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
    version: '1.2.0',

    /* 星云形态编号：0 螺旋星系 / 1 发射星云（花环）/ 2 环状星云 / 3 暗尘柱状星云 */
    nebulae: [
      { id: 'g1',  group: 'g1',  type: 0, cn: '卷一 · 启程', en: 'VOLUME I',   tag: '螺旋星系 · 时间之轴', radius: 1.40, tiltX: 0.66, tiltZ: -0.34, spin: 0.030, accent: [0.62, 0.80, 1.00], accentCss: '#9ec9ff', match: ['卷一', '卷一 · 启程', '启程'] },
      { id: 'g2',  group: 'g2',  type: 1, cn: '卷二 · 群像', en: 'VOLUME II',  tag: '发射星云 · 花环', radius: 1.50, tiltX: 0.82, tiltZ: 0.20, spin: -0.018, accent: [1.00, 0.58, 0.72], accentCss: '#ff9bb0', match: ['卷二', '卷二 · 群像', '群像'] },
      { id: 'g3',  group: 'g3',  type: 2, cn: '卷三 · 回声', en: 'VOLUME III', tag: '环状星云 · 回声', radius: 1.28, tiltX: 0.42, tiltZ: 0.30, spin: 0.036, accent: [0.45, 0.95, 1.00], accentCss: '#7fe9f2', match: ['卷三', '卷三 · 回声', '回声'] },
      { id: 'g4',  group: 'g4',  type: 3, cn: '卷四 · 焰',  en: 'VOLUME IV',  tag: '暗尘柱 · 焰', radius: 1.42, tiltX: 0.22, tiltZ: -0.14, spin: -0.024, accent: [1.00, 0.70, 0.44], accentCss: '#ffb479', match: ['卷四', '卷四 · 焰', '焰'] },
      { id: 'g5',  group: 'g5',  type: 4, cn: '卷五 · 喷流', en: 'VOLUME V',   tag: '双极喷流 · 脉冲', radius: 1.38, tiltX: 0.18, tiltZ: 0.12, spin: 0.020, accent: [0.70, 0.86, 1.00], accentCss: '#b3dbff', match: ['卷五', '卷五 · 喷流', '喷流'] },
      { id: 'g6',  group: 'g6',  type: 5, cn: '卷六 · 猫眼', en: 'VOLUME VI',  tag: '旋涡眼 · 注视', radius: 1.34, tiltX: 0.52, tiltZ: -0.28, spin: -0.030, accent: [1.00, 0.78, 0.40], accentCss: '#ffc766', match: ['卷六', '卷六 · 猫眼', '猫眼'] },
      { id: 'g7',  group: 'g7',  type: 6, cn: '卷七 · 细丝', en: 'VOLUME VII', tag: '蟹状细丝 · 残骸', radius: 1.36, tiltX: 0.38, tiltZ: 0.22, spin: 0.026, accent: [0.55, 0.95, 0.90], accentCss: '#8cf2e6', match: ['卷七', '卷七 · 细丝', '细丝'] },
      { id: 'g8',  group: 'g8',  type: 7, cn: '卷八 · 花瓣', en: 'VOLUME VIII',tag: '六瓣玫瑰 · 绽放', radius: 1.30, tiltX: 0.60, tiltZ: 0.34, spin: -0.022, accent: [1.00, 0.62, 0.80], accentCss: '#ff9ecc', match: ['卷八', '卷八 · 花瓣', '花瓣'] },
      { id: 'g9',  group: 'g9',  type: 8, cn: '卷九 · 茧',   en: 'VOLUME IX',  tag: '恒星茧 · 孕育', radius: 1.32, tiltX: 0.30, tiltZ: -0.18, spin: 0.018, accent: [1.00, 0.72, 0.46], accentCss: '#ffb877', match: ['卷九', '卷九 · 茧', '茧'] },
      { id: 'g10', group: 'g10', type: 9, cn: '卷十 · 蝶',   en: 'VOLUME X',   tag: '双瓣蝴蝶 · 对称', radius: 1.30, tiltX: 0.48, tiltZ: 0.16, spin: -0.020, accent: [0.62, 0.88, 1.00], accentCss: '#9ee0ff', match: ['卷十', '卷十 · 蝶', '蝶'] }
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

  /* 体积形态总数：与 js/shaders.js 的 medium() 分派一致 */
  SY.CONFIG.NEBULA_TYPES = 12;
  /* 星云数量上限：0 = 不限（实际受显卡与内存限制） */
  SY.CONFIG.MAX_NEBULAE = 0;

  const TYPE_COUNT = SY.CONFIG.NEBULA_TYPES;

  /* 按数量自动排布：1 片居中；≤4 片 2×2；更多环形展开 */
  function layoutNebulae(list) {
    const n = list.length;
    if (!n) return;
    if (n === 1) { list[0].center = [0, 0, 0]; return; }
    if (n <= 4) {
      const pos = [[-4.95, 2.34, -2.30], [4.90, 2.26, -1.10], [-4.70, -2.26, 1.70], [4.78, -2.30, 2.10]];
      list.forEach((nb, i) => { nb.center = pos[i].slice(); });
      return;
    }
    const R = 6.2 + 0.62 * (n - 4);
    list.forEach((nb, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      nb.center = [
        Math.sin(a) * R,
        Math.sin(a * 2) * (1.7 + 0.025 * n),
        Math.cos(a) * R * 0.55
      ];
    });
  }

  /** 依据导入的数据集，得到最终的星云列表（配置项 + 未匹配分组自动补齐） */
  SY.buildNebulae = function (data) {
    const groups = data.groups || [];
    const usedGroups = new Set();
    const usedTypes = new Set();
    const out = [];

    // 形态优先取没被用过的，全部用完才允许重复
    function takeType(preferred) {
      if (Number.isFinite(preferred) && preferred >= 0 && preferred < TYPE_COUNT && !usedTypes.has(preferred)) {
        usedTypes.add(preferred);
        return preferred;
      }
      for (let t = 0; t < TYPE_COUNT; t++) {
        if (!usedTypes.has(t)) { usedTypes.add(t); return t; }
      }
      const t = out.length % TYPE_COUNT;
      usedTypes.add(t);
      return t;
    }

    // 1) 配置里能匹配到数据分组的
    SY.CONFIG.nebulae.forEach((n) => {
      const g = groups.find((x) => x.id === n.group) || groups.find((x) => (n.match || []).indexOf(x.cn) >= 0);
      if (!g || usedGroups.has(g.id)) return;
      usedGroups.add(g.id);
      out.push(Object.assign({}, n, {
        group: g.id,
        cn: g.cn || n.cn,
        en: g.en || n.en,
        tag: g.tag || n.tag,
        count: (g.count || 0),
        type: takeType(n.type)
      }));
    });

    // 2) 剩下的分组自动生成星云
    let extra = 0;
    groups.forEach((g) => {
      if (usedGroups.has(g.id)) return;
      const idx = extra++;
      const acc = SY.AUTO_ACCENTS[(out.length + idx) % SY.AUTO_ACCENTS.length];
      const t = takeType();
      out.push({
        id: g.id, group: g.id, type: t,
        cn: g.cn, en: g.en || ('GROUP ' + (idx + 1)),
        tag: g.tag || ('形态 ' + (t + 1) + ' · 自动生成'),
        radius: 1.30 + 0.08 * (idx % 3),
        tiltX: 0.30 + 0.18 * (idx % 4),
        tiltZ: 0.10 * ((idx % 5) - 2),
        spin: (idx % 2 ? -1 : 1) * (0.018 + 0.004 * (idx % 4)),
        accent: acc, accentCss: hex(acc), count: g.count || 0, auto: true
      });
    });

    // 3) 数量上限（0 = 不限）
    const max = SY.CONFIG.MAX_NEBULAE | 0;
    const list = max > 0 ? out.slice(0, max) : out;
    if (list.length !== out.length) {
      console.warn('[星云] 超过 MAX_NEBULAE=' + max + '，其余分组不显示');
    }

    // 4) 自动排布
    const auto = list.filter((n) => !n.center);
    if (auto.length) layoutNebulae(auto);

    // 5) 场景包围盒：供相机取景使用
    let rx = 0, ry = 0;
    list.forEach((n) => {
      const r = (n.radius || 1.4) * 1.45;
      rx = Math.max(rx, Math.abs(n.center[0]) + r);
      ry = Math.max(ry, Math.abs(n.center[1]) + r);
    });
    SY.sceneBounds = { rx: Math.max(3.2, rx), ry: Math.max(2.2, ry) };

    return list;
  };
})();