/* 10 片星云：形态唯一性 / 布局 / 新 shader 编译验证 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.CDP_PORT || '9911';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E9%98%85%E8%AF%BB%E5%99%A8/index.html';
const CN = ['一','二','三','四','五','六','七','八','九','十'];

(async () => {
  const profile = path.join(process.env.TEMP, 'neb-test-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1400,900',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, URL], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page'); } catch (e) {}
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pend = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pend.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

  await send('Runtime.enable');
  await sleep(7000);

  const prep = `(async () => {
    const names = ${JSON.stringify(CN)};
    const files = [];
    for (let i = 0; i < names.length; i++) {
      for (let k = 1; k <= 3; k++) {
        const f = new File(['第' + names[i] + '卷 第' + k + '篇\\n' + '字'.repeat(600 + i * 400)], '00' + k + '-篇' + k + '.txt');
        Object.defineProperty(f, 'webkitRelativePath', { value: '书/卷' + names[i] + '/00' + k + '-篇' + k + '.txt' });
        files.push(f);
      }
    }
    const ds = await SY.DataSource.fromFiles(files);
    await SY.DataSource.save(ds);
    setTimeout(() => location.reload(), 300);
    return ds.docs.length + ' docs, ' + ds.groups.length + ' groups';
  })()`;
  console.log('prep:', await ev(prep));
  await sleep(9000);

  console.log('nebulae:', await ev('SY.NEBULAE.length'));
  console.log('types:', await ev('SY.NEBULAE.map(function(n){return n.type}).join(",")'));
  console.log('unique:', await ev('new Set(SY.NEBULAE.map(function(n){return n.type})).size'));
  console.log('shapes:', await ev('SY.NEBULAE.map(function(n){return n.cn}).join(" / ")'));
  console.log('bounds:', await ev('JSON.stringify(SY.sceneBounds)'));
  console.log('gl error:', await ev('(function(){var gl=SY.renderer.gl; var e=gl.getError(); return e;})()'));

  await sleep(1500);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'screenshots', 'ten-nebulae.png'), Buffer.from(shot.data, 'base64'));

  // 进入第 5 片（type 4 双极喷流）验证新 shader
  await ev('SY.app.enter(4)');
  await sleep(4500);
  console.log('mode:', await ev('SY.renderer.mode'), '| gl error:', await ev('SY.renderer.gl.getError()'));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'screenshots', 'jet-inside.png'), Buffer.from(shot.data, 'base64'));
  console.log('errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');

  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 400);
})().catch((e) => { console.error(e); process.exit(1); });
