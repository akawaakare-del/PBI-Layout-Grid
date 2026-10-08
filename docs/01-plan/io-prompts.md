# 给其他 AI 的 Prompt（提取脚本 / 回写脚本）

共同约定见 `PRD.md` §6。样例：`docs/01-plan/io-samples/`；现有提取脚本：`scripts/Get-VisualLayout.ps1`。

## Prompt A：小改提取脚本（坐标取整）

```
请修改附上的 PowerShell 脚本 Get-VisualLayout.ps1，其余逻辑和输出格式（CSV、UTF-8 带 BOM、列 Page,Id,Type,X,Y,Width,Height、排序、交互、.bat 启动器）全部不变，只改一处：

X、Y、Width、Height 四列输出为整数（四舍五入，[math]::Round(值, 0, 'AwayFromZero')），CSV 里不再出现小数点。

验收：对样例报表运行，行数与 io-samples 中的 csv 一致（68 行），四列均无小数。
```

## Prompt B：回写脚本

```
请写一个 PowerShell 脚本 Set-VisualLayout.ps1，把修改后的 CSV 布局写回 Power BI PBIP 报表。

输入：
- .Report 文件夹路径（询问用户，引号有无都行）；
- 布局 CSV 路径（UTF-8，可能带 BOM；列 Page,Id,Type,X,Y,Width,Height；X/Y/Width/Height 为整数）。

逻辑：
1. 逐行读 CSV；用 Id 在 .Report/definition/pages/*/visuals/**/visual.json 中找 name == Id 的文件（不依赖 Page 列）。
2. 只修改该 json 的 position.x / y / width / height，其它字段、顺序、缩进、编码（UTF-8 无 BOM）、换行符都保持原样。不要用会重排整个 JSON 的方式重写：用正则/字符串替换只改这四个数字。
3. 值与现有值相同则不写文件。
4. 找不到 Id、或坐标不是数字，不要中断：记录到汇总里继续处理其余行。
5. 写入前先备份：把将被修改的 visual.json 复制到 .Report 旁边 visual-layout-backup/<时间戳>/ 下，保持相对路径。
6. 结束输出汇总：修改了几个视觉、未改动几个、未找到的 Id、非法值的行；中文提示；结束前暂停。同样提供 .bat 启动器（chcp 65001，ExecutionPolicy Bypass）。
7. 验收：用样例报表先跑提取脚本得到 CSV，不改任何值回写 → git diff 应为空；再改一个视觉的 X 回写 → diff 只有那一个数字变化。
```
