// Утилита биндов для Razer Stream Controller X
// Запуск: node bind.js [путь/к/config.json] [--check] [--port=3210] [--no-tray]
import canvas from 'canvas'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'
import { RazerStreamControllerX } from 'loupedeck'
import { execute, holdEnd, holdStart } from './src/actions.js'
import { createAudio } from './src/audio.js'
import { KEY_COUNT, readConfig, startPageOf } from './src/config.js'
import { DEFAULT_STYLE, SCREEN, drawKey, iconTint, innerSize, keyLook, keyRect, keyView, layoutOf, layoutProblem } from './src/draw.js'
import { createMedia } from './src/media.js'
import { APP_DIR } from './src/paths.js'
import { clearIconCache, loadIcon, measurePage } from './src/render.js'
import { startServer } from './src/server.js'
import { sampleSystem } from './src/system.js'
import { createTray } from './src/tray.js'
import { createWeather } from './src/weather.js'
import { createUpdates } from './src/updates.js'
import { toRgb565 } from './src/dither.js'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
// --restarted: запуск из пункта «Перезапустить», старая копия ещё может держать порт
const restarted = args.includes('--restarted')
const LOG_PATH = path.join(APP_DIR, 'bind.log')

// Копия после «Перезапустить» пишет в bind.log сама. Пока старая копия не вышла, файл занят:
// строки копятся и дописываются, как только он освободится
function captureLog() {
    const pending = []
    let fd = null
    const write = (...parts) => {
        const line = `${format(...parts)}\n`
        if (fd === null) pending.push(line)
        else fs.writeSync(fd, line)
    }
    console.log = write
    console.error = write
    const open = attempt => {
        try {
            fd = fs.openSync(LOG_PATH, 'a')
            for (const line of pending.splice(0)) fs.writeSync(fd, line)
        } catch {
            if (attempt < 40) setTimeout(() => open(attempt + 1), 250)
        }
    }
    open(0)
}
// --log: запуск без окна (из «Stream Controller X.exe»), журнал тоже пишем сами
if (restarted || args.includes('--log')) captureLog()
const port = Number(args.find(a => a.startsWith('--port='))?.slice('--port='.length) ?? 3210)
const configPath = path.resolve(args.find(a => !a.startsWith('--')) ?? 'config.json')
const configDir = path.dirname(configPath)

// Первый запуск (скачанный релиз): своего config.json ещё нет — берём стартовый из config.example.json
const examplePath = path.join(APP_DIR, 'config.example.json')
if (!fs.existsSync(configPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, configPath)
    console.log(`Создан ${configPath} из config.example.json`)
}

let config, version
try {
    ({ config, version } = readConfig(configPath))
} catch (err) {
    console.error(`Ошибка в ${configPath}:\n  ${err.message}`)
    process.exit(1)
}
if (checkOnly) {
    const total = Object.values(config.pages).reduce((sum, p) => sum + Object.keys(p).length, 0)
    console.log(`Конфиг в порядке: ${Object.keys(config.pages).length} стр., ${total} кнопок.`)
    process.exit(0)
}

let connected = false
let currentPage = startPageOf(config)
let pageHistory = []
const held = new Map() // кнопки с hold, которые сейчас зажаты
let audio = null
let media = null
let tray = null
let weather = null
let updates = null
let system = sampleSystem()

// Состояния переключателей, которые меняются нажатием. Запоминаются между запусками
const statePath = path.join(configDir, 'state.json')
let toggles = {}
try {
    toggles = JSON.parse(fs.readFileSync(statePath, 'utf8')).toggles ?? {}
} catch {
    // Файла ещё нет
}
let saveTimer
function saveToggles() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        try {
            fs.writeFileSync(statePath, `${JSON.stringify({ toggles }, null, 2)}\n`)
        } catch (err) {
            console.error(`Не удалось сохранить состояние кнопок: ${err.message}`)
        }
    }, 500)
}
const toggleId = (page, index) => `${page}/${index}`

// Окно ожидания и сон экрана
let lastActivity = Date.now()
let idleActive = false
let pageBeforeIdle = null
let asleep = false

// Данные для индикаторов на кнопках
const currentSources = () => ({
    audio: audio?.state ?? null,
    system: { ...system, net: media?.state.net ?? null, gpu: media?.state.gpu ?? null },
    media: media?.state.media ?? null,
    weather: weather?.state ?? null,
})

const status = () => ({
    connected,
    page: currentPage,
    toggles,
    ...currentSources(),
    idle: idleActive,
    asleep,
})

// Сервер стартует первым: занятый порт значит, что утилита уже запущена.
// После «Перезапустить» старая копия освобождает порт не мгновенно — тогда ждём до 10 с
let web
for (let attempt = 0; ; attempt++) {
    try {
        web = await startServer({
            port,
            configPath,
            getStatus: status,
            getCover: () => media?.state.cover ?? null,
            onCommand: deviceCommand,
            getUpdates: () => updates,
        })
        break
    } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err
        if (restarted && attempt < 20) {
            await new Promise(resolve => setTimeout(resolve, 500))
            continue
        }
        console.error(`Порт ${port} занят — похоже, утилита уже запущена. Конфигуратор: http://127.0.0.1:${port}/`)
        process.exit(1)
    }
}

// Команды из конфигуратора
function deviceCommand({ command, key, long, layout }) {
    switch (command) {
        case 'idle':
            if (!enterIdle()) throw new Error('Окно ожидания не настроено: выберите для него страницу')
            return
        case 'restart':
            setTimeout(restart, 100)
            return
        case 'quit':
            setTimeout(shutdown, 100)
            return
        case 'calibrate':
            calibrate(layout ?? null)
            return
        case 'press': {
            // Нажатие из конфигуратора идёт через те же обработчики, что и настоящее
            const index = Number(key)
            if (!Number.isInteger(index) || index < 0 || index >= KEY_COUNT) throw new Error('Неверный номер кнопки')
            device.emit('down', { id: index })
            setTimeout(() => device.emit('up', { id: index }), long ? (config.longPressMs ?? 500) + 150 : 80)
            return
        }
        default:
            throw new Error(`Неизвестная команда ${command}`)
    }
}

// Переподключением управляем сами: библиотека ждёт ответа на рукопожатие бесконечно
// и молча теряет его ошибки. Так бывает, если прошлый процесс сняли через Диспетчер задач
// и сессия с устройством осталась незакрытой
const device = new RazerStreamControllerX({ autoConnect: false, reconnectInterval: 0 })
const RETRY_MS = 3000
const HANDSHAKE_MS = 5000
let attempt = 0
let retryTimer = null
let lastConnectError = null
let shuttingDown = false

function scheduleConnect() {
    if (shuttingDown || retryTimer) return
    retryTimer = setTimeout(() => {
        retryTimer = null
        connectDevice()
    }, RETRY_MS)
}

// Кадр завершения сессии: после него устройство снова принимает подключения.
// Библиотека шлёт его и сразу закрывает порт, не дождавшись записи, поэтому закрываем сами
const WS_CLOSE_FRAME = Buffer.from([0x88, 0x80, 0x00, 0x00, 0x00, 0x00])

function closeSession(serial) {
    const port = serial?.connection
    if (!port?.isOpen) return Promise.resolve()
    return new Promise(resolve => {
        port.write(WS_CLOSE_FRAME)
        port.drain(() => port.close(() => resolve()))
    })
}

// Закрыть зависшую попытку подключения
function abortConnection() {
    const serial = device.connection
    device.connection = null
    closeSession(serial)
}

async function connectDevice() {
    const id = ++attempt
    device.connection = null
    let timeout
    try {
        await Promise.race([
            device.connect(),
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error('устройство не ответило на подключение')), HANDSHAKE_MS)
            }),
        ])
    } catch (err) {
        if (id !== attempt || connected) return
        const message = err?.message === 'No devices found' ? 'устройство не найдено' : String(err?.message ?? err)
        if (message !== lastConnectError) console.log(`Не удалось подключиться: ${message}. Повторяю каждые 3 с…`)
        lastConnectError = message
        abortConnection()
        scheduleConnect()
    } finally {
        clearTimeout(timeout)
    }
}

/* ---------- Отрисовка ---------- */

// Включён ли переключатель: сам по себе или по состоянию звука Windows. null — обычная кнопка
function toggleState(page, index, key) {
    if (!key?.toggle) return null
    const source = key.toggle.source ?? 'self'
    return source === 'self' ? !!toggles[toggleId(page, index)] : !!audio?.state[source]?.muted
}

const viewOf = (page, index, key, on = toggleState(page, index, key)) => keyView(key, { on, sources: currentSources() })

let labelSizes = null
const rendered = new Map() // кнопка → как она нарисована сейчас, чтобы не перерисовывать без изменений
const pressedKeys = new Set()
let cover = { id: null, image: null }

// Один размер подписей на странице. У переключателей учитываем подписи обоих состояний
function measureCurrentPage() {
    const views = []
    for (const [index, key] of Object.entries(config.pages[currentPage])) {
        const on = toggleState(currentPage, Number(index), key)
        views.push(viewOf(currentPage, Number(index), key, on))
        if (key.toggle) views.push(viewOf(currentPage, Number(index), key, !on))
    }
    labelSizes = measurePage(views, config.keyStyle ?? DEFAULT_STYLE, innerSize(config.layout))
}

async function imageFor(spec, look, style) {
    if (!spec) return null
    if (spec.cover) {
        if (cover.id !== spec.cover) {
            const buffer = media?.state.cover
            cover = { id: spec.cover, image: buffer ? await canvas.loadImage(buffer).catch(() => null) : null }
        }
        return cover.image
    }
    return loadIcon(spec, iconTint(look, style), configDir)
}

const signatureOf = view => JSON.stringify([view.look, view.meter, view.on, view.icon, view.compact, config.keyStyle, config.contentScale, config.layout, labelSizes])

// Рисуем сами, а не через device.drawKey: библиотека раскладывает клавиши по сетке 96×96,
// а видимые окошки меньше и стоят не точно по ней (раскладка — config.layout, см. src/draw.js)
async function renderKey(index, pressed = false) {
    if (calibration) return
    const style = config.keyStyle ?? DEFAULT_STYLE
    const key = config.pages[currentPage][index] ?? {}
    const view = viewOf(currentPage, index, key)
    const image = await imageFor(view.icon, view.look, style)
    if (calibration) return
    const { x, y, size, inset } = keyRect(index, config.layout)
    const { radius } = layoutOf(config.layout)
    rendered.set(index, pressed ? null : signatureOf(view))
    // Рисуем в полном цвете и сами переводим в 16 бит экрана с дизерингом — так градиенты без ступенек.
    // Вся кнопка отступает от края окошка на inset, вокруг — чёрное поле
    const keyCanvas = canvas.createCanvas(size, size)
    const ctx = keyCanvas.getContext('2d')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, size, size)
    ctx.translate(inset, inset)
    drawKey(ctx, size - 2 * inset, { view, image, style, labelSizes, pressed, scale: config.contentScale, cornerRadius: radius })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // Кнопка может заходить за край экрана (config.layout) — отправляем только видимую часть
    const left = Math.max(0, -x)
    const top = Math.max(0, -y)
    const width = Math.min(size, SCREEN.width - x) - left
    const height = Math.min(size, SCREEN.height - y) - top
    if (width <= 0 || height <= 0) return
    const { data } = ctx.getImageData(left, top, width, height)
    await device.drawBuffer({ id: 'center', x: x + left, y: y + top, width, height }, toRgb565(data, width, height, x + left, y + top))
}

// Перерисовать кнопку, только если её вид изменился: индикаторы обновляются каждую секунду
function refreshKey(index) {
    const key = config.pages[currentPage][index]
    if (!key || pressedKeys.has(index)) return
    if (rendered.get(index) === signatureOf(viewOf(currentPage, index, key))) return
    renderKey(index).catch(() => {})
}

function refreshKeys(filter) {
    if (!connected || (asleep && !(config.sleep?.brightness > 0))) return
    for (const [index, key] of Object.entries(config.pages[currentPage])) {
        if (filter(key)) refreshKey(Number(index))
    }
}

// Залить весь экран чёрным, чтобы под рамками не оставалось старого изображения
function clearScreen() {
    const { width, height } = SCREEN
    return device.drawBuffer({ id: 'center', x: 0, y: 0, width, height }, Buffer.alloc(width * height * 2))
}

/* ---------- Подгонка под рамки ---------- */

// Пока в конфигураторе открыта «Подгонка под рамки», вместо кнопок на экране мишени:
// рамка по краю каждой кнопки, крест в центре и номер. Рамку подгоняют так, чтобы она была
// видна по всем сторонам окошка одинаково. Раскладка здесь — ещё не сохранённая
let calibration = null
let calibrationTimer = null
const CALIBRATION_TIMEOUT_MS = 5 * 60 * 1000

async function drawCalibration() {
    const { width, height } = SCREEN
    const screen = canvas.createCanvas(width, height)
    const ctx = screen.getContext('2d')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
    for (let i = 0; i < KEY_COUNT; i++) {
        const { x, y, size, inset } = keyRect(i, calibration)
        // Заливка — где будет сама кнопка (с отступом и скруглением), рамка — край окошка
        ctx.fillStyle = '#1b2a1f'
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset, calibration.radius)
        else ctx.rect(x + inset, y + inset, size - 2 * inset, size - 2 * inset)
        ctx.fill()
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 2
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + size / 2, y + size * 0.3)
        ctx.lineTo(x + size / 2, y + size * 0.7)
        ctx.moveTo(x + size * 0.3, y + size / 2)
        ctx.lineTo(x + size * 0.7, y + size / 2)
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.round(size * 0.18)}px "Segoe UI", sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(String(i), x + 6, y + 5)
    }
    const { data } = ctx.getImageData(0, 0, width, height)
    await device.drawBuffer({ id: 'center', x: 0, y: 0, width, height }, toRgb565(data, width, height))
}

// layout — раскладка для примерки, null — закончить и вернуть кнопки
function calibrate(layout) {
    clearTimeout(calibrationTimer)
    if (!layout) {
        if (!calibration) return
        calibration = null
        if (connected) clearScreen().then(renderPage).catch(err => console.error(err.message))
        return
    }
    const problem = layoutProblem(layout)
    if (problem) throw new Error(`Раскладка: ${problem}`)
    calibration = layoutOf(layout)
    wake()
    // Если конфигуратор закрыли, не дождавшись «Готово», кнопки вернутся сами
    calibrationTimer = setTimeout(() => calibrate(null), CALIBRATION_TIMEOUT_MS)
    if (connected) drawCalibration().catch(err => console.error(`Не удалось показать разметку: ${err.message}`))
}

async function renderPage() {
    if (calibration) return drawCalibration()
    rendered.clear()
    measureCurrentPage()
    for (let i = 0; i < KEY_COUNT; i++) {
        try {
            await renderKey(i)
        } catch (err) {
            console.error(`Не удалось нарисовать кнопку ${i}: ${err.message}`)
        }
    }
}

function switchPage(name) {
    if (name === 'back') {
        if (!pageHistory.length) return
        currentPage = pageHistory.pop()
    } else {
        if (name === currentPage) return
        pageHistory.push(currentPage)
        currentPage = name
    }
    console.log(`Страница: ${currentPage}`)
    web.broadcast('status', status())
    return renderPage()
}

/* ---------- Окно ожидания и сон ---------- */

const normalBrightness = () => (config.brightness ?? 10) / 10
// Экран во сне погашен совсем: первое нажатие только будит
const screenDark = () => asleep && !(config.sleep?.brightness > 0)

function enterIdle() {
    const page = config.idle?.page
    if (!config.pages[page]) return false
    if (idleActive) return true
    idleActive = true
    pageBeforeIdle = currentPage
    currentPage = page
    console.log('Окно ожидания')
    web.broadcast('status', status())
    if (connected) renderPage()
    return true
}

function exitIdle() {
    if (!idleActive) return
    idleActive = false
    currentPage = config.pages[pageBeforeIdle] ? pageBeforeIdle : startPageOf(config)
    web.broadcast('status', status())
    if (connected) renderPage()
}

function fallAsleep() {
    asleep = true
    console.log('Сон экрана')
    device.setBrightness((config.sleep?.brightness ?? 0) / 10)
    web.broadcast('status', status())
}

function wake() {
    if (!asleep) return
    asleep = false
    device.setBrightness(normalBrightness())
    web.broadcast('status', status())
    // Пока экран был погашен, индикаторы не обновлялись
    refreshKeys(key => !!key.meter)
}

function checkIdle() {
    const idleFor = Date.now() - lastActivity
    const { idle, sleep } = config
    if (!idleActive && idle?.after > 0 && config.pages[idle.page] && idleFor >= idle.after * 1000) enterIdle()
    if (!asleep && sleep?.after > 0 && idleFor >= sleep.after * 60000) fallAsleep()
}

/* ---------- Нажатия ---------- */

const actionContext = {
    switchPage,
    get audio() { return audio },
    get media() { return media },
}

async function runAction(action, id) {
    try {
        await execute(action, actionContext)
    } catch (err) {
        console.error(`Ошибка на кнопке ${id}: ${err.message}`)
    }
}

// Обычное (короткое) нажатие
async function press(page, id, key) {
    const on = toggleState(page, id, key)
    // У включённого переключателя может быть своё действие
    let action = keyLook(key, on).action
    // «Сейчас играет» без своего действия ставит музыку на паузу и снимает с неё
    if (!action && key.meter === 'nowPlaying') action = { type: 'media', command: 'playpause' }
    if (action?.hold && !key.toggle) {
        try {
            holdStart(action)
            held.set(id, action)
        } catch (err) {
            console.error(`Ошибка на кнопке ${id}: ${err.message}`)
        }
    } else if (action) {
        await runAction(action, id)
        // Громкость, пока кнопку держат, меняется дальше — как при удержании клавиши на клавиатуре
        if (REPEATABLE.has(action.type) && pressedKeys.has(id) && !repeaters.has(id)) {
            const repeat = () => {
                if (!pressedKeys.has(id)) return repeaters.delete(id)
                runAction(action, id)
                repeaters.set(id, setTimeout(repeat, REPEAT_EVERY_MS))
            }
            repeaters.set(id, setTimeout(repeat, REPEAT_DELAY_MS))
        }
    }
    // Переключатель без привязки к Windows меняет состояние при каждом нажатии
    if (key.toggle && (key.toggle.source ?? 'self') === 'self') {
        toggles[toggleId(page, id)] = !on
        saveToggles()
        web.broadcast('status', status())
        if (currentPage === page && !pressedKeys.has(id)) renderKey(id).catch(() => {})
    }
}

// Повтор при удержании: первый повтор через REPEAT_DELAY_MS, дальше каждые REPEAT_EVERY_MS
const REPEATABLE = new Set(['volume'])
const REPEAT_DELAY_MS = 400
const REPEAT_EVERY_MS = 100
const repeaters = new Map() // кнопка → таймер следующего повтора

function stopRepeat(id) {
    clearTimeout(repeaters.get(id))
    repeaters.delete(id)
}

const consumedKeys = new Set() // нажатия, которые только разбудили экран
const longPresses = new Map() // кнопки с долгим нажатием, которые сейчас зажаты

device.on('connect', async () => {
    connected = true
    lastConnectError = null
    console.log('Razer Stream Controller X подключён')
    web.broadcast('status', status())
    tray?.setStatus('устройство подключено', true)
    await device.setBrightness(asleep ? (config.sleep?.brightness ?? 0) / 10 : normalBrightness())
    try {
        await clearScreen()
    } catch (err) {
        console.error(`Не удалось очистить экран: ${err.message}`)
    }
    await renderPage()
})

device.on('disconnect', () => {
    if (connected) {
        connected = false
        console.log('Устройство отключено, переподключаюсь…')
        web.broadcast('status', status())
        tray?.setStatus('устройство не найдено', false)
    }
    scheduleConnect()
})

device.on('down', ({ id }) => {
    if (typeof id !== 'number') return
    lastActivity = Date.now()
    // Первое нажатие в окне ожидания или на погашенном экране только возвращает кнопки
    const consume = idleActive || screenDark()
    wake()
    if (consume) {
        exitIdle()
        consumedKeys.add(id)
        return
    }
    const page = currentPage
    const key = config.pages[page][id]
    console.log(`Кнопка ${id}${key?.label ? ` (${key.label.replace(/\n/g, ' ')})` : ''}`)
    pressedKeys.add(id)
    web.broadcast('press', { key: id, page })
    renderKey(id, true).catch(() => {})
    if (!key) return
    // С долгим нажатием обычное действие выполняется при отпускании, если кнопку не держали
    if (key.longPress && !keyLook(key, toggleState(page, id, key)).action?.hold) {
        const entry = { page, key, fired: false }
        entry.timer = setTimeout(() => {
            entry.fired = true
            console.log(`Кнопка ${id}: долгое нажатие`)
            if (currentPage === page) renderKey(id, 'long').catch(() => {})
            runAction(key.longPress, id)
        }, config.longPressMs ?? 500)
        longPresses.set(id, entry)
        return
    }
    press(page, id, key)
})

device.on('up', ({ id }) => {
    if (typeof id !== 'number') return
    pressedKeys.delete(id)
    stopRepeat(id)
    if (consumedKeys.delete(id)) return
    const long = longPresses.get(id)
    if (long) {
        clearTimeout(long.timer)
        longPresses.delete(id)
        if (!long.fired) press(long.page, id, long.key)
    }
    const action = held.get(id)
    if (action) {
        held.delete(id)
        try { holdEnd(action) } catch (err) { console.error(err.message) }
    }
    // Если кнопка сменила страницу, её уже перерисовал renderPage
    renderKey(id).catch(() => {})
})

// Перезагрузка конфига при сохранении файла (вручную или из конфигуратора)
let reloadTimer
fs.watch(configPath, () => {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
        try {
            const loaded = readConfig(configPath)
            if (loaded.version === version) return
            const layoutChanged = JSON.stringify(layoutOf(config.layout)) !== JSON.stringify(layoutOf(loaded.config.layout))
            ;({ config, version } = loaded)
            // Сохранили — подгонка закончена. Если раскладка сменилась, стираем кнопки на старых местах
            clearTimeout(calibrationTimer)
            const wasCalibrating = !!calibration
            calibration = null
            clearIconCache()
            // После правки показываем кнопки, а не окно ожидания
            lastActivity = Date.now()
            if (idleActive) {
                idleActive = false
                currentPage = pageBeforeIdle
            }
            if (!config.pages[currentPage]) currentPage = startPageOf(config)
            pageHistory = pageHistory.filter(name => config.pages[name])
            weather?.setPlace(config.weather)
            console.log('Конфиг перезагружен')
            web.broadcast('config', { version })
            wake()
            web.broadcast('status', status())
            device.setBrightness(normalBrightness())
            if (connected) {
                if (layoutChanged || wasCalibrating) clearScreen().then(renderPage).catch(err => console.error(err.message))
                else renderPage()
            }
        } catch (err) {
            console.error(`Конфиг не перезагружен — ошибка:\n  ${err.message}`)
        }
    }, 300)
})

// Корректная остановка: отпустить клавиши, убрать значок, закрыть сессию с устройством
async function stop() {
    shuttingDown = true
    clearTimeout(retryTimer)
    for (const action of held.values()) holdEnd(action)
    for (const id of [...repeaters.keys()]) stopRepeat(id)
    media?.close()
    tray?.close()
    // Дождаться, пока уйдёт кадр завершения сессии, чтобы следующий запуск подключился сразу
    await Promise.race([closeSession(device.connection), new Promise(resolve => setTimeout(resolve, 500))])
}

async function shutdown() {
    console.log('Выход')
    await stop()
    process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Новая копия запускается без окна, журнал она открывает сама (captureLog). node запускаем напрямую:
// через «cmd /c … >> bind.log» отсоединённая копия не переживает выход старой
async function restart() {
    console.log('Перезапуск…')
    await stop()
    await web.close()
    const scriptArgs = process.argv.slice(1).filter(arg => arg !== '--restarted')
    spawn(process.execPath, [...scriptArgs, '--restarted'], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    }).unref()
    process.exit(0)
}

// Открыть ссылку или файл программой по умолчанию
const openExternal = target => spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref()

/* ---------- Источники данных ---------- */

const isAudioKey = key => key.meter === 'volume' || key.meter === 'mic' || key.toggle?.source === 'speakers' || key.toggle?.source === 'mic'

try {
    // Громкость или «без звука» изменились: перерисовать индикаторы и переключатели звука
    audio = createAudio({
        onChange: () => {
            web.broadcast('status', status())
            refreshKeys(isAudioKey)
        },
    })
} catch (err) {
    console.error(`Управление громкостью недоступно: ${err.message}`)
}

media = createMedia({
    onChange: () => {
        web.broadcast('status', status())
        refreshKeys(key => key.meter === 'nowPlaying')
    },
})

weather = createWeather({
    onChange: () => {
        web.broadcast('status', status())
        refreshKeys(key => key.meter === 'weather')
    },
})
weather.setPlace(config.weather)

// Обновления с GitHub: проверка при запуске и раз в 12 часов, установка — из конфигуратора
updates = createUpdates({
    onChange: state => {
        web.broadcast('update', state)
        tray?.setUpdate(state.available ? state.latest.version : null)
    },
    restart: () => restart(),
    shutdown: () => shutdown(),
})

// Раз в секунду: загрузка системы, часы, окно ожидания и сон
setInterval(() => {
    system = sampleSystem()
    checkIdle()
    web.broadcast('status', status())
    refreshKeys(key => !!key.meter)
}, 1000)

// Значок в трее: левый клик открывает конфигуратор, правый — меню
if (!args.includes('--no-tray')) {
    tray = createTray({
        // Автозапуск через exe, если он собран, иначе через start-hidden.vbs
        launcher: [path.join(APP_DIR, 'Stream Controller X.exe'), path.join(APP_DIR, 'start-hidden.vbs')].find(file => fs.existsSync(file)),
        onCommand: command => {
            switch (command) {
                case 'open': return openExternal(web.url)
                case 'update': return openExternal(`${web.url}#updates`)
                case 'log': return openExternal(LOG_PATH)
                case 'idle': return enterIdle()
                case 'restart': return restart()
                case 'quit': return shutdown()
            }
        },
    })
    tray.setStatus('ищу устройство…', false)
    if (updates.state.available) tray.setUpdate(updates.state.latest.version)
}

console.log(`Конфиг: ${configPath}\nКонфигуратор: ${web.url}\nИщу устройство… (Ctrl+C — выход)`)
connectDevice()
