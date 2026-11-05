/*
 * 截图/调试工具：node tools/shot.js <out.png> [waitMs] [jsToEval] [afterMs] [w] [h]
 * 启动无头 Chrome，加载 index.html，执行可选脚本并截图，同时打印控制台错误。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const out = path.resolve(argv[0] || path.join(ROOT, 'shot.png'));
const waitMs = Number(argv[1] || 6000);
const evalJs = argv[2] || '';
const afterMs = Number(argv[3] || 4000);
const W = Number(argv[4] || 1440);
const H = Number(argv[5] || 900);
const PORT = 9500 + Math.floor(Math.random() * 400);
const userDir = path.join(os.tmpdir(), 'sy-shot-' + Date.now());

const chromeArgs = [
  '--headless=new',
  '--use-angle=d3d11',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-dev-shm-usage',
  '--allow-file-access-from-files',
  '--window-size=' + W + ',' + H,
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + userDir,
  'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/')
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getJSON(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* retry */ }
    await sleep(250);
  }
  throw new Error('CDP not reachable: ' + url);
}

async function main() {
  const attachPort = process.env.SY_ATTACH_PORT;
  let child = null;
  if (!attachPort) {
    child = spawn(CHROME, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', () => {});
  }
  const port = attachPort || PORT;

  const version = await getJSON('http://127.0.0.1:' + port + '/json/version');
  const targets = await getJSON('http://127.0.0.1:' + port + '/json/list');
  const page = attachPort
    ? targets.find((t) => t.type === 'page' && /index\.html/.test(t.url))
    : targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  let msgId = 0;
  const pending = new Map();
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map((a) => a.value !== undefined ? a.value : (a.description || a.type));
      logs.push('[' + msg.params.type + '] ' + args.join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push('[exception] ' + (d.exception && d.exception.description ? d.exception.description : d.text));
    } else if (msg.method === 'Log.entryAdded') {
      logs.push('[log:' + msg.params.entry.level + '] ' + msg.params.entry.text);
    }
  });

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  if (!attachPort) await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  await sleep(waitMs);

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      let renderer = 'none';
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl2';
      }
      const r = window.SY && window.SY.renderer;
      return JSON.stringify({
        renderer,
        floatColor: !!(window.SY && window.SY.GL && window.SY.GL.floatColor),
        mode: r ? r.mode : null,
        fps: r ? Math.round(r.stats.fps) : 0,
        ms: r ? Math.round(r.stats.ms) : 0,
        steps: r ? r.steps : 0,
        scale: r ? r.renderScale : 0,
        w: r ? r.rt.w : 0, h: r ? r.rt.h : 0
      });
    })()`,
    returnByValue: true
  });
  console.log('ENV ' + info.result.value);
  logs.slice(-25).forEach((l) => console.log(l));

  if (evalJs && evalJs !== '-') {
    const res = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) console.log('[eval-error] ' + JSON.stringify(res.exceptionDetails));
    if (res.result && res.result.value !== undefined) console.log('[eval] ' + JSON.stringify(res.result.value));
    await sleep(afterMs);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SAVED ' + out);

  const post = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({mode: window.SY && window.SY.renderer && window.SY.renderer.mode, fps: window.SY && window.SY.renderer && Math.round(window.SY.renderer.stats.fps)})',
    returnByValue: true
  });
  console.log('POST ' + post.result.value);

  try { ws.close(); } catch (e) {}
  if (child) child.kill();
  await sleep(400);
  if (!attachPort) fs.rmSync(userDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
