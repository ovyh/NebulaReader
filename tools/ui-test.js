/* R4/R5 + 手机菜单 端到端验证 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = process.env.CDP_PORT || '9888';
const URL = 'file:///D:/Documents/deepseek-harness/default-workspace/%E6%98%9F%E4%BA%91%E6%96%87%E6%9C%AC%E9%98%85%E8%AF%BB/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = path.join(process.env.TEMP, 'ui-test-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1280,800',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, URL], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    await sleep(400);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page'); } catch (e) {}
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJS = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };

  await send('Runtime.enable');
  await sleep(6500);

  // 准备一份含关联的数据并重载
  const prep = `(async () => {
    const txt = new File(['# 笔记\\n\\n参考 图片.png 与 b.txt\\n' + '字'.repeat(4000)], 'b.md');
    const t2 = new File(['正文'.repeat(200)], 'b.txt');
    const png = await new Promise((res) => {
      const c = document.createElement('canvas'); c.width = 200; c.height = 140;
      const g = c.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0,0,200,140);
      c.toBlob((b) => res(new File([b], '图片.png', { type: 'image/png' })), 'image/png');
    });
    const ds = await SY.DataSource.fromFiles([txt, t2, png]);
    await SY.DataSource.save(ds);
    setTimeout(() => location.reload(), 300);
    return ds.docs.length + ' files, edges=' + SY.rules.buildEdges(ds.docs).length;
  })()`;
  console.log('prep:', await evalJS(prep));
  await sleep(9000);

  console.log('boot nodes:', await evalJS('SY.data.docs.length'), 'edges:', await evalJS('SY.data.edges.length'));
  await evalJS('SY.app.enter(0)');
  await sleep(4200);
  console.log('mode:', await evalJS('SY.renderer.mode'), 'edgeScreen:', await evalJS('SY.renderer.edgeScreen.length'));

  const pt = await evalJS(`(() => {
    const e = SY.renderer.edgeScreen[0];
    if (!e) return null;
    return JSON.stringify({ x: Math.round((e.ax + e.bx) / 2), y: Math.round((e.ay + e.by) / 2) });
  })()`);
  console.log('edge midpoint:', pt);
  if (pt) {
    const p = JSON.parse(pt);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, buttons: 0, pointerType: 'mouse' });
    await sleep(500);
    console.log('edge tooltip:', await evalJS("document.getElementById('tooltip').className + ' | ' + document.getElementById('tooltip').innerText.replace(/\\n/g,' / ')"));
    await evalJS("window.__ev=[]; ['pointerdown','pointerup'].forEach(function(t){window.addEventListener(t,function(e){window.__ev.push(t+':'+(e.target.id||e.target.className||'?')+'@'+e.clientX+','+e.clientY);},true);}); 'ok'");
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(600);
    console.log('events:', await evalJS("window.__ev.join(' | ')"), '| moved=', await evalJS('SY.renderer.pointer.moved'), '| trans=', await evalJS('!!SY.renderer.trans'));
    console.log('hit:', await evalJS("(function(){var el=document.elementFromPoint(548,390);return el.className+' pe='+getComputedStyle(el).pointerEvents+' parentPe='+getComputedStyle(el.parentElement).pointerEvents;})()"));
    console.log('force updateCards ->', await evalJS("SY.UI.updateCards(); SY.UI.cards[0].style.pointerEvents"));
    console.log('update src:', await evalJS("SY.UI.update.toString().slice(0,160)"));
    console.log('edge click toast:', await evalJS("document.getElementById('toast').innerText"));
    console.log('direct handler:', await evalJS("(function(){var e=SY.renderer.pickEdge(550,389);try{SY.renderer.onEdgeClick(e);return document.getElementById('toast').innerText;}catch(err){return 'THROW '+err.message;}})()"));
  }

  // 键盘导航
  const before = await evalJS("SY.renderer.hoverStar ? SY.renderer.hoverStar.doc.t : 'none'");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(500);
  const after = await evalJS("SY.renderer.hoverStar ? SY.renderer.hoverStar.doc.t : 'none'");
  console.log('keyboard focus:', before, '->', after);

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1200);
  console.log('Enter opens:', await evalJS("!document.getElementById('reader').classList.contains('hidden') || !document.getElementById('media').classList.contains('hidden')"));
  await evalJS('SY.UI.goBack()');
  await sleep(500);

  // 菜单
  await evalJS("document.getElementById('btn-menu').click()");
  await sleep(400);
  const menuOpen = await evalJS("!document.getElementById('menu').classList.contains('hidden')");
  const items = await evalJS("Array.from(document.querySelectorAll('.menu-item')).map(b=>b.dataset.act).join(',')");
  console.log('menu:', menuOpen, items);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'screenshots', 'menu-check.png'), Buffer.from(shot.data, 'base64'));

  await evalJS("document.querySelector('[data-act=atlas]').click()");
  await sleep(600);
  console.log('atlas via menu:', await evalJS("document.getElementById('atlas').classList.contains('is-open')"));
  await evalJS("document.getElementById('btn-menu').click(); document.querySelector('[data-nav=right]').click()");
  await sleep(600);
  console.log('pad nav nebula hover:', await evalJS('SY.renderer.hoverNebula'));
  console.log('uncaught errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');

  ws.close(); chrome.kill();
  setTimeout(() => process.exit(0), 400);
}
main().catch((e) => { console.error(e); process.exit(1); });
