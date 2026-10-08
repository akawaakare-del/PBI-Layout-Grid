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
// 5. 真实样例：68 个组件、1 页，小数全部四舍五入并记录提示
// ============================================================================
{
  const sample = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', '01-plan', 'io-samples', 'Project Portfolio Tracker-layout.csv'), 'utf8');
  const model = L.parseCSV(sample);
  eq(model.items.length, 68, '样例：68 个组件全部导入');
  eq(model.pages.length, 1, '样例：1 页');
  eq(model.pages[0].name, '  嘉聯', '样例：Page 前导空格保留');
  eq(model.errors.length, 0, '样例：无错误行');
  ok(model.roundNotes.length > 0, '样例：含小数行已记录四舍五入提示（共 ' + model.roundNotes.length + ' 行）');
  ok(model.items.every(i => Number.isInteger(i.x) && Number.isInteger(i.y) && Number.isInteger(i.w) && Number.isInteger(i.h)), '样例：所有坐标为整数');
  // 行顺序保持：第 3 行（Id d8e48a...）的 Width 114.3 -> 114
  eq(model.items[1].w, 114, '样例：第 2 个组件 Width 114.3 四舍五入为 114');
}

// ============================================================================
// 6. 非法行提示：非数字 / 负数 / 超出画布 / 字段数错误；错误行不阻断其他行
// ============================================================================
{
  const csv = '"Page","Id","Type","X","Y","Width","Height"\n' +
    '"P1","good","textbox","0","0","100","50"\n' +          // 第 2 行 ok
    '"P1","badnum","textbox","abc","0","100","50"\n' +      // 第 3 行 非数字
    '"P1","neg","textbox","-5","0","100","50"\n' +          // 第 4 行 负数
    '"P1","oob","textbox","1200","0","200","50"\n' +        // 第 5 行 超出画布
    '"P1","few","textbox","0","0","100"\n' +                // 第 6 行 字段数 6
    '"P1","after","textbox","0","0","100","50"\n';          // 第 7 行 ok
  const model = L.parseCSV(csv);
  eq(model.items.length, 2, '错误行被跳过，其余行正常导入');
  eq(model.errors.length, 4, '共 4 个错误');
  ok(model.errors.some(e => e.line === 3 && e.id === 'badnum' && e.field === 'X' && /不是数字/.test(e.msg)), '第 3 行 X 非数字：行号/Id/字段正确');
  ok(model.errors.some(e => e.line === 4 && e.field === 'X' && /负数/.test(e.msg)), '第 4 行 X 负数提示');
  ok(model.errors.some(e => e.line === 5 && /超出/.test(e.msg)), '第 5 行超出画布提示');
  ok(model.errors.some(e => e.line === 6 && /字段数/.test(e.msg)), '第 6 行字段数错误提示');
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

console.log('----------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
