/* ============================================================
   星云文本阅读 · 数据源
   ------------------------------------------------------------
   支持三种方式载入你自己的文本：
     1. 选择本地文件夹（.txt，可含子文件夹作为分组）
     2. 选择 JSON 数据包
     3. 填写远程 JSON 地址（需对方允许 CORS）
   导入后写入 IndexedDB，下次打开自动恢复。
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});
  const DS = (SY.DataSource = {});

  const DB_NAME = 'nebula-reader';
  const STORE = 'dataset';

  /* ---------------- 文本解析 ---------------- */
  const isSep = (l) => /^={8,}\s*$/.test(l);

  DS.parseDoc = function (raw, fallbackTitle) {
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
        chapters.push({ name: h[0] || '', sub: h[1] || '', chars: body.join('\n').replace(/\s/g, '').length });
        i = k;
        continue;
      }
      i++;
    }
    if (!chapters.length) {
      const body = lines.slice(start).join('\n').trim();
      if (body) chapters.push({ name: '', sub: '', chars: body.replace(/\s/g, '').length });
    }
    const chars = chapters.reduce((a, c) => a + c.chars, 0);
    const ex = (lines.slice(start).find((l) => l.trim().length > 12) || '').trim();
    return {
      title: fallbackTitle,
      chapters: chapters,
      chars: chars,
      excerpt: ex.replace(/^[^：:]{1,14}[：:]\s*/, '').slice(0, 92)
    };
  };

  function docMeta(raw, title, group, no) {
    const p = DS.parseDoc(raw, title);
    return {
      id: group + '-' + String(no).padStart(3, '0'),
      g: group, no: no, t: p.title || ('第 ' + no + ' 篇'),
      c: p.chapters.length, w: p.chars, e: p.excerpt, text: raw
    };
  }

  function natSort(a, b) {
    return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
  }

  function baseName(path) {
    const n = path.split('/').pop().replace(/\.txt$/i, '');
    return n.replace(/^\d+[-_.、\s]*/, '') || n;
  }

  function groupFromFolder(name, idx) {
    const cfg = (SY.CONFIG.nebulae || []).find((n) => (n.match || []).indexOf(name) >= 0 || n.cn === name);
    if (cfg) {
      return {
        id: cfg.group || cfg.id, cn: name, en: cfg.en || '', tag: cfg.tag || '',
        count: 0, accent: cfg.accent, accentCss: cfg.accentCss
      };
    }
    return { id: 'x' + (idx + 1), cn: name, en: 'GROUP ' + (idx + 1), tag: '自动分组', count: 0 };
  }

  /* ---------------- IndexedDB ---------------- */
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB 不可用'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
  }

  DS.save = async function (dataset) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataset, 'main');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  };

  DS.load = async function () {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get('main');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[数据源] 读取缓存失败：', e);
      return null;
    }
  };

  DS.clear = async function () {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete('main');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  };

  /* ---------------- 数据集构建 ---------------- */
  function finalize(groups, docs) {
    groups.forEach((g) => { g.count = docs.filter((d) => d.g === g.id).length; });
    const chars = docs.reduce((a, d) => a + (d.w || 0), 0);
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      groups: groups.filter((g) => g.count > 0),
      docs: docs,
      totals: { docs: docs.length, chars: chars, groups: groups.filter((g) => g.count > 0).length }
    };
  }

  DS.demoDataset = function () {
    const src = window.__SY_DEMO;
    const groups = src.groups.map((g) => Object.assign({}, g));
    const docs = src.docs.map((d) => Object.assign({}, d));
    return finalize(groups, docs);
  };

  /* ---------------- 本地文件夹 ---------------- */
  DS.fromFiles = async function (fileList, onProgress) {
    const files = Array.from(fileList).filter((f) => /\.txt$/i.test(f.name) || /text\/plain/.test(f.type));
    if (!files.length) throw new Error('没有找到 .txt 文本文件');
    files.sort((a, b) => natSort(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));

    // 以“文件所在文件夹”为分组；若都直接位于根目录，则归为“全部”
    const rootName = (() => {
      const p = files[0].webkitRelativePath || '';
      return p ? p.split('/')[0] : '';
    })();
    const folderNames = [];
    files.forEach((f) => {
      const p = (f.webkitRelativePath || '').split('/');
      const folder = p.length > 2 ? p[p.length - 2] : (p.length === 2 ? rootName : '全部');
      if (folderNames.indexOf(folder) < 0) folderNames.push(folder);
    });

    const groups = folderNames.map((name, i) => groupFromFolder(name, i));
    const byFolder = {};
    folderNames.forEach((name, i) => { byFolder[name] = groups[i]; });

    const docs = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const p = (f.webkitRelativePath || '').split('/');
      const folder = p.length > 2 ? p[p.length - 2] : (p.length === 2 ? rootName : '全部');
      const g = byFolder[folder];
      const no = docs.filter((d) => d.g === g.id).length + 1;
      let raw = '';
      try { raw = await f.text(); } catch (e) { continue; }
      if (!raw.trim()) continue;
      docs.push(docMeta(raw, baseName(f.name), g.id, no));
      if (onProgress) onProgress(i + 1, files.length, f.name);
      if (i % 12 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!docs.length) throw new Error('这些文件里没有可解析的正文');
    return finalize(groups, docs);
  };

  /* ---------------- JSON 数据包 ---------------- */
  DS.fromJsonText = function (str) {
    let obj;
    try { obj = JSON.parse(str); } catch (e) { throw new Error('JSON 解析失败：' + e.message); }
    return DS.fromObject(obj);
  };

  DS.fromObject = function (obj) {
    if (!obj || !Array.isArray(obj.docs)) throw new Error('数据包缺少 docs 数组');
    const groups = (obj.groups || []).map((g, i) => ({
      id: g.id || ('x' + (i + 1)), cn: g.cn || g.name || ('分组 ' + (i + 1)),
      en: g.en || '', tag: g.tag || '', count: 0
    }));
    const known = {};
    groups.forEach((g) => { known[g.id] = g; });
    const docs = [];
    obj.docs.forEach((d, i) => {
      const gid = d.g || d.group || (groups[0] && groups[0].id) || 'x1';
      if (!known[gid]) {
        known[gid] = { id: gid, cn: gid, en: '', tag: '', count: 0 };
        groups.push(known[gid]);
      }
      const text = typeof d.text === 'string' ? d.text : '';
      const meta = text ? DS.parseDoc(text, d.t || d.title || ('第 ' + (i + 1) + ' 篇')) : null;
      docs.push({
        id: d.id || (gid + '-' + String(i + 1).padStart(3, '0')),
        g: gid, no: d.no || i + 1,
        t: d.t || d.title || (meta && meta.title) || ('第 ' + (i + 1) + ' 篇'),
        c: d.c || (meta ? meta.chapters.length : 0),
        w: d.w || (meta ? meta.chars : (text.length || 0)),
        e: d.e || (meta ? meta.excerpt : ''),
        text: text || undefined,
        u: d.url || d.u || undefined
      });
    });
    return finalize(groups, docs);
  };

  /* ---------------- 远程 ---------------- */
  DS.fromUrl = async function (url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('请求失败：HTTP ' + res.status);
    const txt = await res.text();
    return DS.fromJsonText(txt);
  };

  /* ---------------- 激活数据集 ---------------- */
  DS.activate = function (dataset) {
    const data = {
      groups: dataset.groups,
      docs: dataset.docs,
      totals: dataset.totals || {
        docs: dataset.docs.length,
        chars: dataset.docs.reduce((a, d) => a + (d.w || 0), 0),
        groups: dataset.groups.length
      },
      byId: new Map(dataset.docs.map((d) => [d.id, d])),
      getText(doc) {
        if (doc && typeof doc.text === 'string') return Promise.resolve(doc.text);
        if (doc && doc.u) return fetch(doc.u).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
        return Promise.reject(new Error('这篇没有正文数据'));
      }
    };
    SY.data = data;
    return data;
  };
})();
