/* rules 纯函数单测：node tools/rules-test.js */
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'js', 'config.js'));
require(path.join(__dirname, '..', 'js', 'rules.js'));
const R = global.window.SY.rules;

let pass = 0, fail = 0;
function check(name, actual, expect, tol) {
  const ok = typeof expect === 'number'
    ? Math.abs(actual - expect) <= (tol || 1e-6)
    : actual === expect;
  if (ok) { pass++; console.log('  ok   ' + name + ' = ' + actual); }
  else { fail++; console.log('  FAIL ' + name + ' = ' + actual + ' (期望 ' + expect + (tol ? ' ±' + tol : '') + ')'); }
}

console.log('== 单位 ==');
check('text 10000 字符 → U', R.computeUnits({ type: 'text', meta: { charCount: 10000 } }), 100);
check('text 空 + 2KB → U', R.computeUnits({ type: 'text', meta: { charCount: 0, fileSize: 2048 } }), 2);
check('audio 30s → U', R.computeUnits({ type: 'audio', meta: { durationSec: 30 } }), 300);
check('image 1000x1000 → U', R.computeUnits({ type: 'image', meta: { width: 1000, height: 1000 } }), 100);
check('NaN 安全', R.computeUnits({ type: 'text', meta: { charCount: NaN } }), 0);

console.log('== 恒星参数 ==');
const a = R.computeStar(100);
check('U=100 t', a.t, 0.4008, 0.001);
check('U=100 mass', a.mass, 20.1, 0.2);
check('U=100 temp', a.temperature, 13822, 60);
check('U=100 color', a.color, '#9cc8ff');
check('U=100 radius', a.radius, 49.5, 1.0);

const z = R.computeStar(0);
check('U=0 mass', z.mass, 0.1);
check('U=0 temp', z.temperature, 3000);
check('U=0 color', z.color, '#ff5a3c');
check('U=0 radius', z.radius, 4, 0.1);

const top = R.computeStar(100000);
check('U=1e5 t', top.t, 1, 1e-9);
check('U=1e5 mass', top.mass, 50);
check('U=1e5 temp', top.temperature, 30000);
check('U=1e5 color', top.color, '#6aa8ff');
check('U=1e5 compact', top.compact, false);
check('U=1e5 style', top.style, 'blueWhite');
check('U=1e5 radius 公式值', top.radius, 63.46, 1.0);
console.log('  info  U=1e5 radius =', top.radius.toFixed(2), '（公式值；规范文字给的是 66.5）');

check('U=100001 style', R.computeStar(100001).style, 'whiteDwarf');
check('U=100001 radius', R.computeStar(100001).radius, 10);
check('U=300000 style', R.computeStar(300000).style, 'neutronStar');
check('U=300000 radius', R.computeStar(300000).radius, 8);
check('U=1e6 style', R.computeStar(1000000).style, 'blackHole');
check('U=1e6 radius', R.computeStar(1000000).radius, 6);
check('U=1e9 仍为黑洞', R.computeStar(1e9).style, 'blackHole');
check('U=1e9 半径不增长', R.computeStar(1e9).radius, 6);

console.log('== 格式映射 ==');
const cases = [
  ['txt', 'redDwarf'], ['mp3', 'redDwarfPulse'], ['png', 'ringedPlanet'],
  ['jpg', 'terrestrialPlanet'], ['pdf', 'gasGiant'], ['psd', 'layeredNebula'],
  ['cr2', 'protoplanetaryDisk'], ['docx', 'yellowDwarf'], ['flac', 'whiteDwarf'],
  ['midi', 'binaryOrbit'], ['svg', 'constellation'], ['xyz', 'asteroid']
];
cases.forEach(([ext, style]) => check('format ' + ext, R.resolveStyle(ext).style, style));
check('RAW 类 format 归一', R.resolveStyle('cr2').format, 'RAW');
check('PDF 次级样式', R.resolveStyle('pdf').secondaryStyle, 'gasGiantNebula');

console.log('== 关联边 ==');
const nodes = [
  { id: 'a', g: 'g1', name: '笔记.md', type: 'text', format: 'MD', units: 10, text: '引用 图片.png 和 b.txt' },
  { id: 'b', g: 'g1', name: 'b.txt', type: 'text', format: 'TXT', units: 5, text: '' },
  { id: 'c', g: 'g1', name: '图片.png', type: 'image', format: 'PNG', units: 3, meta: {} }
];
const edges = R.buildEdges(nodes);
const has = (s, t, rel) => edges.some((e) => e.source === s && e.target === t && e.relation === rel);
check('同文件夹 project 边数', edges.filter((e) => e.relation === 'project').length, 2);
check('Markdown 引用 reference', has('a', 'c', 'reference') || has('a', 'b', 'reference'), true);
check('无自环', edges.every((e) => e.source !== e.target), true);
check('边 id 唯一', new Set(edges.map((e) => e.id)).size, edges.length);
check('无向边 id 排序', R.edgeId('b', 'a', 'project', false) === R.edgeId('a', 'b', 'project', false), true);

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
