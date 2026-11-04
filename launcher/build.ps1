# Сборка «Stream Controller X.exe» компилятором C#, который уже есть в Windows (.NET Framework 4).
# Запуск: powershell -ExecutionPolicy Bypass -File launcher\build.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$iconPath = Join-Path $here 'app.ico'
$exePath = Join-Path $root 'Stream Controller X.exe'

# Значок как в трее: тёмная плитка и шесть зелёных квадратиков. Рисуем в нескольких размерах
function New-IconPng([int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    $k = $size / 32.0
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 14 * $k
    $e = $size - 1
    $shape.AddArc(0, 0, $d, $d, 180, 90)
    $shape.AddArc($e - $d, 0, $d, $d, 270, 90)
    $shape.AddArc($e - $d, $e - $d, $d, $d, 0, 90)
    $shape.AddArc(0, $e - $d, $d, $d, 90, 90)
    $shape.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 20, 22, 26))), $shape)
    $color = [System.Drawing.Color]::FromArgb(255, 74, 222, 128)
    $dim = [System.Drawing.Color]::FromArgb(140, 74, 222, 128)
    $i = 0
    foreach ($y in 8, 17) {
        foreach ($x in 5, 13, 21) {
            $fill = if ($i % 2) { $dim } else { $color }
            $g.FillRectangle((New-Object System.Drawing.SolidBrush $fill), $x * $k, $y * $k, 6 * $k, 6 * $k)
            $i++
        }
    }
    $g.Dispose()
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    , $stream.ToArray()
}

# ICO с PNG внутри (так умеет Windows Vista и новее)
$sizes = 16, 24, 32, 48, 64, 256
$images = $sizes | ForEach-Object { , (New-IconPng $_) }
$file = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $file
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($n = 0; $n -lt $sizes.Count; $n++) {
    $s = $sizes[$n]
    $w.Write([byte]($s % 256)); $w.Write([byte]($s % 256))
    $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$images[$n].Length); $w.Write([UInt32]$offset)
    $offset += $images[$n].Length
}
foreach ($image in $images) { $w.Write($image) }
$w.Flush()
[System.IO.File]::WriteAllBytes($iconPath, $file.ToArray())

$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/win32icon:$iconPath" "/out:$exePath" `
    /reference:System.Windows.Forms.dll (Join-Path $here 'Launcher.cs')
if ($LASTEXITCODE) { throw "csc завершился с кодом $LASTEXITCODE" }
Write-Host "Готово: $exePath"
