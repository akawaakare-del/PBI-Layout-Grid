<#
=====================================================================
 作用：把 PBIP 報表裡每個視覺物件的座標（X/Y/寬/高）匯出成 CSV
       隱藏的視覺不列入。
=====================================================================

 【怎麼用】雙擊同資料夾的「取得視覺座標.bat」，或在終端機執行
       .\Get-VisualLayout.ps1
 它會問你路徑，貼上報表的 .Report 資料夾路徑即可（引號有沒有都行）。
 結果存在 .Report 旁邊新開的 visual-layout 資料夾裡。

 註1：路徑要指到 .Report 這層，不是 .pbip 檔，也不是 SemanticModel。
 註2：被放進群組的視覺，座標是「相對群組左上角」的，所以常常是 0。
#>

try {

# 問到給出一個有效路徑為止：直接按 Enter 或路徑不對都會重問
while ($true) {
    $reportPath = (Read-Host "`n請貼上 .Report 資料夾路徑").Trim().Trim('"')
    if (-not $reportPath) { continue }

    # 所有頁面都放在 .Report\definition\pages 底下，一個資料夾一頁
    $pagesDir = Join-Path $reportPath 'definition\pages'
    if (Test-Path $pagesDir) { break }

    Write-Host "這裡沒有 definition\pages，不是 .Report 資料夾，請重貼。" -ForegroundColor Yellow
}

$rows = foreach ($pageDir in Get-ChildItem $pagesDir -Directory) {

    # page.json 裡的 displayName 才是在 Power BI 看到的頁籤名；沒有就退回資料夾 ID
    $pageJson = Join-Path $pageDir.FullName 'page.json'
    $pageName = if (Test-Path $pageJson) {
        (Get-Content $pageJson -Raw -Encoding utf8 | ConvertFrom-Json).displayName
    } else { $pageDir.Name }

    # 每個視覺一個資料夾，裡面的 visual.json 就是它的定義；空白頁沒有 visuals
    # 先全部收進 $map（含群組），因為算絕對座標時要回頭查父群組的位置
    $map = @{}
    foreach ($vFile in Get-ChildItem $pageDir.FullName -Recurse -Filter 'visual.json') {
        $v = Get-Content $vFile.FullName -Raw -Encoding utf8 | ConvertFrom-Json
        if ($v.isHidden) { continue }
        $map[$v.name] = $v
    }

    foreach ($v in $map.Values) {
        # 群組（group）只是容器，本身沒有 visual 節點，也不是一種視覺類型，不輸出
        if (-not $v.visual) { continue }

        # 群組成員的座標是相對父群組左上角的，一路往上累加才是畫布上的絕對座標
        $absX = $v.position.x
        $absY = $v.position.y
        $parentId = $v.parentGroupName
        while ($parentId -and $map.ContainsKey($parentId)) {
            $parent = $map[$parentId]
            $absX += $parent.position.x
            $absY += $parent.position.y
            $parentId = $parent.parentGroupName
        }

        [pscustomobject]@{
            Page   = $pageName
            Id     = $v.name                     # 視覺的唯一 ID，要改檔案時靠它定位
            Type   = $v.visual.visualType
            X      = [math]::Round($absX, 1)
            Y      = [math]::Round($absY, 1)
            Width  = [math]::Round($v.position.width, 1)
            Height = [math]::Round($v.position.height, 1)
        }
    }
}

# 排序成由上到下、由左到右，跟肉眼掃版面的順序一致
$rows = $rows | Sort-Object Page, Y, X

# 輸出到 .Report 旁邊的 visual-layout 資料夾，不弄亂專案根目錄
$outDir = Join-Path (Split-Path $reportPath -Parent) 'visual-layout'
New-Item $outDir -ItemType Directory -Force | Out-Null
$csv = Join-Path $outDir ((Split-Path $reportPath -Leaf) -replace '\.Report$', '-layout.csv')

# Excel 開 CSV 認的是 BOM，沒 BOM 中文頁名會變亂碼
try {
    $rows | ConvertTo-Csv -NoTypeInformation | Out-File $csv -Encoding utf8
} catch [System.IO.IOException] {
    throw "檔案寫不進去，應該是這個 CSV 還開在 Excel 裡，關掉再跑一次：`n  $csv"
}

Write-Host "`n共 $($rows.Count) 個視覺，已寫出：" -ForegroundColor Green
Write-Host "  $csv"

} catch {
    Write-Host "`n出錯了：$($_.Exception.Message)" -ForegroundColor Red
} finally {
    # 雙擊執行時視窗在這裡停住，看得到結果才關
    Read-Host "`n按 Enter 關閉" | Out-Null
}
