// Отрисовка кнопки на canvas. Общий код для устройства (node-canvas) и веб-конфигуратора (браузер),
// поэтому здесь не должно быть импортов Node.js

// Экран Razer Stream Controller X — 480×288 (так его описывает @loupedeck/node), над ним рамка с окошками
// под клавиши. Сколько экрана видно в окошке и где оно, зависит от экземпляра, поэтому раскладка
// настраивается (config.layout, «Подгонка под рамки» в конфигураторе). Окошки стоят не строго
// равномерно, поэтому у каждой колонки и каждого ряда своё положение:
// columns — левый край каждой из 5 колонок, rows — верхний край каждого из 3 рядов, size — сторона окошка.
// inset — отступ всей кнопки (с фоном и рамкой темы) от края окошка: вокруг остаётся чёрное поле,
// край окошка в рамке слегка закрывает экран
export const KEY_SIZE = 78
export const SCREEN = { width: 480, height: 288, columns: 5, rows: 3 }
// radius — скругление углов кнопки в пикселях экрана (у стиля «Плоские» углов нет)
export const DEFAULT_LAYOUT = { columns: [7, 104, 201, 298, 395], rows: [0, 96, 192], size: KEY_SIZE, inset: 1, radius: 8 }
export const LAYOUT_SIZE_LIMITS = [60, 96]
export const LAYOUT_INSET_LIMITS = [0, 12]
export const LAYOUT_RADIUS_LIMITS = [0, 24]
// Окошко у края может начинаться за краем экрана (у первого ряда — выше него). Тогда кнопка
// заходит за край, а рисуется только её видимая часть (см. renderKey в bind.js)
export const LAYOUT_OVERHANG = 20

const evenly = (start, step, count) => Array.from({ length: count }, (_, i) => start + i * step)

// Полная раскладка: недостающее — по умолчанию. Понимает и старую запись { x, y, stepX, stepY }
export function layoutOf(layout) {
    const l = layout ?? {}
    const legacyX = l.x !== undefined || l.stepX !== undefined
    const legacyY = l.y !== undefined || l.stepY !== undefined
    return {
        columns: l.columns ?? (legacyX ? evenly(l.x ?? 7, l.stepX ?? 97, SCREEN.columns) : DEFAULT_LAYOUT.columns),
        rows: l.rows ?? (legacyY ? evenly(l.y ?? 0, l.stepY ?? 96, SCREEN.rows) : DEFAULT_LAYOUT.rows),
        size: l.size ?? DEFAULT_LAYOUT.size,
        inset: l.inset ?? DEFAULT_LAYOUT.inset,
        radius: l.radius ?? DEFAULT_LAYOUT.radius,
    }
}

// Что не так с раскладкой, или null. Кнопки не должны выходить за экран: за его краем устройство не рисует
export function layoutProblem(layout) {
    if (!layout || typeof layout !== 'object') return 'должна быть объектом: { "columns": [7, 104, 201, 298, 395], "rows": [0, 96, 192], "size": 78 }'
    const { size } = layout
    const [minSize, maxSize] = LAYOUT_SIZE_LIMITS
    if (size !== undefined && !(Number.isInteger(size) && size >= minSize && size <= maxSize)) return `"size" — целое число от ${minSize} до ${maxSize}`
    const [minInset, maxInset] = LAYOUT_INSET_LIMITS
    const { inset } = layout
    if (inset !== undefined && !(Number.isInteger(inset) && inset >= minInset && inset <= maxInset)) return `"inset" — целое число от ${minInset} до ${maxInset}`
    const [minRadius, maxRadius] = LAYOUT_RADIUS_LIMITS
    const { radius } = layout
    if (radius !== undefined && !(Number.isInteger(radius) && radius >= minRadius && radius <= maxRadius)) return `"radius" — целое число от ${minRadius} до ${maxRadius}`
    for (const [field, count] of [['columns', SCREEN.columns], ['rows', SCREEN.rows]]) {
        const list = layout[field]
        if (list !== undefined && !(Array.isArray(list) && list.length === count && list.every(Number.isInteger))) {
            return `"${field}" — ${count} целых чисел`
        }
    }
    for (const field of ['x', 'y', 'stepX', 'stepY']) {
        if (layout[field] !== undefined && !Number.isInteger(layout[field])) return `"${field}" — целое число`
    }
    const full = layoutOf(layout)
    const out = (start, limit) => start < -LAYOUT_OVERHANG || start + full.size > limit + LAYOUT_OVERHANG
    if (full.columns.some(x => out(x, SCREEN.width))) return `колонки заходят за край экрана больше чем на ${LAYOUT_OVERHANG} px`
    if (full.rows.some(y => out(y, SCREEN.height))) return `ряды заходят за край экрана больше чем на ${LAYOUT_OVERHANG} px`
    return null
}

// Положение клавиши на экране устройства
export function keyRect(index, layout) {
    const { columns, rows, size, inset } = layoutOf(layout)
    return { x: columns[index % SCREEN.columns], y: rows[Math.floor(index / SCREEN.columns)], size, inset }
}

// Сторона самой кнопки внутри окошка — за вычетом отступа
export const innerSize = layout => {
    const { size, inset } = layoutOf(layout)
    return size - 2 * inset
}

// Доля клавиши под подпись и иконку. Можно уменьшить, если края закрывает рамка клавиши
export const DEFAULT_CONTENT_SCALE = 1

// Тёмные (цвет кнопки — акцент: иконка, кольца, огоньки):
//   graphite — тёмные однотипные кнопки с подсветкой за иконкой; neon — чёрные со светящейся рамкой;
//   black — просто чёрные, на экране видны только иконки и подписи.
// Цветные (заливка цветом кнопки, содержимое — цветом текста):
//   glass — со стеклянным бликом; gradient — с диагональным переливом; flat — плоская заливка без скруглений.
// Светлые: light — бледная заливка оттенком цвета, иконки и кольца — его тёмным оттенком
export const STYLES = ['graphite', 'neon', 'black', 'glass', 'gradient', 'flat', 'light']
export const DEFAULT_STYLE = 'graphite'
const STYLE_KIND = { graphite: 'dark', neon: 'dark', black: 'dark', glass: 'fill', gradient: 'fill', flat: 'fill', light: 'light' }
// 'dark' | 'fill' | 'light' — от этого зависят цвета содержимого и поля в конфигураторе
export const styleKind = style => STYLE_KIND[style] ?? 'dark'

const FONT = '"Segoe UI", sans-serif'
const GRAPHITE_TEXT = '#e7eaf0'
const LIGHT_TEXT = '#1c1f26'
const fontWeight = style => (styleKind(style) === 'fill' ? 'bold' : 600)

/* ---------- Цвета ---------- */

function parseHex(color) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color ?? '')
    if (!match) return null
    const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join('') : match[1]
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
}

const toHex = rgb => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function rgbToHsl([r, g, b]) {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return [h / 6, s, l]
}

function hslToRgb([h, s, l]) {
    if (!s) return [l * 255, l * 255, l * 255]
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const channel = t => {
        t = (t + 1) % 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map(v => v * 255)
}

// Цвет кнопки как яркий акцент на тёмном фоне: тёмные и серые цвета иначе теряются
export function accentColor(color) {
    const rgb = parseHex(color)
    if (!rgb) return '#c5cbd6'
    const [h, s, l] = rgbToHsl(rgb)
    return toHex(hslToRgb([h, s < 0.08 ? s : Math.max(s, 0.55), Math.min(0.74, Math.max(l, 0.64))]))
}

// Для светлого стиля: тёмный насыщенный оттенок цвета (содержимое) и бледный (фон)
export function deepColor(color) {
    const rgb = parseHex(color)
    if (!rgb) return '#3a404c'
    const [h, s] = rgbToHsl(rgb)
    return toHex(hslToRgb([h, s < 0.08 ? s : Math.max(s, 0.6), 0.32]))
}

function paleColor(color, lightness) {
    const rgb = parseHex(color)
    if (!rgb) return toHex(hslToRgb([0.6, 0.08, lightness]))
    const [h, s] = rgbToHsl(rgb)
    return toHex(hslToRgb([h, s < 0.08 ? s : Math.min(s, 0.55), lightness]))
}

// Цвет фона кнопки одним значением — для миниатюр иконок в конфигураторе
export function keyBackdrop(look, style) {
    const kind = styleKind(style)
    if (kind === 'light') return paleColor(look.color, 0.86)
    if (kind === 'fill') return look.color ?? '#000000'
    return style === 'graphite' ? '#24272e' : '#0b0c10'
}

// Цвет «огоньков»: заполненная часть кольца, полоса прогресса, индикатор переключателя
function inkColor(style, look, accent) {
    const kind = styleKind(style)
    if (kind === 'dark') return accent
    return kind === 'light' ? deepColor(look.color) : '#ffffff'
}

function withAlpha(color, alpha) {
    const [r, g, b] = parseHex(color) ?? [255, 255, 255]
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ---------- Вид кнопки ---------- */

// Во включённом состоянии поверх основных полей ложатся заданные поля key.toggle
export function keyLook(key, on = false) {
    if (!on || !key?.toggle) return key ?? {}
    const look = { ...key }
    for (const [field, value] of Object.entries(key.toggle)) {
        if (field !== 'source' && value !== undefined && value !== '') look[field] = value
    }
    return look
}

const MEDIA_ICONS = {
    playpause: 'play', nexttrack: 'skip-forward', prevtrack: 'skip-back', stop: 'square',
    volumeup: 'volume-2', volumedown: 'volume-1', mute: 'volume-x',
}

// Иконка по действию, если своя не выбрана: так все кнопки выглядят однотипно
function autoIcon(action, on) {
    switch (action?.type) {
        case 'hotkey': return MEDIA_ICONS[action.keys.split('+').at(-1)] ?? 'keyboard'
        case 'text': return 'type'
        case 'run': return 'app-window'
        case 'open': return /^https?:/i.test(action.target) ? 'globe' : 'folder-open'
        case 'macro': return 'zap'
        case 'page': return action.page === 'back' ? 'arrow-left' : 'layers'
        case 'delay': return 'hourglass'
        case 'volume':
            if (action.target === 'mic') return 'mic'
            return action.step > 0 ? 'volume-2' : 'volume-1'
        case 'system': return 'lock'
        // Те же значки, что у медиаклавиш в сочетаниях
        case 'media': return { playpause: 'play', next: 'skip-forward', prev: 'skip-back' }[action.command] ?? 'music'
        case 'mute':
            if (action.target === 'mic') return on ? 'mic-off' : 'mic'
            return on ? 'volume-x' : 'volume-2'
        default: return null
    }
}

/* ---------- Индикаторы ---------- */

// Индикаторы, которые можно поставить на кнопку (поле meter)
export const METERS = ['volume', 'mic', 'cpu', 'gpu', 'ram', 'disk', 'netDown', 'netUp', 'uptime', 'time', 'date',
    'clock-h1', 'clock-h2', 'clock-colon', 'clock-m1', 'clock-m2', 'nowPlaying', 'weather']

// Подпись, которую конфигуратор предлагает для индикатора. Сама она не рисуется:
// на кнопке только то, что написано в её подписи
export const METER_CAPTIONS = {
    volume: 'Громкость', mic: 'Микрофон', cpu: 'Процессор', gpu: 'Видеокарта', ram: 'Память', disk: 'Диск',
    netDown: 'Загрузка', netUp: 'Отдача', uptime: 'Работает', time: 'Время', date: 'Дата', nowPlaying: 'Музыка',
    weather: 'Погода',
}

// Код погоды WMO (Open-Meteo) → короткое описание и значок; ночью ясно — луна
function weatherLook(code, isDay) {
    if (code === 0) return ['ясно', isDay ? 'sun' : 'moon']
    if (code === 1) return ['малооблачно', isDay ? 'sun' : 'moon']
    if (code === 2) return ['облачно', isDay ? 'cloud-sun' : 'cloud-moon']
    if (code === 3) return ['пасмурно', 'cloud']
    if (code === 45 || code === 48) return ['туман', 'cloud-fog']
    if (code >= 51 && code <= 57) return ['морось', 'cloud-drizzle']
    if (code >= 61 && code <= 67) return ['дождь', 'cloud-rain']
    if (code >= 71 && code <= 77) return ['снег', 'cloud-snow']
    if (code >= 80 && code <= 82) return ['ливень', 'cloud-rain-wind']
    if (code === 85 || code === 86) return ['снегопад', 'cloud-snow']
    if (code === 95) return ['гроза', 'cloud-lightning']
    if (code === 96 || code === 99) return ['гроза, град', 'cloud-hail']
    return ['', 'thermometer']
}

function weatherView(weather) {
    if (!weather || !Number.isFinite(weather.temperature)) return null
    const degrees = Math.round(weather.temperature)
    const [condition, icon] = weatherLook(weather.code, weather.isDay)
    // «−» вместо дефиса: так минус заметнее
    return { kind: 'value', text: `${degrees > 0 ? '+' : degrees < 0 ? '−' : ''}${Math.abs(degrees)}°`, unit: condition, icon }
}

const pad = n => String(n).padStart(2, '0')
const WEEKDAY_SHORT = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const DAY_MONTH_SHORT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

function formatRate(bytesPerSecond) {
    const units = ['Б/с', 'КБ/с', 'МБ/с', 'ГБ/с']
    let value = bytesPerSecond
    let unit = 0
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1024
        unit++
    }
    return { text: value >= 100 || unit === 0 ? String(Math.round(value)) : value.toFixed(1), unit: units[unit] }
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return days ? { text: `${days} д`, unit: `${hours} ч` } : { text: `${hours}:${pad(minutes)}`, unit: 'ч : мин' }
}

// Кольцо уровня в процентах. glyph — значок того, что измеряет кольцо: у кнопки без подписи он показывает, что это за кольцо
const ring = (value, glyph) => ({ kind: 'ring', value, text: String(value), unit: '%', glyph })

function nowPlaying(media, now) {
    if (!media?.title || media.status === 'none') return null
    let position = media.position ?? 0
    if (media.status === 'playing' && media.updated) position += (now - media.updated) / 1000
    // Прогресс округляем, чтобы кнопка не перерисовывалась каждую секунду
    const progress = media.duration > 0 ? Math.round(100 * Math.min(1, Math.max(0, position / media.duration))) / 100 : null
    return { kind: 'cover', title: media.title, artist: media.artist ?? '', playing: media.status === 'playing', progress, coverId: media.coverId ?? null }
}

// Что показывает индикатор сейчас. sources: { audio, system, media } от утилиты
function meterView(type, sources = {}, now = Date.now()) {
    const { audio, system, media, weather } = sources ?? {}
    const date = new Date(now)
    const time = `${pad(date.getHours())}${pad(date.getMinutes())}`
    switch (type) {
        case 'volume':
        case 'mic': {
            const value = audio?.[type === 'mic' ? 'mic' : 'speakers']
            if (!value) return null
            return {
                ...ring(value.volume, type === 'mic' ? 'mic' : 'volume-2'),
                muted: value.muted,
                icon: value.muted ? (type === 'mic' ? 'mic-off' : 'volume-x') : null,
            }
        }
        case 'cpu': return system ? ring(system.cpu, 'cpu') : null
        case 'gpu': return system?.gpu != null ? ring(system.gpu, 'gpu') : null
        case 'ram': return system?.ram ? ring(Math.round((100 * system.ram.used) / system.ram.total), 'memory-stick') : null
        case 'disk': return system?.disk ? ring(Math.round(100 * (1 - system.disk.free / system.disk.total)), 'hard-drive') : null
        case 'netDown': return system?.net ? { kind: 'value', ...formatRate(system.net.down), icon: 'arrow-down' } : null
        case 'netUp': return system?.net ? { kind: 'value', ...formatRate(system.net.up), icon: 'arrow-up' } : null
        case 'uptime': return system ? { kind: 'value', ...formatUptime(system.uptime), icon: 'timer' } : null
        // День недели и дата — часть индикатора, а не подпись
        case 'time': return {
            kind: 'value',
            text: `${time.slice(0, 2)}:${time.slice(2)}`,
            unit: `${WEEKDAY_SHORT.format(date)}, ${DAY_MONTH_SHORT.format(date)}`,
        }
        case 'date': return {
            kind: 'value',
            text: String(date.getDate()),
            unit: `${DAY_MONTH_SHORT.format(date).replace(/^\d+\s*/, '')}, ${WEEKDAY_SHORT.format(date)}`,
        }
        case 'clock-h1': return { kind: 'digit', text: time[0] }
        case 'clock-h2': return { kind: 'digit', text: time[1] }
        case 'clock-m1': return { kind: 'digit', text: time[2] }
        case 'clock-m2': return { kind: 'digit', text: time[3] }
        case 'clock-colon': return { kind: 'digit', text: ':', dim: date.getSeconds() % 2 === 1 }
        case 'nowPlaying': return nowPlaying(media, now)
        case 'weather': return weatherView(weather)
        default: return null
    }
}

// Всё, что нужно для отрисовки кнопки в текущем состоянии.
// on — состояние переключателя (null у обычной кнопки), sources — данные для индикатора.
// Подпись — ровно то, что написано у кнопки. Без неё индикатор и картинка рисуются крупно
// (view.compact), а смысл передают значки внутри кнопки
export function keyView(key, { on = null, sources = null, now = Date.now() } = {}) {
    const look = keyLook(key, on)
    const bare = !look.label
    let meter = key?.meter ? meterView(key.meter, sources, now) : null
    // У кнопок громкости вместо одинакового значка — «+» и «−», иначе без подписи их не различить
    if (meter?.kind === 'ring' && look.action?.type === 'volume') meter = { ...meter, glyph: look.action.step > 0 ? 'circle-plus' : 'circle-minus' }
    let icon = null
    if (meter) {
        if (meter.kind === 'cover') icon = meter.coverId ? { cover: meter.coverId } : { lucide: 'music' }
        else if (meter.icon) icon = { lucide: meter.icon }
        else if (bare && meter.glyph) icon = { lucide: meter.glyph }
    } else if (key?.meter === 'nowPlaying') {
        // Ничего не играет
        icon = { lucide: 'music' }
    } else if (key?.meter === 'weather') {
        // Город не выбран или погода ещё не пришла
        icon = { lucide: 'cloud-sun' }
    } else if (look.icon === 'none') {
        icon = null
    } else if (look.icon?.startsWith('lucide:')) {
        icon = { lucide: look.icon.slice('lucide:'.length) }
    } else if (look.icon) {
        icon = { file: look.icon }
    } else {
        const name = autoIcon(look.action, on)
        if (name) icon = { lucide: name }
    }
    return { look, icon, on, meter, compact: bare }
}

// Цвет иконки из библиотеки
export function iconTint(look, style) {
    if (look.iconColor) return look.iconColor
    const kind = styleKind(style)
    if (kind === 'dark') return accentColor(look.color)
    return kind === 'light' ? deepColor(look.color) : (look.textColor ?? '#ffffff')
}

function textTint(look, style) {
    const kind = styleKind(style)
    if (kind === 'dark') return GRAPHITE_TEXT
    return kind === 'light' ? LIGHT_TEXT : (look.textColor ?? '#ffffff')
}

/* ---------- Подписи ---------- */

// mode: 'icon' — подпись под иконкой или индикатором, 'text' — кнопка только с подписью
function labelBox(size, mode) {
    const padding = size * 0.06
    // start — желаемый размер шрифта, floor — меньше него общий размер страницы не опускается
    return mode === 'icon'
        ? { top: size * 0.63, height: size * 0.33, width: size - padding * 2, start: Math.round(size * 0.155), floor: Math.round(size * 0.14), lines: 2 }
        : { top: padding, height: size - padding * 2, width: size - padding * 2, start: Math.round(size * 0.21), floor: Math.round(size * 0.16), lines: 4 }
}

// Разбить подпись на строки, чтобы она влезла в ширину кнопки
function wrap(ctx, text, maxWidth) {
    const lines = []
    for (const paragraph of text.split('\n')) {
        let line = ''
        for (const word of paragraph.split(' ')) {
            const candidate = line ? `${line} ${word}` : word
            if (line && ctx.measureText(candidate).width > maxWidth) {
                lines.push(line)
                line = word
            } else {
                line = candidate
            }
        }
        lines.push(line)
    }
    return lines
}

// Самый крупный шрифт не больше maxSize, при котором подпись влезает: длинные слова не переносятся
function fitLabel(ctx, label, box, style, maxSize = box.start) {
    for (let fontSize = maxSize; ; fontSize--) {
        ctx.font = `${fontWeight(style)} ${fontSize}px ${FONT}`
        let lines = wrap(ctx, label, box.width)
        const lineHeight = fontSize * 1.15
        const fits = lines.length <= box.lines && lines.length * lineHeight <= box.height
            && lines.every(line => ctx.measureText(line).width <= box.width)
        if (fits) return { fontSize, lines, lineHeight }
        if (fontSize <= 8) {
            if (lines.length > box.lines) lines = [...lines.slice(0, box.lines - 1), `${lines[box.lines - 1]}…`]
            return { fontSize, lines, lineHeight }
        }
    }
}

// Где подпись: под иконкой или индикатором ('icon'), одна на всю кнопку ('text').
// У больших цифр часов и обложки трека своей подписи нет
// В компактном виде подпись остаётся только у кнопок без иконки — там текст и есть содержимое
function labelMode(view) {
    const kind = view.meter?.kind
    if (kind === 'digit' || kind === 'cover') return null
    const visual = view.icon || view.meter
    if (view.compact) return visual ? null : 'text'
    return visual ? 'icon' : 'text'
}

// Один размер шрифта для всех подписей страницы: отдельно для кнопок с иконкой и только с текстом.
// Слишком длинная подпись уменьшается сама и не тянет за собой остальные (не ниже box.floor)
export function measureLabels(ctx, views, size, style) {
    const sizes = {}
    for (const mode of ['icon', 'text']) {
        const box = labelBox(size, mode)
        const fits = views
            .filter(view => view.look.label && labelMode(view) === mode)
            .map(view => fitLabel(ctx, view.look.label, box, style).fontSize)
        sizes[mode] = fits.length ? Math.max(box.floor, Math.min(...fits)) : box.start
    }
    return sizes
}

// Обрезать строку с многоточием, если она не влезает
function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text
    let cut = text
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
    return `${cut.trimEnd()}…`
}

// Самый крупный шрифт до maxSize, при котором строка влезает в ширину
function fitFont(ctx, text, maxWidth, maxSize, weight) {
    let fontSize = maxSize
    for (; fontSize > 8; fontSize--) {
        ctx.font = `${weight} ${fontSize}px ${FONT}`
        if (ctx.measureText(text).width <= maxWidth) break
    }
    ctx.font = `${weight} ${fontSize}px ${FONT}`
    return fontSize
}

function drawLabel(ctx, size, label, mode, color, style, labelSizes) {
    const box = labelBox(size, mode)
    const own = fitLabel(ctx, label, box, style)
    const shared = labelSizes?.[mode]
    const { lines, lineHeight } = shared && shared < own.fontSize ? fitLabel(ctx, label, box, style, shared) : own
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const startY = box.top + (box.height - lines.length * lineHeight) / 2 + lineHeight / 2
    lines.forEach((line, i) => ctx.fillText(line, size / 2, startY + i * lineHeight))
}

/* ---------- Части кнопки ---------- */

// Обход против часовой стрелки вырезает дырку в контуре, обойдённом по часовой.
// Правило 'evenodd' для этого не годится: node-canvas не учитывает его при отрисовке теней
function roundRectPath(ctx, x, y, width, height, radius, counterClockwise = false) {
    ctx.moveTo(x + radius, y)
    if (counterClockwise) {
        ctx.arcTo(x, y, x, y + height, radius)
        ctx.arcTo(x, y + height, x + width, y + height, radius)
        ctx.arcTo(x + width, y + height, x + width, y, radius)
        ctx.arcTo(x + width, y, x, y, radius)
    } else {
        ctx.arcTo(x + width, y, x + width, y + height, radius)
        ctx.arcTo(x + width, y + height, x, y + height, radius)
        ctx.arcTo(x, y + height, x, y, radius)
        ctx.arcTo(x, y, x + width, y, radius)
    }
    ctx.closePath()
}

// Подсветка цветом кнопки за иконкой
function drawGlow(ctx, size, accent, alpha) {
    const glow = ctx.createRadialGradient(size / 2, size * 0.34, 0, size / 2, size * 0.34, size * 0.62)
    glow.addColorStop(0, withAlpha(accent, alpha))
    glow.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, size, size)
}

function drawBackground(ctx, size, look, style, on, accent, radius) {
    // У пустой кнопки нет ни подсветки, ни светящейся рамки
    const empty = !look.label && !look.icon && !look.action && !look.meter
    switch (style) {
        case 'graphite': {
            const base = ctx.createLinearGradient(0, 0, 0, size)
            base.addColorStop(0, '#2c3039')
            base.addColorStop(1, '#1a1c22')
            ctx.fillStyle = base
            ctx.fillRect(0, 0, size, size)
            if (!empty) drawGlow(ctx, size, accent, on ? 0.45 : 0.22)
            return
        }
        case 'neon': {
            ctx.fillStyle = '#08090c'
            ctx.fillRect(0, 0, size, size)
            if (!empty) drawGlow(ctx, size, accent, on ? 0.3 : 0.1)
            // Саму рамку рисует drawNeonFrame поверх содержимого — иначе её закрывает обложка трека
            return
        }
        case 'black':
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, size, size)
            if (on) drawGlow(ctx, size, accent, 0.3)
            return
        case 'gradient': {
            // Перелив по диагонали: сверху слева светлее и чуть сдвинут по тону, снизу справа темнее
            const [h, s, l] = rgbToHsl(parseHex(look.color) ?? [0, 0, 0])
            const fill = ctx.createLinearGradient(0, 0, size, size)
            fill.addColorStop(0, toHex(hslToRgb([h - 0.03, s, Math.min(0.85, l + 0.15)])))
            fill.addColorStop(1, toHex(hslToRgb([h + 0.025, s, Math.max(0.04, l - 0.13)])))
            ctx.fillStyle = fill
            ctx.fillRect(0, 0, size, size)
            break
        }
        case 'light': {
            const fill = ctx.createLinearGradient(0, 0, 0, size)
            fill.addColorStop(0, paleColor(look.color, 0.9))
            fill.addColorStop(1, paleColor(look.color, 0.8))
            ctx.fillStyle = fill
            ctx.fillRect(0, 0, size, size)
            if (on) {
                ctx.fillStyle = withAlpha(deepColor(look.color), 0.2)
                ctx.fillRect(0, 0, size, size)
            }
            return
        }
        default:
            ctx.fillStyle = look.color ?? '#000000'
            ctx.fillRect(0, 0, size, size)
    }
    if (on) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
        ctx.fillRect(0, 0, size, size)
    }
}

const neonWidth = (size, on) => Math.max(2, size * (on ? 0.05 : 0.035))

// «Неон»: рамка цветом кнопки с ореолом внутрь. Включённая — ярче и толще
function drawNeonFrame(ctx, size, look, on, accent, radius) {
    const empty = !look.label && !look.icon && !look.action && !look.meter
    const width = neonWidth(size, on)
    ctx.save()
    ctx.lineWidth = width
    ctx.strokeStyle = empty ? 'rgba(255, 255, 255, 0.08)' : withAlpha(accent, on ? 1 : 0.8)
    if (!empty) {
        ctx.shadowColor = accent
        ctx.shadowBlur = size * (on ? 0.16 : 0.1)
    }
    ctx.beginPath()
    roundRectPath(ctx, width / 2, width / 2, size - width, size - width, Math.max(0, radius - width / 2))
    ctx.stroke()
    ctx.restore()
}

// С подписью иконка занимает верхние 0.06–0.6 кнопки, подпись — нижнюю треть
function drawIcon(ctx, size, image, withLabel, compact) {
    const iconSize = withLabel ? size * 0.54 : size * (compact ? 0.66 : 0.6)
    const y = withLabel ? size * 0.06 : (size - iconSize) / 2
    ctx.drawImage(image, (size - iconSize) / 2, y, iconSize, iconSize)
}

// Кольцо уровня (громкость, процессор, память, диск) с числом в центре или значком «без звука».
// В компактном виде кольцо на всю кнопку, а в его нижнем разрыве — значок того, что оно измеряет
function drawRing(ctx, size, meter, image, style, ink, textColor, compact) {
    const cx = size / 2
    // С подписью кольцо не доходит до верхнего края: там рамка клавиши и неоновая рамка
    const cy = size * (compact ? 0.55 : 0.38)
    const radius = size * (compact ? 0.37 : 0.265)
    const start = Math.PI * 0.75
    const sweep = Math.PI * 1.5
    ctx.lineWidth = size * (compact ? 0.08 : 0.065)
    ctx.lineCap = 'round'
    const kind = styleKind(style)
    ctx.strokeStyle = kind === 'dark' ? 'rgba(255, 255, 255, 0.12)' : `rgba(0, 0, 0, ${kind === 'light' ? 0.1 : 0.28})`
    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, start + sweep)
    ctx.stroke()
    if (!meter.muted && meter.value > 0) {
        ctx.strokeStyle = ink
        ctx.beginPath()
        ctx.arc(cx, cy, radius, start, start + (sweep * Math.min(100, meter.value)) / 100)
        ctx.stroke()
    }
    ctx.fillStyle = textColor
    if (meter.muted && image) {
        // Без звука: крупный перечёркнутый значок вместо числа
        const iconSize = size * (compact ? 0.42 : 0.3)
        ctx.drawImage(image, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize)
    } else if (compact) {
        const glyph = image ? size * 0.23 : 0
        drawNumber(ctx, meter, cx, cy - (glyph ? size * 0.09 : 0), size * 0.54, Math.round(size * 0.27), 'bold')
        if (image) ctx.drawImage(image, cx - glyph / 2, cy + size * 0.19 - glyph / 2, glyph, glyph)
    } else if (!meter.muted) {
        drawNumber(ctx, meter, cx, cy + size * 0.01, radius * 1.55, Math.round(size * 0.2), fontWeight(style))
    }
}

// Число кольца, справа от него единица («%») поменьше и бледнее, на той же линии низа.
// Вместе по центру x; y — середина строки, как у textBaseline = 'middle'.
// Шрифт — самый крупный до maxSize, при котором число с единицей влезает в maxWidth
function drawNumber(ctx, meter, x, y, maxWidth, maxSize, weight) {
    const { text, unit } = meter
    const font = px => `${weight} ${Math.round(px)}px ${FONT}`
    const unitSize = px => px * 0.6
    let fontSize = maxSize
    let width
    let unitWidth
    for (; ; fontSize--) {
        ctx.font = font(fontSize)
        width = ctx.measureText(text).width
        ctx.font = font(unitSize(fontSize))
        unitWidth = unit ? ctx.measureText(unit).width : 0
        if (width + unitWidth <= maxWidth || fontSize <= 8) break
    }
    const left = x - (width + unitWidth) / 2
    ctx.save()
    ctx.font = font(fontSize)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, left, y)
    if (unit) {
        // Линия низа цифр: при textBaseline = 'middle' она ниже y на разницу высот над линиями
        const aboveMiddle = ctx.measureText(text).actualBoundingBoxAscent
        ctx.textBaseline = 'alphabetic'
        const baseline = y + ctx.measureText(text).actualBoundingBoxAscent - aboveMiddle
        ctx.font = font(unitSize(fontSize))
        ctx.globalAlpha *= 0.8
        ctx.fillText(unit, left + width, baseline)
    }
    ctx.restore()
}

// Значение с единицей: скорость сети, время работы, часы, дата.
// Без подписи занимает всю кнопку
function drawValue(ctx, size, meter, image, style, textColor, compact) {
    const cx = size / 2
    let top = size * (compact ? 0.1 : 0.05)
    if (image) {
        const iconSize = size * (compact ? 0.24 : 0.2)
        ctx.drawImage(image, cx - iconSize / 2, top, iconSize, iconSize)
        top += iconSize + size * 0.02
    }
    const bottom = size * (compact ? 0.92 : 0.62)
    const { unit } = meter
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const unitSize = unit ? Math.round(size * (compact ? 0.15 : 0.115)) : 0
    const maxValue = compact ? (image ? 0.32 : 0.4) : (image ? 0.25 : 0.3)
    const valueSize = fitFont(ctx, meter.text, size * 0.86, Math.round(size * maxValue), 'bold')
    const blockHeight = valueSize + (unitSize ? unitSize * 1.2 : 0)
    const valueY = top + (bottom - top - blockHeight) / 2 + valueSize / 2
    ctx.fillText(meter.text, cx, valueY)
    if (unit) {
        ctx.save()
        ctx.globalAlpha = 0.65
        fitFont(ctx, unit, size * 0.86, unitSize, fontWeight(style))
        ctx.fillText(unit, cx, valueY + valueSize / 2 + unitSize * 0.7)
        ctx.restore()
    }
}

// Большая цифра часов на всю кнопку: пять кнопок в ряд складываются в «14:35»
function drawDigit(ctx, size, meter, textColor) {
    ctx.save()
    ctx.fillStyle = textColor
    ctx.globalAlpha = meter.dim ? 0.2 : 1
    ctx.textAlign = 'center'
    // 'middle' в браузере и на устройстве (node-canvas) ставит строку по-разному, поэтому центрируем
    // по реальной высоте цифры от линии низа: так одинаково везде. Двоеточие выравнивается по цифрам
    ctx.textBaseline = 'alphabetic'
    ctx.font = `bold ${Math.round(size * 0.78)}px ${FONT}`
    const { actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } = ctx.measureText('0')
    ctx.fillText(meter.text, size / 2, size / 2 + (ascent - descent) / 2)
    ctx.restore()
}

// Обложка трека целиком, под ней название и исполнитель, сверху полоса прогресса. На паузе — значок паузы.
// Название — содержимое кнопки, а не подпись, поэтому оно видно и на страницах без подписей
function drawCover(ctx, size, meter, image, hasCover, style, accent, radius) {
    const padding = size * 0.07
    const area = size * 0.7 // обложка сверху, под ней название и исполнитель
    if (image && hasCover) {
        // Поля вокруг вписанной обложки заполняем ею же, растянутой и затемнённой — без чёрных полос
        const fill = Math.max(size / image.width, size / image.height)
        ctx.save()
        ctx.globalAlpha = 0.25
        ctx.drawImage(image, (size - image.width * fill) / 2, (size - image.height * fill) / 2, image.width * fill, image.height * fill)
        ctx.restore()
        // Сама обложка — целиком, без обрезки
        const fit = Math.min(size / image.width, area / image.height)
        const width = image.width * fit
        const height = image.height * fit
        ctx.drawImage(image, (size - width) / 2, (area - height) / 2, width, height)
    } else if (image) {
        const iconSize = area * 0.6
        ctx.drawImage(image, (size - iconSize) / 2, (area - iconSize) / 2, iconSize, iconSize)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.font = `${fontWeight(style)} ${Math.round(size * 0.13)}px ${FONT}`
    ctx.fillText(ellipsize(ctx, meter.title, size - padding * 2), size / 2, size * 0.775)
    if (meter.artist) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.font = `${Math.round(size * 0.11)}px ${FONT}`
        ctx.fillText(ellipsize(ctx, meter.artist, size - padding * 2), size / 2, size * 0.885)
    }
    if (meter.progress !== null) {
        // Полоса сверху: устройство обычно стоит под углом, и нижний край кнопки плохо виден.
        // Скруглённая полоска с отступами от углов — иначе скругление кнопки срезает её концы.
        // Тёмная подложка — чтобы полосу было видно и на светлой обложке
        const barHeight = Math.max(3, Math.round(size * 0.045))
        const barY = Math.max(size * 0.07, style === 'neon' ? neonWidth(size, false) + 3 : 0)
        const barX = Math.max(radius, size * 0.1)
        const barWidth = size - barX * 2
        const pill = (x, y, width, height) => {
            ctx.beginPath()
            roundRectPath(ctx, x, y, width, height, Math.min(height / 2, width / 2))
            ctx.fill()
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        pill(barX - 1.5, barY - 1.5, barWidth + 3, barHeight + 3)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
        pill(barX, barY, barWidth, barHeight)
        // Светлый стиль тут не нужен: под полосой всегда тёмная подложка
        ctx.fillStyle = styleKind(style) === 'dark' ? accent : '#ffffff'
        if (meter.progress > 0) pill(barX, barY, Math.max(barHeight, barWidth * Math.min(1, meter.progress)), barHeight)
    }
    if (!meter.playing) {
        // Значок паузы: две полоски на тёмном круге
        const cx = size / 2
        const cy = area / 2
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.beginPath()
        ctx.arc(cx, cy, size * 0.15, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        const barWidth = size * 0.045
        const barHeight = size * 0.13
        ctx.fillRect(cx - barWidth * 1.6, cy - barHeight / 2, barWidth, barHeight)
        ctx.fillRect(cx + barWidth * 0.6, cy - barHeight / 2, barWidth, barHeight)
    }
}

// Отметка в углу: у кнопки есть действие на долгое нажатие
function drawLongPressMark(ctx, size, style, ink) {
    const inset = size * 0.07
    const leg = size * 0.11
    ctx.beginPath()
    ctx.moveTo(size - inset, size - inset - leg)
    ctx.lineTo(size - inset, size - inset)
    ctx.lineTo(size - inset - leg, size - inset)
    ctx.closePath()
    ctx.fillStyle = withAlpha(ink, styleKind(style) === 'fill' ? 0.65 : 0.8)
    ctx.fill()
}

// Светлая кромка сверху и тень по нижнему краю, как у кнопок конфигуратора
function drawEdges(ctx, size, radius, highlight) {
    const k = size / 96
    const edge = Math.max(1, Math.round(k))
    ctx.beginPath()
    roundRectPath(ctx, 0, 0, size, size, radius)
    roundRectPath(ctx, 0, edge, size, size, radius, true)
    ctx.fillStyle = `rgba(255, 255, 255, ${highlight})`
    ctx.fill()

    // Рисуем рамку снаружи клавиши (её саму отрежет скругление) и оставляем только её тень
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 4 * k
    ctx.shadowOffsetY = -2 * k
    ctx.beginPath()
    ctx.rect(-size, -size, size * 3, size * 3)
    roundRectPath(ctx, 0, 0, size, size, radius, true)
    ctx.fillStyle = '#000000'
    ctx.fill()
    ctx.restore()
}

// «Стекло»: затемнение снизу и блик по диагонали (linear-gradient(158deg, …) с резким краем на 34–35%)
function drawGlass(ctx, size) {
    const shade = ctx.createLinearGradient(0, size, 0, 0)
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.28)')
    shade.addColorStop(0.32, 'rgba(0, 0, 0, 0)')
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, size, size)

    const gloss = ctx.createLinearGradient(size * 0.2562, size * -0.1035, size * 0.7438, size * 1.1035)
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.17)')
    gloss.addColorStop(0.34, 'rgba(255, 255, 255, 0.04)')
    gloss.addColorStop(0.35, 'rgba(255, 255, 255, 0)')
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gloss
    ctx.fillRect(0, 0, size, size)
}

// Индикатор состояния переключателя в правом верхнем углу
function drawLed(ctx, size, on, style, ink) {
    const kind = styleKind(style)
    ctx.save()
    ctx.beginPath()
    // У самого угла, подальше от колец и иконки. В «Неоне» чуть глубже, чтобы не ложился на рамку
    const inset = style === 'neon' ? 0.12 : 0.1
    ctx.arc(size * (1 - inset), size * inset, Math.max(2, size * 0.035), 0, Math.PI * 2)
    if (on) {
        ctx.shadowColor = ink
        ctx.shadowBlur = size * 0.08
        ctx.fillStyle = ink
        ctx.fill()
    } else if (kind !== 'fill') {
        ctx.fillStyle = kind === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.18)'
        ctx.fill()
    } else {
        // Тёмная точка со светлой обводкой видна и на светлом, и на тёмном фоне
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
        ctx.stroke()
    }
    ctx.restore()
}

/* ---------- Кнопка целиком ---------- */

// view — результат keyView, image — загруженная иконка view.icon нужного цвета (iconTint).
// labelSizes — общий размер подписей страницы (measureLabels)
export function drawKey(ctx, size, {
    view = keyView({}),
    image = null,
    style = DEFAULT_STYLE,
    labelSizes = null,
    pressed = false,
    scale = DEFAULT_CONTENT_SCALE,
    cornerRadius = DEFAULT_LAYOUT.radius, // в единицах size (config.layout.radius)
} = {}) {
    const { look, on, meter } = view
    const rounded = style !== 'flat' && cornerRadius > 0
    const radius = rounded ? Math.min(cornerRadius, size / 2) : 0
    const accent = accentColor(look.color)
    const ink = inkColor(style, look, accent)

    ctx.save()
    if (rounded) {
        // За скруглёнными углами — чёрный, как корпус вокруг клавиши
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, size, size)
        ctx.beginPath()
        roundRectPath(ctx, 0, 0, size, size, radius)
        ctx.clip()
    }
    drawBackground(ctx, size, look, style, on, accent, radius)

    const offset = (size * (1 - scale)) / 2
    const textColor = textTint(look, style)
    const { compact } = view
    if (meter?.kind === 'cover') {
        // Обложка — фон на всю кнопку, её не уменьшаем
        drawCover(ctx, size, meter, image, !!view.icon?.cover, style, accent, radius)
    } else {
        // Подпись, иконку и индикатор при необходимости уменьшаем относительно центра
        ctx.save()
        ctx.translate(offset, offset)
        ctx.scale(scale, scale)
        const mode = labelMode(view)
        const label = mode ? look.label : null
        if (meter?.kind === 'ring') drawRing(ctx, size, meter, image, style, ink, textColor, compact)
        else if (meter?.kind === 'value') drawValue(ctx, size, meter, image, style, textColor, compact)
        else if (meter?.kind === 'digit') drawDigit(ctx, size, meter, textColor)
        else if (image) drawIcon(ctx, size, image, !!label, compact)
        if (label) drawLabel(ctx, size, label, mode, textColor, style, labelSizes)
        ctx.restore()
    }

    if (style === 'glass') drawGlass(ctx, size)
    if (style === 'neon') drawNeonFrame(ctx, size, look, on, accent, radius)
    // Кромка и тень — у объёмных стилей. У «Неона» вместо них рамка, «Чёрный» — без рельефа
    const highlight = { graphite: 0.1, glass: 0.2, gradient: 0.16, light: 0.45 }[style]
    if (rounded && highlight) drawEdges(ctx, size, radius, highlight)
    if (on !== null) drawLed(ctx, size, on, style, ink)
    if (look.longPress) drawLongPressMark(ctx, size, style, ink)

    // Подсветка нажатия. Рамка идёт по границе содержимого, иначе её закроет рамка клавиши.
    // pressed === 'long' — сработало долгое нажатие
    if (pressed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.fillRect(0, 0, size, size)
        const inset = offset + 2
        ctx.strokeStyle = pressed === 'long' ? accent : '#ffffff'
        ctx.lineWidth = pressed === 'long' ? 4 : 3
        ctx.beginPath()
        roundRectPath(ctx, inset, inset, size - inset * 2, size - inset * 2, Math.max(0, radius - inset / 2))
        ctx.stroke()
    }
    ctx.restore()
}
