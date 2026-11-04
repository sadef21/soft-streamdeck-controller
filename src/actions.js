// Выполнение действий, назначенных на кнопки
import { spawn } from 'node:child_process'
import path from 'node:path'
import koffi from 'koffi'
import { keysDown, keysUp, parseCombo, tapCombo, typeText } from './keyboard.js'

// Win+L, отправленное программой, Windows игнорирует, поэтому блокируем напрямую
const LockWorkStation = koffi.load('user32.dll').func('int __stdcall LockWorkStation()')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function systemCommand(command) {
    if (command === 'lock' && !LockWorkStation()) throw new Error('Windows не дала заблокировать компьютер')
}

function launch(cmd, args, options = {}) {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false, ...options })
    child.on('error', err => console.error(`Не удалось запустить ${cmd}: ${err.message}`))
    child.unref()
}

// Открыть URL, файл или папку программой по умолчанию
function open(target) {
    launch('explorer.exe', [target])
}

function run({ path: file, args = [], cwd }) {
    const ext = path.extname(file).toLowerCase()
    const options = { cwd: cwd || path.dirname(file) }
    if (ext === '.exe') return launch(file, args, options)
    if (ext === '.bat' || ext === '.cmd') return launch('cmd.exe', ['/c', file, ...args], options)
    if (ext === '.ps1') return launch('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', file, ...args], options)
    // Ярлыки .lnk, документы и прочее — через оболочку Windows
    open(file)
}

// Вывести окно плеера: Spotify — по своей ссылке, остальные — по идентификатору приложения Windows
function openPlayer(app) {
    if (!app) throw new Error('сейчас ничего не играет')
    if (/spotify/i.test(app)) return open('spotify:')
    open(`shell:AppsFolder\\${app}`)
}

function audioOf(ctx) {
    if (!ctx.audio) throw new Error('управление громкостью недоступно')
    return ctx.audio
}

// open — вывести окно плеера, seek — перемотать на seconds (минус — назад)
const MEDIA_COMMANDS = ['playpause', 'next', 'prev', 'seek', 'shuffle', 'repeat', 'open']

// ctx: { switchPage(name), openPanel(panel), audio, media } — то, что действию нужно от основного цикла
export async function execute(action, ctx) {
    switch (action.type) {
        case 'hotkey': return tapCombo(action.keys)
        case 'text': return typeText(action.text)
        case 'run': return run(action)
        case 'open': return open(action.target)
        case 'delay': return sleep(action.ms)
        case 'page': return ctx.switchPage(action.page)
        case 'volume': return audioOf(ctx).changeVolume(action.target ?? 'speakers', action.step)
        case 'volumeSet': {
            // Точный уровень (пресеты регулятора). Ненулевой уровень включает звук, как прибавление громкости
            const audio = audioOf(ctx)
            const target = action.target ?? 'speakers'
            audio.setVolume(target, action.value)
            if (action.value > 0 && audio.state[target]?.muted) audio.setMute(target, false)
            return
        }
        // Регулятор громкости во весь экран (bind.js); без target — закрыть открытую панель
        case 'mixer': return ctx.openPanel(action.target ? { kind: 'volume', target: action.target } : null)
        case 'mute': return audioOf(ctx).toggleMute(action.target ?? 'speakers')
        case 'media':
            if (!ctx.media) throw new Error('управление плеером недоступно')
            if (action.command === 'seek') return ctx.media.command(`seek ${action.seconds}`)
            if (action.command === 'open') return openPlayer(ctx.media.state.media?.app)
            return ctx.media.command(action.command)
        case 'player': return ctx.openPanel({ kind: 'player' })
        case 'system': return systemCommand(action.command)
        case 'macro':
            for (const step of action.steps) {
                await execute(step, ctx)
                if (action.stepDelay) await sleep(action.stepDelay)
            }
            return
        default:
            throw new Error(`Неизвестный тип действия "${action.type}"`)
    }
}

// Удержание: клавиши зажаты, пока зажата кнопка (push-to-talk и т.п.)
export function holdStart(action) {
    keysDown(parseCombo(action.keys))
}

export function holdEnd(action) {
    keysUp(parseCombo(action.keys))
}

// Проверка конфига заранее, чтобы ошибки были видны при запуске, а не при нажатии
export function validate(action, where, pages) {
    const fail = msg => { throw new Error(`${where}: ${msg}`) }
    if (!action || typeof action !== 'object') fail('нет "action"')
    switch (action.type) {
        case 'hotkey': {
            if (typeof action.keys !== 'string') fail('у "hotkey" должно быть поле "keys"')
            let codes
            try { codes = parseCombo(action.keys) } catch (err) { fail(err.message) }
            if (!codes.length) fail('сочетание клавиш не задано')
            break
        }
        case 'text':
            if (typeof action.text !== 'string' || !action.text) fail('у "text" должно быть поле "text" с текстом')
            break
        case 'run':
            if (typeof action.path !== 'string' || !action.path) fail('у "run" должно быть поле "path" с путём к программе')
            if (action.args && !Array.isArray(action.args)) fail('"args" должен быть массивом')
            break
        case 'open':
            if (typeof action.target !== 'string' || !action.target) fail('у "open" должно быть поле "target" — что открыть')
            break
        case 'delay':
            if (typeof action.ms !== 'number') fail('у "delay" должно быть числовое поле "ms"')
            break
        case 'page':
            if (action.page !== 'back' && !pages[action.page]) fail(`страница "${action.page}" не найдена`)
            break
        case 'volume':
            if (typeof action.step !== 'number' || !action.step || Math.abs(action.step) > 100) {
                fail('у "volume" должно быть поле "step" — шаг в процентах, например 5 или -5')
            }
            if (action.target !== undefined && action.target !== 'speakers' && action.target !== 'mic') {
                fail('"target" должен быть "speakers" (звук) или "mic" (микрофон)')
            }
            break
        case 'mute':
        case 'mixer':
            if (action.target !== undefined && action.target !== 'speakers' && action.target !== 'mic') {
                fail('"target" должен быть "speakers" (звук) или "mic" (микрофон)')
            }
            break
        case 'volumeSet':
            if (typeof action.value !== 'number' || action.value < 0 || action.value > 100) fail('у "volumeSet" должно быть поле "value" от 0 до 100')
            if (action.target !== undefined && action.target !== 'speakers' && action.target !== 'mic') {
                fail('"target" должен быть "speakers" (звук) или "mic" (микрофон)')
            }
            break
        case 'media':
            if (!MEDIA_COMMANDS.includes(action.command)) {
                fail(`"command" должен быть одним из: ${MEDIA_COMMANDS.map(c => `"${c}"`).join(', ')}`)
            }
            if (action.command === 'seek' && !(typeof action.seconds === 'number' && action.seconds)) {
                fail('у перемотки ("seek") должно быть поле "seconds", например 10 или -10')
            }
            break
        case 'player':
            break
        case 'system':
            if (action.command !== 'lock') fail('"command" должен быть "lock" (заблокировать компьютер)')
            break
        case 'macro':
            if (!Array.isArray(action.steps)) fail('у "macro" должен быть массив "steps"')
            action.steps.forEach((step, i) => validate(step, `${where} → шаг ${i + 1}`, pages))
            break
        default:
            fail(`неизвестный тип действия "${action.type}"`)
    }
    if (action.hold && action.type !== 'hotkey') fail('"hold" работает только с "hotkey"')
}
