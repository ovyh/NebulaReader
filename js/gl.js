/* ============================================================
   星云文本阅读 · minimal WebGL2 toolkit + matrix math
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});
  const GL = (SY.GL = {});

  GL.createContext = function (canvas) {
    const attrs = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    };
    const gl = canvas.getContext('webgl2', attrs);
    if (!gl) throw new Error('此设备不支持 WebGL2');
    GL.floatColor = !!gl.getExtension('EXT_color_buffer_float');
    GL.floatLinear = true;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    return gl;
  };

  function compile(gl, type, src, name) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || '';
      console.error('[shader:' + name + ']\n' + log);
      const numbered = src.split('\n').map((l, i) => String(i + 1).padStart(3, ' ') + ' | ' + l).join('\n');
      console.error(numbered);
      throw new Error('Shader compile failed: ' + name + ' — ' + log);
    }
    return sh;
  }

  GL.program = function (gl, vsSrc, fsSrc, name) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc, name + '.vert'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc, name + '.frag'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      console.error('[link:' + name + '] ' + log);
      throw new Error('Program link failed: ' + name);
    }
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const key = info.name.replace(/\[0\]$/, '');
      uniforms[key] = gl.getUniformLocation(p, info.name);
    }
    return { program: p, u: uniforms, name: name };
  };

  GL.target = function (gl, w, h, opts) {
    opts = opts || {};
    const float = opts.float !== false && GL.floatColor;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D, 0,
      float ? gl.RGBA16F : gl.RGBA8,
      Math.max(1, w | 0), Math.max(1, h | 0), 0,
      gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null
    );
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('Framebuffer incomplete (' + w + 'x' + h + ')');
    return { tex: tex, fbo: fbo, w: Math.max(1, w | 0), h: Math.max(1, h | 0), float: float };
  };

  GL.resizeTarget = function (gl, t, w, h) {
    if (t.w === w && t.h === h) return t;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
    const nt = GL.target(gl, w, h, { float: t.float });
    return nt;
  };

  GL.emptyVAO = function (gl) {
    return gl.createVertexArray();
  };

  GL.quadBuffer = function (gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, 1, 1,
      -1, -1, 1, 1, -1, 1
    ]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buf;
  };

  GL.upload3D = function (gl, bytes, size) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.bindTexture(gl.TEXTURE_3D, null);
    return tex;
  };

  /* ---------------- math ---------------- */
  const M = (SY.M = {});

  M.identity = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  };

  M.perspective = function (o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };

  M.lookAt = function (o, eye, center, up) {
    let z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
    let len = 1 / (Math.hypot(z0, z1, z2) || 1);
    z0 *= len; z1 *= len; z2 *= len;
    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (!len) { x0 = 0; x1 = 0; x2 = 0; } else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    o[15] = 1;
    return o;
  };

  M.multiply = function (o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4]     = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };

  M.rotY = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, 0, -s, 0, 1, 0, s, 0, c];
  };
  M.rotX = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0, c, s, 0, -s, c];
  };
  M.rotZ = function (a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, s, 0, -s, c, 0, 0, 0, 1];
  };
  M.mul3 = function (a, b) {
    const o = new Float32Array(9);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) {
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
    }
    return o;
  };
  M.transpose3 = function (m) {
    return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  };

  M.project = function (vp, p, w, h) {
    const x = p[0], y = p[1], z = p[2];
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.0001) return { x: 0, y: 0, visible: false, w: cw };
    const ix = 1 / cw;
    return {
      x: (cx * ix * 0.5 + 0.5) * w,
      y: (0.5 - cy * ix * 0.5) * h,
      visible: true,
      w: cw
    };
  };

  M.normalize = function (v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  M.cross = function (a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  };
  M.sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  M.lerp3 = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  M.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  M.smoothstep = function (a, b, x) {
    const t = M.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  M.easeInOut = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
})();
