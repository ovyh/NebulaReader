/* ============================================================
   星云阅读器 · GLSL — 体积星云 / 星空 / 后处理
   所有星云均为实时三维体积积分（raymarch），无任何位图贴图。
   介质返回 vec4(emission, extinction)：尘埃会真实遮挡内部结构。
   ============================================================ */
(function () {
  'use strict';
  const SY = (window.SY = window.SY || {});
  const S = (SY.shaders = {});

  const HEAD = `#version 300 es
precision highp float;
precision highp sampler3D;
precision highp sampler2D;
`;

  const NOISE = `
uniform sampler3D uNoise;

float fbm(vec3 p) {
  vec4 v = texture(uNoise, p);
  return v.r * 0.500 + v.g * 0.270 + v.b * 0.150 + v.a * 0.080;
}
float fbm2(vec3 p) {
  vec4 v = texture(uNoise, p * 1.87 + 0.271);
  return v.r * 0.540 + v.g * 0.265 + v.b * 0.125 + v.a * 0.070;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`;

  S.vertQuad = HEAD + `
uniform vec4 uQuad;
out vec2 vUV;
const vec2 V[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  vec2 p = V[gl_VertexID];
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(uQuad.xy + p * uQuad.zw, 0.0, 1.0);
}
`;

  /* ------------------------------------------------------------
     深空背景
     ------------------------------------------------------------ */
  S.fragSky = HEAD + NOISE + `
in vec2 vUV;
out vec4 fragColor;

uniform vec3 uEye, uRight, uUp, uFwd;
uniform float uTanHalf, uAspect, uTime;

const vec3 MW_N = vec3(0.358, 0.742, -0.566);

vec3 starField(vec3 rd, float band) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float sc = 46.0 * pow(1.64, float(i));
    vec3 p = rd * sc;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(id + float(i) * 23.7);
    if (h > 0.858) {
      vec3 off = vec3(hash13(id + 3.1), hash13(id + 7.7), hash13(id + 11.3)) - 0.5;
      off *= 0.62;
      float d = length(f - off);
      float mag = (h - 0.858) / 0.142;
      float core = smoothstep(0.068, 0.0, d);
      float glow = exp(-d * d * 160.0) * 0.40;
      float tw = 0.84 + 0.16 * sin(uTime * 1.5 + h * 90.0);
      vec3 tint = mix(vec3(0.66, 0.79, 1.00), vec3(1.00, 0.82, 0.62), hash13(id + 5.5));
      c += tint * (core * 1.45 + glow) * (0.10 + 1.0 * mag * mag) * tw / (1.0 + float(i) * 1.6);
    }
  }
  return c * (0.68 + 0.62 * band);
}

void main() {
  vec2 ndc = vec2(vUV.x * 2.0 - 1.0, vUV.y * 2.0 - 1.0);
  vec3 rd = normalize(uFwd + uRight * (ndc.x * uTanHalf * uAspect) + uUp * (ndc.y * uTanHalf));

  vec3 col = mix(vec3(0.0022, 0.0035, 0.0090), vec3(0.0050, 0.0080, 0.0200), vUV.y);

  float bandN = dot(rd, normalize(MW_N));
  float band = exp(-bandN * bandN * 24.0);
  float n1 = fbm(rd * 2.15 + 1.7);
  float n2 = fbm2(rd * 4.60 + 5.1);
  float dustN = fbm(rd * 7.0 + 13.0);
  float dust = smoothstep(0.46, 0.78, dustN);
  float mw = band * (0.06 + 0.95 * pow(n1, 2.6)) * (0.25 + 0.95 * n2);
  col += vec3(0.095, 0.125, 0.290) * mw * 1.15;
  col += vec3(0.190, 0.070, 0.135) * band * pow(n2, 2.6) * 0.55;
  col *= 1.0 - 0.68 * band * dust;

  vec3 d1 = normalize(vec3(-0.82, 0.30, -0.49));
  vec3 d2 = normalize(vec3(0.90, -0.24, 0.36));
  vec3 d3 = normalize(vec3(0.18, 0.55, 0.81));
  float a1 = acos(clamp(dot(rd, d1), -1.0, 1.0));
  float a2 = acos(clamp(dot(rd, d2), -1.0, 1.0));
  float a3 = acos(clamp(dot(rd, d3), -1.0, 1.0));
  col += vec3(0.045, 0.120, 0.255) * exp(-a1 * a1 * 15.0) * (0.3 + 0.85 * fbm(rd * 3.1));
  col += vec3(0.210, 0.055, 0.190) * exp(-a2 * a2 * 12.0) * (0.3 + 0.85 * fbm2(rd * 3.4));
  col += vec3(0.045, 0.155, 0.145) * exp(-a3 * a3 * 18.0) * (0.25 + 0.7 * fbm(rd * 4.2));

  col += starField(rd, band);

  fragColor = vec4(col, 1.0);
}
`;

  /* ------------------------------------------------------------
     体积星云
     ------------------------------------------------------------ */
  S.fragNebula = HEAD + NOISE + `
in vec2 vUV;
out vec4 fragColor;

uniform vec3 uEye, uRight, uUp, uFwd;
uniform float uTanHalf, uAspect, uTime;
uniform vec2 uRes;
uniform vec4 uQuad;

uniform vec3 uCenter;
uniform mat3 uRotT;
uniform float uScale;
uniform float uType;
uniform float uOpacity;
uniform float uSteps;
uniform float uDensity;
uniform float uEmit;
uniform float uSeed;
uniform float uInside;
uniform vec3 uAccent;

float capsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

/* ========== 0 · 螺旋星系 ========== */
vec4 medSpiral(vec3 p) {
  float r = length(p.xz);
  float th = atan(p.z + 1e-5, p.x + 1e-5);
  float warp = fbm(p * 1.10 + vec3(0.0, uTime * 0.006, 0.0));
  float spin = th + 2.45 * log(r + 0.085) + (warp - 0.5) * 2.0;
  float arms = pow(0.5 + 0.5 * cos(2.0 * spin), 2.2);
  float thin = 0.042 + 0.070 * r;
  float disc = exp(-pow(r / 0.95, 3.2)) * exp(-pow(abs(p.y) / thin, 1.9));
  float n = fbm(vec3(p.x, p.y * 1.9, p.z) * 2.70 + 4.0);
  float det = texture(uNoise, vec3(p.x, p.y * 2.2, p.z) * 3.2 + 17.0).b;
  float dust = smoothstep(0.52, 0.80, det);
  float bulge = exp(-(r * r * 22.0 + p.y * p.y * 200.0));
  float gas = disc * (0.05 + 1.45 * arms) * (0.20 + 1.35 * n);
  gas *= 1.0 - 0.55 * dust * (1.0 - smoothstep(0.05, 0.60, r));
  gas += bulge * 3.0;
  float ext = gas * 0.12 + dust * disc * 0.85 + bulge * 0.12;

  vec3 cCore = vec3(1.40, 1.02, 0.62);
  vec3 cArm  = vec3(0.20, 0.40, 1.15);
  vec3 cHII  = vec3(1.60, 0.26, 0.60);
  vec3 c = mix(cArm, cCore, exp(-r * 5.0));
  c = mix(c, cHII, smoothstep(0.55, 0.88, n) * (1.0 - smoothstep(0.02, 0.42, r)) * 1.0);
  c += vec3(0.75, 0.85, 1.30) * pow(max(det - 0.72, 0.0) * 3.6, 3.0);
  return vec4(c * gas, ext);
}

/* ========== 1 · 发射星云（花环状） ========== */
vec4 medRose(vec3 p) {
  float rho = length(p.xz);
  float th = atan(p.z + 1e-4, p.x + 1e-4);
  float n1 = fbm(p * 1.10 + 3.0);
  float n2 = fbm(p * 2.40 + 9.0);
  float det = texture(uNoise, p * 1.50 + 2.0).b;
  float fine = texture(uNoise, p * 2.40 + 7.0).a;

  float ringR = 0.50 + 0.055 * sin(th * 5.0 + n1 * 6.0) + 0.04 * (n1 - 0.5);
  float ring = exp(-pow((rho - ringR) / (0.13 + 0.05 * n2), 2.0));
  float thick = exp(-pow(p.y / (0.15 + 0.07 * n2), 2.0));
  float petal = 0.30 + 0.85 * pow(0.5 + 0.5 * cos(th * 7.0 + n2 * 6.3), 3.0);
  float fil = pow(clamp((det - 0.32) * 2.0, 0.0, 1.0), 1.8);

  float gas = ring * thick * petal * (0.35 + 1.9 * fil + 0.5 * n2);
  gas += 2.2 * exp(-pow((rho - 0.32) / 0.075, 2.0)) * thick * petal;
  gas += 0.42 * exp(-dot(p, p) * 14.0) * petal;
  gas += 2.4 * exp(-dot(p, p) * 120.0);
  float dust = smoothstep(0.58, 0.78, fine);
  gas *= 1.0 - 0.5 * dust;
  float ext = gas * 0.42 + dust * thick * 1.4;

  vec3 c = mix(vec3(1.35, 0.08, 0.22), vec3(0.95, 0.08, 0.62), smoothstep(0.28, 0.75, n2));
  c = mix(c, vec3(1.55, 1.00, 0.48), smoothstep(0.55, 0.92, n1) * 0.75);
  c = mix(c, vec3(0.14, 0.58, 1.00), smoothstep(0.70, 0.97, fine) * 0.5);
  c *= 1.0 - 0.40 * dust;
  return vec4(c * gas, ext);
}

/* ========== 2 · 环状星云 ========== */
vec4 medRing(vec3 p) {
  float rho = length(p.xz);
  float r = length(p);
  float th = atan(p.z + 1e-5, p.x + 1e-5);
  float n1 = fbm(p * 2.35 + 4.0);
  float n2 = texture(uNoise, p * 3.4 + 8.0).b;
  float wob = 0.030 * sin(th * 3.0 + uTime * 0.05);
  float torus = length(vec2(rho - 0.60 + wob, p.y * 1.30));
  float band = exp(-pow(torus / 0.065, 2.0));
  float shell = exp(-pow((r - 0.52) / 0.22, 2.0)) * (0.05 + 0.85 * n1);
  float core = exp(-(rho * rho * 90.0 + p.y * p.y * 70.0));
  float jet = exp(-pow(rho / 0.075, 2.0)) * exp(-pow(abs(p.y) / 0.46, 2.0)) * (0.18 + 0.7 * n2);
  float gas = band * 1.45 + shell * 0.30 + core * 2.8 + jet * 0.55;
  gas *= 0.45 + 1.0 * n1;
  float ext = gas * 0.20 + shell * 0.30 + smoothstep(0.62, 0.92, n2) * 0.18;

  vec3 c = mix(vec3(0.85, 0.36, 1.20), vec3(0.20, 1.05, 1.40),
               1.0 - smoothstep(0.08, 0.50, torus));
  c = mix(c, vec3(1.50, 0.95, 0.30), exp(-r * r * 24.0));
  c = mix(c, vec3(0.70, 1.20, 1.60), smoothstep(0.65, 0.95, n2) * 0.6);
  return vec4(c * gas, ext);
}

/* ========== 3 · 暗尘造星云（柱状） ========== */
vec4 medPillar(vec3 p) {
  float warp = fbm(p * 1.25 + 5.0);
  vec3 q = p + (warp - 0.5) * vec3(0.30, 0.14, -0.24);
  float n1 = fbm(q * 1.15 + 2.0);
  float n3 = fbm(q * 2.80 + 21.0);
  float det = texture(uNoise, q * 1.55 + 8.0).b;

  float d1 = capsule(q, vec3(-0.32, 0.62, 0.02), vec3(-0.08, -0.66, 0.10), 0.092);
  float d2 = capsule(q, vec3(0.28, 0.44, -0.12), vec3(0.44, -0.52, -0.02), 0.078);
  float d3 = capsule(q, vec3(0.02, 0.26, 0.32), vec3(-0.02, -0.46, 0.26), 0.062);
  float dd = min(d1, min(d2, d3));

  float skin = exp(-pow((dd + 0.015) / 0.038, 2.0));
  float inner = smoothstep(0.01, -0.10, dd);
  float cloud = smoothstep(0.42, 0.76, n1) * (1.0 - smoothstep(0.30, 1.15, length(q)));
  float dust = smoothstep(0.55, 0.74, det);

  float gas = skin * 2.3 + inner * 0.22 + cloud * 0.22;
  vec3 clusterC = q - vec3(0.10, -0.62, 0.04);
  gas += 2.2 * exp(-dot(clusterC, clusterC) * 60.0);
  gas *= 1.0 - 0.30 * dust * cloud;
  gas *= 0.65 + 0.75 * n3;
  float ext = dust * 2.1 * (0.35 + cloud) + gas * 0.14;

  vec3 c = mix(vec3(1.30, 0.38, 0.08), vec3(1.00, 0.12, 0.24), smoothstep(0.30, 0.72, n3));
  c = mix(c, vec3(0.95, 0.25, 0.75), smoothstep(0.55, 0.90, n1) * 0.45);
  c = mix(c, vec3(0.16, 0.36, 1.15), smoothstep(0.55, 0.92, det) * 0.55);
  c += vec3(1.2, 0.95, 0.65) * pow(max(n3 - 0.62, 0.0) * 3.0, 3.0) * 1.5;
  return vec4(c * gas, ext);
}

vec4 medium(vec3 p) {
  if (uType < 0.5) return medSpiral(p);
  if (uType < 1.5) return medRose(p);
  if (uType < 2.5) return medRing(p);
  return medPillar(p);
}

float hashE(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  vec2 ndc = vec2(gl_FragCoord.x / uRes.x * 2.0 - 1.0, gl_FragCoord.y / uRes.y * 2.0 - 1.0);
  vec3 rdW = normalize(uFwd + uRight * (ndc.x * uTanHalf * uAspect) + uUp * (ndc.y * uTanHalf));
  vec3 roW = uEye;

  vec3 ro = (uRotT * (roW - uCenter)) / uScale;
  vec3 rd = normalize(uRotT * rdW);

  float R = 1.44;
  float b = dot(ro, rd);
  float c2 = dot(ro, ro) - R * R;
  float h = b * b - c2;

  /* 球外的柔和星云辉光（径向光晕，不是贴图） */
  float dPerp = sqrt(max(dot(ro, ro) - b * b, 0.0));
  float halo = 0.0;

  if (h < 0.0) {
    fragColor = vec4(uAccent * halo, 0.0);
    return;
  }
  h = sqrt(h);
  float t0 = -b - h;
  float t1 = -b + h;
  if (t1 < 0.0) {
    fragColor = vec4(uAccent * halo, 0.0);
    return;
  }
  t0 = max(t0, 0.0);

  float span = t1 - t0;
  float steps = uSteps;
  float dt = span / steps;

  float jitter = hashE(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uSeed + fract(uTime) * 61.0);
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  float t = t0 + dt * jitter;

  for (int i = 0; i < 112; i++) {
    if (float(i) >= steps) break;
    vec3 p = ro + rd * t;
    vec4 m = medium(p);
    m.rgb *= uDensity;
    m.a *= uDensity;
    acc += trans * m.rgb * uEmit * dt;
    trans *= exp(-m.a * 1.9 * dt);
    if (trans < 0.008) break;
    t += dt;
  }

  acc += uAccent * halo * trans * (1.0 - uInside);
  float alpha = clamp(1.0 - trans, 0.0, 1.0) * uOpacity;
  fragColor = vec4(acc * uOpacity, alpha);
}
`;

  /* ------------------------------------------------------------
     体积层合成（半分辨率 → 全分辨率）
     ------------------------------------------------------------ */
  S.fragVolComp = HEAD + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
void main() { fragColor = texture(uSrc, vUV); }
`;

  /* ------------------------------------------------------------
     文档恒星（instanced billboards, additive）
     ------------------------------------------------------------ */
  S.vertStar = HEAD + `
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aCS;
layout(location = 2) in vec4 aCol;

uniform mat4 uViewProj;
uniform mat3 uRot;
uniform vec3 uCenter;
uniform float uScale;
uniform float uSizeScale;
uniform float uBright;
uniform vec3 uRight, uUp, uEye;
uniform float uPixelScale;
uniform float uTime;

out vec2 vQ;
out vec3 vColor;
out float vSeed;
out float vFade;

void main() {
  vec3 center = uCenter + uRot * (aCS.xyz * uScale);
  float dist = length(center - uEye);
  float s = max(aCS.w * uSizeScale, dist * uPixelScale * 1.5);
  vec3 wp = center + (uRight * aQuad.x + uUp * aQuad.y) * s;
  gl_Position = uViewProj * vec4(wp, 1.0);
  vQ = aQuad;
  vColor = aCol.rgb * uBright;
  vSeed = aCol.w;
  vFade = clamp(1.30 - dist * 0.020, 0.40, 1.0);
}
`;

  S.fragStar = HEAD + `
in vec2 vQ;
in vec3 vColor;
in float vSeed;
in float vFade;

uniform float uTime;
uniform float uSelection;

out vec4 fragColor;

void main() {
  float d = length(vQ);
  float core = smoothstep(0.17, 0.0, d);
  float glow = exp(-d * d * 5.0);
  float spike = (exp(-abs(vQ.x) * 26.0) * exp(-abs(vQ.y) * 3.0) +
                 exp(-abs(vQ.y) * 26.0) * exp(-abs(vQ.x) * 3.0));
  float halo = smoothstep(0.035, 0.0, abs(d - 0.52)) * 0.26;
  float tw = 0.90 + 0.10 * sin(uTime * 1.6 + vSeed * 47.0);
  vec3 c = vColor * (core * 0.85 + glow * 1.05 + spike * 0.34 + halo) * tw * vFade;
  fragColor = vec4(c * 1.0, 1.0);
}
`;

  /* ------------------------------------------------------------
     星座连线
     ------------------------------------------------------------ */
  S.vertLine = HEAD + `
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
void main() { gl_Position = uViewProj * vec4(aPos, 1.0); }
`;

  S.fragLine = HEAD + `
uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;
void main() { fragColor = vec4(uColor * uAlpha, 1.0); }
`;

  /* ------------------------------------------------------------
     后处理
     ------------------------------------------------------------ */
  S.fragBright = HEAD + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + uKnee, l);
  fragColor = vec4(c * k, 1.0);
}
`;

  S.fragDown = HEAD + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSrc, vUV + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(1.0, 1.0)).rgb;
  c += texture(uSrc, vUV).rgb * 2.0;
  fragColor = vec4(c / 6.0, 1.0);
}
`;

  S.fragUp = HEAD + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 c = texture(uSrc, vUV + vec2(-t.x, -t.y) * 1.6).rgb;
  c += texture(uSrc, vUV + vec2(0.0, -t.y) * 1.6).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(t.x, -t.y) * 1.6).rgb;
  c += texture(uSrc, vUV + vec2(-t.x, 0.0) * 1.6).rgb * 2.0;
  c += texture(uSrc, vUV).rgb * 4.0;
  c += texture(uSrc, vUV + vec2(t.x, 0.0) * 1.6).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(-t.x, t.y) * 1.6).rgb;
  c += texture(uSrc, vUV + vec2(0.0, t.y) * 1.6).rgb * 2.0;
  c += texture(uSrc, vUV + vec2(t.x, t.y) * 1.6).rgb;
  fragColor = vec4(c / 16.0, 1.0);
}
`;

  S.fragComposite = HEAD + `
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uAberr;
uniform float uFade;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUV;
  vec2 p = uv - 0.5;
  float r2 = dot(p, p);

  vec2 off = p * r2 * uAberr;
  vec3 sc;
  sc.r = texture(uScene, uv + off).r;
  sc.g = texture(uScene, uv).g;
  sc.b = texture(uScene, uv - off).b;

  vec3 bl = texture(uBloom, uv).rgb;
  vec3 c = sc + bl * uBloomStrength;

  c *= uExposure;
  c = mix(c, c * vec3(0.975, 1.0, 1.035), 0.7);
  c = aces(c);

  float vig = 1.0 - smoothstep(0.28, 1.10, length(p * vec2(1.0, 1.10)));
  c *= mix(0.38, 1.0, vig);

  c = pow(c, vec3(1.0 / 2.2));

  float g = (h12(uv * uRes + fract(uTime) * 137.0) - 0.5) * 0.015;
  c += g;
  c *= uFade;

  fragColor = vec4(c, 1.0);
}
`;
})();
