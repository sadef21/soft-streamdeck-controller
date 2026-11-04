// Значок в трее через помощника tray.ps1
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { APP_DIR } from './paths.js'

const RESTART_MS = 5000

// onCommand получает пункты меню: open, idle, log, restart, quit.
// launcher — что запускать при автозапуске вместе с Windows («Stream Controller X.exe» или start-hidden.vbs)
export function createTray({ launcher, onCommand }) {
    // -EncodedCommand работает даже там, где запуск скриптов запрещён политикой
    const script = fs.readFileSync(path.join(APP_DIR, 'src', 'tray.ps1'), 'utf8')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    let child = null
    let restartTimer = null
    let closed = false
    let status = null

    const send = line => child?.stdin.write(`${line}\n`)

    function start() {
        child = spawn('powershell.exe', ['-STA', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
            { windowsHide: true, env: { ...process.env, STREAMX_LAUNCHER: launcher } })
        readline.createInterface({ input: child.stdout }).on('line', line => onCommand?.(line.trim()))
        child.stderr.resume()
        child.on('error', err => console.error(`Не удалось показать значок в трее: ${err.message}`))
        child.on('exit', () => {
            child = null
            if (!closed) restartTimer = setTimeout(start, RESTART_MS)
        })
        if (status) send(status)
    }

    start()
    return {
        setStatus(text, connected) {
            status = `status ${text}|${connected ? 1 : 0}`
            send(status)
        },
        // Значок исчезает, когда помощник видит закрытый stdin
        close() {
            closed = true
            clearTimeout(restartTimer)
            child?.stdin.end()
        },
    }
}
