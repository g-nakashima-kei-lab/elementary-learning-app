$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$outPath = "$PSScriptRoot\debug_test.txt"

# 一時的に index.html の末尾に自動テストログを注入
$html = Get-Content -Raw -Path "$PSScriptRoot\index.html"
$debugCode = @'
<script>
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const logs = [];
    const app = window.__mathApp;
    logs.push("Initial timeLimit: " + app.timeLimit);
    logs.push("Initial timerDisplay: " + app.timerDisplayEl.textContent);
    logs.push("Initial isTimerStarted: " + app.isTimerStarted);

    // 1. 設定変更
    app.setTimeLimit(60);
    logs.push("After setTimeLimit(60) display: " + app.timerDisplayEl.textContent);

    // 2. 入力
    app.handleKeypadInput('2');
    logs.push("After input '2', isTimerStarted: " + app.isTimerStarted);
    logs.push("Cell (0,0) answer: " + app.answers[0][0]);

    // 3. 時間切れシミュレーション (61秒経過)
    app.timerStartTime = performance.now() - 61000;
    app.updateTimerDisplay();

    logs.push("After time-up display: " + app.timerDisplayEl.textContent);
    logs.push("After time-up isTestFinished: " + app.isTestFinished);

    // 4. 時間切れ後のテンキー入力テスト
    app.handleKeypadInput('5');
    logs.push("After time-up input '5', cell (0,0) answer: " + app.answers[0][0]);

    // 5. 時間切れ後の手書き入力テスト
    app.handlePointerDown({ preventDefault: ()=>{}, pointerId: 1, clientX: 10, clientY: 10 });
    logs.push("After time-up handlePointerDown, isDrawing: " + app.isDrawing);

    // 6. 結果モーダルの表示状態
    logs.push("resultModal is-open: " + app.resultModal.classList.contains('is-open'));

    // ログを画面の先頭に表示
    const div = document.createElement('div');
    div.id = "debug-output-box";
    div.innerText = logs.join('\n');
    document.body.prepend(div);
  }, 300);
});
</script>
'@

$debugHtml = $html.Replace("</body>", "$debugCode`n</body>")
[System.IO.File]::WriteAllText("$PSScriptRoot\debug_index.html", $debugHtml, [System.Text.Encoding]::UTF8)

Start-Process -FilePath $edgePath -ArgumentList "--headless", "--virtual-time-budget=2000", "--dump-dom", "http://localhost:8080/debug_index.html" -RedirectStandardOutput $outPath -Wait

$res = Get-Content -Raw -Path $outPath
$idx = $res.IndexOf('id="debug-output-box"')
if ($idx -ge 0) {
    $idx2 = $res.IndexOf('>', $idx) + 1
    $idx3 = $res.IndexOf('</div>', $idx2)
    Write-Host "DEBUG RESULT:"
    Write-Host ($res.Substring($idx2, $idx3 - $idx2))
} else {
    Write-Host "debug-output-box not found, checking raw file..."
    Select-String -Path $outPath -Pattern "Initial timeLimit|After time-up" -Context 0,2
}

Remove-Item "$PSScriptRoot\debug_index.html", "$PSScriptRoot\debug_test.txt" -ErrorAction SilentlyContinue
