# Значок утилиты в трее: меню, конфигуратор, автозапуск вместе с Windows.
# Команды пишет в stdout: open, idle, log, restart, quit.
# Состояние читает из stdin строками «status <текст>|<1 — устройство подключено, 0 — нет>».
# Закрывается сам, когда утилита закрывает stdin
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$launcher = $env:STREAMX_LAUNCHER
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Stream Controller X.lnk'

function Send([string]$line) {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
}

# Значок рисуем сами, как в конфигураторе: шесть квадратиков. Серые — устройство не подключено
function New-TrayIcon([bool]$connected) {
    $bitmap = New-Object System.Drawing.Bitmap 32, 32
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 14
    $shape.AddArc(0, 0, $d, $d, 180, 90)
    $shape.AddArc(31 - $d, 0, $d, $d, 270, 90)
    $shape.AddArc(31 - $d, 31 - $d, $d, $d, 0, 90)
    $shape.AddArc(0, 31 - $d, $d, $d, 90, 90)
    $shape.CloseFigure()
    $graphics.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 20, 22, 26))), $shape)
    $color = if ($connected) { [System.Drawing.Color]::FromArgb(255, 74, 222, 128) } else { [System.Drawing.Color]::FromArgb(255, 125, 133, 146) }
    $dim = [System.Drawing.Color]::FromArgb(140, $color.R, $color.G, $color.B)
    $i = 0
    foreach ($y in 8, 17) {
        foreach ($x in 5, 13, 21) {
            $fill = if ($i % 2) { $dim } else { $color }
            $graphics.FillRectangle((New-Object System.Drawing.SolidBrush $fill), $x, $y, 6, 6)
            $i++
        }
    }
    $graphics.Dispose()
    [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
}

$icons = @{ $true = (New-TrayIcon $true); $false = (New-TrayIcon $false) }

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = $menu.Items.Add('Запуск…')
$statusItem.Enabled = $false
$null = $menu.Items.Add('-')
$openItem = $menu.Items.Add('Открыть конфигуратор')
$openItem.Font = New-Object System.Drawing.Font($openItem.Font, [System.Drawing.FontStyle]::Bold)
$openItem.add_Click({ Send 'open' })
$idleItem = $menu.Items.Add('Показать окно ожидания')
$idleItem.add_Click({ Send 'idle' })
$null = $menu.Items.Add('-')
$autostartItem = New-Object System.Windows.Forms.ToolStripMenuItem 'Запускать вместе с Windows'
$autostartItem.Checked = Test-Path $shortcutPath
$autostartItem.Enabled = [bool]$launcher
$autostartItem.add_Click({
    try {
        if (Test-Path $shortcutPath) {
            Remove-Item $shortcutPath -Force
        } else {
            # Ярлык в папке автозагрузки запускает утилиту без окна и без браузера
            $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
            if ($launcher.EndsWith('.exe')) {
                $shortcut.TargetPath = $launcher
                $shortcut.Arguments = '--background'
            } else {
                $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
                $shortcut.Arguments = '"' + $launcher + '"'
            }
            $shortcut.WorkingDirectory = Split-Path $launcher
            $shortcut.Description = 'Утилита для Razer Stream Controller X'
            $shortcut.Save()
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Не удалось изменить автозапуск: $($_.Exception.Message)", 'Stream Controller X') | Out-Null
    }
    $autostartItem.Checked = Test-Path $shortcutPath
})
$null = $menu.Items.Add($autostartItem)
$logItem = $menu.Items.Add('Открыть журнал')
$logItem.add_Click({ Send 'log' })
$null = $menu.Items.Add('-')
$restartItem = $menu.Items.Add('Перезапустить')
$restartItem.add_Click({ Send 'restart' })
$quitItem = $menu.Items.Add('Выход')
$quitItem.add_Click({ Send 'quit' })

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icons[$false]
$tray.Text = 'Stream Controller X'
$tray.ContextMenuStrip = $menu
$tray.add_MouseClick({
    param($source, $click)
    if ($click.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Send 'open' }
})
$tray.Visible = $true

# Состояние от утилиты читаем асинхронно, чтобы не останавливать меню
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$script:pending = $stdin.ReadLineAsync()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.add_Tick({
    while ($script:pending.IsCompleted) {
        $line = $script:pending.Result
        if ($null -eq $line) {
            # Утилита закрылась: убираем значок, иначе он останется висеть в трее
            $timer.Stop()
            $tray.Visible = $false
            $tray.Dispose()
            [System.Windows.Forms.Application]::Exit()
            return
        }
        $script:pending = $stdin.ReadLineAsync()
        if ($line.StartsWith('status ')) {
            $parts = $line.Substring(7).Split('|')
            $statusItem.Text = $parts[0]
            $tray.Icon = $icons[$parts[1] -eq '1']
            $tip = "Stream Controller X — $($parts[0])"
            $tray.Text = $tip.Substring(0, [Math]::Min(63, $tip.Length))
        }
    }
})
$timer.Start()
[System.Windows.Forms.Application]::Run()
