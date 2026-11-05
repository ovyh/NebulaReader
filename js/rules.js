/* ============================================================
   星云文本阅读 · 天体规则（纯函数，可单测）
   ------------------------------------------------------------
   computeUnits       文件 → 等效信息量 U
   normalizeUnits     U → t（0..1 对数归一化）
   computeStar        U → 质量/温度/颜色/半径/样式（含致密星）
   resolveStyle       格式 → 天体样式（含未知格式 fallback）
   buildEdges         节点集合 → 关联边（去重、无自环）
   本文件不依赖任何第三方库，浏览器与 Node 均可加载。
   ============================================================ */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
  const SY = (root.SY = root.SY || {});
  const R = (SY.rules = {});

  const FALLBACK = {
    UNITS: {
      TEXT_CHARS_PER_UNIT: 100,
      AUDIO_UNITS_PER_SECOND: 10,
      IMAGE_PIXELS_PER_UNIT: 10000,
      TEXT_BYTES_PER_UNIT: 1024
    },
    THRESHOLDS: {
      NORMALIZER_UNITS: 100000,
      WHITE_DWARF_UNITS: 100000,
      NEUTRON_STAR_UNITS: 300000,
      BLACK_HOLE_UNITS: 1000000,
      LENS_THRESHOLD: 5,
      MAX_FILE_MB: 100,
      MIN_RADIUS: 4,
      MAX_RADIUS: 72,
      MAX_UNITS: Number.MAX_SAFE_INTEGER
    },
    FORMAT_STARS: {},
    STYLE_PRESETS: {},
    EDGE_RULES: {
      project: { visual: 'gravity', directed: false, weight: 1.0 },
      reference: { visual: 'constellation', directed: true, weight: 0.8 },
      embed: { visual: 'constellation', directed: true, weight: 0.9 },
      tag: { visual: 'nebulaBridge', directed: false, weight: 0.6 },
      timeline: { visual: 'orbit', directed: true, weight: 0.7 },
      similar: { visual: 'nebulaBridge', directed: false, weight: 0.5 }
    },
    COLOR_STOPS: [
      { max: 3700, hex: '#ff5a3c' },
      { max: 5200, hex: '#ff9a4d' },
      { max: 6000, hex: '#ffd36b' },
      { max: 7500, hex: '#fff4d6' },
      { max: 10000, hex: '#dcefff' },
      { max: 30000, hex: '#9cc8ff' },
      { max: Infinity, hex: '#6aa8ff' }
    ]
  };

  function cfg() { return (SY && SY.CONFIG) || {}; }
  function unitsCfg() { return Object.assign({}, FALLBACK.UNITS, cfg().UNITS || {}); }
  function thCfg() { return Object.assign({}, FALLBACK.THRESHOLDS, cfg().THRESHOLDS || {}); }
  function stylePresets() { return Object.assign({}, FALLBACK.STYLE_PRESETS, cfg().STYLE_PRESETS || {}); }
  function formatStars() { return cfg().FORMAT_STARS || FALLBACK.FORMAT_STARS; }
  function edgeRules() { return Object.assign({}, FALLBACK.EDGE_RULES, cfg().EDGE_RULES || {}); }
  function colorStops() { return cfg().COLOR_STOPS || FALLBACK.COLOR_STOPS; }

  /* ---------------- 数值工具 ---------------- */
  R.safe = function (v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return fallback || 0;
    return n;
  };
  R.clamp = function (v, lo, hi) {
    const n = R.safe(v, lo);
    return Math.min(hi, Math.max(lo, n));
  };
  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return [1, 1, 1];
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  R.hexToRgb = hexToRgb;

  /* ---------------- 1. 单位 U ---------------- */
  /**
   * node: { type:'text'|'audio'|'image', meta:{charCount,durationSec,width,height,fileSize}, text? }
   * 返回有限非负数；取不到度量时回退到文件体积。
   */
  R.computeUnits = function (node) {
    const u = unitsCfg();
    const th = thCfg();
    const meta = (node && node.meta) || {};
    const type = node && node.type;
    let units = 0;

    if (type === 'text') {
      const chars = R.safe(meta.charCount, 0);
      if (chars > 0) units = Math.ceil(chars / Math.max(1, u.TEXT_CHARS_PER_UNIT));
      else units = Math.ceil(R.safe(meta.fileSize, 0) / Math.max(1, u.TEXT_BYTES_PER_UNIT));
    } else if (type === 'audio') {
      const dur = R.safe(meta.durationSec, 0);
      units = dur > 0 ? Math.ceil(dur * u.AUDIO_UNITS_PER_SECOND) : 0;
    } else if (type === 'image') {
      const w = R.safe(meta.width, 0), h = R.safe(meta.height, 0);
      units = (w > 0 && h > 0) ? Math.ceil((w * h) / Math.max(1, u.IMAGE_PIXELS_PER_UNIT)) : 0;
    } else {
      units = Math.ceil(R.safe(meta.fileSize, 0) / Math.max(1, u.TEXT_BYTES_PER_UNIT));
    }

    return R.clamp(units, 0, th.MAX_UNITS);
  };

  /* ---------------- 2. 归一化 / 质量 / 温度 ---------------- */
  R.normalizeUnits = function (units) {
    const th = thCfg();
    const U = R.clamp(units, 0, th.MAX_UNITS);
    if (U <= 0) return 0;
    const denom = Math.log10(1 + Math.max(1, th.NORMALIZER_UNITS));
    return Math.log10(1 + U) / denom;
  };

  R.computeMass = function (t) {
    const tt = Math.min(1, Math.max(0, t));
    return 0.1 + 49.9 * tt;
  };

  R.computeTemperature = function (t) {
    const tt = Math.min(1, Math.max(0, t));
    return 3000 + 27000 * tt;
  };

  R.colorForTemperature = function (T) {
    const stops = colorStops();
    const temp = R.safe(T, 3000);
    for (let i = 0; i < stops.length; i++) {
      if (temp < stops[i].max) return stops[i].hex;
    }
    return stops[stops.length - 1].hex;
  };

  /* 主序星颜色分段 → 样式 key */
  R.mainSequenceStyle = function (T) {
    if (T < 3700) return 'redDwarf';
    if (T < 5200) return 'orangeDwarf';
    if (T < 6000) return 'yellowDwarf';
    if (T < 7500) return 'yellowWhite';
    if (T < 10000) return 'whiteStar';
    if (T <= 30000) return 'blueWhite';
    return 'blueStar';
  };

  /* ---------------- 3. 恒星综合计算 ---------------- */
  R.computeStar = function (units) {
    const th = thCfg();
    const U = R.clamp(units, 0, th.MAX_UNITS);
    const t = R.normalizeUnits(U);
    const mass = R.computeMass(t);
    const temperature = R.computeTemperature(t);

    // 主序星半径（致密星不参与放大）
    const L = Math.pow(mass, 3.5);
    const mainRadius = R.clamp(4 + 10 * Math.log10(1 + L), th.MIN_RADIUS, th.MAX_RADIUS);

    let style, radius, compact = false;
    if (U >= th.BLACK_HOLE_UNITS) {
      style = 'blackHole'; radius = 6; compact = true;
    } else if (U >= th.NEUTRON_STAR_UNITS) {
      style = 'neutronStar'; radius = 8; compact = true;
    } else if (U > th.WHITE_DWARF_UNITS) {
      style = 'whiteDwarf'; radius = 10; compact = true;
    } else {
      style = R.mainSequenceStyle(temperature);
      radius = mainRadius;
    }

    // 样式预设可覆盖半径（defense in depth：仍夹在上下限内）
    const preset = stylePresets()[style] || {};
    if (preset.radius) radius = R.clamp(preset.radius, th.MIN_RADIUS, th.MAX_RADIUS);
    if (!compact) radius = R.clamp(radius, th.MIN_RADIUS, th.MAX_RADIUS);

    return {
      units: U,
      t: t,
      mass: mass,
      temperature: temperature,
      color: R.colorForTemperature(temperature),
      radius: radius,
      style: style,
      compact: compact,
      preset: preset
    };
  };

  /* ---------------- 4. 格式 → 样式 ---------------- */
  R.normalizeFormat = function (ext) {
    const e = String(ext || '').replace(/^\./, '').toUpperCase();
    return e || 'UNKNOWN';
  };

  R.resolveStyle = function (format) {
    const f = R.normalizeFormat(format);
    const table = formatStars();
    const hit = table[f];
    if (hit) {
      return {
        format: hit.format || f,
        style: hit.style || 'asteroid',
        secondaryStyle: hit.secondaryStyle || null,
        transparent: !!hit.transparent
      };
    }
    return { format: f === 'UNKNOWN' ? 'UNKNOWN' : f, style: 'asteroid', secondaryStyle: null, transparent: false };
  };

  /* ---------------- 5. 关联边 ---------------- */
  function edgeId(a, b, relation, directed) {
    const x = directed ? a : (a < b ? a : b);
    const y = directed ? b : (a < b ? b : a);
    return x + '|' + y + '|' + relation;
  }

  /**
   * nodes: FileNode 数组（含 id/g/name/type/format/meta/text）
   * 返回 Edge[]，已去重、无自环。
   */
  R.buildEdges = function (nodes) {
    const list = (nodes || []).filter((n) => n && n.id);
    const byId = new Map(list.map((n) => [n.id, n]));
    const rules = edgeRules();
    const th = thCfg();
    const out = new Map();

    function add(source, target, relation, weight) {
      if (!source || !target || source === target) return;
      if (!byId.has(source) || !byId.has(target)) return;
      const rule = rules[relation] || { visual: 'gravity', directed: false, weight: 0.5 };
      const id = edgeId(source, target, relation, rule.directed);
      if (out.has(id)) return;
      out.set(id, {
        id: id,
        source: source,
        target: target,
        relation: relation,
        visual: rule.visual,
        directed: !!rule.directed,
        weight: typeof weight === 'number' ? weight : rule.weight
      });
    }

    // 1) 同文件夹：主星（信息量最大的文本）+ 该文件夹其余天体
    const groups = new Map();
    list.forEach((n) => {
      const g = n.g || n.meta && n.meta.group || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(n);
    });
    groups.forEach((arr) => {
      if (arr.length < 2) return;
      const texts = arr.filter((n) => n.type === 'text');
      let hub = texts.sort((a, b) => (b.units || 0) - (a.units || 0))[0];
      if (!hub) hub = arr.slice().sort((a, b) => (b.units || 0) - (a.units || 0))[0];
      arr.forEach((n) => { if (n.id !== hub.id) add(hub.id, n.id, 'project'); });
    });

    // 2) Markdown / HTML / 文本中的引用（按文件名匹配）
    const nameIndex = new Map();
    list.forEach((n) => {
      const base = String(n.name || '').replace(/\.[^.]+$/, '');
      if (base) {
        if (!nameIndex.has(base)) nameIndex.set(base, []);
        nameIndex.get(base).push(n);
      }
    });
    list.forEach((n) => {
      if (!n.text || typeof n.text !== 'string') return;
      const fmt = String(n.format || '').toUpperCase();
      if (['MD', 'HTML', 'HTM', 'TXT'].indexOf(fmt) < 0) return;
      const scanned = n.text.slice(0, 20000);
      nameIndex.forEach((targets, base) => {
        if (base.length < 2) return;
        if (scanned.indexOf(base) < 0) return;
        targets.forEach((tg) => { if (tg.id !== n.id) add(n.id, tg.id, 'reference'); });
      });
    });

    // 3) 相似：同格式且 U 接近（±20%），每节点最多 limit 条，避免边爆炸
    const similarRule = rules.similar || {};
    const similarLimit = similarRule.limit || 3;
    const similarCount = new Map();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.format !== b.format) continue;
        const ua = a.units || 0, ub = b.units || 0;
        const m = Math.max(ua, ub);
        if (m <= 0) continue;
        if ((similarCount.get(a.id) || 0) >= similarLimit) break;
        if ((similarCount.get(b.id) || 0) >= similarLimit) continue;
        if (Math.abs(ua - ub) / m <= 0.2) {
          add(a.id, b.id, 'similar');
          similarCount.set(a.id, (similarCount.get(a.id) || 0) + 1);
          similarCount.set(b.id, (similarCount.get(b.id) || 0) + 1);
        }
      }
    }

    // 4) 时间轴：同格式的 SRT/VTT/PPT/PPTX/EPUB，按名称排序串联
    const timelineFormats = ['SRT', 'VTT', 'PPT', 'PPTX', 'EPUB'];
    timelineFormats.forEach((fmt) => {
      const seq = list.filter((n) => String(n.format || '').toUpperCase() === fmt)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN', { numeric: true }));
      for (let i = 0; i < seq.length - 1; i++) add(seq[i].id, seq[i + 1].id, 'timeline');
    });

    const edges = Array.from(out.values());

    // 5) 引力透镜：被引用次数达阈值的节点打标（不重复加边）
    const refCount = new Map();
    edges.forEach((e) => {
      if (e.relation === 'reference') refCount.set(e.target, (refCount.get(e.target) || 0) + 1);
    });
    list.forEach((n) => {
      const c = refCount.get(n.id) || 0;
      n.meta = n.meta || {};
      n.meta.refCount = c;
      n.meta.lens = c >= R.safe(th.LENS_THRESHOLD, 5);
    });

    return edges;
  };

  R.edgeId = edgeId;
  R.FALLBACK = FALLBACK;

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})();
