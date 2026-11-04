// Эмуляция клавиатуры через WinAPI SendInput (user32.dll)
import koffi from 'koffi'

const user32 = koffi.load('user32.dll')

const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
    wVk: 'uint16',
    wScan: 'uint16',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
})
const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
    dx: 'long',
    dy: 'long',
    mouseData: 'uint32',
    dwFlags: 'uint32',
    time: 'uint32',
    dwExtraInfo: 'uintptr_t',
})
const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
    uMsg: 'uint32',
    wParamL: 'uint16',
    wParamH: 'uint16',
})
const INPUT = koffi.struct('INPUT', {
    type: 'uint32',
    u: koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
})

const SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)')

const INPUT_KEYBOARD = 1
const KEYEVENTF_EXTENDEDKEY = 0x1
const KEYEVENTF_KEYUP = 0x2
const KEYEVENTF_UNICODE = 0x4

// Названия клавиш -> виртуальные коды Windows
export const VK = {
    ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b, meta: 0x5b,
    lctrl: 0xa2, rctrl: 0xa3, lshift: 0xa0, rshift: 0xa1, lalt: 0xa4, ralt: 0xa5, rwin: 0x5c,
    enter: 0x0d, return: 0x0d, esc: 0x1b, escape: 0x1b, tab: 0x09, space: 0x20,
    backspace: 0x08, delete: 0x2e, del: 0x2e, insert: 0x2d, ins: 0x2d,
    home: 0x24, end: 0x23, pageup: 0x21, pgup: 0x21, pagedown: 0x22, pgdn: 0x22,
    up: 0x26, down: 0x28, left: 0x25, right: 0x27,
    capslock: 0x14, numlock: 0x90, scrolllock: 0x91, printscreen: 0x2c, prtsc: 0x2c, pause: 0x13,
    apps: 0x5d, menu: 0x5d,
    // Мультимедиа
    volumeup: 0xaf, volumedown: 0xae, mute: 0xad,
    playpause: 0xb3, nexttrack: 0xb0, prevtrack: 0xb1, stop: 0xb2,
    // Знаки (US-раскладка физических клавиш)
    minus: 0xbd, '-': 0xbd, equals: 0xbb, '=': 0xbb, plus: 0xbb,
    '[': 0xdb, ']': 0xdd, '\\': 0xdc, ';': 0xba, "'": 0xde,
    ',': 0xbc, comma: 0xbc, '.': 0xbe, period: 0xbe, '/': 0xbf, slash: 0xbf, '`': 0xc0, backquote: 0xc0,
    // Цифровой блок
    num0: 0x60, num1: 0x61, num2: 0x62, num3: 0x63, num4: 0x64,
    num5: 0x65, num6: 0x66, num7: 0x67, num8: 0x68, num9: 0x69,
    nummultiply: 0x6a, numadd: 0x6b, numsubtract: 0x6d, numdecimal: 0x6e, numdivide: 0x6f,
}
for (let i = 0; i < 26; i++) VK[String.fromCharCode(97 + i)] = 0x41 + i
for (let i = 0; i <= 9; i++) VK[String(i)] = 0x30 + i
for (let i = 1; i <= 24; i++) VK[`f${i}`] = 0x6f + i

// Клавиши, которым нужен флаг "extended", иначе Windows путает их с цифровым блоком
const EXTENDED = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e,
    0xa3, 0xa5, 0x5b, 0x5c, 0x5d, 0x6f, 0x90, 0x2c])

export function parseCombo(combo) {
    return combo.toLowerCase().split('+').map(s => s.trim()).filter(Boolean).map(name => {
        const code = VK[name]
        if (code === undefined) throw new Error(`Неизвестная клавиша "${name}" в "${combo}"`)
        return code
    })
}

function keyInput(vk, up) {
    let flags = up ? KEYEVENTF_KEYUP : 0
    if (EXTENDED.has(vk)) flags |= KEYEVENTF_EXTENDEDKEY
    return { type: INPUT_KEYBOARD, u: { ki: { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }
}

function send(inputs) {
    if (!inputs.length) return
    const sent = SendInput(inputs.length, inputs, koffi.sizeof(INPUT))
    if (sent !== inputs.length) {
        throw new Error('SendInput заблокирован (возможно, активное окно запущено от администратора)')
    }
}

export function keysDown(codes) {
    send(codes.map(vk => keyInput(vk, false)))
}

export function keysUp(codes) {
    send([...codes].reverse().map(vk => keyInput(vk, true)))
}

// Нажать и отпустить сочетание, например "ctrl+shift+m"
export function tapCombo(combo) {
    const codes = parseCombo(combo)
    keysDown(codes)
    keysUp(codes)
}

// Напечатать произвольный текст (любой язык, не зависит от раскладки)
export function typeText(text) {
    const inputs = []
    for (const ch of text.replace(/\r\n/g, '\n')) {
        if (ch === '\n') {
            inputs.push(keyInput(VK.enter, false), keyInput(VK.enter, true))
            continue
        }
        // Символы вне BMP (эмодзи) идут двумя суррогатными половинами
        for (let i = 0; i < ch.length; i++) {
            const code = ch.charCodeAt(i)
            for (const up of [false, true]) {
                inputs.push({
                    type: INPUT_KEYBOARD,
                    u: { ki: { wVk: 0, wScan: code, dwFlags: KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0), time: 0, dwExtraInfo: 0 } },
                })
            }
        }
    }
    send(inputs)
}
