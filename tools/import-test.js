/* 多格式导入验证：TXT/MD/PNG/MP3/未知扩展名 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.CDP_PORT || '9777';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E6%96%87%E6%9C%AC%E9%98%85%E8%AF%BB/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = path.join(process.env.TEMP, 'import-test-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--window-size=1280,800', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, URL], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      page = list.find((t) => t.type === 'page');
    } catch (e) {}
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value || a.description).join(' '));
  });
  const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

  await send('Runtime.enable');
  await sleep(7000);

  console.log('boot:', await evalJS("!!(window.SY && SY.data)"), 'demo docs:', await evalJS('SY.data.docs.length'));
  console.log('demo types:', await evalJS("Array.from(new Set(SY.data.docs.map(d=>d.type))).join(',')"));

  const script = `(async () => {
    function pngFile() {
      return new Promise((res) => {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 200;
        const g = c.getContext('2d');
        g.fillStyle = '#3366cc'; g.fillRect(0, 0, 320, 200);
        g.fillStyle = '#ffcc33'; g.fillRect(40, 40, 120, 80);
        c.toBlob((b) => res(new File([b], '图片.png', { type: 'image/png' })), 'image/png');
      });
    }
    const txt = new File(['字'.repeat(12000)], 'a.txt', { type: 'text/plain' });
    const md = new File(['# 笔记\\n\\n引用 图片.png 与 b.txt\\n' + 'x'.repeat(500)], 'b.md', { type: 'text/markdown' });
    const png = await pngFile();
    const mp3 = new File([new Uint8Array(2000)], 'c.mp3', { type: 'audio/mpeg' });
    const xyz = new File(['unknown'], 'd.xyz', { type: '' });
    const ds = await SY.DataSource.fromFiles([txt, md, png, mp3, xyz]);
    return JSON.stringify({
      docs: ds.docs.map((d) => ({ n: d.name, t: d.type, f: d.format, u: d.units, s: d.style, r: Math.round(d.radius * 10) / 10, e: d.meta && d.meta.error || '' })),
      failures: ds.failures
    });
  })()`;

  const out = await evalJS(script);
  console.log('import:', out);

  const applied = await evalJS(`(async () => {
    const ds = await SY.DataSource.fromFiles([new File(['字'.repeat(12000)], 'a.txt'), new File(['# 引用 图片.png'], 'b.md')]);
    SY.DataSource.activate(ds);
    SY.renderer.setDataset(SY.data);
    SY.renderer.dive(0);
    return 'nodes=' + SY.data.docs.length + ' edges=' + SY.data.edges.length;
  })()`);
  console.log('apply:', applied);
  await sleep(4000);
  console.log('mode:', await evalJS('SY.renderer.mode'));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'screenshots', 'import-check.png'), Buffer.from(shot.data, 'base64'));
  console.log('uncaught errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');

  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 400);
}
main().catch((e) => { console.error(e); process.exit(1); });
