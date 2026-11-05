"""生成应用图标：assets/icon.ico + icon.png"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = int(os.environ.get("ICON_SIZE", "512"))
rng = np.random.default_rng(20261105)

def smooth_noise(size, cells, seed):
    r = np.random.default_rng(seed)
    g = r.random((cells, cells)).astype(np.float32)
    img = Image.fromarray((g * 255).astype(np.uint8), mode='L').resize((size, size), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255.0

y, x = np.mgrid[0:S, 0:S]
u = (x - S / 2) / (S / 2)
v = (y - S / 2) / (S / 2)
r = np.sqrt(u ** 2 + v ** 2)
ang = np.arctan2(v, u)

# 背景：深空渐变
bg = np.zeros((S, S, 3), np.float32)
bg += np.stack([
    np.full((S, S), 0.012, np.float32),
    np.full((S, S), 0.016, np.float32),
    np.full((S, S), 0.038, np.float32)
], axis=-1)

# 体积感星云：多层噪声 + 椭圆包络
n1 = smooth_noise(S, 5, 11)
n2 = smooth_noise(S, 13, 22)
n3 = smooth_noise(S, 37, 33)
n4 = smooth_noise(S, 90, 44)
cloud = 0.55 * n1 + 0.27 * n2 + 0.12 * n3 + 0.06 * n4
cloud = np.clip((cloud - 0.42) * 2.6, 0, 1)
ell = np.sqrt((u * 0.92) ** 2 + (v * 1.18) ** 2)
envelope = np.clip(1.0 - (ell / 0.92) ** 1.7, 0, 1)
# 中部空腔，形成环形花冠
cavity = np.clip((ell - 0.22) / 0.30, 0, 1)
dens = cloud * envelope * (0.35 + 0.9 * cavity)

# 颜色：青蓝 -> 品红 -> 暖金
c_cyan = np.array([0.35, 0.85, 1.00], np.float32)
c_mag = np.array([1.00, 0.32, 0.62], np.float32)
c_gold = np.array([1.00, 0.80, 0.42], np.float32)
mix1 = np.clip((ang / (2 * np.pi)) + 0.5, 0, 1)[..., None]
col = c_cyan * (1 - mix1) + c_mag * mix1
core_t = np.clip(1.0 - ell / 0.7, 0, 1)[..., None] ** 2
col = col * (1 - core_t) + c_gold * core_t

img = bg + col * dens[..., None] * 1.45

# 星点
yy, xx = np.mgrid[0:S, 0:S]
for _ in range(160):
    px = rng.integers(6, S - 6)
    py = rng.integers(6, S - 6)
    rad = rng.uniform(0.6, 2.1)
    b = rng.uniform(0.25, 0.95)
    tint = np.array([0.75, 0.86, 1.0]) if rng.random() < 0.7 else np.array([1.0, 0.86, 0.66])
    d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
    star = np.clip(1 - d / (rad * 2.4), 0, 1) ** 2
    img += tint[None, None, :] * (star * b)[..., None] * 0.9

# 主星 + 十字星芒
cy, cx = S / 2, S / 2
d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
glow = np.exp(-(d / 40) ** 2) * 0.85 + np.exp(-(d / 120) ** 2) * 0.22
core = np.clip(1 - d / 13, 0, 1) ** 2 * 1.5
spike_h = np.exp(-((y - cy) ** 2) / 9.0) * np.clip(1 - np.abs(x - cx) / 210, 0, 1) ** 3
spike_v = np.exp(-((x - cx) ** 2) / 9.0) * np.clip(1 - np.abs(y - cy) / 210, 0, 1) ** 3
starfield = glow + core + (spike_h + spike_v) * 0.55
img += np.stack([starfield * 0.92, starfield * 0.97, starfield * 1.0], axis=-1)

# 轻微色散与暗角
img[..., 0] *= 1.02
img[..., 2] *= 1.04
img *= (1.0 - 0.35 * np.clip(r - 0.55, 0, 1))[..., None]

img = np.clip(img, 0, 1) ** (1 / 1.9)
img8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
icon = Image.fromarray(img8, mode='RGB').convert('RGBA')

# 圆角方形遮罩
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
icon.putalpha(mask)

import os
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')
os.makedirs(out, exist_ok=True)
icon.save(os.path.join(out, 'icon.png'))
icon.save(os.path.join(out, 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('icon written to', out)
