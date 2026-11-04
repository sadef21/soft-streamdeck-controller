# Помощник утилиты: что сейчас играет (Spotify, иначе текущий плеер Windows), трафик сети и загрузка видеокарты.
# Пишет строки JSON в stdout. Команды читает из stdin: playpause, next, prev, ping.
# Закрывается сам, когда утилита закрывает stdin
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Ожидание асинхронных операций WinRT из PowerShell 5.1
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($operation, [Type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    if (-not $task.Wait(3000)) { throw 'операция не завершилась за 3 с' }
    $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$ManagerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$PropertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

function Send($object) {
    [Console]::Out.WriteLine(($object | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

$manager = $null
try {
    $manager = Await ($ManagerType::RequestAsync()) $ManagerType
} catch {
    Send ([ordered]@{ type = 'error'; message = "Медиасессии Windows недоступны: $($_.Exception.Message)" })
}

# Spotify, если он запущен, иначе плеер, который Windows считает текущим
function Get-Session {
    if (-not $manager) { return $null }
    foreach ($session in $manager.GetSessions()) {
        if ($session.SourceAppUserModelId -match 'spotify') { return $session }
    }
    return $manager.GetCurrentSession()
}

function Read-Cover($properties) {
    if (-not $properties.Thumbnail) { return $null }
    $stream = Await ($properties.Thumbnail.OpenReadAsync()) $StreamType
    # Поток приходит COM-объектом без методов: PowerShell не умеет привести его к IInputStream,
    # а вызов через рефлексию приводит сам
    $source = $asStreamForRead.Invoke($null, @($stream))
    $memory = New-Object System.IO.MemoryStream
    $source.CopyTo($memory)
    $source.Dispose()
    [Convert]::ToBase64String($memory.ToArray())
}

$script:lastState = ''
$script:lastTrack = ''

function Update-Media {
    $session = Get-Session
    if (-not $session) {
        $state = [ordered]@{ type = 'media'; status = 'none' }
    } else {
        $properties = Await ($session.TryGetMediaPropertiesAsync()) $PropertiesType
        $timeline = $session.GetTimelineProperties()
        $state = [ordered]@{
            type     = 'media'
            app      = $session.SourceAppUserModelId
            title    = $properties.Title
            artist   = $properties.Artist
            album    = $properties.AlbumTitle
            status   = $session.GetPlaybackInfo().PlaybackStatus.ToString().ToLower()
            position = [math]::Round($timeline.Position.TotalSeconds, 1)
            duration = [math]::Round($timeline.EndTime.TotalSeconds, 1)
            updated  = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
        }
        # Обложку отправляем только при смене трека
        $track = "$($state.app)|$($state.title)|$($state.artist)"
        if ($track -ne $script:lastTrack) {
            $script:lastTrack = $track
            $cover = $null
            try { $cover = Read-Cover $properties } catch { }
            Send ([ordered]@{ type = 'cover'; track = $track; data = $cover })
        }
    }
    $json = $state | ConvertTo-Json -Compress
    if ($json -ne $script:lastState) {
        $script:lastState = $json
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
    }
}

# Сколько байт принято и отправлено по всем работающим сетевым адаптерам
function Send-Network {
    $received = [long]0
    $sent = [long]0
    foreach ($nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($nic.OperationalStatus -ne 'Up') { continue }
        if ($nic.NetworkInterfaceType -eq 'Loopback' -or $nic.NetworkInterfaceType -eq 'Tunnel') { continue }
        $statistics = $nic.GetIPStatistics()
        $received += $statistics.BytesReceived
        $sent += $statistics.BytesSent
    }
    Send ([ordered]@{ type = 'net'; rx = $received; tx = $sent })
}

# Загрузка видеокарты, как в Диспетчере задач: по каждому блоку видеокарты складываем все процессы,
# берём самый загруженный. Счётчики читаются целой категорией за пару миллисекунд
$script:gpuCategory = $null
try { $script:gpuCategory = New-Object System.Diagnostics.PerformanceCounterCategory 'GPU Engine' } catch { }
$script:gpuPrevious = $null

function Send-Gpu {
    if (-not $script:gpuCategory) { return }
    $samples = $script:gpuCategory.ReadCategory()['utilization percentage']
    if ($script:gpuPrevious) {
        $sums = @{}
        foreach ($name in $samples.Keys) {
            if (-not $script:gpuPrevious.Contains($name)) { continue }
            if ($name -match '(luid_\w+?_phys_\d+_eng_\d+)') {
                $sums[$Matches[1]] += [System.Diagnostics.CounterSample]::Calculate($script:gpuPrevious[$name].Sample, $samples[$name].Sample)
            }
        }
        $load = if ($sums.Count) { ($sums.Values | Measure-Object -Maximum).Maximum } else { 0 }
        Send ([ordered]@{ type = 'gpu'; load = [math]::Min(100, [math]::Round($load)) })
    }
    $script:gpuPrevious = $samples
}

function Invoke-MediaCommand([string]$command) {
    if ($command -eq 'ping') {
        Send ([ordered]@{ type = 'pong' })
        return
    }
    $session = Get-Session
    if (-not $session) { return }
    switch ($command) {
        'playpause' { $null = Await ($session.TryTogglePlayPauseAsync()) ([bool]) }
        'next' { $null = Await ($session.TrySkipNextAsync()) ([bool]) }
        'prev' { $null = Await ($session.TrySkipPreviousAsync()) ([bool]) }
    }
}

# Команды читаем асинхронно, чтобы не останавливать опрос плеера
$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pending = $stdin.ReadLineAsync()
$next = [DateTime]::MinValue
while ($true) {
    while ($pending.IsCompleted) {
        $line = $pending.Result
        if ($null -eq $line) { exit }
        $pending = $stdin.ReadLineAsync()
        try {
            Invoke-MediaCommand $line.Trim()
        } catch {
            Send ([ordered]@{ type = 'error'; message = "Команда $($line.Trim()): $($_.Exception.Message)" })
        }
        $next = [DateTime]::MinValue
    }
    if ([DateTime]::UtcNow -ge $next) {
        try {
            Update-Media
        } catch {
            Send ([ordered]@{ type = 'error'; message = "Плеер: $($_.Exception.Message)" })
        }
        try { Send-Network } catch { }
        try { Send-Gpu } catch { }
        $next = [DateTime]::UtcNow.AddMilliseconds(1000)
    }
    Start-Sleep -Milliseconds 100
}
