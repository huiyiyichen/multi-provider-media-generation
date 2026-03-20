param(
  [string]$SourceDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$DestinationDir
)

$ErrorActionPreference = 'Stop'

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath
  )

  $directory = [System.IO.Path]::GetDirectoryName($DestinationPath)
  if ($directory) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  $text = [System.IO.File]::ReadAllText($SourcePath)
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($DestinationPath, $text, $encoding)
}

function Assert-NoBom {
  param([Parameter(Mandatory = $true)][string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "File contains UTF-8 BOM: $Path"
  }
}

function Assert-StartsWithBytes {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][byte[]]$ExpectedBytes
  )

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt $ExpectedBytes.Length) {
    throw "File is shorter than expected: $Path"
  }

  for ($index = 0; $index -lt $ExpectedBytes.Length; $index += 1) {
    if ($bytes[$index] -ne $ExpectedBytes[$index]) {
      $expected = ($ExpectedBytes | ForEach-Object { $_.ToString('X2') }) -join ' '
      throw "File does not start with expected bytes [$expected]: $Path"
    }
  }
}

function Resolve-DestinationDir {
  param([string]$ExplicitDestination)

  if ($ExplicitDestination) {
    return [System.IO.Path]::GetFullPath($ExplicitDestination)
  }

  if ($env:CODEX_HOME) {
    return [System.IO.Path]::GetFullPath((Join-Path $env:CODEX_HOME 'skills\multi-provider-media-generation'))
  }

  $userHome = [Environment]::GetFolderPath('UserProfile')
  if (-not $userHome) {
    throw 'Unable to resolve Codex skill directory because USERPROFILE is not available.'
  }

  return [System.IO.Path]::GetFullPath((Join-Path $userHome '.codex\skills\multi-provider-media-generation'))
}

$sourceRoot = [System.IO.Path]::GetFullPath($SourceDir)
$destinationRoot = Resolve-DestinationDir -ExplicitDestination $DestinationDir

$requiredFiles = @(
  'SKILL.md',
  'README.md',
  'agents\openai.yaml',
  'dist\cli.js'
)

foreach ($relativePath in $requiredFiles) {
  $absolutePath = Join-Path $sourceRoot $relativePath
  if (-not (Test-Path -LiteralPath $absolutePath)) {
    throw "Missing required source file: $absolutePath"
  }
}

[System.IO.Directory]::CreateDirectory($destinationRoot) | Out-Null

foreach ($name in @('agents', 'assets', 'dist', 'references', 'scripts')) {
  $target = Join-Path $destinationRoot $name
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $destinationRoot -Recurse -Force
}

foreach ($name in @('SKILL.md', 'README.md', 'package.json')) {
  $target = Join-Path $destinationRoot $name
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force
  }
}

Write-Utf8NoBomFile -SourcePath (Join-Path $sourceRoot 'SKILL.md') -DestinationPath (Join-Path $destinationRoot 'SKILL.md')
Write-Utf8NoBomFile -SourcePath (Join-Path $sourceRoot 'README.md') -DestinationPath (Join-Path $destinationRoot 'README.md')
Write-Utf8NoBomFile -SourcePath (Join-Path $sourceRoot 'agents\openai.yaml') -DestinationPath (Join-Path $destinationRoot 'agents\openai.yaml')
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json') -Destination (Join-Path $destinationRoot 'package.json') -Force

$installedSkillPath = Join-Path $destinationRoot 'SKILL.md'
$installedAgentPath = Join-Path $destinationRoot 'agents\openai.yaml'

Assert-NoBom -Path $installedSkillPath
Assert-NoBom -Path $installedAgentPath
Assert-StartsWithBytes -Path $installedSkillPath -ExpectedBytes ([byte[]](0x2D, 0x2D, 0x2D))

$agentText = [System.IO.File]::ReadAllText($installedAgentPath)
if (-not $agentText.TrimStart().StartsWith('interface:')) {
  throw "openai.yaml must start with an interface block: $installedAgentPath"
}

$result = [ordered]@{
  source_dir = $sourceRoot
  destination_dir = $destinationRoot
  skill_md = $installedSkillPath
  openai_yaml = $installedAgentPath
  bom_removed = $true
  frontmatter_ok = $true
  interface_block_ok = $true
}

$result | ConvertTo-Json -Depth 4