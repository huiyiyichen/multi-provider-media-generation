param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NodeArgs
)

$ErrorActionPreference = "Stop"

if (-not $NodeArgs -or $NodeArgs.Count -eq 0) {
  throw "Usage: .\scripts\codex-node.ps1 <node-args...>"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tmpDir = Join-Path $repoRoot "tmp"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$outPath = Join-Path $tmpDir ("codex-node-" + $stamp + ".out.txt")
$errPath = Join-Path $tmpDir ("codex-node-" + $stamp + ".err.txt")
$keepWrapperLogs = $env:MEDIA_SKILL_KEEP_WRAPPER_LOGS -eq "1"

$nodePathCandidates = @(
  "C:\Program Files\nodejs\node.exe",
  "D:\Program Files\ok-ww\data\apps\ok-ww\python\Lib\site-packages\playwright\driver\node.exe"
)

$nodePath = $nodePathCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $nodePath) {
  throw "Unable to find node.exe in known locations."
}

$childEnv = @{
  SystemRoot = "C:\Windows"
  windir = "C:\Windows"
  ComSpec = "C:\Windows\System32\cmd.exe"
  ProgramFiles = "C:\Program Files"
  "ProgramFiles(x86)" = "C:\Program Files (x86)"
  ProgramData = "C:\ProgramData"
  ALLUSERSPROFILE = "C:\ProgramData"
  USERPROFILE = "C:\Users\26361"
  APPDATA = "C:\Users\26361\AppData\Roaming"
  LOCALAPPDATA = "C:\Users\26361\AppData\Local"
  PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC"
  MEDIA_SKILL_DISPLAY_DATA_DIR = "C:\Users\26361\.codex\skills\multi-provider-media-generation\data"
}

$exitCode = 1

try {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $nodePath
  $startInfo.WorkingDirectory = $repoRoot
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  foreach ($arg in $NodeArgs) {
    [void]$startInfo.ArgumentList.Add($arg)
  }

  foreach ($entry in $childEnv.GetEnumerator()) {
    $startInfo.Environment[$entry.Key] = [string]$entry.Value
  }

  $proc = [System.Diagnostics.Process]::new()
  $proc.StartInfo = $startInfo

  [void]$proc.Start()
  $stdout = $proc.StandardOutput.ReadToEnd()
  $stderr = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  $exitCode = $proc.ExitCode

  if ($keepWrapperLogs) {
    Set-Content -LiteralPath $outPath -Value $stdout -Encoding UTF8
    Set-Content -LiteralPath $errPath -Value $stderr -Encoding UTF8
  }

  if (-not [string]::IsNullOrEmpty($stdout)) {
    Write-Output ($stdout.TrimEnd())
  }

  if (-not [string]::IsNullOrEmpty($stderr)) {
    [Console]::Error.Write($stderr)
  }
} finally {
  if (-not $keepWrapperLogs) {
    if (Test-Path $outPath) {
      Remove-Item -LiteralPath $outPath -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path $errPath) {
      Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
    }
  }
}

exit $exitCode
