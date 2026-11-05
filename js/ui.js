/* ============================================================
   星云文本阅读 · UI layer
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function loadDocText(doc) {
    if (!doc) return Promise.reject(new Error('缺少文档'));
    if (typeof doc.text === 'string') return Promise.resolve(doc.text);
    if (SY.data && SY.data.getText) return SY.data.getText(doc);
    return Promise.reject(new Error('这篇没有正文数据'));
  }

  const isSep = (l) => /^={8,}\s*$/.test(l);

  function parseDocText(raw) {
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    const storyIdx = lines.findIndex((l) => /^正文\s*\/\s*Story/i.test(l.trim()));
    const start = storyIdx >= 0 ? storyIdx + 1 : 0;
    const chapters = [];
    let i = start;
    while (i < lines.length) {
      if (isSep(lines[i])) {
        let j = i + 1;
        const head = [];
        while (j < lines.length && !isSep(lines[j])) { head.push(lines[j]); j++; }
        if (j >= lines.length) break;
        let k = j + 1;
        const body = [];
        while (k < lines.length && !isSep(lines[k])) { body.push(lines[k]); k++; }
        const h = head.map((s) => s.trim()).filter(Boolean);
        chapters.push({ name: h[0] || '', sub: h[1] || '', body });
        i = k;
        continue;
      }
      i++;
    }
    if (!chapters.length) {
      const body = lines.slice(start);
      if (body.join('').trim()) chapters.push({ name: '', sub: '', body: body });
    }
    // 只有带「正文 / Story」头的结构化格式才从正文取标题，普通文本用文件名
    let title = '';
    if (storyIdx >= 0) title = (lines[1] || '').trim();
    return { title, chapters };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function speakerColor(name) {
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
    const hue = 186 + (Math.abs(h) % 150);
    return 'hsl(' + hue + ' 68% 76%)';
  }

  function paragraphsHtml(body) {
    const out = [];
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const text = buf.join('').trim();
      buf = [];
      if (!text) return;
      if (/^【.*】$/.test(text)) {
        out.push('<p class="stage">' + esc(text) + '</p>');
        return;
      }
      const m = text.match(/^([^：:\s]{1,16})[：:]\s*(.*)$/);
      if (m && m[1] && !/^[《（(“"']/.test(m[1])) {
        const sp = m[1];
        out.push('<p><span class="spk" style="color:' + speakerColor(sp) + '">' + esc(sp) + '</span>' + esc(m[2]) + '</p>');
      } else {
        out.push('<p class="narr">' + esc(text) + '</p>');
      }
    };
    for (const line of body) {
      if (!line.trim()) { flush(); continue; }
      buf.push(line.trim());
    }
    flush();
    return out.join('\n');
  }

  const UI = {
    init(renderer, index) {
      this.r = renderer;
      this.index = index;
      this.docsById = new Map(index.docs.map((d) => [d.id, d]));
      this.cards = [];
      this.reader = { doc: null, parsed: null, idx: 0, fontSize: 18.5, open: false };
      this.buildCards();
      this.buildSearch();
      this.buildAtlas();
      this.bindReader();
      this.bindGlobal();
      this.bindRenderer();
      this.renderAboutStats();
      this.bindData();
      const t = index.totals || { docs: index.docs.length };
      $('#search').placeholder = '搜索 ' + t.docs + ' 篇文本';
      $('#atlas-kicker').textContent = t.docs + ' TEXTS · ' + SY.NEBULAE.length + ' NEBULAE';
      $('#atlas-title').textContent = '星图目录';
    },

    /* ---------------- nebula labels ---------------- */
    buildCards() {
      const stage = $('#stage');
      const total = SY.NEBULAE.length;
      const pad = (v) => (v < 10 ? '0' + v : '' + v);
      SY.NEBULAE.forEach((n, i) => {
        const el = document.createElement('div');
        el.className = 'nebula-card';
        el.style.setProperty('--accent', n.accentCss);
        el.innerHTML =
          '<div class="nc-rule"></div>' +
          '<div class="nc-idx">' + pad(i + 1) + ' / ' + pad(total) + '</div>' +
          '<div class="nc-cn">' + esc(n.cn) + '</div>' +
          '<div class="nc-en">' + n.en + '</div>' +
          '<div class="nc-meta">' + (n.count || 0) + ' 篇 · ' + esc(n.tag) + '</div>' +
          '<div class="nc-cta">进入 · ENTER</div>';
        el.addEventListener('click', () => { if (this.r.mode === 'galaxy') this.enterNebula(i); });
        el.addEventListener('mouseenter', () => { this.r.setHoverNebula(i); });
        el.addEventListener('mouseleave', () => { if (this.r.hoverNebula === i) this.r.setHoverNebula(-1); });
        stage.appendChild(el);
        this.cards.push(el);
      });
    },

    updateCards() {
      const inside = this.r.mode !== 'galaxy';
      const list = inside ? [] : this.r.nebulaScreens;
      this.cards.forEach((el, i) => {
        const s = list[i];
        if (!s || !s.visible) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          return;
        }
        el.style.pointerEvents = 'auto';
        el.style.opacity = '';
        el.style.left = s.x + 'px';
        const scrH = (window.screen && window.screen.height) ? window.screen.height : 1e9;
        const syPos = window.screenY || 0;
        const outerH = window.outerHeight || 0;
        const chrome = Math.max(0, outerH - (window.innerHeight || 0));
        const off = chrome > 20 && syPos + outerH > scrH + 8;
        const vh = off ? Math.max(320, scrH - Math.max(syPos, 0)) : (window.innerHeight || 800);
        const top = Math.min(Math.max(s.y + s.r * 0.92, 96), vh - 104);
        el.style.top = top + 'px';
        el.classList.toggle('is-on', !!window.SY.readyForLabels && (!this.r.trans || this.r.trans.dir === 'out'));
        el.classList.toggle('is-dim', this.r.hoverNebula >= 0 && this.r.hoverNebula !== i);
      });
    },

    /* ---------------- search ---------------- */
    buildSearch() {
      const input = $('#search');
      const box = $('#search-results');
      let timer = 0;
      const render = (q) => {
        q = q.trim().toLowerCase();
        if (!q) { box.classList.remove('is-open'); box.innerHTML = ''; return; }
        const hits = [];
        for (const d of this.index.docs) {
          const hay = (d.t + ' ' + d.e).toLowerCase();
          if (hay.indexOf(q) >= 0) hits.push(d);
          if (hits.length >= 14) break;
        }
        if (!hits.length) {
          box.innerHTML = '<div class="sr-empty">没有找到与「' + esc(q) + '」相关的星</div>';
        } else {
          box.innerHTML = hits.map((d) => {
            const g = this.groupOf(d.g);
            return '<div class="sr-item" data-id="' + d.id + '">' +
              '<span class="sr-idx">' + esc(g.cn.slice(0, 2)) + '·' + String(d.no).padStart(3, '0') + '</span>' +
              '<span class="sr-title">' + esc(d.t) + '</span>' +
              '<span class="sr-tag">' + d.c + ' 节</span></div>';
          }).join('');
        }
        box.classList.add('is-open');
      };
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => render(input.value), 90);
      });
      input.addEventListener('focus', () => { if (input.value) render(input.value); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const first = box.querySelector('.sr-item');
          if (first) first.click();
        } else if (e.key === 'Escape') {
          input.blur();
          box.classList.remove('is-open');
        }
      });
      box.addEventListener('click', (e) => {
        const item = e.target.closest('.sr-item');
        if (!item) return;
        const d = this.docsById.get(item.dataset.id);
        box.classList.remove('is-open');
        input.value = '';
        input.blur();
        if (d) this.openDoc(d);
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-wrap')) box.classList.remove('is-open');
      });
    },

    groupOf(id) {
      return this.index.groups.find((g) => g.id === id) || this.index.groups[0];
    },

    /* ---------------- atlas ---------------- */
    buildAtlas() {
      const body = $('#atlas-body');
      const accents = {};
      SY.NEBULAE.forEach((n) => { accents[n.group] = n.accentCss; });
      body.innerHTML = this.index.groups.map((g) => {
        const docs = this.index.docs.filter((d) => d.g === g.id);
        return '<section class="atlas-group" data-g="' + g.id + '" style="--accent:' + accents[g.id] + '">' +
          '<div class="ag-head"><i class="ag-dot"></i><span class="ag-cn">' + esc(g.cn) + '</span>' +
          '<span class="ag-en">' + g.en + '</span><span class="ag-count">' + g.count + '</span>' +
          '<span class="chev">▾</span></div>' +
          '<div class="ag-items">' + docs.map((d) =>
            '<div class="ag-item" data-id="' + d.id + '"><span class="no">' + String(d.no).padStart(3, '0') + '</span>' +
            '<span class="ti">' + esc(d.t) + '</span><span class="mt">' + d.c + ' 节</span></div>'
          ).join('') + '</div></section>';
      }).join('');

      body.addEventListener('click', (e) => {
        const head = e.target.closest('.ag-head');
        if (head) {
          head.parentElement.classList.toggle('is-collapsed');
          return;
        }
        const item = e.target.closest('.ag-item');
        if (item) {
          const d = this.docsById.get(item.dataset.id);
          if (d) { this.closeAtlas(); this.openDoc(d); }
        }
      });
      $('#btn-atlas').addEventListener('click', () => this.toggleAtlas());
      $('#atlas-close').addEventListener('click', () => this.closeAtlas());
    },

    toggleAtlas() {
      const el = $('#atlas');
      const open = !el.classList.contains('is-open');
      if (open) this.closeReader();
      el.classList.toggle('is-open', open);
      el.classList.toggle('hidden', false);
      document.body.classList.toggle('atlas-open', open);
      $('#btn-atlas').classList.toggle('is-on', open);
      if (open) el.classList.remove('hidden');
    },

    closeAtlas() {
      const el = $('#atlas');
      el.classList.remove('is-open');
      document.body.classList.remove('atlas-open');
      $('#btn-atlas').classList.remove('is-on');
    },

    /* ---------------- reader ---------------- */
    bindReader() {
      $('#reader-close').addEventListener('click', () => this.closeReader());
      $('#reader-veil').addEventListener('click', () => this.closeReader());
      $('#prev-chapter').addEventListener('click', () => this.gotoChapter(this.reader.idx - 1));
      $('#next-chapter').addEventListener('click', () => this.gotoChapter(this.reader.idx + 1));
      $$('.rt-right [data-font]').forEach((b) => {
        b.addEventListener('click', () => {
          this.reader.fontSize = Math.max(15, Math.min(24, this.reader.fontSize + Number(b.dataset.font) * 0.8));
          document.documentElement.style.setProperty('--read-size', this.reader.fontSize + 'px');
        });
      });
    },

    async openDoc(doc) {
      this.closeAtlas();
      const g = this.groupOf(doc.g);
      const reader = $('#reader');
      this.reader.doc = doc;
      this.reader.gid = doc.g;
      reader.classList.remove('hidden');
      document.body.classList.add('reading');
      reader.style.setProperty('--accent', (SY.NEBULAE.find((n) => n.id === doc.g) || {}).accentCss || '#9ad8ff');
      this.reader.open = true;

      $('#rn-group').textContent = g.cn + ' · ' + g.en;
      $('#rt-kicker').textContent = g.en + ' · ' + String(doc.no).padStart(3, '0');
      $('#rt-title').textContent = doc.t;
      $('#rt-meta').textContent = doc.c + ' 节 · ' + doc.w.toLocaleString('zh-CN') + ' 字 · ' + g.tag;
      $('#doc-body').innerHTML = '<p class="narr" style="opacity:.6">正在展开星图…</p>';
      $('#rn-chapters').innerHTML = '';

      try {
        const raw = await loadDocText(doc);
        const parsed = parseDocText(raw);
        this.reader.parsed = parsed;
        this.reader.idx = 0;
        $('#rt-title').textContent = parsed.title || doc.t;
        this.buildChapterNav(parsed);
        this.renderChapter(0);
      } catch (err) {
        console.error(err);
        $('#doc-body').innerHTML = '<p class="narr">星尘散佚，无法读取此篇。</p>';
      }
    },

    buildChapterNav(parsed) {
      const ol = $('#rn-chapters');
      ol.innerHTML = parsed.chapters.map((c, i) => {
        const sub = c.sub ? '<em>' + esc(c.sub) + '</em>' : '';
        const name = esc(c.name || '正文');
        return '<li data-i="' + i + '"><span class="ci">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="ct">' + sub + name + '</span></li>';
      }).join('');
      ol.onclick = (e) => {
        const li = e.target.closest('li');
        if (li) this.gotoChapter(Number(li.dataset.i));
      };
    },

    renderChapter(i) {
      const st = this.reader;
      if (!st.parsed) return;
      const n = st.parsed.chapters.length;
      if (!n) return;
      i = Math.max(0, Math.min(n - 1, i));
      st.idx = i;
      const c = st.parsed.chapters[i];
      const html = '<section class="chapter">' +
        '<header class="chapter-head"><span class="ch-no">' + String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0') + '</span>' +
        '<h2>' + esc(c.name || '正文') + '</h2>' +
        (c.sub ? '<span class="ch-sub">' + esc(c.sub) + '</span>' : '') + '</header>' +
        paragraphsHtml(c.body) + '</section>' +
        '<div style="height:80px"></div>';
      $('#doc-body').innerHTML = html;
      $('#reader-scroll').scrollTop = 0;
      $('#chapter-index').textContent = (i + 1) + ' / ' + n;
      $('#rn-progress').textContent = (i + 1) + ' / ' + n;
      $('#rn-bar-fill').style.width = ((i + 1) / n * 100) + '%';
      $('#prev-chapter').disabled = i <= 0;
      $('#next-chapter').disabled = i >= n - 1;
      const items = $$('#rn-chapters li');
      items.forEach((el, k) => el.classList.toggle('is-on', k === i));
      const active = items[i];
      if (active) {
        const ol = $('#rn-chapters');
        const top = active.offsetTop - ol.clientHeight / 2 + active.clientHeight / 2;
        ol.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    },

    gotoChapter(i) {
      if (i < 0 || !this.reader.parsed) return;
      if (i >= this.reader.parsed.chapters.length) return;
      this.renderChapter(i);
    },

    closeReader() {
      if (!this.reader.open) return;
      this.reader.open = false;
      $('#reader').classList.add('hidden');
      document.body.classList.remove('reading');
      $('#doc-body').innerHTML = '';
    },

    /* ---------------- star tooltip ---------------- */
    bindRenderer() {
      this.r.onNebulaHover = (i) => {
        this.cards.forEach((el, k) => el.classList.toggle('is-dim', i >= 0 && k !== i));
      };
      this.r.onNebulaClick = (i) => this.enterNebula(i);
      this.r.onStarHover = (star, x, y) => {
        const tip = $('#tooltip');
        const ring = $('#star-ring');
        this.hoverStarRef = star || null;
        if (!star) {
          tip.classList.remove('is-on');
          tip.classList.add('hidden');
          if (ring) { ring.classList.remove('is-on'); ring.classList.add('hidden'); }
          this.tipDoc = null;
          return;
        }
        const d = star.doc;
        if (!this.tipDoc || this.tipDoc.id !== d.id) {
          const g = this.groupOf(d.g);
          tip.innerHTML = '<div class="tt-kicker">' + (g.en || g.cn) + ' · ' + String(d.no).padStart(3, '0') + '</div>' +
            '<div class="tt-title">' + esc(d.t) + '</div>' +
            '<div class="tt-meta">' + d.c + ' 节 · ' + d.w.toLocaleString('zh-CN') + ' 字</div>' +
            '<div class="tt-hint">点击恒星 · 展开叙事</div>';
          this.tipDoc = d;
        }
        tip.classList.remove('hidden');
        this.positionStarUI(star);
        tip.classList.add('is-on');
        if (ring) { ring.classList.remove('hidden'); ring.classList.add('is-on'); }
      };
      this.r.onStarClick = (star) => {
        if (star) this.openDoc(star.doc);
      };
      this.r.onSwitch = (mode, group) => {
        const hint = $('#hint');
        if (mode === 'inside') {
          document.body.classList.add('mode-inside');
          const n = SY.NEBULAE[this.r.nebulaIndex];
          $('#crumb-nebula').textContent = n.cn;
          $('#crumb-nebula').classList.add('is-on');
          document.title = n.cn + ' · ' + SY.CONFIG.title;
          this.cards.forEach((el) => { el.style.opacity = '0'; });
          this.r.hoverStar = null;
          this.hoverStarRef = null;
          this.tipDoc = null;
          $('#tooltip').classList.remove('is-on');
          $('#star-ring').classList.remove('is-on');
          hint.innerHTML = '<span>拖拽旋转</span><i></i><span>滚轮推近</span><i></i><span>点击恒星阅读</span><i></i><span>Esc 返回星云</span>';
        } else {
          document.body.classList.remove('mode-inside');
          $('#crumb-nebula').textContent = '四重星云';
          $('#crumb-nebula').classList.remove('is-on');
          document.title = SY.CONFIG.title;
          this.closeReader();
          hint.innerHTML = '<span>拖拽旋转</span><i></i><span>滚轮推近</span><i></i><span>点击星云，坠入其中</span>';
        }
      };
    },

    enterNebula(i) {
      if (this.r.mode !== 'galaxy' || this.r.trans) return;
      this.r.dive(i);
      const n = SY.NEBULAE[i];
      const g = this.groupOf(n.id);
      this.toast('正在坠入 · ' + g.cn);
    },

    toast(text) {
      let el = $('#toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.classList.add('is-on');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => el.classList.remove('is-on'), 1900);
    },

    /* ---------------- about ---------------- */
    renderAboutStats() {
      const t = this.index.totals;
      const grid = $('#about-grid');
      if (!grid) return;
      grid.innerHTML =
        '<div class="about-stat"><b>' + t.docs + '</b><span>恒星 · 文档</span></div>' +
        '<div class="about-stat"><b>' + (t.chars / 10000).toFixed(1) + ' 万</b><span>正文总字数</span></div>' +
        '<div class="about-stat"><b>' + String(SY.NEBULAE.length).padStart(2, '0') + '</b><span>体积星云</span></div>' +
        '<div class="about-stat"><b>' + (SY.isDemo ? '示例' : '本地') + '</b><span>数据来源</span></div>';
      $('#btn-about').addEventListener('click', () => {
        $('#about').classList.remove('hidden');
        document.body.classList.add('atlas-open');
      });
      $('#about-close').addEventListener('click', () => {
        $('#about').classList.add('hidden');
        document.body.classList.remove('atlas-open');
      });
    },

    /* ---------------- data source ---------------- */
    bindData() {
      const panel = $('#data-panel');
      const open = () => {
        panel.classList.remove('hidden');
        document.body.classList.add('atlas-open');
        this.updateDataStatus();
      };
      const close = () => {
        panel.classList.add('hidden');
        document.body.classList.remove('atlas-open');
      };
      $('#btn-data').addEventListener('click', open);
      $('#data-close').addEventListener('click', close);
      panel.addEventListener('click', (e) => { if (e.target === panel) close(); });

      $('#btn-pick-folder').addEventListener('click', () => $('#pick-folder').click());
      $('#btn-pick-json').addEventListener('click', () => $('#pick-json').click());

      $('#pick-folder').addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || !files.length) return;
        this.dataProgress(0, '读取 ' + files.length + ' 个文件…');
        try {
          const ds = await SY.DataSource.fromFiles(files, (done, total, name) => {
            this.dataProgress(done / total, '解析 ' + done + ' / ' + total + ' · ' + name);
          });
          await this.importDataset(ds);
        } catch (err) {
          this.dataError(err);
        }
      });

      $('#pick-json').addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          this.dataProgress(0.4, '读取数据包…');
          const ds = SY.DataSource.fromJsonText(await f.text());
          await this.importDataset(ds);
        } catch (err) {
          this.dataError(err);
        }
      });

      $('#btn-load-url').addEventListener('click', async () => {
        const url = $('#data-url').value.trim();
        if (!url) { this.dataError(new Error('请填写数据地址')); return; }
        try {
          this.dataProgress(0.3, '正在下载…');
          const ds = await SY.DataSource.fromUrl(url);
          await this.importDataset(ds);
        } catch (err) {
          this.dataError(err, '远程地址载入失败。若对方不允许跨域（CORS），请先把 JSON 下载到本地再用「选择 JSON 数据包」。');
        }
      });

      $('#btn-demo').addEventListener('click', async () => {
        try {
          const ds = SY.DataSource.demoDataset();
          await SY.DataSource.save(ds);
          location.reload();
        } catch (err) { this.dataError(err); }
      });

      $('#btn-clear').addEventListener('click', async () => {
        await SY.DataSource.clear();
        location.reload();
      });
    },

    updateDataStatus() {
      const el = $('#data-status');
      const t = this.index.totals || { docs: this.index.docs.length, chars: 0 };
      el.textContent = '当前：' + (SY.isDemo ? '示例数据' : '已导入数据') + ' · ' +
        t.docs + ' 篇 · ' + (t.chars / 10000).toFixed(1) + ' 万字 · ' + SY.NEBULAE.length + ' 片星云';
    },

    dataProgress(ratio, msg) {
      const bar = $('#data-bar');
      if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + '%';
      if (msg) $('#data-hint').textContent = msg;
      $('#data-hint').style.color = '';
    },

    dataError(err, extra) {
      const el = $('#data-hint');
      el.style.color = '#ff9a9a';
      el.textContent = (err && err.message ? err.message : String(err)) + (extra ? ' · ' + extra : '');
      console.error('[数据源]', err);
    },

    async importDataset(ds) {
      this.dataProgress(0.9, '正在写入本地缓存…');
      try {
        await SY.DataSource.save(ds);
      } catch (err) {
        console.warn('[数据源] 缓存失败', err);
        this.dataError(new Error('无法写入本地缓存（IndexedDB 不可用）'), '导入的数据在刷新后会丢失');
        return;
      }
      this.dataProgress(1, '完成 · ' + ds.totals.docs + ' 篇，正在重启…');
      setTimeout(() => location.reload(), 600);
    },

    /* ---------------- global keys ---------------- */
    bindGlobal() {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (this.reader.open) { this.closeReader(); e.preventDefault(); return; }
          if (!$('#about').classList.contains('hidden')) {
            $('#about').classList.add('hidden');
            document.body.classList.remove('atlas-open');
            return;
          }
          if ($('#atlas').classList.contains('is-open')) { this.closeAtlas(); return; }
          if (this.r.mode === 'inside' && !this.r.trans) { this.r.surface(); }
        } else if (e.key === '/' && !this.reader.open) {
          e.preventDefault();
          $('#search').focus();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          this.toggleAtlas();
        } else if (this.reader.open) {
          if (e.key === 'ArrowLeft') this.gotoChapter(this.reader.idx - 1);
          if (e.key === 'ArrowRight') this.gotoChapter(this.reader.idx + 1);
        }
      });
    },

    positionStarUI(star) {
      const tip = $('#tooltip');
      const ring = $('#star-ring');
      const s = star.screen || { x: 0, y: 0, r: 10 };
      const rr = Math.max(30, s.r * 2 + 18);
      if (ring) {
        ring.style.left = s.x + 'px';
        ring.style.top = s.y + 'px';
        ring.style.width = rr + 'px';
        ring.style.height = rr + 'px';
      }
      const tw = Math.min(320, Math.max(220, tip.offsetWidth || 280));
      const th = tip.offsetHeight || 120;
      let x = s.x + rr / 2 + 16;
      if (x + tw > window.innerWidth - 14) x = s.x - rr / 2 - 18 - tw;
      x = Math.max(14, x);
      let y = s.y - th * 0.45;
      y = Math.max(78, Math.min(window.innerHeight - th - 16, y));
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    },

    update() {
      if (this.r.mode === 'galaxy' && !this.r.trans) this.updateCards();
      if (this.r.trans && this.r.trans.dir === 'in') {
        this.cards.forEach((el) => { el.style.opacity = '0'; });
      }
      if (this.hoverStarRef && this.r.mode === 'inside') this.positionStarUI(this.hoverStarRef);
    }
  };

  SY.UI = UI;
})();
