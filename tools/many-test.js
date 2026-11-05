/* 16 组：验证超过 12 种后循环、数量不设上限 */
const path = require('path');
const { spawn } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E9%98%85%E8%AF%BB%E5%99%A8/index.html';

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1200,760',
    '--remote-debugging-port=9951', '--user-data-dir=' + path.join(process.env.TEMP, 'many-' + Date.now()), URL], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:9951/json/list')).json(); page = l.find((t) => t.type === 'page'); } catch (e) {}
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); p.resolve(m.result); } });
  const send = (m, p) => new Promise((r) => { const i = ++id; pend.set(i, { resolve: r }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };

  await send('Runtime.enable');
  await sleep(7000);
  const prep = "(async()=>{const names=[];for(let i=1;i<=16;i++)names.push('组'+String(i).padStart(2,'0'));const files=[];for(const n of names){for(let k=1;k<=2;k++){const f=new File(['y'.repeat(500)],'0'+k+'.txt');Object.defineProperty(f,'webkitRelativePath',{value:'书/'+n+'/0'+k+'.txt'});files.push(f);}}const ds=await SY.DataSource.fromFiles(files);await SY.DataSource.save(ds);setTimeout(()=>location.reload(),200);return ds.groups.length;})()";
  console.log('groups:', await ev(prep));
  await sleep(9000);
  console.log('nebulae:', await ev('SY.NEBULAE.length'));
  console.log('types  :', await ev('SY.NEBULAE.map(function(n){return n.type}).join(",")'));
  console.log('bounds :', await ev('JSON.stringify(SY.sceneBounds)'));
  console.log('errors :', await ev('SY.renderer && SY.renderer.gl ? SY.renderer.gl.getError() : "n/a"'));
  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error(e.message); process.exit(1); });
