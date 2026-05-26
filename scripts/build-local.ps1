$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tempRoot = Join-Path $env:TEMP 'housing-ping-system-build'

if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

robocopy $root $tempRoot /E /XD node_modules dist migrated_prompt_history | Out-Null
if ($LASTEXITCODE -gt 7) {
    throw "Failed to copy source files to temporary build folder. robocopy exit code: $LASTEXITCODE"
}

Push-Location $tempRoot
try {
    npm.cmd ci
    New-Item -ItemType Directory -Force -Path (Join-Path $tempRoot 'public') | Out-Null
    npm.cmd run build:css
    npm.cmd run build:app
}
finally {
    Pop-Location
}

$sourceDist = Join-Path $tempRoot 'dist'
$targetDist = Join-Path $root 'dist'

if (Test-Path -LiteralPath $targetDist) {
    Remove-Item -LiteralPath $targetDist -Recurse -Force
}
Copy-Item -LiteralPath $sourceDist -Destination $targetDist -Recurse

$indexHtml = Join-Path $targetDist 'index.html'
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath $indexHtml
$html = $html -replace '<script type="module" crossorigin src="(\./assets/[^"]+\.js)"></script>', '<script defer src="$1"></script>'
$html = $html -replace '\s+crossorigin href=', ' href='
Set-Content -Encoding UTF8 -LiteralPath $indexHtml -Value $html

Write-Host "Built HTML output: $targetDist"
