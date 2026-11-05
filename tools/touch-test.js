/* 触摸手势验证：模拟触屏拖动，检查相机是否旋转、移动端按钮是否出现 */
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.CDP_PORT || '9444';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E6%96%87%E6%9C%AC%E9%98%85%E8%AF%BB/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = path.join(process.env.TEMP, 'touch-test-' + Date.now());
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
  if (!page) throw new Error('no page');

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
  await sleep(6000);

  console.log('touch-action:', await evalJS("getComputedStyle(document.getElementById('space')).touchAction"));
  console.log('mobile buttons visible:', await evalJS("getComputedStyle(document.getElementById('btn-add-folder')).display"));
  console.log('az before:', await evalJS('SY.renderer.orbit.az'));

  const y = 430;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 340, y: y }] });
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 340 - i * 22, y: y }] });
    await sleep(30);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);

  console.log('az after :', await evalJS('SY.renderer.orbit.az'));
  console.log('delta    :', await evalJS("(SY.renderer.orbit.az).toFixed(3)"));
  console.log('pointer map size:', await evalJS('SY.renderer.pointers.size'));

  await evalJS("window.__pd=[]; window.addEventListener('pointerdown', function(e){ window.__pd.push([e.pointerId, e.pointerType, (e.target.id||e.target.className||'?'), e.clientX, e.clientY]); }, true); 'ok'");
  const d0 = await evalJS('SY.renderer.orbit.dist');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 400, id: 0 }, { x: 260, y: 400, id: 1 }] });
  await sleep(150);
  console.log('pointers after 2-finger down:', await evalJS('SY.renderer.pointers.size'), 'pinch:', await evalJS('!!SY.renderer.pinch'));
  console.log('pointerdown events:', JSON.stringify(await evalJS('window.__pd')));
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180 - i * 12, y: 400, id: 0 }, { x: 260 + i * 12, y: 400, id: 1 }] });
    await sleep(30);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  console.log('dist before/after pinch:', d0, await evalJS('SY.renderer.orbit.dist'));

  ws.close();
  chrome.kill();
  setTimeout(() => process.exit(0), 400);
}
main().catch((e) => { console.error(e); process.exit(1); });
