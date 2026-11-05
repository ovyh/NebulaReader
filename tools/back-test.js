/* 返回键验证：进入星云 → 返回键出现 → 点击回到星系；阅读器 / 星图同理 */
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.CDP_PORT || '9555';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E6%96%87%E6%9C%AC%E9%98%85%E8%AF%BB/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = path.join(process.env.TEMP, 'back-test-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=430,860', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, URL
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      page = list.find((t) => t.type === 'page');
    } catch (e) { /* retry */ }
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  });
  const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

  await send('Runtime.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await sleep(7000);

  console.log('galaxy, back visible:', await evalJS("document.getElementById('btn-back').classList.contains('is-on')"));

  await evalJS('SY.app.enter(0)');
  await sleep(3500);
  console.log('inside mode:', await evalJS('SY.renderer.mode'), '| back visible:', await evalJS("document.getElementById('btn-back').classList.contains('is-on')"));

  await evalJS("document.getElementById('btn-back').click()");
  await sleep(3500);
  console.log('after back, mode:', await evalJS('SY.renderer.mode'));

  await evalJS("document.getElementById('btn-atlas').click()");
  await sleep(800);
  console.log('atlas open:', await evalJS("document.getElementById('atlas').classList.contains('is-open')"), '| back visible:', await evalJS("document.getElementById('btn-back').classList.contains('is-on')"));
  await evalJS("document.getElementById('btn-back').click()");
  await sleep(600);
  console.log('after back, atlas open:', await evalJS("document.getElementById('atlas').classList.contains('is-open')"));

  await evalJS("SY.app.open('g1-001')");
  await sleep(1800);
  console.log('reader open:', await evalJS('SY.UI.reader.open'));
  console.log('goBack handled:', await evalJS('SY.UI.goBack()'));
  await sleep(600);
  console.log('reader after back:', await evalJS('SY.UI.reader.open'));
  console.log('goBack in galaxy returns:', await evalJS('SY.UI.goBack()'));

  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 400);
}
main().catch((e) => { console.error(e); process.exit(1); });
