# 给其他 AI 的 Prompt（提取脚本 / 回写脚本）

共同约定见 `PRD.md` §6。样例：`docs/01-plan/io-samples/`；现有提取脚本：`scripts/Get-VisualLayout.ps1`（可在其上改）。

## Prompt A：改造提取脚本

```
请修改附上的 PowerShell 脚本 Get-VisualLayout.ps1，把输出从 CSV 改为 Excel(.xlsx)。

背景：脚本读取 Power BI PBIP 的 .Report/definition/pages/<页>/visuals/<id>/visual.json，导出每个视觉的坐标。

要求：
1. 输出一个 .xlsx，放在 .Report 旁边的 visual-layout 文件夹，文件名 <报表名>-layout.xlsx。
2. 一个报表页一个 sheet。sheet 名 = page.json 的 displayName；Excel 限制 sheet 名 ≤31 字符、不能含 \ / ? * [ ] :，需替换/截断，且不同页截断后不得重名（重名则加序号）。
3. 每个 sheet 的列固定且仅有：Id, Type, X, Y, Width, Height。第一行是表头。
   - Id = visual.json 的 name；Type = visual.visualType。
   - X/Y/Width/Height 必须是整数（四舍五入），单元格为数值类型，不是文本。
4. 不处理群组（报表不使用群组）；若遇到带 parentGroupName 的视觉，保留现有累加绝对坐标逻辑即可，不必扩展。隐藏视觉（isHidden）不导出；没有 visual 节点的容器不导出。
5. 每个 sheet 内按 Y、X 升序排序。
6. 不要求安装 Excel。请优先用不依赖 Excel 的方案（如 ImportExcel 模块，或直接生成 xlsx 的 zip/XML）；若需要安装模块，脚本里检测并给出清晰的中文提示。
7. 保留现有交互：询问 .Report 路径、中文错误提示、结束前暂停；.bat 启动器不变。
8. 验收：对附上的样例报表运行，结果与 io-samples 里的 csv 行数一致（68 行）、坐标为取整值；用 Excel 打开中文无乱码、数值列可正常求和。
```

## Prompt B：回写脚本

```
请写一个 PowerShell 脚本 Set-VisualLayout.ps1，把修改后的 xlsx 布局写回 Power BI PBIP 报表。

输入：
- .Report 文件夹路径（询问用户，引号有无都行）；
- 布局 xlsx 路径：一个页面一个 sheet，列为 Id, Type, X, Y, Width, Height（X/Y/Width/Height 为整数）。

逻辑：
1. 遍历所有 sheet 的所有行；用 Id 在 .Report/definition/pages/*/visuals/**/visual.json 中找 name == Id 的文件（不依赖 sheet 名和页名）。
2. 只修改该 json 的 position.x / y / width / height，其它字段、顺序、缩进、编码（UTF-8 无 BOM）、换行符都保持原样。注意不要用会重排整个 JSON 的方式重写：优先用正则/字符串替换仅改这四个数字，或在序列化后确保与原格式一致。
3. 值与现有值相同则不写文件。
4. 找不到 Id、或 xlsx 中 X/Y/Width/Height 不是数字，不要中断：记录到汇总里继续处理其余行。
5. 写入前先备份：把将被修改的 visual.json 复制到 .Report 旁边 visual-layout-backup/<时间戳>/ 下，保持相对路径。
6. 结束输出汇总：修改了几个视觉、未改动几个、未找到的 Id 列表、非法值的行；中文提示；结束前暂停。同样提供 .bat 启动器（chcp 65001，ExecutionPolicy Bypass）。
7. 验收：用样例报表先跑提取脚本得到 xlsx，不改任何值回写 → git diff 应为空；再改一个视觉的 X 回写 → diff 只有那一个数字变化。
```
