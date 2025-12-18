param(
  [switch]$OpenLatest = $true
)

$ErrorActionPreference = "SilentlyContinue"

Write-Output "[find-minimax-errors] running..."
Write-Output ("[find-minimax-errors] cwd=" + (Get-Location).Path)

$scriptPath = $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
Write-Output ("[find-minimax-errors] repoRoot=" + $repoRoot)

$candidateLogDirs = @(
  (Join-Path (Get-Location).Path "logs"),
  (Join-Path $repoRoot "logs")
) | Select-Object -Unique

$patterns = @(
  "minimax-error-*.json",
  "minimax-py-error-*.json"
)

$found = @()
foreach ($d in $candidateLogDirs) {
  Write-Output ("[find-minimax-errors] scanDir=" + $d)
  if (Test-Path $d) {
    foreach ($p in $patterns) {
      $found += Get-ChildItem -Path $d -Filter $p -File
    }
  }
}

if (-not $found -or $found.Count -eq 0) {
  Write-Output "鏈壘鍒?MiniMax 閿欒鏃ュ織鏂囦欢銆?
  Write-Output "鎻愮ず锛氬厛瑙﹀彂涓€娆¤闊?TTS锛堣瀹冩姤閿?鎴愬姛閮借锛夛紝鐒跺悗鍐嶈繍琛岋細"
  Write-Output "  powershell -ExecutionPolicy Bypass -File scripts\\find-minimax-errors.ps1"
  exit 0
}

$sorted = $found | Sort-Object LastWriteTime -Descending
Write-Output "宸叉壘鍒?MiniMax 閿欒鏃ュ織锛堟渶澶氬睍绀?20 涓級锛?
$sorted | Select-Object -First 20 | ForEach-Object {
  Write-Output ("- " + $_.FullName + "  (" + $_.LastWriteTime.ToString("s") + ")")
}

$latest = $sorted | Select-Object -First 1
Write-Output ("鏈€鏂版枃浠讹細" + $latest.FullName)

if ($OpenLatest) {
  try {
    notepad $latest.FullName | Out-Null
  } catch {
    try {
      ii $latest.FullName | Out-Null
    } catch {
      Write-Output "鏃犳硶鑷姩鎵撳紑鏂囦欢锛岃鎵嬪姩鎵撳紑涓婇潰杈撳嚭鐨勮矾寰勩€?
    }
  }
}
