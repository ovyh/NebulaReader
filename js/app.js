/* ============================================================
   星云文本阅读 · boot & main loop
   ============================================================ */
(function () {
  'use strict';
  const SY = window.SY;
  const $ = (s) => document.querySelector(s);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let barEl, statusEl, flashT = 0;

  function setLoad(p, msg) {
    if (barEl) barEl.style.width = Math.max(0, Math.min(100, p)) + '%';
    if (statusEl && msg) statusEl.textContent = msg;
  }

  function pulse(strength, dur) {
    const el = $('#flash');
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = String(strength);
    void el.offsetWidth;
    el.style.transition = 'opacity ' + dur + 'ms cubic-bezier(.25,.0,.2,1)';
    el.style.opacity = '0';
    clearTimeout(flashT);
    flashT = setTimeout(() => { el.style.transition = 'none'; }, dur + 60);
  }

  function fail(msg) {
    const load = $('#loading');
    if (load) {
      load.classList.remove('is-out');
      const st = $('#load-status');
      if (st) {
        st.innerHTML = '<span style="color:#ff9a9a">' + msg + '</span><br><span style="opacity:.6;font-size:9px;letter-spacing:.14em">请使用支持 WebGL2 的 Chrome / Edge 浏览器，并确认显卡驱动已启用硬件加速。</span>';
      }
    }
    console.error('[星云文本阅读]', msg);
  }

  async function boot() {
    barEl = $('#load-bar-fill');
    statusEl = $('#load-status');

    const cfg = SY.CONFIG;
    document.title = cfg.title;
    if ($('#intro-tagline')) $('#intro-tagline').textContent = cfg.tagline;

    setLoad(6, '正在解译星图…');
    await sleep(60);

    /* 1. 取数据：缓存 → 示例 */
    let dataset = null;
    try { dataset = await SY.DataSource.load(); } catch (e) { dataset = null; }
    if (!dataset || !dataset.docs || !dataset.docs.length) {
      dataset = SY.DataSource.demoDataset();
      SY.isDemo = true;
    } else {
      SY.isDemo = false;
    }
    const data = SY.DataSource.activate(dataset);

    setLoad(18, '正在为 ' + data.totals.docs + ' 颗恒星定位…');
    await nextFrame();

    let renderer;
    try {
      renderer = new SY.Renderer($('#space'), data);
    } catch (err) {
      console.error(err);
      fail('星云渲染器启动失败：' + (err && err.message ? err.message : err));
      return;
    }
    SY.renderer = renderer;

    setLoad(52, '正在合成体积星云…');
    await nextFrame();

    SY.UI.init(renderer, data);

    const uiSwitch = renderer.onSwitch;
    renderer.onSwitch = function (mode, group) {
      if (uiSwitch) uiSwitch(mode, group);
      if (mode === 'inside') pulse(0.92, 1000);
      else pulse(0.85, 900);
    };
    renderer.onDiveEnd = function () {
      const n = SY.NEBULAE[renderer.nebulaIndex];
      if (n) SY.UI.toast('已抵达 · ' + n.cn + ' · ' + (n.count || 0) + ' 颗星');
    };
    renderer.onSurfaceEnd = function () {
      SY.UI.toast('已返回 · ' + SY.NEBULAE.length + ' 片星云');
    };

    setLoad(74, '正在校准光谱与泛光…');
    await nextFrame();

    SY.app = {
      enter(i) { renderer.dive(i); },
      exit() { renderer.surface(); },
      open(id) {
        const d = data.byId ? data.byId.get(id) : data.docs.find((x) => x.id === id);
        if (d) SY.UI.openDoc(d);
      },
      nebula(i) { renderer.dive(i); }
    };

    await nextFrame();

    setLoad(100, SY.isDemo ? '示例数据 · 可在「数据」中导入你的文本' : '星门已开启');
    await sleep(420);

    const load = $('#loading');
    load.classList.add('is-out');
    setTimeout(() => load.classList.add('hidden'), 1100);

    const intro = $('#intro');
    setTimeout(() => intro.classList.add('is-in'), 1000);
    setTimeout(() => intro.classList.add('is-out'), 4600);
    setTimeout(() => { window.SY.readyForLabels = true; }, 6400);
    const dismiss = () => { intro.classList.add('is-out'); window.SY.readyForLabels = true; };
    window.addEventListener('pointerdown', dismiss, { once: true });

    document.body.classList.add('ready');
    requestAnimationFrame(loop);
  }

  function loop(now) {
    const r = SY.renderer;
    if (!r) return;
    try {
      r.frame(now);
      if (SY.UI) SY.UI.update();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }

  window.addEventListener('error', (e) => {
    console.error('[星云文本阅读] window error', e.message);
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 30);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(boot, 30));
  }
})();
