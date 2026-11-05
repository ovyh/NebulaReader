/* ============================================================
   星云阅读器 · 数据源
   ------------------------------------------------------------
   扫描本地文件 / JSON 数据包 / 远程地址，产出 FileNode（文档兼容层）：
     - type: 'text' | 'audio' | 'image'
     - format: 大写扩展名（RAW 类统一 RAW）
     - units/mass/temperature/color/radius/style: 由 js/rules.js 计算
   每个文件独立 try/catch，失败只记录 meta.error，不中断导入。
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});
  const DS = (SY.DataSource = {});

  const DB_NAME = 'nebula-reader';
  const STORE = 'dataset';
  const SCHEMA_VERSION = 2;

  const EXT_TYPE = {
    txt: 'text', log: 'text', md: 'text', markdown: 'text', html: 'text', htm: 'text',
    xml: 'text', json: 'text', yaml: 'text', yml: 'text', ini: 'text', toml: 'text',
    csv: 'text', tsv: 'text', tex: 'text', latex: 'text', srt: 'text', vtt: 'text',
    rtf: 'text', doc: 'text', docx: 'text', odt: 'text', pdf: 'text', epub: 'text',
    xls: 'text', xlsx: 'text', ppt: 'text', pptx: 'text',
    mp3: 'audio', aac: 'audio', m4a: 'audio', ogg: 'audio', opus: 'audio', wma: 'audio',
    amr: 'audio', wav: 'audio', flac: 'audio', alac: 'audio', aiff: 'audio', ape: 'audio',
    midi: 'audio', mid: 'audio', ac3: 'audio', eac3: 'audio', dts: 'audio', pcm: 'audio',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', tiff: 'image',
    tif: 'image', webp: 'image', heic: 'image', heif: 'image', avif: 'image', ico: 'image',
    svg: 'image', eps: 'image', ai: 'image', cr2: 'image', cr3: 'image', nef: 'image',
    arw: 'image', dng: 'image', psd: 'image', xcf: 'image', tga: 'image', exr: 'image',
    hdr: 'image'
  };

  const TEXT_FORMATS = ['TXT', 'LOG', 'MD', 'HTML', 'HTM', 'XML', 'JSON', 'YAML', 'YML',
    'INI', 'TOML', 'CSV', 'TSV', 'TEX', 'LATEX', 'SRT', 'VTT', 'RTF', 'DOC', 'DOCX',
    'ODT', 'PDF', 'EPUB', 'XLS', 'XLSX', 'PPT', 'PPTX'];

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

  /* ---------------- 基础工具 ---------------- */
  function natSort(a, b) {
    return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
  }

  function extOf(name) {
    const m = /\.([^.\\/]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function baseName(path) {
    const n = String(path || '').split('/').pop();
    return n.replace(/\.[^.]+$/, '').replace(/^\d+[-_.、\s]*/, '') || n;
  }

  function formatOf(name) {
    const ext = extOf(name);
    if (!ext) return 'UNKNOWN';
    const rule = (SY.CONFIG.FORMAT_STARS || {})[ext.toUpperCase()];
    return (rule && rule.format) || ext.toUpperCase();
  }

  function typeOf(name) {
    const ext = extOf(name);
    return EXT_TYPE[ext] || 'text';
  }

  function finite(v, def) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : (def || 0);
  }

  function idFromPath(path, index) {
    const s = String(path || '') + '#' + index;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'n' + ((h >>> 0).toString(36)) + index.toString(36);
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

  // 文件夹导入用目录名分组；手机多选没有目录信息，则按文件名前缀匹配配置里的分组
  function folderOf(f, rootName) {
    const rel = f.webkitRelativePath || '';
    if (rel) {
      const parts = rel.split('/');
      if (parts.length > 2) return parts[parts.length - 2];
      return parts.length === 2 ? rootName : '全部';
    }
    const base = baseName(f.name);
    const cfg = (SY.CONFIG.nebulae || []).find((n) =>
      (n.match || []).some((m) => base.indexOf(m) === 0) || (n.cn && base.indexOf(n.cn) === 0));
    return cfg ? cfg.cn : '全部';
  }

  /* ---------------- 图片 / 音频元数据 ---------------- */
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = url;
    });
  }

  async function imageMeta(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;

      const S = 16;
      const canvas = document.createElement('canvas');
      canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, S, S);
      const px = ctx.getImageData(0, 0, S, S).data;
      let r = 0, g = 0, b = 0, lum = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 8) continue;
        r += px[i]; g += px[i + 1]; b += px[i + 2];
        lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        n++;
      }
      if (n) { r /= n; g /= n; b /= n; lum /= n; }
      const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

      // 缩略图（用于阅读器预览 + 持久化）
      const maxSide = 640;
      const scale = Math.min(1, maxSide / Math.max(1, w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const tc = document.createElement('canvas');
      tc.width = tw; tc.height = th;
      tc.getContext('2d').drawImage(img, 0, 0, tw, th);
      let thumb = '';
      try { thumb = tc.toDataURL('image/jpeg', 0.82); } catch (e) { thumb = ''; }

      return { width: w, height: h, dominantColor: hex, brightness: lum, thumb: thumb };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function audioMeta(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement('audio');
      let settled = false;
      const finish = (durationSec, error) => {
        if (settled) return;
        settled = true;
        resolve({ url: url, durationSec: finite(durationSec, 0), error: error || '' });
      };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => finish(audio.duration, '');
      audio.onerror = () => finish(0, '音频元数据解析失败');
      audio.src = url;
      setTimeout(() => finish(0, '音频元数据超时'), 8000);
    });
  }

  /* ---------------- 节点构建 ---------------- */
  function baseNode(file, groupId, no, index) {
    const format = formatOf(file.name);
    const type = typeOf(file.name);
    const resolved = SY.rules ? SY.rules.resolveStyle(format) : { format: format, style: 'asteroid', secondaryStyle: null, transparent: false };
    return {
      id: idFromPath(file.webkitRelativePath || file.name, index),
      g: groupId,
      no: no,
      t: baseName(file.name),
      type: type,
      format: resolved.format,
      name: file.name,
      style: resolved.style,
      secondaryStyle: resolved.secondaryStyle || null,
      units: 0, mass: 0.1, temperature: 3000, color: '#ff5a3c', radius: 4,
      links: [],
      c: 0, w: 0, e: '',
      meta: {
        fileSize: finite(file.size, 0),
        mime: file.type || '',
        group: groupId,
        error: ''
      }
    };
  }

  function applyStar(node) {
    const star = SY.rules.computeStar(node.units);
    node.mass = star.mass;
    node.temperature = star.temperature;
    node.color = star.color;
    node.radius = star.radius;
    node.compact = star.compact;
    node.tNorm = star.t;
    if (!node.style || node.style === 'asteroid' && node.format !== 'UNKNOWN') {
      // 样式以格式表为准，这里不覆盖
    }
    return node;
  }

  async function nodeFromFile(file, groupId, no, index) {
    const node = baseNode(file, groupId, no, index);
    const maxMb = (SY.CONFIG.THRESHOLDS || {}).MAX_FILE_MB || 100;
    if (node.meta.fileSize > maxMb * 1024 * 1024) {
      node.meta.error = '文件超过 ' + maxMb + 'MB，已跳过内容解析';
      node.units = 0;
      return applyStar(node);
    }

    if (node.type === 'text') {
      let text = '';
      try {
        text = await file.text();
      } catch (e) {
        node.meta.error = '读取失败：' + e.message;
        return applyStar(node);
      }
      const p = DS.parseDoc(text, node.t);
      node.text = text;
      node.c = p.chapters.length;
      node.w = p.chars;
      node.e = p.excerpt;
      node.meta.charCount = Array.from(text).length;
      node.meta.encoding = 'utf-8';
      if (TEXT_FORMATS.indexOf(node.format) < 0 && node.format !== 'UNKNOWN') {
        node.meta.warning = '按纯文本解析';
      }
    } else if (node.type === 'image') {
      try {
        const m = await imageMeta(file);
        node.meta.width = m.width;
        node.meta.height = m.height;
        node.meta.dominantColor = m.dominantColor;
        node.meta.brightness = m.brightness;
        node.meta.previewAvailable = !!m.thumb;
        node.thumb = m.thumb || undefined;
        node.accent = m.dominantColor;
      } catch (e) {
        node.meta.error = e.message || '图片解析失败';
        node.meta.previewAvailable = false;
      }
    } else if (node.type === 'audio') {
      try {
        const m = await audioMeta(file);
        node.meta.durationSec = m.durationSec;
        node.meta.previewAvailable = !!m.url;
        if (m.error) node.meta.error = m.error;
        node.mediaUrl = m.url;
      } catch (e) {
        node.meta.error = e.message || '音频解析失败';
        node.meta.previewAvailable = false;
      }
    }

    node.units = SY.rules.computeUnits(node);
    return applyStar(node);
  }

  /* ---------------- IndexedDB ---------------- */
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB 不可用'));
      const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    });
  }

  DS.save = async function (dataset) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(stripMedia(dataset), 'main');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  };

  // 音频的 objectURL 不能持久化，保存前剔除
  function stripMedia(dataset) {
    const copy = Object.assign({}, dataset);
    copy.docs = dataset.docs.map((d) => {
      const c = Object.assign({}, d);
      delete c.mediaUrl;
      if (c.meta) c.meta = Object.assign({}, c.meta, { previewAvailable: !!c.thumb });
      return c;
    });
    return copy;
  }

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

  /* ---------------- 数据集 ---------------- */
  function normalizeDoc(d, i) {
    const format = d.format || formatOf(d.name || ('.' + (d.ext || 'txt')));
    const resolved = SY.rules ? SY.rules.resolveStyle(format) : { format: format, style: 'asteroid' };
    const type = d.type || (d.text ? 'text' : 'text');
    const node = Object.assign({}, d);
    node.type = type;
    node.format = resolved.format;
    node.name = d.name || (d.t || ('node-' + i));
    node.style = d.style || resolved.style;
    node.secondaryStyle = d.secondaryStyle || resolved.secondaryStyle || null;
    node.links = d.links || [];
    node.meta = d.meta || {};
    if (!Number.isFinite(node.units)) {
      node.meta.charCount = node.meta.charCount || (node.text ? Array.from(node.text).length : (d.w || 0));
      node.units = SY.rules ? SY.rules.computeUnits(node) : 0;
    }
    return applyStar(node);
  }

  function finalize(groups, docs) {
    docs.forEach((d, i) => {
      d.no = d.no || (i + 1);
      d.id = d.id || ('n' + i);
    });
    groups.forEach((g) => { g.count = docs.filter((d) => d.g === g.id).length; });
    const chars = docs.reduce((a, d) => a + (d.w || 0), 0);
    const units = docs.reduce((a, d) => a + (Number.isFinite(d.units) ? d.units : 0), 0);
    return {
      version: 2,
      createdAt: new Date().toISOString(),
      groups: groups.filter((g) => g.count > 0),
      docs: docs,
      totals: {
        docs: docs.length,
        chars: chars,
        units: units,
        groups: groups.filter((g) => g.count > 0).length
      }
    };
  }

  DS.demoDataset = function () {
    const src = window.__SY_DEMO;
    const groups = src.groups.map((g) => Object.assign({}, g));
    const docs = src.docs.map((d, i) => normalizeDoc({
      id: d.id, g: d.g, no: d.no, t: d.t, c: d.c, w: d.w, e: d.e, text: d.text,
      name: d.t + '.txt', type: 'text', format: 'TXT'
    }, i));
    return finalize(groups, docs);
  };

  /* ---------------- 本地文件 / 文件夹 ---------------- */
  DS.fromFiles = async function (fileList, onProgress) {
    const maxMb = (SY.CONFIG.THRESHOLDS || {}).MAX_FILE_MB || 100;
    const files = Array.from(fileList).filter((f) => f && f.name && !/^\./.test(f.name));
    if (!files.length) throw new Error('没有找到可导入的文件');
    files.sort((a, b) => natSort(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));

    const rootName = (() => {
      const p = files[0].webkitRelativePath || '';
      return p ? p.split('/')[0] : '';
    })();
    const folderNames = [];
    files.forEach((f) => {
      const folder = folderOf(f, rootName);
      if (folderNames.indexOf(folder) < 0) folderNames.push(folder);
    });

    const groups = folderNames.map((name, i) => groupFromFolder(name, i));
    const byFolder = {};
    folderNames.forEach((name, i) => { byFolder[name] = groups[i]; });

    const docs = [];
    const failures = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const g = byFolder[folderOf(f, rootName)];
      const no = docs.filter((d) => d.g === g.id).length + 1;
      try {
        const node = await nodeFromFile(f, g.id, no, i);
        docs.push(node);
        if (node.meta && node.meta.error) failures.push({ name: f.name, error: node.meta.error });
      } catch (e) {
        failures.push({ name: f.name, error: e.message || String(e) });
        console.warn('[导入] 跳过', f.name, e);
      }
      if (onProgress) onProgress(i + 1, files.length, f.name);
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    if (!docs.length) throw new Error('这些文件都无法解析');
    const ds = finalize(groups, docs);
    ds.failures = failures;
    return ds;
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
      const merged = Object.assign({}, d, {
        id: d.id || (gid + '-' + String(i + 1).padStart(3, '0')),
        g: gid, no: d.no || i + 1,
        t: d.t || d.title || (d.name ? baseName(d.name) : ('第 ' + (i + 1) + ' 篇')),
        text: text || undefined,
        u: d.url || d.u || undefined
      });
      if (!merged.type) merged.type = text ? 'text' : (d.type || 'text');
      docs.push(normalizeDoc(merged, i));
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
    const docs = (dataset.docs || []).map((d, i) => normalizeDoc(d, i));
    const edges = SY.rules && SY.rules.buildEdges ? SY.rules.buildEdges(docs) : [];
    const linksById = new Map();
    edges.forEach((e) => {
      if (!linksById.has(e.source)) linksById.set(e.source, []);
      if (!linksById.has(e.target)) linksById.set(e.target, []);
      linksById.get(e.source).push(e.target);
      if (!e.directed) linksById.get(e.target).push(e.source);
    });
    docs.forEach((d) => { d.links = linksById.get(d.id) || []; });

    const data = {
      groups: dataset.groups,
      docs: docs,
      edges: edges,
      totals: dataset.totals || {
        docs: docs.length,
        chars: docs.reduce((a, d) => a + (d.w || 0), 0),
        units: docs.reduce((a, d) => a + (d.units || 0), 0),
        groups: dataset.groups.length
      },
      byId: new Map(docs.map((d) => [d.id, d])),
      getText(doc) {
        if (!doc) return Promise.reject(new Error('缺少文档'));
        if (doc.type && doc.type !== 'text') {
          return Promise.reject(new Error('这不是文本文件'));
        }
        if (typeof doc.text === 'string') return Promise.resolve(doc.text);
        if (doc.u) return fetch(doc.u).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
        return Promise.reject(new Error('这篇没有正文数据'));
      }
    };
    SY.data = data;
    return data;
  };
})();
