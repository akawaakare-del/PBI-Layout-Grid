// ============================================================================
// PBI-Layout-Grid 单元测试（Node 直接运行，无第三方依赖）
//   运行：node src/test/unit/run-tests.js
// 说明：从 src/main/index.html 提取 PBILOGIC 纯逻辑块（浏览器与 Node 复用同一份
//       代码，零复制），并用 vm 编译应用层脚本做语法校验。
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', '..', 'main', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// ---- 提取纯逻辑块（PBILOGIC-BEGIN ~ PBILOGIC-END） ----
const m = html.match(/\/\/ PBILOGIC-BEGIN([\s\S]*?)\/\/ PBILOGIC-END/);
if (!m) { console.error('FAIL: 未找到 PBILOGIC 标记'); process.exit(1); }
const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(m[0], sandbox);
const L = sandbox.module.exports;
if (!L || typeof L.parseCSV !== 'function') { console.error('FAIL: PbiLogic 导出异常'); process.exit(1); }

// ---- 应用层脚本语法校验（不执行 DOM） ----
const appMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
if (!appMatch) { console.error('FAIL: 未找到应用层脚本'); process.exit(1); }
new vm.Script(appMatch[1]); // 仅编译，验证语法
console.log('ok  应用层脚本语法校验通过');

// ---- 极简断言框架 ----
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('ok  ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}
function eq(a, b, name) { ok(a === b, name + (a === b ? '' : '（期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + '）')); }

// ============================================================================
// 1. 带 BOM 的 CSV 解析
// ============================================================================
{
  const csv = '﻿"Page","Id","Type","X","Y","Width","Height"\n"P1","a1","textbox","0","0","100","50"\n';
  const model = L.parseCSV(csv);
  eq(model.items.length, 1, 'BOM：解析出 1 个组件');
  eq(model.items[0].page, 'P1', 'BOM：Page 正确');
  eq(model.errors.length, 0, 'BOM：无错误');
}

// ============================================================================
// 2. 引号字段、字段内逗号、字段内引号转义
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\r\n' +
    '"P,1","id""x","textbox","10","20","30","40"\r\n';
  const model = L.parseCSV(csv);
  eq(model.items.length, 1, '引号/逗号：解析出 1 个组件');
  eq(model.items[0].page, 'P,1', '字段内逗号保留');
  eq(model.items[0].id, 'id"x', '字段内引号 "" 转义为 "');
  eq(model.eol, '\r\n', 'EOL 检测为 CRLF');
}

// ============================================================================
// 3. Page 前导空格原样保留；同名 Page（含空格差异不算同名）归入同页
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"  嘉聯","a","shape","0","0","10","10"\n' +
    '"  嘉聯","b","shape","0","0","10","10"\n' +
    '"嘉聯","c","shape","0","0","10","10"\n';
  const model = L.parseCSV(csv);
  eq(model.pages.length, 2, '前导空格不同 = 不同页（原样保留不 trim）');
  eq(model.pages[0].name, '  嘉聯', 'Page 前导空格原样保留');
  eq(model.pages[0].items.length, 2, '同名 Page 归入同一页');
}

// ============================================================================
// 4. 原样导出：不改坐标时，导出（含 BOM）与输入逐字节等价
//    约定：EOL 沿用输入检测值；输出统一 UTF-8 BOM + 全部字段加引号
// ============================================================================
{
  // LF 风格输入
  const csvLf = '﻿"Page","Id","Type","X","Y","Width","Height"\n' +
    '"  嘉聯","a1","textbox","0","0","100","50"\n' +
    '"  嘉聯","a2","cardVisual","10,5","20","100","50"\n'.replace('"10,5"', '"105"');
  const model = L.parseCSV(csvLf);
  eq(L.serializeCSV(model), csvLf.slice(1), 'LF 输入：导出与输入逐字节等价（除 BOM 处理约定外）');
  // CRLF 风格输入
  const csvCrlf = csvLf.replace(/\n/g, '\r\n');
  const model2 = L.parseCSV(csvCrlf);
  eq(L.serializeCSV(model2), csvCrlf.slice(1), 'CRLF 输入：导出与输入逐字节等价');
}

// ============================================================================
// 5. Sprint 4 真实样例：14 个组件、1 页，新格式（含 Title/Z 列），其中 2 行越界照常导入
//    说明：样例坐标已全部为整数（无小数行），roundNotes 应为 0
// ============================================================================
{
  const sample = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', '01-plan', 'io-samples', 'Project Portfolio Tracker-layout.csv'), 'utf8');
  const model = L.parseCSV(sample);
  eq(model.items.length, 14, '样例：14 个组件全部导入（越界行不再拒绝）');
  eq(model.totalRows, 14, '样例：CSV 共 14 行');
  eq(model.pages.length, 1, '样例：1 页');
  eq(model.pages[0].name, '  嘉聯', '样例：Page 前导空格保留');
  eq(model.errors.length, 0, '样例：无错误行');
  eq(model.warnings.length, 0, '样例：无警告');
  ok(model.hasTitle && model.hasZ, '样例：识别出 Title 与 Z 列');
  eq(model.header.join(','), 'Page,Id,Type,Title,X,Y,Width,Height,Z', '样例：列顺序以输入为准');
  eq(model.roundNotes.length, 0, '样例：坐标均为整数，无四舍五入提示');
  ok(model.items.every(i => Number.isInteger(i.x) && Number.isInteger(i.y) && Number.isInteger(i.w) && Number.isInteger(i.h)), '样例：所有坐标为整数');
  // 行顺序保持：第 2 行（Id 0f7596...）是 top_bg，宽 220 通栏背景
  eq(model.items[1].w, 220, '样例：第 2 个组件 top_bg 宽度 220');
  // Title 解析：第 1 行 Title 为 "已完成数"，存在空 Title 行
  eq(model.items[0].title, '已完成数', '样例：Title 原样解析');
  ok(model.items.some(i => i.title === ''), '样例：空 Title（"" 空值）解析为空串');
  // 越界集合：恰为 Id fb5630...（y+h=1080）与 e528a...（x+w=1400）两行
  const oobIds = model.items.filter(i => L.rectOutOfBounds(i, 1280, 720)).map(i => i.id).sort();
  eq(oobIds.join(','), ['e528a60272d8eaad788e', 'fb5630e539d444a5edb0'].sort().join(','), '样例：越界集合恰为指定两行');
}

// ============================================================================
// 6. 非法行提示：非数字 / 负数 / 宽高<=0 / 字段数错误；越界行（Sprint 4）照常导入
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"P1","good","textbox","0","0","100","50"\n' +          // 第 2 行 ok
    '"P1","badnum","textbox","abc","0","100","50"\n' +      // 第 3 行 非数字
    '"P1","neg","textbox","-5","0","100","50"\n' +          // 第 4 行 负数
    '"P1","oob","textbox","1200","0","200","50"\n' +        // 第 5 行 越界：Sprint 4 起照常导入
    '"P1","zerow","textbox","0","0","0","50"\n' +           // 第 6 行 宽=0
    '"P1","few","textbox","0","0","100"\n' +                // 第 7 行 字段数 6
    '"P1","after","textbox","0","0","100","50"\n';          // 第 8 行 ok
  const model = L.parseCSV(csv);
  eq(model.totalRows, 7, '数据行总数 7（含损坏行）');
  eq(model.items.length, 3, '越界行导入，其余损坏行跳过');
  eq(model.errors.length, 4, '共 4 个错误（非数字/负数/宽0/字段数）');
  ok(model.errors.some(e => e.line === 3 && e.id === 'badnum' && e.field === 'X' && /不是数字/.test(e.msg)), '第 3 行 X 非数字：行号/Id/字段正确');
  ok(model.errors.some(e => e.line === 4 && e.field === 'X' && /负数/.test(e.msg)), '第 4 行 X 负数提示');
  ok(model.errors.some(e => e.line === 6 && e.field === 'Width' && /大于 0/.test(e.msg)), '第 6 行宽 0 提示');
  ok(model.errors.some(e => e.line === 7 && /字段数/.test(e.msg)), '第 7 行字段数错误提示');
  const oobItem = model.items.find(i => i.id === 'oob');
  ok(!!oobItem && oobItem.x === 1200 && oobItem.w === 200, '第 5 行越界照常导入（x=1200, w=200）');
  ok(L.rectOutOfBounds(oobItem, 1280, 720), '第 5 行被判定为越界');
}

// ============================================================================
// 7. 小数取整提示：记录行号、Id 与字段名
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"P1","r1","textbox","10.4","20.6","30.0","50"\n';
  const model = L.parseCSV(csv);
  eq(model.items[0].x, 10, '10.4 四舍五入为 10');
  eq(model.items[0].y, 21, '20.6 四舍五入为 21');
  eq(model.roundNotes.length, 1, '产生 1 条取整提示');
  ok(model.roundNotes[0].line === 2 && model.roundNotes[0].id === 'r1' && model.roundNotes[0].fields.join(',') === 'X,Y', '取整提示含行号/Id/字段');
}

// ============================================================================
// 8. 命令栈：撤销/重做一致性（移动命令 + 重置命令）
// ============================================================================
{
  const stack = L.createCommandStack();
  const item = { x: 0, y: 0 };
  const mk = (f, to) => ({
    do() { item.x = to.x; item.y = to.y; },
    undo() { item.x = f.x; item.y = f.y; }
  });
  stack.push(mk({ x: 0, y: 0 }, { x: 100, y: 50 }));
  eq(item.x, 100, '命令执行后位置更新');
  stack.push(mk({ x: 100, y: 50 }, { x: 110, y: 60 }));
  stack.undo();
  eq(item.x, 100, '撤销一步回到上一位置');
  stack.undo();
  eq(item.x, 0, '再撤销回到初始位置');
  ok(!stack.canUndo(), '栈空后不可再撤销');
  stack.redo();
  eq(item.x, 100, '重做恢复');
  // 撤销后执行新命令，重做分支被截断
  stack.undo();
  stack.push(mk({ x: 0, y: 0 }, { x: 7, y: 7 }));
  ok(!stack.canRedo(), '新命令截断重做分支');
  eq(item.x, 7, '新命令生效');

  // 重置命令：多组件批量恢复，undo 可还原
  const items = [{ x: 1, y: 2, orig: { x: 0, y: 0 } }, { x: 9, y: 9, orig: { x: 5, y: 5 } }];
  const reset = {
    do() { items.forEach(i => { i.x = i.orig.x; i.y = i.orig.y; }); },
    undo() { items[0].x = 1; items[0].y = 2; items[1].x = 9; items[1].y = 9; }
  };
  const s2 = L.createCommandStack();
  s2.push(reset);
  ok(items.every(i => i.x === i.orig.x && i.y === i.orig.y), '重置：全部回到基准');
  s2.undo();
  ok(items[0].x === 1 && items[1].x === 9, '重置可撤销：恢复改动后状态');
  s2.redo();
  ok(items[0].x === 0 && items[1].x === 5, '重置可重做');
}

// ============================================================================
// 9. 导出全页面 + 修改仅影响对应行
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"P1","a","textbox","0","0","100","50"\n' +
    '"P2","b","textbox","0","0","100","50"\n';
  const model = L.parseCSV(csv);
  model.items[1].x = 77; // 只改 P2 的 b
  const out = L.serializeCSV(model);
  const lines = out.trim().split('\n');
  eq(lines.length, 3, '导出含表头 + 2 行（跨页全量）');
  ok(lines[1].includes('"0","0","100","50"'), '未修改行原样');
  ok(lines[2].includes('"77","0","100","50"'), '仅被修改行的 X 变化');
  ok(lines[2].includes('"P2"'), 'Page 值透传');
}

// ============================================================================
// 10. Sprint 2 基础：copyRect / rectEq
// ============================================================================
{
  const r = { x: 1, y: 2, w: 3, h: 4 };
  const c = L.copyRect(r);
  ok(c !== r && c.x === 1 && c.y === 2 && c.w === 3 && c.h === 4, 'copyRect：返回新对象且值一致');
  c.x = 99;
  eq(r.x, 1, 'copyRect：修改副本不影响原对象');
  ok(L.rectEq({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4 }), 'rectEq：相同矩形为 true');
  ok(!L.rectEq({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 5 }), 'rectEq：h 不同为 false');
  ok(!L.rectEq({ x: 1, y: 2, w: 3, h: 4 }, { x: 1, y: 2, w: 3, h: 4.5 }), 'rectEq：严格相等（4 vs 4.5 为 false）');
}

// ============================================================================
// 11. 移动吸附：阈值边界、最小距离、阈值随 zoom 折算
// ============================================================================
{
  // 左线=0、中心=50、右线=100 的矩形（w=100），候选线含 640
  const rect = { x: 0, y: 0, w: 100, h: 40 };
  const candX = [0, 640, 1280];
  const candY = [0, 360, 720];
  // zoom=1：threshold = 10/1 = 10（画布像素）
  let res = L.computeSnapMove({ x: 635, y: 300, w: 100, h: 40 }, candX, candY, 10);
  ok(res.x && res.x.target === 640 && res.x.line === 0, 'zoom=1：左线距 640 为 5 ≤ 10，命中线 640（左线）');
  eq(res.x.delta, 5, 'zoom=1：delta=+5 贴齐');
  // zoom=4：threshold = 10/4 = 2.5（画布像素），5 > 2.5 不命中
  res = L.computeSnapMove({ x: 635, y: 300, w: 100, h: 40 }, candX, candY, 2.5);
  ok(res.x === null, 'zoom=4：同样的 5 画布像素 > 2.5 阈值，不命中（手感按屏幕像素一致）');
  // zoom=0.25：threshold = 10/0.25 = 40，命中
  res = L.computeSnapMove({ x: 635, y: 300, w: 100, h: 40 }, candX, candY, 40);
  ok(res.x && res.x.target === 640, 'zoom=25%：阈值放大到 40，命中');
  // 阈值边界：距离恰好 = threshold 命中；threshold+1 不命中
  res = L.computeSnapMove({ x: 630, y: 300, w: 100, h: 40 }, candX, candY, 10);
  ok(res.x && res.x.dist === 10, '距离恰好等于阈值时命中');
  res = L.computeSnapMove({ x: 629, y: 300, w: 100, h: 40 }, candX, candY, 10);
  ok(res.x === null, '距离超过阈值 1px 不命中');
  // 多条候选取最近：左线 644 距 645 为 1、距 640 为 4，取 645（640 也会被右线 744 比较但不更近）
  res = L.computeSnapMove({ x: 644, y: 300, w: 100, h: 40 }, [640, 645], candY, 10);
  ok(res.x && res.x.target === 645 && res.x.dist === 1, '多条候选都在阈值内时取距离最小者');
}

// ============================================================================
// 12. 移动吸附：两轴独立（X 命中、Y 不命中）
// ============================================================================
{
  const candX = [0, 640, 1280], candY = [0, 360, 720];
  // x=637 距 640 为 3（左线）会命中；y=200 距任何 Y 候选都 > 10
  const res = L.computeSnapMove({ x: 637, y: 200, w: 100, h: 40 }, candX, candY, 10);
  ok(res.x && res.x.target === 640, '两轴独立：X 轴命中 640');
  ok(res.y === null, '两轴独立：Y 轴无命中（调用方按网格/1px 处理）');
  // y=685,h=40：下线 725 距 720 为 5（中心 705 距 720 为 15），命中下线
  const res2 = L.computeSnapMove({ x: 100, y: 685, w: 100, h: 40 }, candX, candY, 10);
  ok(res2.y && res2.y.target === 720 && res2.y.line === 2 && res2.y.dist === 5, 'Y 轴下线距 720 为 5，命中（line=2 下线）');
  ok(res2.x === null, 'Y 命中时 X 不强制命中');
  // 中心线命中：rect.x+ w/2 = 640 → x = 590
  const res3 = L.computeSnapMove({ x: 588, y: 100, w: 100, h: 40 }, candX, candY, 10);
  ok(res3.x && res3.x.line === 1 && res3.x.target === 640, '水平中心线命中（line=1）');
}

// ============================================================================
// 13. 移动吸附：阈值 0 / 两种吸附全关时调用方语义（无命中 → 走 1px）
// ============================================================================
{
  const candX = [0, 640, 1280], candY = [0, 360, 720];
  const res = L.computeSnapMove({ x: 636, y: 356, w: 10, h: 10 }, candX, candY, 0);
  ok(res.x === null && res.y === null, 'threshold=0：无非零距离命中（双关时由调用方取整到 1px）');
}

// ============================================================================
// 14. 缩放计算：网格吸附 / 组件吸附 / 双关 / 最小尺寸 / 画布夹紧
// ============================================================================
{
  const base = { snapGrid: true, snapComp: false, threshold: 10, candX: [0, 640, 1280], candY: [0, 360, 720], minW: 10, minH: 10, canvasW: 1280, canvasH: 720 };
  // e 手柄 + 网格：右边 205 → 210
  let r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'e', 5, 0, base);
  eq(r.rect.w, 110, '缩放：e 手柄网格吸附，右边 205 → 210（w=110）');
  eq(r.rect.x, 100, '缩放：e 手柄不动 x');
  // e 手柄 + 组件吸附：右边 635 距 640 为 5 ≤ 10 命中（优先于网格）
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'e', 435, 0, Object.assign({}, base, { snapComp: true }));
  eq(r.rect.w, 540, '缩放：组件吸附优先，右边贴 640（w=540）');
  ok(r.hits.e && r.hits.e.target === 640, '缩放：hits.e 记录命中线供引导线');
  // e 手柄 双关：1px 取整
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'e', 4.4, 0, Object.assign({}, base, { snapGrid: false }));
  eq(r.rect.w, 104, '缩放：双关时 1px 精度（104.4 → 104）');
  // e 手柄最小尺寸：拖过头 w < 10 → 夹紧到 10
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'e', -200, 0, base);
  eq(r.rect.w, 10, '缩放：最小尺寸保护 w=10');
  // e 手柄画布右缘：右边拖到 2000 → 夹紧 1280
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'e', 2000, 0, base);
  eq(r.rect.w, 1180, '缩放：不可超出画布右边（w=1180）');
  // nw 手柄：x/y 动、w/h 反向
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'nw', 10, 5, base);
  eq(r.rect.x, 110, '缩放：nw 手柄 x 右移');
  eq(r.rect.y, 110, '缩放：nw 手柄 y 下移');
  eq(r.rect.w, 90, '缩放：nw 手柄 w 缩小');
  eq(r.rect.h, 40, '缩放：nw 手柄 h 缩小');
  // nw 最小尺寸：拖太多 → 夹紧（x 最多右移到 x+w-minW）
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 'nw', 500, 0, base);
  eq(r.rect.w, 10, '缩放：nw 拖过头夹紧最小宽 10');
  eq(r.rect.x, 190, '缩放：nw 夹紧后 x=190（右边不动）');
  // nw 画布左上缘：x 不可 < 0
  r = L.computeResize({ x: 50, y: 50, w: 100, h: 50 }, 'nw', -100, -100, base);
  eq(r.rect.x, 0, '缩放：x 不可出画布左缘（夹紧 0）');
  eq(r.rect.y, 0, '缩放：y 不可出画布上缘（夹紧 0）');
  eq(r.rect.w, 150, '缩放：夹紧后宽保持右边不变');
  // s 手柄 + 组件吸附：下边 715 距 720 为 5 命中
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 's', 0, 565, Object.assign({}, base, { snapComp: true }));
  eq(r.rect.h, 620, '缩放：s 组件吸附，下边贴 720（h=620）');
  ok(r.hits.s && r.hits.s.target === 720, '缩放：hits.s 记录命中线');
}

// ============================================================================
// 15. 输入校验：合法 / 非数字 / 非整数 / 负数 / 尺寸过小 / 越界
// ============================================================================
{
  // 合法（字符串数字可）
  let v = L.validateRectInput({ x: '10', y: '20', w: '100', h: '50' }, 1280, 720, 10);
  ok(v.ok && v.rect.x === 10 && v.rect.w === 100, '校验：字符串数字通过并转整数');
  // 空
  v = L.validateRectInput({ x: '', y: 20, w: 100, h: 50 }, 1280, 720, 10);
  ok(!v.ok && v.field === 'X' && /不是数字/.test(v.msg), '校验：空值为非数字');
  // 非数字
  v = L.validateRectInput({ x: 'abc', y: 20, w: 100, h: 50 }, 1280, 720, 10);
  ok(!v.ok && v.field === 'X' && /不是数字/.test(v.msg), '校验：abc 非数字');
  // 非整数
  v = L.validateRectInput({ x: 10.5, y: 20, w: 100, h: 50 }, 1280, 720, 10);
  ok(!v.ok && v.field === 'X' && /整数/.test(v.msg), '校验：10.5 必须是整数');
  // 负数
  v = L.validateRectInput({ x: -1, y: 20, w: 100, h: 50 }, 1280, 720, 10);
  ok(!v.ok && v.field === 'X' && /负/.test(v.msg), '校验：负数拒绝');
  // 尺寸 < 10
  v = L.validateRectInput({ x: 0, y: 0, w: 9, h: 50 }, 1280, 720, 10);
  ok(!v.ok && v.field === '宽' && /不能小于/.test(v.msg), '校验：宽 9 < 10 拒绝');
  v = L.validateRectInput({ x: 0, y: 0, w: 10, h: 5 }, 1280, 720, 10);
  ok(!v.ok && v.field === '高' && /不能小于/.test(v.msg), '校验：高 5 < 10 拒绝');
  // 越界：x+w > 1280
  v = L.validateRectInput({ x: 1200, y: 0, w: 100, h: 50 }, 1280, 720, 10);
  ok(!v.ok && v.field === 'X' && /超出画布/.test(v.msg), '校验：X+宽超出画布');
  // 边界：恰好贴边通过
  v = L.validateRectInput({ x: 1180, y: 670, w: 100, h: 50 }, 1280, 720, 10);
  ok(v.ok, '校验：恰好贴画布右下缘通过');
}

// ============================================================================
// 16. 可合并命令：窗口内合并、超窗拒绝、撤销回到序列起点
// ============================================================================
{
  const item = { x: 0, y: 0, w: 100, h: 50 };
  const apply = (it, r) => { it.x = r.x; it.y = r.y; it.w = r.w; it.h = r.h; };
  const stack = L.createCommandStack();
  const cmd = L.createMergeableRectCommand(item, { x: 0, y: 0, w: 100, h: 50 }, { x: 1, y: 0, w: 100, h: 50 }, '方向键', apply, 500);
  stack.push(cmd);
  eq(item.x, 1, '合并命令：push 立即应用到本次终点（首击不丢失）');
  // 模拟按住右箭头：t=100,300,600 连续三次 +1px
  ok(cmd.tryMerge({ x: 1, y: 0, w: 100, h: 50 }, 100), '合并：窗口内第一次合并成功');
  ok(cmd.tryMerge({ x: 2, y: 0, w: 100, h: 50 }, 300), '合并：间隔 200ms < 500ms 合并成功');
  ok(cmd.tryMerge({ x: 3, y: 0, w: 100, h: 50 }, 600), '合并：间隔 300ms < 500ms 合并成功');
  eq(item.x, 3, '合并：连续移动后位置为 3');
  // 停顿 600ms 后再移动：应被拒绝（调用方需新建命令）
  ok(!cmd.tryMerge({ x: 4, y: 0, w: 100, h: 50 }, 1200), '合并：停顿 600ms 超过窗口，拒绝合并');
  // 撤销一次：回到按键序列起点 0
  stack.undo();
  eq(item.x, 0, '合并：一次撤销回到按键序列开始前');
  stack.redo();
  eq(item.x, 3, '合并：重做恢复到序列终点 3');
  // peek 供调用方判断栈顶命令
  eq(typeof stack.peek, 'function', '命令栈提供 peek()');
  eq(stack.peek(), cmd, 'peek 返回栈顶命令');
  stack.undo();
  eq(stack.peek(), null, '栈空时 peek 返回 null');
}

// ============================================================================
// 17. Shift 锁轴：主方向判定（平局取水平）
// ============================================================================
{
  eq(L.dominantAxis(10, 5), 'h', '锁轴：|dx|>|dy| 锁水平');
  eq(L.dominantAxis(5, 10), 'v', '锁轴：|dy|>|dx| 锁垂直');
  eq(L.dominantAxis(10, 10), 'h', '锁轴：平局取水平');
  eq(L.dominantAxis(-10, 3), 'h', '锁轴：负位移同样按绝对值判定');
  eq(L.dominantAxis(3, -10), 'v', '锁轴：dy 为负锁垂直');
  eq(L.dominantAxis(0, 0), 'h', '锁轴：零位移取水平');
}

// ============================================================================
// 18. Sprint 3 CSV：新列解析（Title 含逗号/引号/中文、空 Title 不带引号、Z 重复/空）
// ============================================================================
{
  const csv = '"Page","Id","Type","Title","X","Y","Width","Height","Z"\n' +
    '"P1","a","textbox","标题,带逗号","0","0","100","50","0"\n' +
    '"P1","b","textbox","引""号""","10","10","100","50","1000"\n' +
    '"P1","c","shape",,"20","20","100","50","1000"\n' +        // 空 Title 不带引号；Z 与上行重复
    '"P1","d","shape",,"30","30","100","50",\n';               // 空 Z
  const model = L.parseCSV(csv);
  eq(model.items.length, 4, '新格式：4 行全部导入');
  eq(model.errors.length, 0, '新格式：无错误');
  eq(model.items[0].title, '标题,带逗号', 'Title 字段内逗号保留');
  eq(model.items[1].title, '引"号"', 'Title 字段内引号 "" 转义为 "');
  eq(model.items[2].title, '', '空 Title（不带引号空值）为空串');
  eq(model.items[2].z, 1000, 'Z 重复值保留');
  eq(model.items[3].z, null, '空 Z 视为无层次（按行序）');
  // Z 非整数 -> 错误行
  const bad = '"Page","Id","Type","Title","X","Y","Width","Height","Z"\n' +
    '"P1","e","textbox","t","0","0","100","50","1.5"\n';
  const m2 = L.parseCSV(bad);
  eq(m2.items.length, 0, 'Z=1.5 非整数：该行报错');
  ok(m2.errors.some(e => e.field === 'Z' && /不是整数/.test(e.msg)), 'Z 非整数提示正确');
}

// ============================================================================
// 19. Sprint 3 CSV：列顺序以输入为准；缺 Title/Z 的旧格式兼容；导出同构
// ============================================================================
{
  // 列顺序变化：Title 在最后、Z 在 Type 后
  const csv = '"Page","Id","Type","Z","X","Y","Width","Height","Title"\n' +
    '"P1","a","textbox","2000","0","0","100","50","名称A"\n';
  const model = L.parseCSV(csv);
  eq(model.items[0].z, 2000, '列序变化：Z 仍按表头名解析');
  eq(model.items[0].title, '名称A', '列序变化：Title 仍按表头名解析');
  const out = L.serializeCSV(model);
  const lines = out.trim().split('\n');
  eq(lines[0], csv.trim().split('\n')[0], '导出表头与输入逐字一致（列序不变）');
  ok(lines[1].includes('"名称A"'), '导出 Title 透传');
  ok(lines[1].includes('"2000"'), '导出 Z 透传');

  // 旧格式：无 Title/Z 列
  const old = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"P1","a","textbox","0","0","100","50"\n';
  const m2 = L.parseCSV(old);
  ok(!m2.hasTitle && !m2.hasZ, '旧格式：hasTitle/hasZ 为 false');
  eq(m2.items[0].title, '', '旧格式：Title 缺省为空串');
  eq(m2.items[0].z, null, '旧格式：Z 缺省为 null');
  eq(L.serializeCSV(m2), old, '旧格式：导出列集合与输入完全一致（不凭空新增列）');

  // Z 修改后导出：只有 Z 值变化；空 Title 导出 ""
  m2.items[0].z = 5; // 无 Z 列时不影响导出（列不存在）
  const csv3 = '"Page","Id","Type","Title","X","Y","Width","Height","Z"\n' +
    '"P1","a","textbox","","0","0","100","50","0"\n';
  const m3 = L.parseCSV(csv3);
  m3.items[0].z = 3000;
  const out3 = L.serializeCSV(m3).trim().split('\n');
  ok(out3[1].endsWith('"3000"'), '修改 Z 后导出 Z=3000');
  ok(out3[1].includes('"",'), '空 Title 导出为 ""');
}

// ============================================================================
// 20. Sprint 3 Z 重分配：不连续 / 重复 / 置顶置底 / 已在顶底 / 范围外不变
//     约定：纯函数不改 item.z，新 Z 值读 changes（from/to）；
//     Z 集合升序重新分配给新序列（无负数、无巨大新值，只有移动范围内变化）
// ============================================================================
{
  const mk = (id, z, row) => ({ id, z, row });
  // 不连续 Z：A0 B1000 C2000 D3000；把 A 置顶 -> 序列 B,C,D,A，整个序列 Z 都会变化
  let items = [mk('A', 0, 0), mk('B', 1000, 1), mk('C', 2000, 2), mk('D', 3000, 3)];
  let res = L.computeZReorder(items, 'A', 'top');
  eq(res.order.map(i => i.id).join(','), 'B,C,D,A', '置顶：序列末尾为最顶层');
  eq(res.changes.length, 4, '置顶：Z 全不相同时整个序列 Z 重新分配（4 项变化）');
  eq(items[0].z, 0, '原 Z 集合不变（纯逻辑不写入）');
  // 新序列 B,C,D,A 分配原集合 [0,1000,2000,3000]
  const toOf = (r, id) => r.changes.find(c => c.item.id === id).to;
  eq(toOf(res, 'A'), 3000, 'A 置顶取最大已有值 3000（无巨大新值）');
  eq(toOf(res, 'B'), 0, 'B 被压到原集合最小值 0（无负数）');
  eq(toOf(res, 'C'), 1000, 'C 变为 1000');
  eq(toOf(res, 'D'), 2000, 'D 变为 2000');

  // 下移一层：D(top) 下移 -> 仅 D/C 两个组件变化
  items = [mk('A', 0, 0), mk('B', 1000, 1), mk('C', 2000, 2), mk('D', 3000, 3)];
  res = L.computeZReorder(items, 'D', 'down');
  eq(res.order.map(i => i.id).join(','), 'A,B,D,C', '下移：D 与 C 交换位置');
  eq(res.changes.length, 2, '下移：仅 D/C 两个组件变化');
  eq(toOf(res, 'D'), 2000, 'D 下移后 Z=2000');
  eq(toOf(res, 'C'), 3000, 'C 变为 3000');
  ok(!res.changes.some(c => c.item.id === 'A' || c.item.id === 'B'), '范围外 A/B 不在变化列表中');

  // Z 重复：平局由 row 打破，组内移动 Z 集合不变 -> 零变化
  items = [mk('A', 0, 0), mk('B', 0, 1), mk('C', 1000, 2)];
  res = L.computeZReorder(items, 'A', 'up');
  eq(res.order.map(i => i.id).join(','), 'B,A,C', 'Z 重复：序列 A(0,r0),B(0,r1),C(1000)，A 上移与 B 交换');
  eq(res.changes.length, 0, 'Z 重复：组内交换后仍分配 [0,0,1000]，零变化（不产生命令）');

  // 置底：D 置底 -> 序列 D,A,B,C，整个序列变化
  items = [mk('A', 0, 0), mk('B', 1000, 1), mk('C', 2000, 2), mk('D', 3000, 3)];
  res = L.computeZReorder(items, 'D', 'bottom');
  eq(res.order.map(i => i.id).join(','), 'D,A,B,C', '置底：序列首位为最底层');
  eq(res.changes.length, 4, '置底：整个序列 Z 重新分配');
  eq(toOf(res, 'D'), 0, 'D 置底取最小已有值 0');
  eq(toOf(res, 'A'), 1000, 'A 变为 1000');
  eq(toOf(res, 'C'), 3000, 'C 变为 3000');

  // 已在顶/底：无变化
  items = [mk('A', 0, 0), mk('B', 1000, 1)];
  res = L.computeZReorder(items, 'B', 'top');
  eq(res.changes.length, 0, '已在顶：置顶无变化（不产生命令）');
  res = L.computeZReorder(items, 'A', 'bottom');
  eq(res.changes.length, 0, '已在底：置底无变化');
  res = L.computeZReorder(items, 'B', 'up');
  eq(res.changes.length, 0, '已在顶：上移无变化');
  res = L.computeZReorder(items, 'A', 'down');
  eq(res.changes.length, 0, '已在底：下移无变化');
  eq(L.computeZReorder(items, 'X', 'top'), null, '组件不在页内返回 null');
}

// ============================================================================
// 21. Sprint 3 搜索匹配：大小写不敏感 / 空格分词交集 / Title+Type+Id
// ============================================================================
{
  ok(L.matchSearch('', '标题', 'textbox', 'abc123'), '空查询恒匹配');
  ok(L.matchSearch('  ', '标题', 'textbox', 'abc123'), '纯空白查询恒匹配');
  ok(L.matchSearch('标题', '销售 标题', 'textbox', 'abc123'), 'Title 子串匹配');
  ok(L.matchSearch('TEXTBOX', '销售 标题', 'textbox', 'abc123'), '大小写不敏感');
  ok(L.matchSearch('text', '标题', 'textbox', 'abc123'), 'Type 子串匹配');
  ok(L.matchSearch('ABC', '标题', 'textbox', 'abc123'), 'Id 子串匹配');
  ok(L.matchSearch('标题 textbox', '销售 标题', 'textbox', 'abc123'), '空格分词取交集：两个词都命中');
  ok(!L.matchSearch('标题 shape', '销售 标题', 'textbox', 'abc123'), '空格分词取交集：有一个词不命中则过滤');
  ok(!L.matchSearch('不存在', '标题', 'textbox', 'abc123'), '无命中返回 false');
}

// ============================================================================
// 22. Sprint 3 草稿：序列化/解析往返；损坏/版本不符/结构非法安全丢弃
// ============================================================================
{
  const draft = {
    v: L.DRAFT_VERSION, fileName: 'a.csv', csvText: '"Page",...\n', savedAt: '2026-10-09T10:00:00.000Z',
    pageIndex: 0, points: { P1: [{ x: 1, y: 2, name: '点 1' }] },
    lockedIds: ['a'], items: { a: { x: 1, y: 2, w: 3, h: 4, z: 5 }, b: { x: 0, y: 0, w: 10, h: 10, z: null } }
  };
  const back = L.parseDraft(L.serializeDraft(draft));
  ok(back && back.items.a.x === 1 && back.items.b.z === null, '草稿：往返一致');
  eq(back.lockedIds.length, 1, '草稿：锁定集合往返一致');
  eq(back.points.P1[0].name, '点 1', '草稿：坐标点往返一致');
  eq(L.parseDraft('{not json'), null, '草稿：损坏 JSON 安全丢弃');
  eq(L.parseDraft('{"v":999,"fileName":"x","csvText":"","savedAt":"","pageIndex":0,"items":{},"lockedIds":[],"points":{}}'), null, '草稿：版本不符丢弃');
  eq(L.parseDraft('{"v":' + L.DRAFT_VERSION + ',"fileName":"x","csvText":"","savedAt":"","pageIndex":-1,"items":{},"lockedIds":[],"points":{}}'), null, '草稿：pageIndex 非法丢弃');
  eq(L.parseDraft('{"v":' + L.DRAFT_VERSION + ',"fileName":"x","csvText":"","savedAt":"","pageIndex":0,"items":{"a":{"x":"bad"}},"lockedIds":[],"points":{}}'), null, '草稿：items 数值非法丢弃');
  eq(L.parseDraft('{"v":' + L.DRAFT_VERSION + ',"fileName":"x","csvText":"","savedAt":"","pageIndex":0,"items":{},"lockedIds":"nope","points":{}}'), null, '草稿：lockedIds 非数组丢弃');
}

// ============================================================================
// 23. Sprint 3 蓝图 16:9 判定：精确 / 容差边界 / 容差外 / 非正数
// ============================================================================
{
  ok(L.is169(1600, 900), '16:9 精确通过');
  ok(L.is169(1280, 720), '1280×720 通过');
  // 下边界：ratio = 16/9*0.99 通过；再小 1% 拒绝
  ok(L.is169(16 * 0.99, 9), '比例恰在 -1% 容差边界通过');
  ok(!L.is169(16 * 0.989, 9), '超出 -1% 容差拒绝');
  ok(L.is169(16 * 1.01, 9), '比例恰在 +1% 容差边界通过');
  ok(!L.is169(16 * 1.011, 9), '超出 +1% 容差拒绝');
  ok(!L.is169(0, 9), '宽为 0 拒绝');
  ok(!L.is169(1600, 0), '高为 0 拒绝');
  ok(!L.is169(1200, 900), '4:3 拒绝');
}

// ============================================================================
// 24. Sprint 4 越界判定：边界值（恰好贴边不算越界；1281/721 算；负坐标算）
// ============================================================================
{
  const CW = 1280, CH = 720;
  ok(!L.rectOutOfBounds({ x: 0, y: 0, w: 1280, h: 720 }, CW, CH), '整画布矩形不算越界');
  ok(!L.rectOutOfBounds({ x: 1180, y: 670, w: 100, h: 50 }, CW, CH), 'x+w=1280、y+h=720 恰好贴边不算越界');
  ok(L.rectOutOfBounds({ x: 1181, y: 0, w: 100, h: 50 }, CW, CH), 'x+w=1281 算越界');
  ok(L.rectOutOfBounds({ x: 0, y: 671, w: 100, h: 50 }, CW, CH), 'y+h=721 算越界');
  ok(L.rectOutOfBounds({ x: -1, y: 0, w: 100, h: 50 }, CW, CH), 'x=-1 算越界');
  ok(L.rectOutOfBounds({ x: 0, y: -10, w: 100, h: 50 }, CW, CH), 'y=-10 算越界');
  eq(L.oobAmount({ x: 0, y: 0, w: 1280, h: 720 }, CW, CH), 0, '界内矩形越界量为 0');
  eq(L.oobAmount({ x: 0, y: 0, w: 373, h: 1080 }, CW, CH), 360, '高度 1080 越界量 = 360');
  eq(L.oobAmount({ x: 1100, y: 300, w: 300, h: 40 }, CW, CH), 120, '右缘 1400 越界量 = 120');
  eq(L.oobAmount({ x: -5, y: 0, w: 100, h: 730 }, CW, CH), 15, '左 5 + 下 10，越界量累加 = 15');
}

// ============================================================================
// 25. Sprint 4 移动约束 clampDragRect：越界组件向画布内可动、更深越界拒绝、界内夹紧
// ============================================================================
{
  const CW = 1280, CH = 720;
  const oobFrom = { x: 0, y: 0, w: 373, h: 1080 }; // 越界量 360（底边 1080-720）
  // 向画布内移动：y -50（上移）-> 越界量 310，允许
  let r = L.clampDragRect(oobFrom, { x: 0, y: -50, w: 373, h: 1080 }, CW, CH);
  eq(r.y, -50, '越界组件向画布内移动被允许（y 上移 50）');
  // 平行移动：x +100，越界量不变，允许
  r = L.clampDragRect(oobFrom, { x: 100, y: 0, w: 373, h: 1080 }, CW, CH);
  eq(r.x, 100, '越界组件平行移动被允许（越界程度不变）');
  // 向更深越界移动：y +50 -> 越界量 410，拒绝（停在原处）
  r = L.clampDragRect(oobFrom, { x: 0, y: 50, w: 373, h: 1080 }, CW, CH);
  eq(r.y, 0, '越界组件向更深越界方向移动被拒绝（停在原处）');
  // 已在界内：出界移动被夹紧回画布（原有行为）
  r = L.clampDragRect({ x: 100, y: 100, w: 100, h: 50 }, { x: 1300, y: 100, w: 100, h: 50 }, CW, CH);
  eq(r.x, 1180, '界内组件右移出界：夹紧到 x=1180（右边贴 1280）');
  eq(r.y, 100, '界内组件另一轴不受影响');
  r = L.clampDragRect({ x: 100, y: 100, w: 100, h: 50 }, { x: -30, y: 700, w: 100, h: 50 }, CW, CH);
  eq(r.x, 0, '界内组件左移出界：夹紧到 x=0');
  eq(r.y, 670, '界内组件下移出界：夹紧到 y=670（底边贴 720）');
}

// ============================================================================
// 26. Sprint 4 缩放边界：越界组件的边可向内收回（不被画布夹紧卡死）
// ============================================================================
{
  const base = { snapGrid: false, snapComp: false, threshold: 10, candX: [], candY: [], minW: 10, minH: 10, canvasW: 1280, canvasH: 720 };
  // s 手柄：起点底边 1080（越界），向上拖 500 -> 底边 580（可越过 720 向内收回）
  let r = L.computeResize({ x: 0, y: 0, w: 373, h: 1080 }, 's', 0, -500, base);
  eq(r.rect.h, 580, '缩放：越界组件 s 手柄可向内收回（h=580，不被夹在 720）');
  // s 手柄：向下拖（更深越界）-> 不允许超过起点底边 1080
  r = L.computeResize({ x: 0, y: 0, w: 373, h: 1080 }, 's', 0, 200, base);
  eq(r.rect.h, 1080, '缩放：越界组件 s 手柄不允许更深越界（停在 1080）');
  // 界内组件保持原行为：s 手柄底缘夹紧 720（h = 720 - 100 = 620）
  r = L.computeResize({ x: 100, y: 100, w: 100, h: 50 }, 's', 0, 2000, base);
  eq(r.rect.h, 620, '缩放：界内组件 s 手柄底缘仍夹紧 720');
  // e 手柄：起点右边 1400（越界），向左收回可到 1280 以内
  r = L.computeResize({ x: 1100, y: 300, w: 300, h: 40 }, 'e', -200, 0, base);
  eq(r.rect.w, 100, '缩放：越界组件 e 手柄可向内收回（w=100，右边 1200）');
}

// ============================================================================
// 27. Sprint 4 输入校验：越界组件"更不越界"的值接受，"更越界"拒绝
// ============================================================================
{
  const CW = 1280, CH = 720;
  const from = { x: 0, y: 0, w: 373, h: 1080 }; // 越界量 360
  // 高度改回 700（进入画布内）：接受
  let v = L.validateRectInput({ x: '0', y: '0', w: '373', h: '700' }, CW, CH, 10, from);
  ok(v.ok && v.rect.h === 700, '校验：越界组件高度改小（回到画布内）被接受');
  // 高度改成 1200（越界量 480 > 360）：拒绝
  v = L.validateRectInput({ x: '0', y: '0', w: '373', h: '1200' }, CW, CH, 10, from);
  ok(!v.ok && /越界/.test(v.msg), '校验：越界组件输入更重越界的值被拒绝');
  // 高度不变 1080（越界量相同）：接受（保持原样显示/编辑）
  v = L.validateRectInput({ x: '0', y: '0', w: '373', h: '1080' }, CW, CH, 10, from);
  ok(v.ok, '校验：越界组件维持原值（同等越界）被接受');
  // 界内组件保持原行为：出界拒绝
  v = L.validateRectInput({ x: '1200', y: '0', w: '100', h: '50' }, CW, CH, 10, { x: 0, y: 0, w: 100, h: 50 });
  ok(!v.ok && /超出画布/.test(v.msg), '校验：界内组件修改后出界仍被拒绝');
  // 不传 fromRect（旧调用方式）保持原行为
  v = L.validateRectInput({ x: '1200', y: '0', w: '100', h: '50' }, CW, CH, 10);
  ok(!v.ok && /超出画布/.test(v.msg), '校验：无 fromRect 时保持画布边界校验');
}

// ============================================================================
// 28. Sprint 4 样例往返：导入 -> 不改动导出 -> 14 行，数值与输入逐字节一致（除 BOM）
// ============================================================================
{
  const sample = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', '01-plan', 'io-samples', 'Project Portfolio Tracker-layout.csv'), 'utf8');
  const model = L.parseCSV(sample);
  const out = L.serializeCSV(model);
  const lines = out.trim().split('\n');
  eq(lines.length, 15, '往返：导出表头 + 14 行');
  eq(out, sample.slice(1), '往返：不改动导出与输入逐字节一致（越界值原样透传）');
}

// ============================================================================
// 29. Sprint 4 真损坏行：字符串数字 / 负数 / 宽高 0 / Z 非整数 仍进 errors，items 不含
// ============================================================================
{
  const csv = '"Page","Id","Type","Title","X","Y","Width","Height","Z"\n' +
    '"P1","s1","textbox","t","abc","0","100","50","0"\n' +        // 字符串数字
    '"P1","s2","textbox","t","-1","0","100","50","0"\n' +         // 负数
    '"P1","s3","textbox","t","0","0","0","50","0"\n' +            // 宽 0
    '"P1","s4","textbox","t","0","0","100","50","1.5"\n' +        // Z 非整数
    '"P1","ok","textbox","t","0","0","100","50","0"\n';           // 正常行
  const model = L.parseCSV(csv);
  eq(model.totalRows, 5, '损坏行测试：共 5 行');
  eq(model.items.length, 1, '仅正常行进入 items');
  eq(model.items[0].id, 'ok', '正常行保留');
  eq(model.errors.length, 4, '4 行损坏全部进入 errors');
  ok(model.errors.some(e => e.id === 's1' && /不是数字/.test(e.msg)), '字符串数字报错');
  ok(model.errors.some(e => e.id === 's2' && /负数/.test(e.msg)), '负数报错');
  ok(model.errors.some(e => e.id === 's3' && /大于 0/.test(e.msg)), '宽 0 报错');
  ok(model.errors.some(e => e.id === 's4' && e.field === 'Z' && /不是整数/.test(e.msg)), 'Z 非整数报错');
}

// ============================================================================
// 30. Sprint 4 Id 重复：各行保留 + 警告；跨页同名 Id 不算重复
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"P1","dup","textbox","0","0","100","50"\n' +
    '"P1","dup","textbox","10","10","100","50"\n' +   // 同页重复
    '"P2","dup","textbox","0","0","100","50"\n' +     // 跨页同名 Id：合法
    '"P1","uni","textbox","0","0","100","50"\n';
  const model = L.parseCSV(csv);
  eq(model.items.length, 4, 'Id 重复行全部保留，不丢弃');
  eq(model.errors.length, 0, 'Id 重复不产生错误');
  eq(model.warnings.length, 1, '同页 Id 重复给出 1 条警告');
  ok(/Id 重复/.test(model.warnings[0].msg) && model.warnings[0].id === 'dup' && model.warnings[0].line === 3, '警告含行号/Id/原因');
}

console.log('----------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
