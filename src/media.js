// Что сейчас играет (Spotify и другие плееры), скорость сети и загрузка видеокарты — через помощника media.ps1
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { APP_DIR } from './paths.js'

const RESTART_MS = 5000

// state.media: { title, artist, status: 'playing' | 'paused' | … | 'none', position, duration, updated, coverId }
// state.cover: Buffer с обложкой текущего трека или null. state.net: { down, up } — байт в секунду.
// state.gpu: загрузка видеокарты в процентах или null
export function createMedia({ onChange } = {}) {
    // -EncodedCommand работает даже там, где запуск скриптов запрещён политикой
    const script = fs.readFileSync(path.join(APP_DIR, 'src', 'media.ps1'), 'utf8')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const state = { media: null, cover: null, net: null, gpu: null }
    let coverId = 0
    let lastNet = null
    let child = null
    let restartTimer = null
    let closed = false
    let lastError = null

    function handle(line) {
        let message
        try {
            message = JSON.parse(line)
        } catch {
            return
        }
        switch (message.type) {
            case 'media': {
                const { type, ...media } = message
                state.media = { ...media, coverId: state.cover ? coverId : null }
                onChange?.('media')
                break
            }
            case 'cover':
                state.cover = message.data ? Buffer.from(message.data, 'base64') : null
                coverId++
                if (state.media) state.media.coverId = state.cover ? coverId : null
                onChange?.('media')
                break
            case 'net': {
                const now = Date.now()
                if (lastNet && now > lastNet.time) {
                    const seconds = (now - lastNet.time) / 1000
                    state.net = {
                        down: Math.max(0, Math.round((message.rx - lastNet.rx) / seconds)),
                        up: Math.max(0, Math.round((message.tx - lastNet.tx) / seconds)),
                    }
                }
                lastNet = { rx: message.rx, tx: message.tx, time: now }
                break
            }
            case 'gpu':
                state.gpu = message.load
                break
            case 'error':
                if (message.message !== lastError) console.error(message.message)
                lastError = message.message
                break
        }
    }

    function start() {
        child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
            { windowsHide: true })
        readline.createInterface({ input: child.stdout }).on('line', handle)
        // В stderr PowerShell пишет служебный прогресс загрузки модулей — он не нужен
        child.stderr.resume()
        child.on('error', err => console.error(`Не удалось запустить помощника плеера: ${err.message}`))
        child.on('exit', () => {
            child = null
            if (!closed) restartTimer = setTimeout(start, RESTART_MS)
        })
    }

    start()
    return {
        state,
        // playpause, next, prev — уходят тому плееру, который показан на кнопке
        command(name) {
            child?.stdin.write(`${name}\n`)
        },
        close() {
            closed = true
            clearTimeout(restartTimer)
            child?.stdin.end()
        },
    }
}
