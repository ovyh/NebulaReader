/* ============================================================
   星云阅读器 · Renderer
   - 四片体积星云（实时 raymarch，无贴图）
   - 星云内部：每篇文档 = 一颗恒星
   - 泛光 / ACES / 色散 后处理
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});
  const M = SY.M;
  const GL = SY.GL;

  let NEBULAE = [];


  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  class Renderer {
    constructor(canvas, index) {
      this.canvas = canvas;
      this.index = index;
      NEBULAE = SY.buildNebulae(index);
      this.gl = GL.createContext(canvas);
      this.time = 0;
      this.last = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.renderScale = 1.0;
      this.volScale = 0.56;
      this.steps = 72;
      this.mode = 'galaxy';
      this.nebulaIndex = -1;
      this.activeGroup = null;
      this.hoverNebula = -1;
      this.hoverStar = null;
      this.hoverEdge = null;
      this.focusStar = null;
      this.edgeScreen = [];
      this.trans = null;
      this.pointer = { x: 0, y: 0, down: false, drag: false, lx: 0, ly: 0, moved: 0 };
      this.pointers = new Map();
      this.pinch = null;
      this.orbit = { az: 0.0, el: 0.055, dist: 12.4 };
      this.orbitIn = { az: 0.62, el: 0.52, dist: 7.4 };
      this.cam = { eye: [0, 0.4, 12.4], target: [0, 0, 0.4], fov: 43 * Math.PI / 180 };
      this.viewProj = new Float32Array(16);
      this.view = new Float32Array(16);
      this.proj = new Float32Array(16);
      this.np = new Float32Array(16);
      this.stats = { fps: 0, ms: 16, frames: 0, acc: 0 };
      this.qualityTimer = 0;
      this.nebulaScreens = NEBULAE.map(() => ({ x: 0, y: 0, r: 0, visible: false }));
      this.groups = {};
      this.onNebulaHover = null;
      this.onNebulaClick = null;
      this.onStarHover = null;
      this.onStarClick = null;
      this.onEdgeHover = null;
      this.onEdgeClick = null;
      this.onSwitch = null;
      this.onDiveEnd = null;
      this.onSurfaceEnd = null;
      this.hoverAmount = NEBULAE.map(() => 0);
      this.init();
    }

    /** 热切换数据集（不重建 WebGL 上下文） */
    setDataset(data) {
      this.index = data;
      NEBULAE = SY.buildNebulae(data);
      this.nebulaScreens = NEBULAE.map(() => ({ x: 0, y: 0, r: 0, visible: false }));
      this.hoverAmount = NEBULAE.map(() => 0);
      this.mode = 'galaxy';
      this.nebulaIndex = -1;
      this.activeGroup = null;
      this.trans = null;
      this.hoverStar = null;
      this.hoverEdge = null;
      this.focusStar = null;
      this.edgeScreen = [];
      this.hoverNebula = -1;
      this.orbit = { az: 0.0, el: 0.055, dist: 12.4 };
      this.cam = { eye: [0, 0.4, 12.4], target: [0, 0, 0.4], fov: 43 * Math.PI / 180 };
      this.buildAllStars();
    }

    /* ---------------- init ---------------- */
    init() {
      const gl = this.gl;
      this.progSky = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragSky, 'sky');
      this.progNeb = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragNebula, 'nebula');
      this.progStar = GL.program(gl, SY.shaders.vertStar, SY.shaders.fragStar, 'star');
      this.progLine = GL.program(gl, SY.shaders.vertLine, SY.shaders.fragLine, 'line');
      this.progBright = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragBright, 'bright');
      this.progDown = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragDown, 'down');
      this.progUp = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragUp, 'up');
      this.progComp = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragComposite, 'composite');
      this.progVolComp = GL.program(gl, SY.shaders.vertQuad, SY.shaders.fragVolComp, 'volcomp');

      this.vaoEmpty = GL.emptyVAO(gl);
      this.quad = GL.quadBuffer(gl);

      /* 3D noise */
      const raw = atob(window.__SY_NOISE_B64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      this.noiseTex = GL.upload3D(gl, bytes, window.__SY_NOISE_SIZE || 64);

      this.resize(true);
      this.buildAllStars();

      window.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      window.addEventListener('pointermove', (e) => this.onPointerMove(e));
      window.addEventListener('pointerup', (e) => this.onPointerUp(e));
      window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
      this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      this.canvas.addEventListener('pointerleave', () => {
        if (this.hoverStar) {
          this.hoverStar = null;
      this.hoverEdge = null;
      this.focusStar = null;
      this.edgeScreen = [];
          this.canvas.style.cursor = 'default';
          if (this.onStarHover) this.onStarHover(null);
        }
      });
      window.addEventListener('resize', () => this.resize(false));
      if (window.ResizeObserver) {
        try { new ResizeObserver(() => this.resize(false)).observe(this.canvas); } catch (e) {}
      }
    }

    /* ---------------- targets ---------------- */
    resize(initial) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.renderScale;
      const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
      if (!initial && this.rt && this.rt.scene.w === w && this.rt.scene.h === h) return;
      this.canvas.width = w;
      this.canvas.height = h;
      const gl = this.gl;
      if (this.rt) this.destroyTargets(this.rt);
      const float = GL.floatColor;
      const scene = GL.target(gl, w, h, { float });
      const vol = GL.target(gl, Math.max(2, Math.floor(w * this.volScale)), Math.max(2, Math.floor(h * this.volScale)), { float });
      const half = Math.max(2, Math.floor(w / 2));
      const halfH = Math.max(2, Math.floor(h / 2));
      const bl = [];
      let bw = half, bh = halfH;
      for (let i = 0; i < 4; i++) {
        bl.push(GL.target(gl, bw, bh, { float }));
        bw = Math.max(2, Math.floor(bw / 2));
        bh = Math.max(2, Math.floor(bh / 2));
      }
      this.rt = { scene, vol, bloom: bl, w, h, dpr };
    }

    destroyTargets(rt) {
      const gl = this.gl;
      gl.deleteTexture(rt.scene.tex); gl.deleteFramebuffer(rt.scene.fbo);
      gl.deleteTexture(rt.vol.tex); gl.deleteFramebuffer(rt.vol.fbo);
      rt.bloom.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    }

    /* ---------------- star layout ---------------- */
    buildAllStars() {
      const data = this.index;
      this.groups = {};
      (data.groups || []).forEach((g) => {
        const list = data.docs.filter((d) => d.g === g.id);
        if (list.length) this.groups[g.id] = this.buildStars(g.id, list);
      });
      this.buildEdgeGeometry();
    }

    buildStars(groupId, docs) {
      const gl = this.gl;
      const neb = NEBULAE.find((n) => n.group === groupId) || NEBULAE[0] || { type: 0, accent: [0.6, 0.8, 1.0] };
      const type = neb.type | 0;
      const rnd = mulberry32(hashStr(groupId + '::' + docs.length));
      const palette = SY.paletteOf(neb.accent || [0.6, 0.8, 1.0]);
      const list = [];
      const n = docs.length;

      for (let i = 0; i < n; i++) {
        const d = docs[i];
        const t = n > 1 ? i / (n - 1) : 0;
        let p;
        if (type === 0) {
          // 螺旋星系：单臂旋涡
          const r = 0.70 + t * 3.10;
          const a = t * 3.55 + (rnd() - 0.5) * 0.10;
          p = [Math.cos(a) * r, (rnd() - 0.5) * 0.42 * (1 - t * 0.35), Math.sin(a) * r];
        } else if (type === 1) {
          // 发射星云：三臂团簇 + 核球
          if (i % 10 < 7) {
            const tt = Math.pow(rnd(), 0.66);
            const r = 0.65 + tt * 3.75;
            const arm = i % 3;
            const a = arm * 2.0944 + tt * 3.75 + (rnd() - 0.5) * 0.55;
            p = [Math.cos(a) * r, gauss(rnd) * 0.52 * (1.0 - tt * 0.30), Math.sin(a) * r];
          } else {
            const r = Math.pow(rnd(), 0.85) * 1.45;
            const th = rnd() * Math.PI * 2;
            const ph = Math.acos(2 * rnd() - 1);
            p = [Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r * 0.85, Math.sin(ph) * Math.sin(th) * r];
          }
        } else if (type === 2) {
          // 环状星云：一圈回声
          const a = t * Math.PI * 2 + (rnd() - 0.5) * 0.24;
          const r = 2.55 + rnd() * 0.72;
          p = [Math.cos(a) * r, (rnd() - 0.5) * 1.0, Math.sin(a) * r];
        } else {
          // 暗尘柱状：彗尾
          const r = 0.55 + t * 3.95;
          const a = -0.85 + t * 2.1 + (rnd() - 0.5) * 0.42;
          p = [Math.cos(a) * r * 0.92, (rnd() - 0.5) * 1.55 * (1.0 - t * 0.35) + t * 0.28, Math.sin(a) * r];
        }

        // 节点 → 视觉：半径 / 颜色 / 样式来自 js/rules.js；旧数据回退到字数
        const radius = Number.isFinite(d.radius) ? d.radius : (4 + Math.min(68, (d.w || 0) / 2000));
        const preset = (SY.CONFIG.STYLE_PRESETS || {})[d.style] || {};
        const compact = !!d.compact || !!preset.compact;
        const sizeScale = compact ? 1 : (preset.sizeScale || 1);
        const size = (0.020 + (radius - 4) / 68 * 0.115) * sizeScale;
        const rgb = (d.color && SY.rules) ? SY.rules.hexToRgb(d.color) : palette[i % palette.length];
        // 图片：主色调参与混色（不贴位图），亮度影响光晕
        let col = rgb.slice();
        if (d.accent && d.type === 'image' && SY.rules) {
          const a = SY.rules.hexToRgb(d.accent);
          const mix = 0.35;
          col = [
            rgb[0] * (1 - mix) + a[0] * mix,
            rgb[1] * (1 - mix) + a[1] * mix,
            rgb[2] * (1 - mix) + a[2] * mix
          ];
        }
        const jitter = compact ? 1 : (0.94 + rnd() * 0.12);
        list.push({
          doc: d, pos: p, size: size * jitter, color: col, seed: rnd() * 10,
          style: d.style || 'redDwarf', compact: compact,
          glow: preset.glow || 1, ring: !!preset.ring, disk: !!preset.disk,
          pulse: !!preset.pulse, tail: !!preset.tail,
          screen: { x: 0, y: 0, r: 0, visible: false }
        });
      }

      const centers = new Float32Array(n * 4);
      const colors = new Float32Array(n * 4);
      list.forEach((s, i) => {
        centers[i * 4] = s.pos[0]; centers[i * 4 + 1] = s.pos[1]; centers[i * 4 + 2] = s.pos[2];
        centers[i * 4 + 3] = s.size;
        colors[i * 4] = s.color[0]; colors[i * 4 + 1] = s.color[1]; colors[i * 4 + 2] = s.color[2];
        colors[i * 4 + 3] = s.seed;
      });

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const cb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, centers, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);

      const colB = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, colB);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(2, 1);
      gl.bindVertexArray(null);

      /* constellation lines */
      const links = [];
      if (type === 0 || type === 2 || type === 3) {
        for (let i = 0; i < list.length - 1; i++) {
          links.push([list[i].pos, list[i + 1].pos, 0.55]);
        }
      } else {
        for (let i = 0; i < list.length; i++) {
          let best = -1, bd = 1e9;
          for (let k = 0; k < list.length; k++) {
            if (k === i) continue;
            const dx = list[i].pos[0] - list[k].pos[0];
            const dy = list[i].pos[1] - list[k].pos[1];
            const dz = list[i].pos[2] - list[k].pos[2];
            const dd = dx * dx + dy * dy + dz * dz;
            if (dd < bd) { bd = dd; best = k; }
          }
          if (best >= 0 && bd < 0.9) links.push([list[i].pos, list[best].pos, 0.30]);
        }
      }
      const lineArr = new Float32Array(links.length * 6);
      links.forEach((l, i) => {
        lineArr[i * 6] = l[0][0]; lineArr[i * 6 + 1] = l[0][1]; lineArr[i * 6 + 2] = l[0][2];
        lineArr[i * 6 + 3] = l[1][0]; lineArr[i * 6 + 4] = l[1][1]; lineArr[i * 6 + 5] = l[1][2];
      });
      const lineVAO = gl.createVertexArray();
      const lineBuf = gl.createBuffer();
      gl.bindVertexArray(lineVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, lineArr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      /* 致密星光晕 / 吸积盘环：单独 VAO，避免动到普通恒星的 instanced 批次 */
      const compactStars = list.filter((s) => s.compact);
      let glowVAO = null, glowCount = 0;
      if (compactStars.length) {
        const gc = new Float32Array(compactStars.length * 4);
        const gcol = new Float32Array(compactStars.length * 4);
        compactStars.forEach((s, i) => {
          gc[i * 4] = s.pos[0]; gc[i * 4 + 1] = s.pos[1]; gc[i * 4 + 2] = s.pos[2];
          gc[i * 4 + 3] = s.size * (s.glow || 1.6) * 2.4;
          gcol[i * 4] = s.color[0]; gcol[i * 4 + 1] = s.color[1]; gcol[i * 4 + 2] = s.color[2];
          gcol[i * 4 + 3] = s.seed;
        });
        glowVAO = gl.createVertexArray();
        gl.bindVertexArray(glowVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const gcb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gcb);
        gl.bufferData(gl.ARRAY_BUFFER, gc, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);
        const gcolB = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gcolB);
        gl.bufferData(gl.ARRAY_BUFFER, gcol, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(2, 1);
        gl.bindVertexArray(null);
        glowCount = compactStars.length;
      }

      /* 黑洞吸积盘：静态圆环线框 */
      const holes = list.filter((s) => s.disk);
      let ringVAO = null, ringCount = 0;
      if (holes.length) {
        const seg = 48;
        const arr = new Float32Array(holes.length * seg * 6);
        let k = 0;
        holes.forEach((s) => {
          const R = Math.max(0.05, s.size * 3.2);
          for (let j = 0; j < seg; j++) {
            const a0 = (j / seg) * Math.PI * 2;
            const a1 = ((j + 1) / seg) * Math.PI * 2;
            const c0 = [Math.cos(a0) * R, Math.sin(a0) * R * 0.32, Math.sin(a0) * R];
            const c1 = [Math.cos(a1) * R, Math.sin(a1) * R * 0.32, Math.sin(a1) * R];
            arr[k++] = s.pos[0] + c0[0]; arr[k++] = s.pos[1] + c0[1]; arr[k++] = s.pos[2] + c0[2];
            arr[k++] = s.pos[0] + c1[0]; arr[k++] = s.pos[1] + c1[1]; arr[k++] = s.pos[2] + c1[2];
          }
        });
        ringVAO = gl.createVertexArray();
        const rb = gl.createBuffer();
        gl.bindVertexArray(ringVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, rb);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        ringCount = holes.length * seg;
      }

      /* 关联边：占位，等 buildEdgeGeometry() 填充 */
      return {
        list, vao, count: n, lineVAO, lineCount: links.length,
        palette, centerBuf: cb, colorBuf: colB, lineBuf,
        glowVAO, glowCount, ringVAO, ringCount,
        edgeVAO: null, edgeCount: 0, adjacency: null, highlightBuf: null, highlightVAO: null
      };
    }

    /* ---------------- camera ---------------- */
    updateCamera(dt) {
      const cam = this.cam;
      let desiredEye, desiredTarget, desiredFov;

      if (this.trans) {
        const tr = this.trans;
        tr.t += dt / tr.dur;
        const e = M.easeInOut(Math.min(tr.t, 1));
        cam.eye = M.lerp3(tr.fromEye, tr.toEye, e);
        cam.target = M.lerp3(tr.fromTarget, tr.toTarget, e);
        cam.fov = tr.fromFov + (tr.toFov - tr.fromFov) * e;
        if (!tr.switched && tr.t >= 0.52) {
          tr.switched = true;
          this.doSwitch(tr.dir);
          cam.eye = tr.midEye.slice();
          cam.target = tr.midTarget.slice();
          cam.fov = tr.midFov;
        }
        if (tr.t >= 1) {
          const dir = tr.dir;
          this.trans = null;
          if (dir === 'in') { if (this.onDiveEnd) this.onDiveEnd(); }
          else { if (this.onSurfaceEnd) this.onSurfaceEnd(); }
        }
        return;
      }

      if (this.mode === 'galaxy') {
        const target = [0, -0.08, 0.4];
        /* 依据视口高度自适应取景：窗口较矮时整体拉远，保证四组标签完整可见 */
        const scr = (window.screen && window.screen.height) ? window.screen.height : 900;
        const sy = window.screenY || 0;
        const oh = window.outerHeight || 0;
        const chrome = Math.max(0, oh - (window.innerHeight || 0));
        const offscreen = chrome > 20 && sy + oh > scr + 8;
        const vh = offscreen ? Math.max(320, scr - Math.max(sy, 0)) : (this.canvas.clientHeight || 900);
        const vw = this.canvas.clientWidth || 1400;
        const fitH = M.clamp(vh / 980, 0.60, 1.10);
        const fitW = M.clamp(vw / 1500, 0.72, 1.15);
        let fit = Math.min(fitH, fitW);
        // 竖屏 / 窄屏：按纵横比把四片星云整体收进画面
        const aspect = vw / Math.max(1, vh);
        if (aspect < 1) {
          const tanV = Math.tan(0.5 * 43 * Math.PI / 180);
          const tanH = tanV * aspect;
          const need = Math.max(6.2 / Math.max(0.08, tanH), 2.9 / tanV);
          fit = Math.min(fit, 12.4 / (need * 1.05));
        }
        this.fit = fit;
        const d = this.orbit.dist / fit;
        const az = this.orbit.az + Math.sin(this.time * 0.11) * 0.028;
        const el = this.orbit.el + Math.sin(this.time * 0.073) * 0.012;
        desiredEye = [
          target[0] + Math.sin(az) * Math.cos(el) * d,
          target[1] + Math.sin(el) * d,
          target[2] + Math.cos(az) * Math.cos(el) * d
        ];
        desiredTarget = target;
        desiredFov = 43 * Math.PI / 180;
      } else {
        const d = this.orbitIn.dist;
        const az = this.orbitIn.az + Math.sin(this.time * 0.05) * 0.05;
        const el = this.orbitIn.el + Math.sin(this.time * 0.037) * 0.03;
        desiredTarget = [0, 0, 0];
        desiredEye = [
          Math.sin(az) * Math.cos(el) * d,
          Math.sin(el) * d,
          Math.cos(az) * Math.cos(el) * d
        ];
        desiredFov = 54 * Math.PI / 180;
      }

      const k = 1 - Math.exp(-dt * 5.0);
      cam.eye = M.lerp3(cam.eye, desiredEye, k);
      cam.target = M.lerp3(cam.target, desiredTarget, k);
      cam.fov += (desiredFov - cam.fov) * k;
    }

    buildMatrices() {
      const gl = this.gl;
      const w = this.rt.w, h = this.rt.h;
      const aspect = w / h;
      const eye = this.cam.eye, target = this.cam.target;
      const fwd = M.normalize(M.sub(target, eye));
      let right = M.normalize(M.cross(fwd, [0, 1, 0]));
      const up = M.cross(right, fwd);
      this.basis = { fwd, right, up };
      this.tanHalf = Math.tan(this.cam.fov / 2);
      this.aspect = aspect;
      M.lookAt(this.view, eye, target, [0, 1, 0]);
      M.perspective(this.proj, this.cam.fov, aspect, 0.05, 300);
      M.multiply(this.viewProj, this.proj, this.view);
      this.np[0] = this.proj[0]; this.np[1] = this.proj[1]; this.np[2] = this.proj[2]; this.np[3] = this.proj[3];
      for (let i = 4; i < 16; i++) this.np[i] = this.proj[i];
    }

    doSwitch(dir) {
      if (dir === 'in') {
        this.mode = 'inside';
        const g = this.activeGroup;
        this.orbitIn.az = 0.7;
        this.orbitIn.el = 0.22;
        this.orbitIn.dist = 7.8;
        /* 切换坐标系：从星系坐标进入星云内部坐标 */
        const t = this.trans;
        t.fromEye = t.midEye.slice();
        t.fromTarget = t.midTarget.slice();
        t.fromFov = t.midFov;
        t.toEye = [1.35, 0.55, 4.55];
        t.toTarget = [0, 0, 0];
        t.toFov = 57 * Math.PI / 180;
        if (this.onSwitch) this.onSwitch('inside', g);
      } else {
        this.mode = 'galaxy';
        this.trans.toEye = [0, 0.4, 13.4];
        this.trans.toTarget = [0, 0.02, 0.4];
        this.trans.toFov = 43 * Math.PI / 180;
        this.trans.midEye = [0, 0.4, 13.4];
        this.trans.midTarget = [0, 0.02, 0.4];
        this.trans.midFov = 43 * Math.PI / 180;
        this.activeGroup = null;
        if (this.onSwitch) this.onSwitch('galaxy', null);
      }
    }

    dive(i) {
      if (this.trans) return;
      const n = NEBULAE[i];
      this.nebulaIndex = i;
      this.activeGroup = n.group;
      const cam = this.cam;
      const toCenter = M.normalize(M.sub(cam.eye, n.center));
      const startEye = cam.eye.slice();
      const startTarget = cam.target.slice();
      const fov0 = cam.fov;
      this.trans = {
        t: 0, dur: 1.85, dir: 'in', switched: false,
        fromEye: startEye, fromTarget: startTarget, fromFov: fov0,
        toEye: [n.center[0] + toCenter[0] * 0.45, n.center[1] + toCenter[1] * 0.45, n.center[2] + toCenter[2] * 0.45],
        toTarget: n.center.slice(),
        toFov: 66 * Math.PI / 180,
        midEye: [0.0, 0.05, 1.15],
        midTarget: [0, 0, 0],
        midFov: 62 * Math.PI / 180
      };
    }

    surface() {
      if (this.trans) return;
      const cam = this.cam;
      const n = NEBULAE[this.nebulaIndex];
      const outEye = [n.center[0] * 1.16, n.center[1] * 1.16 + 0.4, n.center[2] * 1.16 + 9.0];
      this.trans = {
        t: 0, dur: 1.7, dir: 'out', switched: false,
        fromEye: cam.eye.slice(), fromTarget: cam.target.slice(), fromFov: cam.fov,
        toEye: outEye, toTarget: [n.center[0] * 0.4, n.center[1] * 0.4, n.center[2] * 0.4],
        toFov: 52 * Math.PI / 180,
        midEye: outEye, midTarget: [n.center[0] * 0.4, n.center[1] * 0.4, n.center[2] * 0.4],
        midFov: 52 * Math.PI / 180
      };
    }
    /* ---------------- pointers ---------------- */
    onPointerDown(e) {
      if (this.trans) return;
      // UI 元素上的按下不算拖拽；但双指捏合无论落在哪里都要生效
      const t = e.target;
      const isUI = !!(t && t.closest && t.closest('button, input, a, .nebula-card, #atlas, #reader, #about, #data-panel, .search-wrap'));
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinchJustUsed = false;

      // 双指：捏合缩放
      if (this.pointers.size >= 2) {
        const pts = Array.from(this.pointers.values());
        const a = pts[0], b = pts[1];
        this.pinch = {
          dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          zoom: this.mode === 'galaxy' ? this.orbit.dist : this.orbitIn.dist
        };
        this.pointer.down = false;
        this.pointer.drag = false;
        return;
      }

      if (isUI) { this.pointer.down = false; return; }

      this.pointer.down = true;
      this.pointer.drag = false;
      this.pointer.moved = 0;
      this.pointer.lx = e.clientX;
      this.pointer.ly = e.clientY;
      try { this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }

    onPointerMove(e) {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;

      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // 捏合缩放（双指）
      if (this.pointers.size >= 2 && this.pinch) {
        const pts = Array.from(this.pointers.values());
        const a = pts[0], b = pts[1];
        const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const ratio = this.pinch.dist / d;
        if (this.mode === 'galaxy') {
          this.orbit.dist = M.clamp(this.pinch.zoom * ratio, 7.2, 15.0);
        } else {
          this.orbitIn.dist = M.clamp(this.pinch.zoom * ratio, 2.6, 15.0);
        }
        this.pinchJustUsed = true;
        return;
      }

      const p = this.pointer;
      if (p.down && !this.trans) {
        const dx = e.clientX - p.lx;
        const dy = e.clientY - p.ly;
        p.moved += Math.abs(dx) + Math.abs(dy);
        p.lx = e.clientX;
        p.ly = e.clientY;
        // 触摸屏手感更钝，灵敏度提高
        const k = (e.pointerType === 'touch' || e.pointerType === 'pen') ? 2.2 : 1;
        if (p.moved > 4) p.drag = true;
        if (p.drag) {
          if (this.mode === 'galaxy') {
            this.orbit.az -= dx * 0.0035 * k;
            this.orbit.el = M.clamp(this.orbit.el + dy * 0.0028 * k, -0.55, 0.55);
          } else {
            this.orbitIn.az -= dx * 0.0042 * k;
            this.orbitIn.el = M.clamp(this.orbitIn.el + dy * 0.0034 * k, -1.25, 1.25);
          }
        }
      }
      if (this.mode === 'galaxy') {
        this.pickNebula(e.clientX, e.clientY);
      } else {
        const s = this.pickStar(e.clientX, e.clientY);
        const edge = s ? null : this.pickEdge(e.clientX, e.clientY);
        if (edge !== this.hoverEdge) {
          this.hoverEdge = edge;
          if (edge) this.canvas.style.cursor = 'pointer';
          if (this.onEdgeHover) this.onEdgeHover(edge, e.clientX, e.clientY);
        }
      }
    }

    onPointerUp(e) {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const p = this.pointer;
      const wasDown = p.down;
      p.down = false;
      if (this.pinchJustUsed) { this.pinchJustUsed = false; return; }
      if (!wasDown || this.trans) return;
      if (p.moved > 8) return;
      if (this.mode === 'galaxy') {
        const hit = this.pickNebula(e.clientX, e.clientY);
        if (hit >= 0 && this.onNebulaClick) this.onNebulaClick(hit);
      } else {
        const s = this.pickStar(e.clientX, e.clientY);
        if (s) {
          if (this.onStarClick) this.onStarClick(s);
          return;
        }
        const edge = this.pickEdge(e.clientX, e.clientY);
        if (edge && this.onEdgeClick) this.onEdgeClick(edge);
      }
    }

    onWheel(e) {
      if (this.trans) return;
      e.preventDefault();
      const d = Math.exp(e.deltaY * 0.0011);
      if (this.mode === 'galaxy') {
        this.orbit.dist = M.clamp(this.orbit.dist * d, 7.2, 15.0);
      } else {
        this.orbitIn.dist = M.clamp(this.orbitIn.dist * d, 2.6, 15.0);
      }
    }

    pickNebula(px, py) {
      let best = -1, bestD = 1e9;
      for (let i = 0; i < NEBULAE.length; i++) {
        const s = this.nebulaScreens[i];
        if (!s.visible) continue;
        const rr = Math.max(s.r * 0.62, 54);
        const d = Math.hypot(px - s.x, py - s.y);
        if (d < rr && d < bestD) { bestD = d; best = i; }
      }
      this.setHoverNebula(best);
      return best;
    }

    setHoverNebula(i) {
      if (this.hoverNebula === i) return;
      this.hoverNebula = i;
      this.canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
      if (this.onNebulaHover) this.onNebulaHover(i);
    }

    pickStar(px, py) {
      const g = this.groups[this.activeGroup];
      if (!g) return null;
      let best = null, bestD = 1e9;
      for (const s of g.list) {
        if (!s.screen.visible) continue;
        const d = Math.hypot(px - s.screen.x, py - s.screen.y);
        if (d < Math.max(26, s.screen.r + 16) && d < bestD) { best = s; bestD = d; }
      }
      if (best !== this.hoverStar) {
        this.hoverStar = best;
        this.canvas.style.cursor = best ? 'pointer' : 'default';
        if (this.onStarHover) this.onStarHover(best, px, py);
      }
      return best;
    }

    /* 点到线段的距离 */
    distToSegment(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    /** 屏幕坐标 → 关联边（8px 容差） */
    pickEdge(px, py) {
      if (this.mode !== 'inside' || !this.activeGroup) return null;
      const g = this.groups[this.activeGroup];
      if (!g || !g.edgeSegs) return null;
      let best = null, bestD = 8;
      for (const e of this.edgeScreen) {
        const d = this.distToSegment(px, py, e.ax, e.ay, e.bx, e.by);
        if (d < bestD) { bestD = d; best = g.edgeSegs[e.index]; }
      }
      return best;
    }

    /** 方向键 / 触屏方向盘：把焦点移到该方向最近的天体 */
    focusNearest(dir) {
      if (this.mode !== 'inside' || !this.activeGroup) return null;
      const g = this.groups[this.activeGroup];
      if (!g || !g.list.length) return null;
      const visible = g.list.filter((s) => s.screen.visible);
      if (!visible.length) return null;

      let cur = this.hoverStar;
      if (!cur || !cur.screen.visible) {
        cur = visible.slice().sort((a, b) => a.screen.y - b.screen.y)[0];
        this.hoverStar = cur;
        if (this.onStarHover) this.onStarHover(cur, cur.screen.x, cur.screen.y);
        return cur;
      }

      const vx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      const vy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
      let best = null, bestScore = Infinity;
      for (const s of visible) {
        if (s === cur) continue;
        const dx = s.screen.x - cur.screen.x;
        const dy = s.screen.y - cur.screen.y;
        const along = dx * vx + dy * vy;
        if (along <= 6) continue;
        const perp = Math.abs(dx * vy - dy * vx);
        const score = along + perp * 2.2;
        if (score < bestScore) { bestScore = score; best = s; }
      }
      if (!best) return cur;
      this.hoverStar = best;
      if (this.onStarHover) this.onStarHover(best, best.screen.x, best.screen.y);
      return best;
    }

    /** 键盘焦点：高亮某个恒星（复用悬停 UI） */
    focusOn(star) {
      this.hoverStar = star || null;
      if (this.onStarHover) this.onStarHover(this.hoverStar, star ? star.screen.x : 0, star ? star.screen.y : 0);
    }

    /* ---------------- render ---------------- */
    render(dt) {
      const gl = this.gl;
      const rt = this.rt;
      this.buildMatrices();

      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.scene.fbo);
      gl.viewport(0, 0, rt.w, rt.h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clearColor(0.004, 0.006, 0.014, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      /* sky */
      const sky = this.progSky;
      gl.useProgram(sky.program);
      gl.bindVertexArray(this.vaoEmpty);
      gl.uniform4f(sky.u.uQuad, 0, 0, 1, 1);
      gl.uniform3fv(sky.u.uEye, this.cam.eye);
      gl.uniform3fv(sky.u.uRight, this.basis.right);
      gl.uniform3fv(sky.u.uUp, this.basis.up);
      gl.uniform3fv(sky.u.uFwd, this.basis.fwd);
      gl.uniform1f(sky.u.uTanHalf, this.tanHalf);
      gl.uniform1f(sky.u.uAspect, this.aspect);
      gl.uniform1f(sky.u.uTime, this.time);
      gl.uniform2f(sky.u.uRes, rt.w, rt.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
      if (sky.u.uNoise) gl.uniform1i(sky.u.uNoise, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* embedded star clusters inside each nebula (drawn before gas so dust occludes them) */
      if (this.mode === 'galaxy') {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        this.drawEmbedded();
      }

      /* volumes → half-res target */
      const vol = rt.vol;
      gl.bindFramebuffer(gl.FRAMEBUFFER, vol.fbo);
      gl.viewport(0, 0, vol.w, vol.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      if (this.mode === 'inside') {
        this.drawNebula(this.nebulaIndex, true);
      } else {
        const order = NEBULAE.map((n, i) => ({
          i, d: Math.hypot(n.center[0] - this.cam.eye[0], n.center[1] - this.cam.eye[1], n.center[2] - this.cam.eye[2])
        })).sort((a, b) => b.d - a.d);
        for (const o of order) this.drawNebula(o.i, false);
      }

      /* composite volumes over the sky */
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.scene.fbo);
      gl.viewport(0, 0, rt.w, rt.h);
      gl.useProgram(this.progVolComp.program);
      gl.bindVertexArray(this.vaoEmpty);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, vol.tex);
      gl.uniform1i(this.progVolComp.u.uSrc, 0);
      gl.uniform4f(this.progVolComp.u.uQuad, 0, 0, 1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      /* stars + lines (inside) */
      if (this.mode === 'inside' && this.activeGroup) {
        this.drawStars();
      }

      gl.disable(gl.BLEND);

      /* bloom chain */
      this.bloomPass();

      /* composite */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      const cp = this.progComp;
      gl.useProgram(cp.program);
      gl.bindVertexArray(this.vaoEmpty);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rt.scene.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, rt.bloom[0].tex);
      gl.uniform1i(cp.u.uScene, 0);
      gl.uniform1i(cp.u.uBloom, 1);
      gl.uniform4f(cp.u.uQuad, 0, 0, 1, 1);
      gl.uniform2f(cp.u.uRes, rt.w, rt.h);
      gl.uniform1f(cp.u.uTime, this.time);
      gl.uniform1f(cp.u.uBloomStrength, 0.55);
      gl.uniform1f(cp.u.uExposure, 1.10);
      gl.uniform1f(cp.u.uAberr, this.mode === 'galaxy' ? 0.0016 : 0.0022);
      gl.uniform1f(cp.u.uFade, 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    drawNebula(i, interior) {
      const gl = this.gl;
      const n = NEBULAE[i];
      const p = this.progNeb;
      const rt = this.rt;

      let cx, cy, sx, sy, visible = true;
      if (interior) {
        cx = 0; cy = 0; sx = 1.0; sy = 1.0;
      } else {
        const s = M.project(this.viewProj, n.center, rt.w, rt.h);
        if (!s.visible) return;
        cx = (s.x / rt.w) * 2 - 1;
        cy = 1 - (s.y / rt.h) * 2;
        const dist = Math.hypot(
          n.center[0] - this.cam.eye[0],
          n.center[1] - this.cam.eye[1],
          n.center[2] - this.cam.eye[2]
        );
        const R = n.radius * 1.44;
        const rNdc = R / (Math.max(dist - R * 0.4, 0.3) * this.tanHalf);
        sx = (rNdc / this.aspect) * 1.65;
        sy = rNdc * 1.65;
        if (!isFinite(sx) || sx <= 0) return;
      }

      const rot = M.mul3(M.rotY(this.time * n.spin + (interior ? 0.6 : 0)), M.mul3(M.rotX(n.tiltX), M.rotZ(n.tiltZ)));
      const rotT = M.transpose3(rot);

      gl.useProgram(p.program);
      gl.bindVertexArray(this.vaoEmpty);
      gl.uniform4f(p.u.uQuad, cx, cy, sx, sy);
      gl.uniform3fv(p.u.uEye, this.cam.eye);
      gl.uniform3fv(p.u.uRight, this.basis.right);
      gl.uniform3fv(p.u.uUp, this.basis.up);
      gl.uniform3fv(p.u.uFwd, this.basis.fwd);
      gl.uniform1f(p.u.uTanHalf, this.tanHalf);
      gl.uniform1f(p.u.uAspect, this.aspect);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform2f(p.u.uRes, this.rt.vol.w, this.rt.vol.h);
      gl.uniform3fv(p.u.uCenter, interior ? [0, 0, 0] : n.center);
      gl.uniformMatrix3fv(p.u.uRotT, false, rotT);
      gl.uniform1f(p.u.uScale, interior ? 7.2 : n.radius);
      gl.uniform1f(p.u.uType, n.type);
      gl.uniform1f(p.u.uSteps, this.steps);
      gl.uniform1f(p.u.uSeed, i * 7.31 + (interior ? 3.7 : 0));
      gl.uniform1f(p.u.uInside, interior ? 1 : 0);
      gl.uniform3f(p.u.uAccent, n.accent[0], n.accent[1], n.accent[2]);
      gl.uniform1f(p.u.uDensity, interior ? 0.22 : 1.0);
      gl.uniform1f(p.u.uEmit, interior ? 0.34 : 1.45);
      const hover = this.hoverNebula === i ? 1.0 : 0.0;
      this.hoverAmount[i] += (hover - this.hoverAmount[i]) * 0.08;
      gl.uniform1f(p.u.uOpacity, (interior ? 0.92 : 1.0));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, this.noiseTex);
      if (p.u.uNoise) gl.uniform1i(p.u.uNoise, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    drawStars() {
      const gl = this.gl;
      const g = this.groups[this.activeGroup];
      if (!g) return;
      const rt = this.rt;
      const pixelScale = (2 * this.tanHalf) / rt.h;

      /* ---- 线框层：星座连线 / 关联边 / 吸积盘 / 悬停高亮 ---- */
      const lp = this.progLine;
      gl.useProgram(lp.program);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(lp.u.uViewProj, false, this.viewProj);

      if (g.lineCount) {
        gl.uniform3f(lp.u.uColor, 0.32, 0.52, 0.95);
        gl.uniform1f(lp.u.uAlpha, 0.09);
        gl.bindVertexArray(g.lineVAO);
        gl.drawArrays(gl.LINES, 0, g.lineCount * 2);
      }

      if (g.edgeVAO && g.edgeCount) {
        gl.uniform3f(lp.u.uColor, 0.45, 0.78, 1.0);
        gl.uniform1f(lp.u.uAlpha, 0.18);
        gl.bindVertexArray(g.edgeVAO);
        gl.drawArrays(gl.LINES, 0, g.edgeCount * 2);
      }

      if (this.hoverEdge) {
        const seg = this.hoverEdge;
        if (!this.edgeHoverBuf) {
          this.edgeHoverBuf = gl.createBuffer();
          this.edgeHoverVAO = gl.createVertexArray();
          gl.bindVertexArray(this.edgeHoverVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeHoverBuf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(6), gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
          gl.bindVertexArray(null);
        }
        const arr = new Float32Array([seg.a[0], seg.a[1], seg.a[2], seg.b[0], seg.b[1], seg.b[2]]);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeHoverBuf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
        gl.uniform3f(lp.u.uColor, 1.0, 0.82, 0.38);
        gl.uniform1f(lp.u.uAlpha, 0.95);
        gl.bindVertexArray(this.edgeHoverVAO);
        gl.drawArrays(gl.LINES, 0, 2);
      }

      if (g.ringVAO && g.ringCount && !SY.reducedMotion) {
        gl.uniform3f(lp.u.uColor, 1.0, 0.55, 0.22);
        gl.uniform1f(lp.u.uAlpha, 0.5);
        gl.bindVertexArray(g.ringVAO);
        gl.drawArrays(gl.LINES, 0, g.ringCount * 2);
      }

      /* 悬停恒星：高亮它的所有关联边 */
      if (this.hoverStar && g.adjacency && g.highlightBuf) {
        const segs = g.adjacency[this.hoverStar.doc.id] || [];
        if (segs.length) {
          const arr = new Float32Array(segs.length * 6);
          segs.forEach((s, i) => {
            arr[i * 6] = s[0][0]; arr[i * 6 + 1] = s[0][1]; arr[i * 6 + 2] = s[0][2];
            arr[i * 6 + 3] = s[1][0]; arr[i * 6 + 4] = s[1][1]; arr[i * 6 + 5] = s[1][2];
          });
          gl.bindBuffer(gl.ARRAY_BUFFER, g.highlightBuf);
          gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
          gl.uniform3f(lp.u.uColor, 0.75, 0.95, 1.0);
          gl.uniform1f(lp.u.uAlpha, 0.55);
          gl.bindVertexArray(g.highlightVAO);
          gl.drawArrays(gl.LINES, 0, segs.length * 2);
        }
      }

      /* ---- 恒星 billboard ---- */
      const sp = this.progStar;
      gl.useProgram(sp.program);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(sp.u.uViewProj, false, this.viewProj);
      gl.uniformMatrix3fv(sp.u.uRot, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
      gl.uniform3f(sp.u.uCenter, 0, 0, 0);
      gl.uniform1f(sp.u.uScale, 1.0);
      gl.uniform1f(sp.u.uSizeScale, 1.0);
      gl.uniform1f(sp.u.uBright, 0.58);
      gl.uniform3fv(sp.u.uRight, this.basis.right);
      gl.uniform3fv(sp.u.uUp, this.basis.up);
      gl.uniform3fv(sp.u.uEye, this.cam.eye);
      gl.uniform1f(sp.u.uPixelScale, pixelScale);
      gl.uniform1f(sp.u.uTime, this.time);
      gl.uniform1f(sp.u.uSelection, 0);
      gl.bindVertexArray(g.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, g.count);

      /* 致密星光晕（同程序，放大 + 低亮度） */
      if (g.glowVAO && g.glowCount) {
        const pulse = SY.reducedMotion ? 1 : (1 + Math.sin(this.time * 2.2) * 0.07);
        gl.uniform1f(sp.u.uBright, 0.26);
        gl.uniform1f(sp.u.uSizeScale, pulse);
        gl.bindVertexArray(g.glowVAO);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, g.glowCount);
      }

      gl.bindVertexArray(null);
    }

    /** 依据 data.edges 生成每个星云的关联边几何与邻接表 */
    buildEdgeGeometry() {
      const gl = this.gl;
      const edges = (this.index && this.index.edges) || [];
      const posOf = new Map();
      Object.keys(this.groups).forEach((gid) => {
        this.groups[gid].list.forEach((s) => posOf.set(s.doc.id, { pos: s.pos, g: gid }));
      });

      const perGroup = {};
      const adjacency = {};
      edges.forEach((e) => {
        const a = posOf.get(e.source), b = posOf.get(e.target);
        if (!a || !b || a.g !== b.g) return; // 跨星云的边不画
        const gid = a.g;
        (perGroup[gid] = perGroup[gid] || []).push([a.pos, b.pos, e]);
        adjacency[gid] = adjacency[gid] || {};
        (adjacency[gid][e.source] = adjacency[gid][e.source] || []).push([a.pos, b.pos]);
        (adjacency[gid][e.target] = adjacency[gid][e.target] || []).push([a.pos, b.pos]);
      });

      Object.keys(perGroup).forEach((gid) => {
        const g = this.groups[gid];
        if (!g) return;
        const segs = perGroup[gid];
        const arr = new Float32Array(segs.length * 6);
        segs.forEach((s, i) => {
          arr[i * 6] = s[0][0]; arr[i * 6 + 1] = s[0][1]; arr[i * 6 + 2] = s[0][2];
          arr[i * 6 + 3] = s[1][0]; arr[i * 6 + 4] = s[1][1]; arr[i * 6 + 5] = s[1][2];
        });
        const vao = gl.createVertexArray();
        const buf = gl.createBuffer();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        g.edgeVAO = vao;
        g.edgeCount = segs.length;
        g.edgeSegs = segs.map((s) => ({ a: s[0], b: s[1], edge: s[2] }));

        const hvao = gl.createVertexArray();
        const hbuf = gl.createBuffer();
        gl.bindVertexArray(hvao);
        gl.bindBuffer(gl.ARRAY_BUFFER, hbuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(6), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        g.highlightVAO = hvao;
        g.highlightBuf = hbuf;
        g.adjacency = adjacency[gid] || {};
      });
    }

    drawEmbedded() {
      const gl = this.gl;
      const sp = this.progStar;
      const rt = this.rt;
      gl.useProgram(sp.program);
      gl.uniformMatrix4fv(sp.u.uViewProj, false, this.viewProj);
      gl.uniform3fv(sp.u.uRight, this.basis.right);
      gl.uniform3fv(sp.u.uUp, this.basis.up);
      gl.uniform3fv(sp.u.uEye, this.cam.eye);
      gl.uniform1f(sp.u.uPixelScale, (2 * this.tanHalf) / rt.h);
      gl.uniform1f(sp.u.uTime, this.time);
      gl.uniform1f(sp.u.uSelection, 0);
      gl.uniform1f(sp.u.uBright, 0.50);
      gl.uniform1f(sp.u.uSizeScale, 0.30);
      for (let i = 0; i < NEBULAE.length; i++) {
        const n = NEBULAE[i];
        const g = this.groups[n.group];
        if (!g) continue;
        const rot = M.mul3(M.rotY(this.time * n.spin), M.mul3(M.rotX(n.tiltX), M.rotZ(n.tiltZ)));
        gl.uniformMatrix3fv(sp.u.uRot, false, rot);
        gl.uniform3fv(sp.u.uCenter, n.center);
        gl.uniform1f(sp.u.uScale, n.radius * 0.17);
        gl.bindVertexArray(g.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, g.count);
      }
      gl.bindVertexArray(null);
    }

    bloomPass() {
      const gl = this.gl;
      const rt = this.rt;
      const bl = rt.bloom;

      gl.disable(gl.BLEND);
      gl.useProgram(this.progBright.program);
      gl.bindVertexArray(this.vaoEmpty);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bl[0].fbo);
      gl.viewport(0, 0, bl[0].w, bl[0].h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rt.scene.tex);
      gl.uniform1i(this.progBright.u.uScene, 0);
      gl.uniform4f(this.progBright.u.uQuad, 0, 0, 1, 1);
      gl.uniform1f(this.progBright.u.uThreshold, 0.90);
      gl.uniform1f(this.progBright.u.uKnee, 0.90);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(this.progDown.program);
      gl.bindVertexArray(this.vaoEmpty);
      for (let i = 1; i < bl.length; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, bl[i].fbo);
        gl.viewport(0, 0, bl[i].w, bl[i].h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, bl[i - 1].tex);
        gl.uniform1i(this.progDown.u.uSrc, 0);
        gl.uniform2f(this.progDown.u.uTexel, 1 / bl[i - 1].w, 1 / bl[i - 1].h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.progUp.program);
      gl.bindVertexArray(this.vaoEmpty);
      for (let i = bl.length - 1; i > 0; i--) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, bl[i - 1].fbo);
        gl.viewport(0, 0, bl[i - 1].w, bl[i - 1].h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, bl[i].tex);
        gl.uniform1i(this.progUp.u.uSrc, 0);
        gl.uniform2f(this.progUp.u.uTexel, 1 / bl[i].w, 1 / bl[i].h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* ---------------- per-frame updates ---------------- */
    updateScreens() {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const rt = this.rt;
      for (let i = 0; i < NEBULAE.length; i++) {
        const n = NEBULAE[i];
        const s = M.project(this.viewProj, n.center, w, h);
        const dist = Math.hypot(n.center[0] - this.cam.eye[0], n.center[1] - this.cam.eye[1], n.center[2] - this.cam.eye[2]);
        const rNdc = (n.radius * 1.42) / (Math.max(dist, 0.5) * this.tanHalf);
        this.nebulaScreens[i] = {
          x: s.x, y: s.y, r: (rNdc / 2) * h, visible: s.visible && this.mode === 'galaxy'
        };
      }

      if (this.mode === 'inside' && this.activeGroup) {
        const g = this.groups[this.activeGroup];
        const pxScale = (2 * this.tanHalf) / h;
        for (const s of g.list) {
          const pr = M.project(this.viewProj, s.pos, w, h);
          const dist = Math.hypot(s.pos[0] - this.cam.eye[0], s.pos[1] - this.cam.eye[1], s.pos[2] - this.cam.eye[2]);
          const r = Math.max(6, (Math.max(s.size, dist * pxScale * 1.55) / (dist * this.tanHalf)) * (h / 2));
          s.screen.x = pr.x; s.screen.y = pr.y; s.screen.r = r; s.screen.visible = pr.visible && pr.w > 0;
        }

        /* 关联边的屏幕投影（供拾取） */
        this.edgeScreen.length = 0;
        if (g.edgeSegs) {
          for (let i = 0; i < g.edgeSegs.length; i++) {
            const seg = g.edgeSegs[i];
            const a = M.project(this.viewProj, seg.a, w, h);
            const b = M.project(this.viewProj, seg.b, w, h);
            if (!a.visible || !b.visible) continue;
            this.edgeScreen.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, index: i });
          }
        }
      }
    }

    frame(now) {
      const t = now * 0.001;
      let dt = this.last ? t - this.last : 0.016;
      this.last = t;
      dt = Math.min(dt, 0.05);
      this.time += dt;

      this.updateCamera(dt);
      this.render(dt);
      this.updateScreens();

      /* 自愈式尺寸校验：部分窗口在启动后才被系统钳制，resize 事件可能丢失 */
      this.sizeTick = (this.sizeTick || 0) + 1;
      if (this.sizeTick % 20 === 0 && this.rt) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75) * this.renderScale;
        const cw = Math.floor(this.canvas.clientWidth * dpr);
        const ch = Math.floor(this.canvas.clientHeight * dpr);
        if (cw > 2 && ch > 2 && (Math.abs(cw - this.rt.w) > 2 || Math.abs(ch - this.rt.h) > 2)) {
          this.resize(false);
        }
      }

      /* quality adaptation */
      this.stats.frames++;
      this.stats.acc += dt;
      if (this.stats.acc > 1.0) {
        this.stats.fps = this.stats.frames / this.stats.acc;
        this.stats.ms = (this.stats.acc / this.stats.frames) * 1000;
        this.stats.frames = 0;
        this.stats.acc = 0;
        this.adaptQuality();
      }
    }

    adaptQuality() {
      const fps = this.stats.fps;
      if (fps < 34 && this.steps > 42) {
        this.steps = Math.max(40, this.steps - 10);
      } else if (fps < 26 && this.renderScale > 0.75) {
        this.renderScale = 0.78;
        this.resize(false);
      } else if (fps > 56 && this.steps < 88 && this.renderScale > 0.95) {
        this.steps = Math.min(88, this.steps + 6);
      }
    }
  }

  SY.Renderer = Renderer;
  Object.defineProperty(SY, 'NEBULAE', { get: function () { return NEBULAE; } });
})();
