/* 合并导入验证：两次导入应累加；重复路径应覆盖而非新增 */
const path = require('path');
const { spawn } = require('child_process');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E9%98%85%E8%AF%BB%E5%99%A8/index.html';

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1200,760',
    '--remote-debugging-port=9961', '--user-data-dir=' + path.join(process.env.TEMP, 'merge-' + Date.now()), URL], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:9961/json/list')).json(); page = l.find((t) => t.type === 'page'); } catch (e) {}
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (m, p) => new Promise((r) => { const i = ++id; pend.set(i, { resolve: r }); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) : r.result.value; };

  await send('Runtime.enable');
  await sleep(7000);

  const batch = (folder, n, tag) => `(async()=>{const files=[];for(let k=1;k<=${n};k++){const f=new File(['${tag}'.repeat(600)],'00'+k+'.txt');Object.defineProperty(f,'webkitRelativePath',{value:'书/${folder}/00'+k+'.txt'});files.push(f);}const ds=await SY.DataSource.fromFiles(files);await SY.UI.importDataset(ds);return ds.docs.length;})()`;

  console.log('batch A:', await ev(batch('甲', 2, 'a')));
  await sleep(9000);
  console.log('after A:', await ev('SY.data.docs.length'), await ev('SY.data.groups.map(function(g){return g.cn})'));

  console.log('batch B:', await ev(batch('乙', 2, 'b')));
  await sleep(9000);
  console.log('after B:', await ev('SY.data.docs.length'), await ev('SY.data.groups.map(function(g){return g.cn})'));
  console.log('paths  :', await ev('SY.data.docs.map(function(d){return d.path}).join(" | ")'));

  // 重复导入同一路径（只 1 个文件）→ 应覆盖，不新增
  console.log('batch A again:', await ev(batch('甲', 1, 'a2')));
  await sleep(9000);
  console.log('after re-A:', await ev('SY.data.docs.length'), await ev('SY.data.groups.map(function(g){return g.cn})'));
  console.log('errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none');

  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error(e.message); process.exit(1); });
