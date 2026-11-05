/* PWA 验证：注册、manifest、离线重载（需先启动 tools/serve.js） */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PWA_PORT || '8099';
const CDP = process.env.PWA_CDP || '9333';
const URL_BASE = 'http://127.0.0.1:' + PORT + '/index.html';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = path.join(process.env.TEMP, 'pwa-test-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + CDP, '--user-data-dir=' + PROFILE, URL_BASE
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    try {
      targets = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch (e) { /* retry */ }
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map(); const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') logs.push('[ex] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

  await send('Runtime.enable');
  await send('Network.enable');
  await sleep(4000);

  console.log('manifest link:', await evalJS("!!document.querySelector('link[rel=manifest]')"));
  console.log('manifest fetch:', await evalJS("fetch('manifest.webmanifest').then(r=>r.status+':'+r.headers.get('content-type'))"));
  console.log('sw registered:', await evalJS("navigator.serviceWorker.getRegistration().then(r=>!!r)"));
  console.log('caches:', await evalJS("caches.keys()"));
  console.log('app booted:', await evalJS("!!(window.SY && SY.data && SY.data.docs.length) + ' docs=' + (window.SY&&SY.data?SY.data.docs.length:0)"));

  // 离线重载
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: false });
  await sleep(5000);
  console.log('offline title:', await evalJS('document.title'));
  console.log('offline booted:', await evalJS("!!(window.SY && SY.data) + ' docs=' + (window.SY&&SY.data?SY.data.docs.length:0)"));
  if (logs.length) console.log('logs:', logs.slice(-5).join(' | '));

  ws.close();
  chrome.kill();
  setTimeout(() => process.exit(0), 500);
}

main().catch((e) => { console.error(e); process.exit(1); });
