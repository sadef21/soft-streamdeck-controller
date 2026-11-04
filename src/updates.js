// Обновления с GitHub. Новая версия — последний релиз репозитория из package.json ("repository"),
// с тегом v<версия> и архивом StreamControllerX-<версия>.zip (собирает scripts/release.ps1).
//
// Как ставится:
//  - папка — git-клон (разработка): git pull, при смене зависимостей npm install, перезапуск;
//  - папка из архива релиза: архив скачивается и распаковывается во временную папку, утилита
//    закрывается, а помощник (PowerShell) дожидается её выхода, копирует файлы поверх и запускает
//    её снова. Поверх работающей утилиты копировать нельзя: node.exe и модули заняты.
//    Личное не трогаем: config.json, state.json, bind.log, backups, icons.
import { execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { APP_DIR } from './paths.js'

const run = promisify(execFile)
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000
const USER_AGENT = 'streamx-bind-updater'

const packageInfo = () => JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'))

// "github:owner/repo", "https://github.com/owner/repo.git" или { url }
function repoOf(pkg) {
    const value = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    const match = /github(?:\.com[/:]|:)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(value ?? '')
    return match ? `${match[1]}/${match[2]}` : null
}

// 1 — a новее b, -1 — старше, 0 — одинаковые. «v1.2.10» > «1.2.9»
export function compareVersions(a, b) {
    const parts = v => String(v).replace(/^v/, '').split(/[.-]/).map(n => Number.parseInt(n, 10) || 0)
    const [x, y] = [parts(a), parts(b)]
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) ? 1 : -1
    }
    return 0
}

const isGitCheckout = () => fs.existsSync(path.join(APP_DIR, '.git'))

async function download(url, file) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
    if (!res.ok) throw new Error(`скачивание: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
}

// Распаковка zip встроенным tar Windows — по полному пути: tar из Git, если он раньше в PATH,
// принимает «C:» за имя сервера. Без него (старые Windows) — через PowerShell
async function unzip(zip, dir) {
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    if (fs.existsSync(tar)) return run(tar, ['-xf', zip, '-C', dir], { windowsHide: true })
    return run('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', zip, dir],
        { windowsHide: true })
}

const hashOf = file => (fs.existsSync(file) ? crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex') : null)

// onChange — состояние изменилось (для конфигуратора и трея). restart — перезапустить утилиту,
// shutdown — закрыть её (после этого помощник ставит файлы и запускает её снова)
export function createUpdates({ onChange, restart, shutdown }) {
    const pkg = packageInfo()
    const repo = repoOf(pkg)
    const state = {
        current: pkg.version,
        repo,
        mode: isGitCheckout() ? 'git' : 'release',
        latest: null, // { version, notes, url, asset, published }
        available: false,
        checking: false,
        installing: false,
        checked: null,
        error: null,
    }
    const changed = () => onChange?.(state)

    async function check() {
        if (!repo) {
            state.error = 'В package.json не указан репозиторий GitHub'
            return changed()
        }
        if (state.checking || state.installing) return
        state.checking = true
        state.error = null
        changed()
        try {
            const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
            })
            if (res.status === 404) {
                state.latest = null
                state.available = false
            } else {
                if (!res.ok) throw new Error(`GitHub ответил ${res.status}`)
                const release = await res.json()
                const asset = release.assets?.find(a => /\.zip$/i.test(a.name))
                state.latest = {
                    version: release.tag_name.replace(/^v/, ''),
                    notes: release.body ?? '',
                    url: release.html_url,
                    asset: asset?.browser_download_url ?? null,
                    published: release.published_at,
                }
                state.available = compareVersions(state.latest.version, state.current) > 0
            }
            state.checked = new Date().toISOString()
        } catch (err) {
            state.error = `Не удалось проверить обновления: ${err.message}`
        } finally {
            state.checking = false
            changed()
        }
    }

    async function installFromGit() {
        const lock = path.join(APP_DIR, 'package-lock.json')
        const before = hashOf(lock)
        console.log('Обновление: git pull')
        await run('git', ['pull', '--ff-only'], { cwd: APP_DIR, windowsHide: true })
        if (hashOf(lock) !== before) {
            console.log('Обновление: npm install')
            const npm = path.join(path.dirname(process.execPath), 'npm.cmd')
            await run('cmd.exe', ['/c', fs.existsSync(npm) ? npm : 'npm', 'install'], { cwd: APP_DIR, windowsHide: true })
        }
        restart()
    }

    async function installFromRelease() {
        if (!state.latest?.asset) throw new Error('У релиза на GitHub нет архива .zip')
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'streamx-update-'))
        const zip = path.join(work, 'update.zip')
        console.log(`Обновление: скачиваю ${state.latest.asset}`)
        await download(state.latest.asset, zip)
        const unpacked = path.join(work, 'files')
        fs.mkdirSync(unpacked)
        await unzip(zip, unpacked)
        // В архиве одна папка верхнего уровня (StreamControllerX) — или файлы сразу в корне
        const entries = fs.readdirSync(unpacked)
        const source = entries.length === 1 && fs.statSync(path.join(unpacked, entries[0])).isDirectory()
            ? path.join(unpacked, entries[0]) : unpacked
        if (!fs.existsSync(path.join(source, 'bind.js'))) throw new Error('в архиве нет bind.js — это не релиз утилиты')

        const helper = path.join(work, 'install.ps1')
        fs.writeFileSync(helper, `﻿${HELPER}`)
        const launcher = path.join(APP_DIR, 'Stream Controller X.exe')
        const quote = value => `"${value}"`
        const command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', quote(helper),
            '-WaitPid', process.pid, '-Source', quote(source), '-Target', quote(APP_DIR), '-Launcher', quote(launcher),
            '-Log', quote(path.join(APP_DIR, 'bind.log'))].join(' ')
        // Помощник должен пережить утилиту. Обычный дочерний процесс Node на Windows закрывается вместе
        // с ней, а отсоединённый (detached) PowerShell остаётся без консоли и не запускается.
        // Поэтому запускаем через wscript: ему консоль не нужна, а PowerShell он стартует скрыто и независимо.
        // VBS — в UTF-16 с BOM, чтобы пути с русскими буквами дошли целыми
        const starter = path.join(work, 'install.vbs')
        const vbs = `CreateObject("WScript.Shell").Run "${command.replace(/"/g, '""')}", 0, False\r\n`
        fs.writeFileSync(starter, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbs, 'utf16le')]))
        console.log('Обновление: файлы скачаны, перезапускаюсь для установки')
        spawn('wscript.exe', [starter], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
        shutdown()
    }

    async function install() {
        if (state.installing) return
        if (!state.available) throw new Error('Обновлений нет')
        state.installing = true
        state.error = null
        changed()
        try {
            if (state.mode === 'git') await installFromGit()
            else await installFromRelease()
        } catch (err) {
            state.installing = false
            state.error = `Не удалось обновить: ${err.stderr?.trim() || err.message}`
            console.error(state.error)
            changed()
        }
    }

    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    timer.unref()
    return { state, check, install, stop: () => clearInterval(timer) }
}

// Помощник установки: ждёт выхода утилиты, копирует новые файлы поверх (кроме личных) и запускает её
const HELPER = `param([int]$WaitPid, [string]$Source, [string]$Target, [string]$Launcher, [string]$Log)
function Write-Log([string]$text) { Add-Content -LiteralPath $Log -Value $text -Encoding UTF8 }
Write-Log 'Обновление: жду закрытия утилиты'
try { Wait-Process -Id $WaitPid -Timeout 30 -ErrorAction Stop } catch {}
Start-Sleep -Milliseconds 500
robocopy $Source $Target /E /R:10 /W:1 /NFL /NDL /NJH /NJS /NP /XF config.json state.json bind.log /XD backups icons .git | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Log "Обновление: не удалось скопировать файлы (robocopy $LASTEXITCODE)" }
else { Write-Log 'Обновление установлено' }
Start-Process -FilePath $Launcher -WorkingDirectory $Target
`
