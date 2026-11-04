// Клавиши для редактора сочетаний. Названия совпадают с src/keyboard.js

export const MODIFIERS = [
    { name: 'ctrl', label: 'Ctrl' },
    { name: 'shift', label: 'Shift' },
    { name: 'alt', label: 'Alt' },
    { name: 'win', label: 'Win' },
]
const MODIFIER_ALIASES = { ctrl: 'ctrl', control: 'ctrl', shift: 'shift', alt: 'alt', win: 'win', meta: 'win' }

const range = (from, to, fn) => Array.from({ length: to - from + 1 }, (_, i) => fn(from + i))

export const KEY_GROUPS = [
    { label: 'Буквы', keys: range(0, 25, i => String.fromCharCode(97 + i)).map(c => [c, c.toUpperCase()]) },
    { label: 'Цифры', keys: range(0, 9, i => [String(i), String(i)]) },
    { label: 'F-клавиши', keys: range(1, 24, i => [`f${i}`, `F${i}`]) },
    {
        label: 'Мультимедиа',
        keys: [['playpause', 'Play / Pause'], ['nexttrack', 'Следующий трек'], ['prevtrack', 'Предыдущий трек'],
            ['stop', 'Стоп'], ['volumeup', 'Громче'], ['volumedown', 'Тише'], ['mute', 'Без звука']],
    },
    {
        label: 'Управление',
        keys: [['enter', 'Enter'], ['esc', 'Esc'], ['tab', 'Tab'], ['space', 'Пробел'], ['backspace', 'Backspace'],
            ['delete', 'Delete'], ['insert', 'Insert'], ['printscreen', 'PrintScreen'], ['pause', 'Pause'],
            ['capslock', 'CapsLock'], ['numlock', 'NumLock'], ['scrolllock', 'ScrollLock'], ['apps', 'Меню (Apps)']],
    },
    {
        label: 'Навигация',
        keys: [['up', '↑ Вверх'], ['down', '↓ Вниз'], ['left', '← Влево'], ['right', '→ Вправо'],
            ['home', 'Home'], ['end', 'End'], ['pageup', 'PageUp'], ['pagedown', 'PageDown']],
    },
    {
        label: 'Цифровой блок',
        keys: [...range(0, 9, i => [`num${i}`, `Num ${i}`]), ['numadd', 'Num +'], ['numsubtract', 'Num −'],
            ['nummultiply', 'Num *'], ['numdivide', 'Num /'], ['numdecimal', 'Num .']],
    },
    {
        label: 'Знаки',
        keys: [['minus', '-'], ['equals', '='], ['[', '['], [']', ']'], ['\\', '\\'], [';', ';'], ["'", "'"],
            ['comma', ','], ['period', '.'], ['slash', '/'], ['backquote', '`']],
    },
]

const LABELS = new Map(KEY_GROUPS.flatMap(g => g.keys))
MODIFIERS.forEach(m => LABELS.set(m.name, m.label))

// KeyboardEvent.code (физическая клавиша, не зависит от раскладки) -> название
const CODES = {
    Enter: 'enter', NumpadEnter: 'enter', Escape: 'esc', Tab: 'tab', Space: 'space', Backspace: 'backspace',
    Delete: 'delete', Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    PrintScreen: 'printscreen', Pause: 'pause', CapsLock: 'capslock', NumLock: 'numlock', ScrollLock: 'scrolllock',
    ContextMenu: 'apps', Minus: 'minus', Equal: 'equals', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Semicolon: ';', Quote: "'", Comma: 'comma', Period: 'period', Slash: 'slash', Backquote: 'backquote',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsubtract', NumpadMultiply: 'nummultiply', NumpadDivide: 'numdivide',
    NumpadDecimal: 'numdecimal', MediaPlayPause: 'playpause', MediaTrackNext: 'nexttrack',
    MediaTrackPrevious: 'prevtrack', MediaStop: 'stop', AudioVolumeUp: 'volumeup', AudioVolumeDown: 'volumedown',
    AudioVolumeMute: 'mute',
}

export const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'])

export function keyFromCode(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
    if (/^Digit\d$/.test(code)) return code.slice(5)
    if (/^Numpad\d$/.test(code)) return `num${code.slice(6)}`
    if (/^F\d{1,2}$/.test(code)) return code.toLowerCase()
    return CODES[code] ?? null
}

// "ctrl+shift+m" -> { mods: Set(['ctrl', 'shift']), keys: ['m'] }
export function parseCombo(combo) {
    const mods = new Set()
    const keys = []
    for (const token of (combo ?? '').toLowerCase().split('+').map(s => s.trim()).filter(Boolean)) {
        if (MODIFIER_ALIASES[token]) mods.add(MODIFIER_ALIASES[token])
        else keys.push(token)
    }
    return { mods, keys }
}

export function buildCombo(mods, keys) {
    return [...MODIFIERS.map(m => m.name).filter(name => mods.has(name)), ...keys].join('+')
}

export function keyLabel(name) {
    return LABELS.get(name) ?? name
}
