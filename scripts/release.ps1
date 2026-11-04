# Сборка релиза: папка dist\StreamControllerX и архив dist\StreamControllerX-<версия>.zip.
# Внутри — всё, чтобы запустить утилиту без установки Node.js: node\node.exe (тот же Node, которым
# собраны node_modules — иначе не загрузятся canvas и koffi), зависимости и «Stream Controller X.exe».
# Личного config.json в архиве нет: при первом запуске он создаётся из config.example.json.
# Архив прикрепляется к релизу на GitHub с тегом v<версия> — его же скачивает «Обновить» в конфигураторе.
# Запуск: npm run release
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$version = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$out = Join-Path $dist 'StreamControllerX'
$zip = Join-Path $dist "StreamControllerX-$version.zip"

if (-not (Test-Path (Join-Path $root 'node_modules'))) { throw 'Нет node_modules — сначала npm install' }
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force $out | Out-Null

Write-Host "Сборка $version…"
foreach ($file in 'bind.js', 'package.json', 'package-lock.json', 'README.md', 'config.example.json', 'Stream Controller X.exe', 'start-hidden.vbs') {
    Copy-Item (Join-Path $root $file) $out
}
foreach ($dir in 'src', 'web') {
    Copy-Item (Join-Path $root $dir) (Join-Path $out $dir) -Recurse
}

# Зависимости копируем как есть: они уже собраны под этот Node
robocopy (Join-Path $root 'node_modules') (Join-Path $out 'node_modules') /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Не удалось скопировать node_modules (robocopy $LASTEXITCODE)" }

$node = (Get-Command node).Source
New-Item -ItemType Directory -Force (Join-Path $out 'node') | Out-Null
Copy-Item $node (Join-Path $out 'node\node.exe')
$nodeVersion = & $node -v

Write-Host 'Упаковка…'
[System.IO.Compression.ZipFile]::CreateFromDirectory($out, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
$size = [Math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Готово: $zip ($size МБ, Node $nodeVersion)"
Write-Host "Дальше: на GitHub → Releases → Draft a new release, тег v$version, прикрепите этот архив."
