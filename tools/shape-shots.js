/* 进入指定星云截图，检查新形态观感 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = '9923';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E9%98%85%E8%AF%BB%E5%99%A8/index.html';
const OUT = 'D:/Documents/deepseek-harness/default-workspace/星云阅读器/screenshots';

(async () => {
  const profile = path.join(process.env.TEMP, 'shp2-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1200,760',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, URL], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page'); } catch (e) {}
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); p.resolve(m.result); }
  });
  const send = (m, p) => new Promise((r) => { const i = ++id; pend.set(i, { resolve: r }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };

  await send('Runtime.enable');
  await sleep(7000);

  const prep = "(async()=>{const cn=['一','二','三','四','五','六','七','八','九','十'];const files=[];for(let i=0;i<cn.length;i++){for(let k=1;k<=3;k++){const f=new File(['x'.repeat(800)],'00'+k+'.txt');Object.defineProperty(f,'webkitRelativePath',{value:'书/卷'+cn[i]+'/00'+k+'.txt'});files.push(f);}}const ds=await SY.DataSource.fromFiles(files);await SY.DataSource.save(ds);setTimeout(()=>location.reload(),200);return ds.groups.length;})()";
  console.log('prep groups:', await ev(prep));
  await sleep(9000);

  for (const idx of [6, 7, 8]) {
    await ev('SY.app.enter(' + idx + ')');
    await sleep(4500);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT + '/shape-' + idx + '.png', Buffer.from(s.data, 'base64'));
    await ev('SY.renderer.surface()');
    await sleep(3200);
  }
  console.log('saved shape-6/7/8');
  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error(e.message); process.exit(1); });
