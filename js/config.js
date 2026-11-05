/* ============================================================
   星云阅读器 · 全局配置
   ------------------------------------------------------------
   - 程序本身不携带任何剧情文本；
   - 这里只定义“入口处的大星云”如何呈现；
   - 想新增一片大星云：在 nebulae 里追加一项即可（详见 教程.md 第 6 节）。
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});

  SY.CONFIG = {
    title: '星云阅读器',
    titleEn: 'NEBULA READER',
    tagline: '把你的文本，变成一片可以走进的星云。',
    version: '1.1.0',

    /* 星云形态编号：0 螺旋星系 / 1 发射星云（花环）/ 2 环状星云 / 3 暗尘柱状星云 */
    nebulae: [
      {
        id: 'g1', group: 'g1', type: 0,
        cn: '卷一 · 启程', en: 'VOLUME I', tag: '螺旋星系 · 时间之轴',
        center: [-4.95, 2.34, -2.30], radius: 1.40,
        tiltX: 0.66, tiltZ: -0.34, spin: 0.030,
        accent: [0.62, 0.80, 1.00], accentCss: '#9ec9ff',
        match: ['卷一', '卷一 · 启程', '启程']
      },
      {
        id: 'g2', group: 'g2', type: 1,
        cn: '卷二 · 群像', en: 'VOLUME II', tag: '发射星云 · 群像',
        center: [4.90, 2.26, -1.10], radius: 1.50,
        tiltX: 0.82, tiltZ: 0.20, spin: -0.018,
        accent: [1.00, 0.58, 0.72], accentCss: '#ff9bb0',
        match: ['卷二', '卷二 · 群像', '群像']
      },
      {
        id: 'g3', group: 'g3', type: 2,
        cn: '卷三 · 回声', en: 'VOLUME III', tag: '环状星云 · 回声',
        center: [-4.70, -2.26, 1.70], radius: 1.28,
        tiltX: 0.42, tiltZ: 0.30, spin: 0.036,
        accent: [0.45, 0.95, 1.00], accentCss: '#7fe9f2',
        match: ['卷三', '卷三 · 回声', '回声']
      },
      {
        id: 'g4', group: 'g4', type: 3,
        cn: '卷四 · 焰', en: 'VOLUME IV', tag: '暗尘星云 · 焰',
        center: [4.78, -2.30, 2.10], radius: 1.42,
        tiltX: 0.22, tiltZ: -0.14, spin: -0.024,
        accent: [1.00, 0.70, 0.44], accentCss: '#ffb479',
        match: ['卷四', '卷四 · 焰', '焰']
      }
    ]
  };

  /* ============================================================
     多格式天体系统配置（阶段一~三）
     - UNITS      : 等效信息量换算系数
     - THRESHOLDS : 致密星阈值 / 半径上下限 / 文件体积上限
     - FORMAT_STARS : 扩展名 → 天体样式
     - STYLE_PRESETS: 样式 → 视觉参数（半径、光晕、脉冲、环、尾迹）
     - EDGE_RULES : 关联边生成规则
     ============================================================ */
  SY.CONFIG.UNITS = {
    TEXT_CHARS_PER_UNIT: 100,     // 每 100 个 Unicode 码点 = 1 U
    AUDIO_UNITS_PER_SECOND: 10,   // 每秒音频 = 10 U
    IMAGE_PIXELS_PER_UNIT: 10000, // 每 1 万像素 = 1 U
    TEXT_BYTES_PER_UNIT: 1024     // 无法取字符时：每 1KB = 1 U
  };

  SY.CONFIG.THRESHOLDS = {
    NORMALIZER_UNITS: 100000,   // t 归一化分母（= 主序星上限）
    WHITE_DWARF_UNITS: 100000,  // U ≥ 1e5 → 白矮星
    NEUTRON_STAR_UNITS: 300000, // U ≥ 3e5 → 中子星
    BLACK_HOLE_UNITS: 1000000,  // U ≥ 1e6 → 黑洞
    LENS_THRESHOLD: 5,          // 被引用 ≥5 次追加引力透镜强调
    MAX_FILE_MB: 100,           // 单文件体积上限
    MIN_RADIUS: 4,
    MAX_RADIUS: 72,
    MAX_UNITS: Number.MAX_SAFE_INTEGER
  };

  /* 温度 → 颜色分段（视觉用，K） */
  SY.CONFIG.COLOR_STOPS = [
    { max: 3700, hex: '#ff5a3c' },
    { max: 5200, hex: '#ff9a4d' },
    { max: 6000, hex: '#ffd36b' },
    { max: 7500, hex: '#fff4d6' },
    { max: 10000, hex: '#dcefff' },
    { max: 30000, hex: '#9cc8ff' },
    { max: Infinity, hex: '#6aa8ff' }
  ];
  /* 扩展名 → 样式；secondaryStyle 表示双属性天体（PDF/RAW/PSD） */
  SY.CONFIG.FORMAT_STARS = {
    /* ---- 文本类 ---- */
    TXT: { style: 'redDwarf' },
    LOG: { style: 'comet' },
    MD: { style: 'yellowDwarf' },
    HTML: { style: 'terrestrialPlanet' },
    HTM: { style: 'terrestrialPlanet' },
    XML: { style: 'asteroidBeltNode' },
    JSON: { style: 'asteroidBeltNode' },
    YAML: { style: 'asteroidBeltNode' },
    YML: { style: 'asteroidBeltNode' },
    INI: { style: 'asteroidBeltNode' },
    TOML: { style: 'asteroidBeltNode' },
    CSV: { style: 'globularCluster' },
    TSV: { style: 'globularCluster' },
    TEX: { style: 'binarySystem' },
    LATEX: { style: 'binarySystem' },
    SRT: { style: 'meteorShower' },
    VTT: { style: 'meteorShower' },
    RTF: { style: 'orangeDwarf' },
    DOC: { style: 'yellowDwarf' },
    DOCX: { style: 'yellowDwarf' },
    ODT: { style: 'blueDwarf' },
    PDF: { style: 'gasGiant', secondaryStyle: 'gasGiantNebula' },
    EPUB: { style: 'emissionNebula' },
    XLS: { style: 'globularCluster' },
    XLSX: { style: 'globularCluster' },
    PPT: { style: 'pulsar' },
    PPTX: { style: 'pulsar' },

    /* ---- 音频类 ---- */
    MP3: { style: 'redDwarfPulse' },
    AAC: { style: 'orangeDwarfPulse' },
    M4A: { style: 'orangeDwarfPulse' },
    OGG: { style: 'brownDwarf' },
    OPUS: { style: 'fastRadioBurst' },
    WMA: { style: 'roguePlanet' },
    AMR: { style: 'meteor' },
    WAV: { style: 'mainSequenceStar' },
    FLAC: { style: 'whiteDwarf' },
    ALAC: { style: 'blueWhiteDwarf' },
    AIFF: { style: 'yellowWhiteStar' },
    APE: { style: 'neutronStar' },
    MIDI: { style: 'binaryOrbit' },
    MID: { style: 'binaryOrbit' },
    AC3: { style: 'binarySystem' },
    EAC3: { style: 'binarySystem' },
    DTS: { style: 'tripleSystem' },
    PCM: { style: 'protostellarCloud' },

    /* ---- 图片类 ---- */
    JPG: { style: 'terrestrialPlanet' },
    JPEG: { style: 'terrestrialPlanet' },
    PNG: { style: 'ringedPlanet', transparent: true },
    GIF: { style: 'variableStar' },
    BMP: { style: 'asteroid' },
    TIFF: { style: 'gasGiant' },
    TIF: { style: 'gasGiant' },
    WEBP: { style: 'iceGiant' },
    HEIC: { style: 'dwarfPlanet' },
    HEIF: { style: 'dwarfPlanet' },
    AVIF: { style: 'brownDwarf' },
    ICO: { style: 'satellite' },
    SVG: { style: 'constellation' },
    EPS: { style: 'darkNebula' },
    AI: { style: 'layeredNebula' },
    CR2: { style: 'protoplanetaryDisk', format: 'RAW' },
    CR3: { style: 'protoplanetaryDisk', format: 'RAW' },
    NEF: { style: 'protoplanetaryDisk', format: 'RAW' },
    ARW: { style: 'protoplanetaryDisk', format: 'RAW' },
    DNG: { style: 'protoplanetaryDisk', format: 'RAW' },
    PSD: { style: 'layeredNebula' },
    XCF: { style: 'nebula' },
    TGA: { style: 'asteroid' },
    EXR: { style: 'supernovaRemnant' },
    HDR: { style: 'supernovaRemnant' }
  };

  /* 样式视觉参数：glow 光晕倍数，sizeScale 半径缩放，compact 致密星，ring/disk/pulse/tail 动效开关 */
  SY.CONFIG.STYLE_PRESETS = {
    redDwarf: { glow: 1.0, sizeScale: 1.0 },
    orangeDwarf: { glow: 1.0, sizeScale: 1.0 },
    yellowDwarf: { glow: 1.0, sizeScale: 1.0 },
    blueDwarf: { glow: 1.0, sizeScale: 1.0 },
    yellowWhite: { glow: 1.0, sizeScale: 1.0 },
    whiteStar: { glow: 1.0, sizeScale: 1.0 },
    blueWhite: { glow: 1.0, sizeScale: 1.0 },
    blueStar: { glow: 1.0, sizeScale: 1.0 },
    yellowWhiteStar: { glow: 1.0, sizeScale: 1.0 },
    mainSequenceStar: { glow: 1.0, sizeScale: 1.0 },
    redDwarfPulse: { glow: 1.1, sizeScale: 1.0, pulse: true },
    orangeDwarfPulse: { glow: 1.1, sizeScale: 1.0, pulse: true },
    brownDwarf: { glow: 0.8, sizeScale: 0.95 },
    blueWhiteDwarf: { glow: 1.4, sizeScale: 0.9 },
    whiteDwarf: { glow: 1.7, sizeScale: 0.75, compact: true, radius: 10 },
    neutronStar: { glow: 2.0, sizeScale: 0.6, compact: true, radius: 8, pulse: true },
    blackHole: { glow: 2.6, sizeScale: 0.45, compact: true, radius: 6, disk: true },
    pulsar: { glow: 1.8, sizeScale: 0.8, pulse: true },
    variableStar: { glow: 1.2, sizeScale: 1.0, pulse: true },
    fastRadioBurst: { glow: 1.5, sizeScale: 0.8, pulse: true },
    comet: { glow: 1.0, sizeScale: 0.9, tail: true },
    meteor: { glow: 1.0, sizeScale: 0.8, tail: true },
    meteorShower: { glow: 1.1, sizeScale: 0.9, tail: true },
    terrestrialPlanet: { glow: 0.9, sizeScale: 1.15, ring: false },
    ringedPlanet: { glow: 0.9, sizeScale: 1.2, ring: true },
    gasGiant: { glow: 1.0, sizeScale: 1.35, ring: true },
    gasGiantNebula: { glow: 1.3, sizeScale: 1.2 },
    iceGiant: { glow: 0.9, sizeScale: 1.2, ring: true },
    dwarfPlanet: { glow: 0.8, sizeScale: 1.0 },
    roguePlanet: { glow: 0.7, sizeScale: 1.0 },
    satellite: { glow: 0.7, sizeScale: 0.8 },
    asteroid: { glow: 0.5, sizeScale: 0.8 },
    asteroidBeltNode: { glow: 0.6, sizeScale: 0.9 },
    globularCluster: { glow: 1.2, sizeScale: 1.1 },
    binarySystem: { glow: 1.1, sizeScale: 1.0 },
    binaryOrbit: { glow: 1.1, sizeScale: 1.0, orbit: true },
    tripleSystem: { glow: 1.1, sizeScale: 1.0 },
    protostellarCloud: { glow: 1.3, sizeScale: 1.2 },
    protoplanetaryDisk: { glow: 1.2, sizeScale: 1.3, disk: true },
    emissionNebula: { glow: 1.3, sizeScale: 1.2 },
    darkNebula: { glow: 0.7, sizeScale: 1.1 },
    layeredNebula: { glow: 1.1, sizeScale: 1.1 },
    nebula: { glow: 1.0, sizeScale: 1.1 },
    supernovaRemnant: { glow: 1.6, sizeScale: 1.2 },
    constellation: { glow: 0.8, sizeScale: 0.9 }
  };

  /* 关联边规则：relation → 视觉样式 / 是否有向 / 权重 */
  SY.CONFIG.EDGE_RULES = {
    project: { visual: 'gravity', directed: false, weight: 1.0 },
    reference: { visual: 'constellation', directed: true, weight: 0.8 },
    embed: { visual: 'constellation', directed: true, weight: 0.9 },
    tag: { visual: 'nebulaBridge', directed: false, weight: 0.6 },
    timeline: { visual: 'orbit', directed: true, weight: 0.7 },
    similar: { visual: 'nebulaBridge', directed: false, weight: 0.5, limit: 3 }
  };
  /* 自动生成一片大星云时使用的备选色（按顺序取用） */
  SY.AUTO_ACCENTS = [
    [0.60, 0.80, 1.00], [1.00, 0.58, 0.72], [0.45, 0.95, 1.00], [1.00, 0.70, 0.44],
    [0.72, 0.62, 1.00], [0.55, 0.95, 0.70], [1.00, 0.86, 0.55], [0.95, 0.60, 0.95]
  ];

  function hex(a) {
    const c = a.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  /** 由主题色推导星体色谱 */
  SY.paletteOf = function (accent) {
    const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    return [
      accent.slice(),
      mix(accent, [1, 1, 1], 0.45),
      mix(accent, [1.0, 0.85, 0.55], 0.50),
      mix(accent, [0.55, 0.85, 1.0], 0.40)
    ];
  };

  /** 依据导入的数据集，得到最终的星云列表（配置项 + 未匹配分组自动补齐） */
  SY.buildNebulae = function (data) {
    const cfg = SY.CONFIG.nebulae.slice();
    const groups = data.groups || [];
    const used = new Set();
    const out = [];

    // 1) 配置里能匹配到数据分组的
    cfg.forEach((n) => {
      const g = groups.find((x) => x.id === n.group) || groups.find((x) => (n.match || []).indexOf(x.cn) >= 0);
      if (!g || used.has(g.id)) return;
      used.add(g.id);
      out.push(Object.assign({}, n, {
        group: g.id,
        cn: g.cn || n.cn,
        en: g.en || n.en,
        tag: g.tag || n.tag,
        count: (g.count || 0)
      }));
    });

    // 2) 剩下的分组自动生成星云
    let extra = 0;
    groups.forEach((g) => {
      if (used.has(g.id)) return;
      const idx = extra++;
      const acc = SY.AUTO_ACCENTS[(out.length + idx) % SY.AUTO_ACCENTS.length];
      out.push({
        id: g.id, group: g.id, type: (out.length + idx) % 4,
        cn: g.cn, en: g.en || ('GROUP ' + (idx + 1)),
        tag: g.tag || '自动生成 · 可在 js/config.js 中微调',
        radius: 1.36, tiltX: 0.5, tiltZ: 0.15, spin: 0.028,
        accent: acc, accentCss: hex(acc), count: g.count || 0, auto: true
      });
    });

    // 3) 未指定坐标的自动排布（2×N 网格，围绕中心）
    const need = out.filter((n) => !n.center);
    if (need.length) {
      need.forEach((n, i) => {
        const k = need.length;
        const perRow = Math.ceil(k / 2);
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const x = (col - (perRow - 1) / 2) * 6.6;
        const y = (row === 0 ? 1.9 : -1.9);
        const z = (row === 0 ? -2.0 : 1.9);
        n.center = [x, y, z];
      });
    }
    return out;
  };
})();
