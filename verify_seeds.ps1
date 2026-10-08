# Testing School Year and Problem Set Seed Logic

function Hash-StringToSeed([string]$str) {
    [uint32]$hash = 2166136261
    foreach ($char in $str.ToCharArray()) {
        $code = [int]$char
        $hash = $hash -bxor $code
        # 32-bit integer multiplication (hash * 16777619)
        $hash = [uint32](($hash * [uint64]16777619) -band 0xFFFFFFFF)
    }
    return $hash
}

function New-Mulberry32([uint32]$seed) {
    $script:s = $seed
    return {
        $script:s = [uint32]($script:s + [uint32]0x6D2B79F5)
        $t = [uint64]$script:s -bxor ([uint64]$script:s -shr 15)
        $t = ($t * (1 -bor [uint64]$script:s)) -band 0xFFFFFFFF
        $t = ($t -bxor ($t + (($t -bxor ($t -shr 7)) * 61))) -band 0xFFFFFFFF
        return [double](($t -bxor ($t -shr 14)) -band 0xFFFFFFFF) / 4294967296.0
    }
}

function SimulateHeaders($schoolYear, $op, $rows, $cols, $problemSet) {
    $seedString = "SY$($schoolYear):OP$($op):R$($rows):C$($cols):SET$($problemSet)"
    $seed = Hash-StringToSeed $seedString
    $prng = New-Mulberry32 $seed

    $base = 0..9
    $arr = [System.Collections.ArrayList]@($base)
    for ($i = $arr.Count - 1; $i -gt 0; $i--) {
        $r = & $prng
        $j = [Math]::Floor($r * ($i + 1))
        $tmp = $arr[$i]
        $arr[$i] = $arr[$j]
        $arr[$j] = $tmp
    }
    return @{
        SeedString = $seedString
        SeedHex = "0x{0:X8}" -f $seed
        Result = ($arr -join ',')
    }
}

Write-Host "=== TEST 1: Identical conditions yield 100% same results ==="
$t1_a = SimulateHeaders 2026 '*' 10 10 '1018-1'
$t1_b = SimulateHeaders 2026 '*' 10 10 '1018-1'
Write-Host "2026 10x10 * 1018-1 (A): $($t1_a.Result) [$($t1_a.SeedString)]"
Write-Host "2026 10x10 * 1018-1 (B): $($t1_b.Result) [$($t1_b.SeedString)]"
Write-Host "Match (Must be True): $($t1_a.Result -eq $t1_b.Result)"

Write-Host "`n=== TEST 2: 1018-1 vs 1018-2 (Different set sequence) ==="
$t2 = SimulateHeaders 2026 '*' 10 10 '1018-2'
Write-Host "2026 10x10 * 1018-2: $($t2.Result) [$($t2.SeedString)]"
Write-Host "Different from 1018-1 (Must be True): $($t1_a.Result -ne $t2.Result)"

Write-Host "`n=== TEST 3: 1018-1 vs 1019-1 (Different date) ==="
$t3 = SimulateHeaders 2026 '*' 10 10 '1019-1'
Write-Host "2026 10x10 * 1019-1: $($t3.Result) [$($t3.SeedString)]"
Write-Host "Different from 1018-1 (Must be True): $($t1_a.Result -ne $t3.Result)"

Write-Host "`n=== TEST 4: School Year 2026 vs 2027 with same 1018-1 ==="
$t4 = SimulateHeaders 2027 '*' 10 10 '1018-1'
Write-Host "2027 10x10 * 1018-1: $($t4.Result) [$($t4.SeedString)]"
Write-Host "Different from 2026 1018-1 (Must be True): $($t1_a.Result -ne $t4.Result)"
