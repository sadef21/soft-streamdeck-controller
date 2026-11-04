// Локальный сервер веб-конфигуратора (только 127.0.0.1)
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { configVersion, formatConfig, validateConfig } from './config.js'
import { VK } from './keyboard.js'
import { APP_DIR as appDir, LUCIDE_DIR as lucideDir, WEB_DIR as webDir } from './paths.js'
import { findPlaces } from './weather.js'

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
}
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'])
// Форматы, которые точно умеет рисовать node-canvas на устройстве
const GALLERY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif'])

const httpError = (status, message) => Object.assign(new Error(message), { status })

function sendJson(res, status, data) {
    if (res.headersSent) return res.end()
    res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
}

function sendFile(res, file, { immutable = false } = {}) {
    fs.readFile(file, (err, data) => {
        if (err) return sendJson(res, 404, { error: 'Файл не найден' })
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Cache-Control': immutable ? 'max-age=604800' : 'no-cache',
        })
        res.end(data)
    })
}

// Файл внутри папки base (защита от ../ в пути)
function insideDir(base, rel) {
    const file = path.join(base, rel)
    return file.startsWith(base + path.sep) ? file : null
}

function readJson(req, limit = 5 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', chunk => {
            size += chunk.length
            if (size > limit) {
                reject(httpError(413, 'Слишком большой запрос'))
                req.destroy()
            } else {
                chunks.push(chunk)
            }
        })
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch {
                reject(httpError(400, 'Некорректный JSON в запросе'))
            }
        })
        req.on('error', reject)
    })
}

// Нативное окно выбора файла или папки Windows
function pickerScript(kind, filter) {
    const dialog = kind === 'folder'
        ? `$d = New-Object System.Windows.Forms.FolderBrowserDialog
           if ($d.ShowDialog($owner) -eq 'OK') { $d.SelectedPath }`
        : `$d = New-Object System.Windows.Forms.OpenFileDialog
           $d.DereferenceLinks = $false
           ${filter === 'programs'
        ? `$d.Filter = 'Программы и ярлыки|*.exe;*.lnk;*.bat;*.cmd;*.ps1|Все файлы|*.*'
           $d.InitialDirectory = [Environment]::GetFolderPath('CommonStartMenu') + '\\Programs'`
        : `$d.Filter = 'Все файлы|*.*'`}
           if ($d.ShowDialog($owner) -eq 'OK') { $d.FileName }`
    return `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Add-Type -AssemblyName System.Windows.Forms
        $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
        ${dialog}`
}

function pickPath(kind, filter) {
    return new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', pickerScript(kind, filter)], { windowsHide: true })
        let out = ''
        child.stdout.on('data', chunk => { out += chunk })
        child.on('error', reject)
        child.on('close', () => resolve(out.trim() || null))
    })
}

let iconLibrary
function getIconLibrary() {
    if (!iconLibrary) {
        const tags = JSON.parse(fs.readFileSync(path.join(lucideDir, 'tags.json'), 'utf8'))
        const names = fs.readdirSync(path.join(lucideDir, 'icons')).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4))
        iconLibrary = names.map(name => ({ name, tags: tags[name] ?? [] }))
    }
    return iconLibrary
}

// getCover — обложка текущего трека (Buffer), onCommand — команды устройству из конфигуратора
/* ---------- Резервные копии config.json ---------- */

// Перед каждым сохранением из конфигуратора прежний config.json копируется в backups/,
// хранятся последние BACKUP_KEEP
const BACKUP_KEEP = 30
const BACKUP_NAME = /^config-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?\.json$/
const backupsDir = configPath => path.join(path.dirname(configPath), 'backups')

function backupConfig(configPath, nextText) {
    let current
    try {
        current = fs.readFileSync(configPath, 'utf8')
    } catch {
        return // Конфига ещё нет — копировать нечего
    }
    if (current === nextText) return
    const dir = backupsDir(configPath)
    fs.mkdirSync(dir, { recursive: true })
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    let name = `config-${stamp}.json`
    for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `config-${stamp}-${n}.json`
    fs.writeFileSync(path.join(dir, name), current)
    for (const old of listBackups(configPath).slice(BACKUP_KEEP)) {
        try {
            fs.unlinkSync(path.join(dir, old.name))
        } catch {
            // Не удалось — попробуем при следующем сохранении
        }
    }
}

// Новые сверху
function listBackups(configPath) {
    const dir = backupsDir(configPath)
    try {
        return fs.readdirSync(dir)
            .filter(name => BACKUP_NAME.test(name))
            .map(name => ({ name, time: fs.statSync(path.join(dir, name)).mtimeMs }))
            .sort((a, b) => b.time - a.time)
    } catch {
        return []
    }
}

// getUpdates — модуль обновлений (src/updates.js), создаётся после сервера
export function startServer({ port, configPath, getStatus, getCover, onCommand, getUpdates }) {
    const configDir = path.dirname(configPath)
    const iconsDir = path.join(configDir, 'icons')
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
    const clients = new Set()
    let picking = false

    function broadcast(event, data) {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        for (const res of clients) res.write(message)
    }
    setInterval(() => {
        for (const res of clients) res.write(': ping\n\n')
    }, 20000).unref()

    const routes = {
        'GET /api/meta': () => ({ keyNames: Object.keys(VK), configPath }),

        'GET /api/update': () => getUpdates?.()?.state ?? null,
        'POST /api/update/check': async () => {
            const updates = getUpdates?.()
            if (!updates) throw httpError(503, 'Проверка обновлений ещё не готова')
            await updates.check()
            return updates.state
        },
        'POST /api/update/install': async () => {
            const updates = getUpdates?.()
            if (!updates) throw httpError(503, 'Обновления ещё не готовы')
            try {
                // Не ждём: установка закрывает утилиту
                if (!updates.state.available) throw new Error('Обновлений нет')
                updates.install()
            } catch (err) {
                throw httpError(400, err.message)
            }
            return { ok: true }
        },

        'GET /api/config': () => {
            const text = fs.readFileSync(configPath, 'utf8')
            return { config: JSON.parse(text.replace(/^﻿/, '')), version: configVersion(text) }
        },

        'PUT /api/config': async req => {
            const { config } = await readJson(req)
            try {
                validateConfig(config, configDir)
            } catch (err) {
                throw httpError(400, err.message)
            }
            const text = formatConfig(config)
            backupConfig(configPath, text)
            fs.writeFileSync(configPath, text)
            return { version: configVersion(text) }
        },

        // Поиск города для погоды
        'GET /api/geocode': async req => {
            const query = (new URL(req.url, 'http://local').searchParams.get('q') ?? '').trim()
            if (query.length < 2) return { places: [] }
            try {
                return { places: await findPlaces(query) }
            } catch (err) {
                throw httpError(502, `Не удалось найти город: ${err.message}. Проверьте интернет`)
            }
        },

        // Резервные копии config.json — прежние версии, которые сохранение заменило
        'GET /api/backups': () => ({ backups: listBackups(configPath) }),

        'GET /api/backup': req => {
            const name = new URL(req.url, 'http://local').searchParams.get('name') ?? ''
            if (!BACKUP_NAME.test(name)) throw httpError(400, 'Нет такой копии')
            try {
                const text = fs.readFileSync(path.join(backupsDir(configPath), name), 'utf8')
                return { config: JSON.parse(text.replace(/^﻿/, '')) }
            } catch {
                throw httpError(404, 'Копия не найдена или повреждена')
            }
        },

        'GET /api/icons': () => {
            let files = []
            try {
                files = fs.readdirSync(iconsDir, { withFileTypes: true })
                    .filter(e => e.isFile() && GALLERY_EXT.has(path.extname(e.name).toLowerCase()))
                    .map(e => ({ name: e.name, mtime: fs.statSync(path.join(iconsDir, e.name)).mtimeMs }))
                    .sort((a, b) => b.mtime - a.mtime)
            } catch {
                // Папки icons ещё нет
            }
            return { icons: files.map(f => `icons/${f.name}`) }
        },

        // Иконку присылает браузер уже готовым PNG 128×128
        'POST /api/icons': async req => {
            const { name, data } = await readJson(req)
            const match = /^data:image\/png;base64,(.+)$/.exec(data ?? '')
            if (!match) throw httpError(400, 'Ожидается PNG')
            const buffer = Buffer.from(match[1], 'base64')
            if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw httpError(400, 'Файл не является PNG')
            const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'icon'
            const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 6)
            const file = `${base}-${hash}.png`
            fs.mkdirSync(iconsDir, { recursive: true })
            fs.writeFileSync(path.join(iconsDir, file), buffer)
            return { path: `icons/${file}` }
        },

        'GET /api/icon-library': () => ({ icons: getIconLibrary() }),

        'POST /api/device': async req => {
            const body = await readJson(req)
            try {
                onCommand?.(body)
            } catch (err) {
                throw httpError(400, err.message)
            }
            return { ok: true }
        },

        'POST /api/pick': async req => {
            const { kind = 'file', filter = 'all' } = await readJson(req)
            if (picking) throw httpError(409, 'Окно выбора уже открыто — оно может быть за окном браузера')
            picking = true
            try {
                return { path: await pickPath(kind, filter) }
            } finally {
                picking = false
            }
        },
    }

    async function handle(req, res) {
        // Защита от сайтов, которые пытаются обратиться к localhost из браузера
        if (!hosts.has(req.headers.host)) throw httpError(403, 'Доступ запрещён')
        if (req.method !== 'GET') {
            const origin = req.headers.origin
            if (origin && !hosts.has(origin.replace(/^http:\/\//, ''))) throw httpError(403, 'Доступ запрещён')
            if (!req.headers['content-type']?.startsWith('application/json')) throw httpError(415, 'Ожидается JSON')
        }
        const url = new URL(req.url, `http://${req.headers.host}`)
        const route = routes[`${req.method} ${url.pathname}`]
        if (route) return sendJson(res, 200, await route(req))

        if (req.method !== 'GET') throw httpError(404, 'Не найдено')
        const pathname = decodeURIComponent(url.pathname)

        if (pathname === '/api/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
            res.write(`retry: 2000\nevent: status\ndata: ${JSON.stringify(getStatus())}\n\n`)
            clients.add(res)
            req.on('close', () => clients.delete(res))
            return
        }
        if (pathname === '/api/icon') {
            const file = path.resolve(configDir, url.searchParams.get('path') ?? '')
            if (!IMAGE_EXT.has(path.extname(file).toLowerCase())) throw httpError(404, 'Не найдено')
            return sendFile(res, file)
        }
        if (pathname === '/shared/draw.js') return sendFile(res, path.join(appDir, 'src', 'draw.js'))
        if (pathname === '/api/media/cover') {
            const cover = getCover?.()
            if (!cover) throw httpError(404, 'Обложки нет')
            const type = cover[0] === 0x89 ? MIME['.png'] : cover[0] === 0xff ? MIME['.jpg'] : 'application/octet-stream'
            res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
            return res.end(cover)
        }

        // Иконки библиотеки не меняются, их можно кешировать
        if (pathname.startsWith('/lucide/')) {
            const file = insideDir(path.join(lucideDir, 'icons'), pathname.slice('/lucide/'.length))
            if (!file) throw httpError(404, 'Не найдено')
            return sendFile(res, file, { immutable: true })
        }
        const file = insideDir(webDir, pathname === '/' ? 'index.html' : pathname)
        if (!file) throw httpError(404, 'Не найдено')
        sendFile(res, file)
    }

    const server = http.createServer((req, res) => {
        handle(req, res).catch(err => sendJson(res, err.status ?? 500, { error: err.message }))
    })

    // Перед перезапуском утилиты порт нужно освободить, а открытые потоки событий закрыть сразу
    function close() {
        return new Promise(resolve => {
            for (const res of clients) res.end()
            server.closeAllConnections()
            server.close(() => resolve())
        })
    }

    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => {
            server.off('error', reject)
            resolve({ broadcast, close, url: `http://127.0.0.1:${port}/` })
        })
    })
}
