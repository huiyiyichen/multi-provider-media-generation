param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$MediaSkillArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cliPath = Join-Path $repoRoot "dist\cli.js"

& (Join-Path $PSScriptRoot "codex-node.ps1") $cliPath @MediaSkillArgs
exit $LASTEXITCODE
