/* ============================================================
   星云文本阅读 · 全局配置
   ------------------------------------------------------------
   - 程序本身不携带任何剧情文本；
   - 这里只定义“入口处的大星云”如何呈现；
   - 想新增一片大星云：在 nebulae 里追加一项即可（详见 教程.md 第 6 节）。
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});

  SY.CONFIG = {
    title: '星云文本阅读',
    titleEn: 'NEBULA TEXT READER',
    tagline: '把你的文本，变成一片可以走进的星云。',
    version: '1.0.0',

    /* 星云形态编号：0 螺旋星系 / 1 发射星云（花环）/ 2 环状星云 / 3 暗尘柱状星云 */
    nebulae: [
      {
        id: 'g1', group: 'g1', type: 0,
        cn: '卷一 · 启程', en: 'VOLUME I', tag: '螺旋星系 · 时间之轴',
        center: [-4.95, 2.02, -2.30], radius: 1.40,
        tiltX: 0.66, tiltZ: -0.34, spin: 0.030,
        accent: [0.62, 0.80, 1.00], accentCss: '#9ec9ff',
        match: ['卷一', '卷一 · 启程', '启程']
      },
      {
        id: 'g2', group: 'g2', type: 1,
        cn: '卷二 · 群像', en: 'VOLUME II', tag: '发射星云 · 群像',
        center: [4.90, 1.98, -1.10], radius: 1.50,
        tiltX: 0.82, tiltZ: 0.20, spin: -0.018,
        accent: [1.00, 0.58, 0.72], accentCss: '#ff9bb0',
        match: ['卷二', '卷二 · 群像', '群像']
      },
      {
        id: 'g3', group: 'g3', type: 2,
        cn: '卷三 · 回声', en: 'VOLUME III', tag: '环状星云 · 回声',
        center: [-4.70, -1.74, 1.70], radius: 1.28,
        tiltX: 0.42, tiltZ: 0.30, spin: 0.036,
        accent: [0.45, 0.95, 1.00], accentCss: '#7fe9f2',
        match: ['卷三', '卷三 · 回声', '回声']
      },
      {
        id: 'g4', group: 'g4', type: 3,
        cn: '卷四 · 焰', en: 'VOLUME IV', tag: '暗尘星云 · 焰',
        center: [4.78, -1.78, 2.10], radius: 1.42,
        tiltX: 0.22, tiltZ: -0.14, spin: -0.024,
        accent: [1.00, 0.70, 0.44], accentCss: '#ffb479',
        match: ['卷四', '卷四 · 焰', '焰']
      }
    ]
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
