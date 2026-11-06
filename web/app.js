// Веб-конфигуратор кнопок Razer Stream Controller X
import { DEFAULT_CONTENT_SCALE, DEFAULT_LAYOUT, DEFAULT_STYLE, KEY_SIZE, LAYOUT_INSET_LIMITS, LAYOUT_RADIUS_LIMITS, LAYOUT_SIZE_LIMITS, METER_CAPTIONS, STYLES, innerSize, layoutOf, layoutProblem, drawKey, iconTint, keyBackdrop, keyView, measureLabels, styleKind } from '/shared/draw.js'
import { openIconPicker } from '/icon-picker.js'
import { KEY_GROUPS, MODIFIERS, MODIFIER_CODES, buildCombo, keyFromCode, keyLabel, parseCombo } from '/keys.js'
import { api, askText, confirmDialog, h, icon, iconButton, iconUrl, toast } from '/ui.js'
import { exportPage, importPage } from '/transfer.js'

const KEY_COUNT = 15
const COLUMNS = 5
const CANVAS_PX = 96 * 2 // разрешение предпросмотра кнопки, рисуется в масштабе клавиши устройства (KEY_SIZE)

const BG_SWATCHES = ['#000000', '#212121', '#37474f', '#455a64', '#b71c1c', '#c62828', '#ad1457', '#6a1b9a', '#4527a0',
    '#283593', '#5865f2', '#1565c0', '#00695c', '#2e7d32', '#558b2f', '#f9a825', '#ef6c00', '#4e342e', '#ffffff']
const TEXT_SWATCHES = ['#ffffff', '#000000', '#fde047', '#86efac', '#93c5fd', '#fca5a5']
const ICON_SWATCHES = ['#ffffff', '#e7eaf0', '#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#c084fc', '#f472b6', '#2dd4bf', '#fb923c']

// Стили кнопок: название и пояснение под плитками выбора. Порядок — как в STYLES (draw.js)
const STYLE_OPTIONS = {
    graphite: ['Графит', 'Тёмные кнопки, цвет кнопки подсвечивает иконку'],
    neon: ['Неон', 'Чёрные кнопки со светящейся рамкой цвета кнопки'],
    black: ['Чёрный', 'Только иконки и подписи на чёрном — ничего лишнего'],
    glass: ['Стекло', 'Цветные кнопки со стеклянным бликом'],
    gradient: ['Градиент', 'Цветные кнопки с переливом по диагонали'],
    flat: ['Плоские', 'Цветная заливка без скруглений и бликов'],
    light: ['Светлый', 'Бледная заливка оттенком цвета, тёмные иконки'],
}
// Кнопка-образец на плитках выбора стиля
const STYLE_SAMPLE = { label: 'Звук', meter: 'volume', color: '#26a69a' }

const ACTIONS = {
    hotkey: { label: 'Сочетание', icon: 'keyboard' },
    text: { label: 'Текст', icon: 'type' },
    run: { label: 'Программа', icon: 'app-window' },
    open: { label: 'Открыть', icon: 'external-link' },
    macro: { label: 'Макрос', icon: 'list-ordered' },
    page: { label: 'Страница', icon: 'layers' },
    volume: { label: 'Громкость', icon: 'volume-2' },
    mute: { label: 'Без звука', icon: 'volume-x' },
    mixer: { label: 'Регулятор', icon: 'sliders-horizontal' },
    player: { label: 'Плеер', icon: 'disc-3' },
    idle: { label: 'Ожидание', icon: 'moon' },
    pin: { label: 'Закрепить', icon: 'lock' },
    volumeSet: { label: 'Уровень', icon: 'gauge' },
    media: { label: 'Музыка', icon: 'music' },
    system: { label: 'Компьютер', icon: 'lock' },
    delay: { label: 'Пауза', icon: 'hourglass' },
}
const KEY_ACTIONS = ['hotkey', 'text', 'run', 'open', 'macro', 'page', 'volume', 'mute', 'mixer', 'media', 'player', 'idle', 'pin', 'system']
const STEP_ACTIONS = ['hotkey', 'text', 'delay', 'run', 'open', 'page', 'volume', 'mute', 'media', 'system']
const SYSTEM_COMMANDS = [['lock', 'Заблокировать (как Win+L)']]
const MEDIA_COMMANDS = [['playpause', 'Пауза / продолжить'], ['next', 'Следующий трек'], ['prev', 'Предыдущий трек'],
    ['seek', 'Перемотать'], ['shuffle', 'Перемешивание вкл / выкл'], ['repeat', 'Повтор: нет → все → трек'], ['open', 'Открыть окно плеера']]

// Индикаторы на кнопке (поле meter)
const METER_GROUPS = [
    ['Звук', [['volume', 'Уровень громкости'], ['mic', 'Уровень микрофона']]],
    ['Музыка', [['nowPlaying', 'Сейчас играет (Spotify и другие плееры)']]],
    ['Погода', [['weather', 'Погода сейчас']]],
    ['Система', [['cpu', 'Загрузка процессора'], ['gpu', 'Загрузка видеокарты'], ['ram', 'Память'], ['disk', 'Свободное место на диске'],
        ['netDown', 'Сеть: загрузка'], ['netUp', 'Сеть: отдача'], ['uptime', 'Время работы Windows']]],
    ['Время', [['time', 'Часы'], ['date', 'Дата'], ['clock-h1', 'Большие часы: десятки часов'], ['clock-h2', 'Большие часы: единицы часов'],
        ['clock-colon', 'Большие часы: двоеточие'], ['clock-m1', 'Большие часы: десятки минут'], ['clock-m2', 'Большие часы: единицы минут']]],
]

// Окно ожидания по умолчанию: система, музыка, сеть и звук, большие часы в нижнем ряду
const IDLE_PAGE = {
    0: { label: 'Процессор', meter: 'cpu', color: '#2e7d32' },
    1: { label: 'Видеокарта', meter: 'gpu', color: '#c0ca33' },
    2: { label: 'Память', meter: 'ram', color: '#1565c0' },
    3: { label: 'Диск', meter: 'disk', color: '#ef6c00' },
    4: { meter: 'date', color: '#5c6bc0' },
    5: { meter: 'nowPlaying', color: '#1db954' },
    6: { label: 'Загрузка', meter: 'netDown', color: '#00838f' },
    7: { label: 'Отдача', meter: 'netUp', color: '#6a1b9a' },
    8: { label: 'Звук', meter: 'volume', color: '#26a69a' },
    9: { label: 'Микрофон', meter: 'mic', color: '#ec407a' },
    10: { meter: 'clock-h1', color: '#4ade80' },
    11: { meter: 'clock-h2', color: '#4ade80' },
    12: { meter: 'clock-colon', color: '#4ade80' },
    13: { meter: 'clock-m1', color: '#4ade80' },
    14: { meter: 'clock-m2', color: '#4ade80' },
}

// Через сколько секунд без нажатий открывается окно ожидания
const IDLE_DELAYS = [[0, 'Не показывать'], [30, 'через 30 секунд'], [60, 'через 1 минуту'], [120, 'через 2 минуты'],
    [300, 'через 5 минут'], [600, 'через 10 минут']]

// Пока утилита не отвечает, предпросмотр индикаторов показывает примерные значения
const SAMPLE_SOURCES = {
    audio: { speakers: { volume: 50, muted: false }, mic: { volume: 80, muted: false } },
    system: { cpu: 12, gpu: 23, ram: { used: 8e9, total: 16e9 }, disk: { drive: 'C', total: 1e12, free: 4e11 }, uptime: 5 * 3600, net: { down: 120000, up: 20000 } },
    media: null,
    weather: { temperature: 7, code: 2, isDay: true },
}

const TOGGLE_SOURCES = [
    ['self', 'Переключается при каждом нажатии'],
    ['speakers', 'Звук Windows выключен'],
    ['mic', 'Микрофон Windows выключен'],
    ['pin', 'Экран закреплён'],
]
const MUTE_TARGETS = [['speakers', 'Звук (динамики)'], ['mic', 'Микрофон']]

const state = {
    config: null,
    version: null, // хеш config.json, который сейчас загружен
    savedJson: '', // для поиска несохранённых изменений
    keyNames: new Set(),
    page: null,
    selected: null,
    editOn: false, // в инспекторе открыто включённое состояние переключателя
    keyTab: 'look', // открытая вкладка настроек кнопки, остаётся при выборе другой кнопки
    globalTab: 'device', // открытая вкладка левой панели общих настроек
    status: { online: false, connected: false, page: null, audio: null, toggles: {} },
    clipboard: null,
    saving: false,
    calibrating: false, // на устройстве открыта «Подгонка под рамки»
    update: null, // состояние обновлений с утилиты (src/updates.js)
}

const $ = id => document.getElementById(id)
const pageNames = () => Object.keys(state.config.pages)
const startPage = () => state.config.startPage ?? pageNames()[0]
// Страница окна ожидания, если она назначена и есть в конфиге
const idlePage = () => {
    const page = state.config.idle?.page
    return page && Object.hasOwn(state.config.pages, page) ? page : null
}
const pageKeys = () => state.config.pages[state.page]
const currentStyle = () => state.config.keyStyle ?? DEFAULT_STYLE
const isEmptyKey = key => !key
    || (!key.label && !key.icon && !key.action && !key.toggle && !key.meter && !key.longPress && (!key.color || key.color === '#000000'))

/* ---------- Конфиг ---------- */

function cleanAction(action) {
    if (action.type === 'hotkey' && !action.hold) delete action.hold
    if (action.type === 'run') {
        if (!action.args?.length) delete action.args
        if (!action.cwd) delete action.cwd
    }
    if (action.type === 'macro') {
        if (!action.stepDelay) delete action.stepDelay
        action.steps.forEach(cleanAction)
    }
}

// Убрать пустые поля, чтобы config.json оставался аккуратным
function cleanConfig(config) {
    for (const keys of Object.values(config.pages)) {
        for (const [index, key] of Object.entries(keys)) {
            for (const target of [key, key.toggle]) {
                if (!target) continue
                for (const field of ['label', 'icon', 'iconColor']) if (!target[field]) delete target[field]
                if (target.action) cleanAction(target.action)
            }
            if (key.toggle?.source === 'self') delete key.toggle.source
            if (!key.meter) delete key.meter
            if (key.longPress) cleanAction(key.longPress)
            if (!Object.keys(key).length) delete keys[index]
        }
    }
}

function canon(config) {
    const copy = structuredClone(config)
    cleanConfig(copy)
    return JSON.stringify(copy)
}

const isDirty = () => !!state.config && canon(state.config) !== state.savedJson

/* ---------- Отмена и повтор (Ctrl+Z / Ctrl+Y) ---------- */

// Снимки конфига в виде canon(): пустые кнопки, которые создаёт выбор кнопки, шагом не считаются.
// Изменения подряд быстрее HISTORY_MERGE_MS (ввод текста, ползунок) склеиваются в один шаг
const history = { past: [], future: [], current: null, last: 0 }
const HISTORY_LIMIT = 100
const HISTORY_MERGE_MS = 800

function resetHistory() {
    history.past = []
    history.future = []
    history.current = canon(state.config)
    history.last = 0
}

// Вызывается при каждой перерисовке (renderDirty): если конфиг изменился, это новый шаг
function recordHistory() {
    if (!state.config) return
    const snapshot = canon(state.config)
    if (snapshot === history.current) return
    const now = Date.now()
    if (now - history.last > HISTORY_MERGE_MS) {
        history.past.push(history.current)
        if (history.past.length > HISTORY_LIMIT) history.past.shift()
    }
    history.future = []
    history.current = snapshot
    history.last = now
}

function stepHistory(from, to) {
    if (!from.length) return
    to.push(history.current)
    history.current = from.pop()
    history.last = 0
    state.config = JSON.parse(history.current)
    if (!state.config.pages[state.page]) {
        state.page = startPage()
        state.selected = null
    }
    renderAll()
}

const undo = () => stepHistory(history.past, history.future)
const redo = () => stepHistory(history.future, history.past)

function walkActions(visit) {
    const walk = action => {
        visit(action)
        if (action.type === 'macro') action.steps.forEach(walk)
    }
    for (const keys of Object.values(state.config.pages)) {
        for (const key of Object.values(keys)) {
            for (const action of [key.action, key.toggle?.action, key.longPress]) if (action) walk(action)
        }
    }
}

function defaultAction(type) {
    switch (type) {
        case 'hotkey': return { type, keys: '' }
        case 'text': return { type, text: '' }
        case 'run': return { type, path: '' }
        case 'open': return { type, target: '' }
        case 'macro': return { type, steps: [] }
        case 'page': return { type, page: pageNames().find(name => name !== state.page) ?? 'back' }
        case 'volume': return { type, step: 5 }
        case 'mute': return { type, target: 'speakers' }
        case 'mixer': return { type, target: 'speakers' }
        case 'player': return { type }
        case 'idle': return { type }
        case 'pin': return { type }
        case 'volumeSet': return { type, target: 'speakers', value: 50 }
        case 'media': return { type, command: 'playpause' }
        case 'system': return { type, command: 'lock' }
        case 'delay': return { type, ms: 200 }
    }
}

async function load() {
    const { config, version } = await api('GET', '/api/config')
    state.config = config
    state.version = version
    state.savedJson = canon(config)
    if (!config.pages[state.page]) {
        state.page = startPage()
        state.selected = null
    }
    resetHistory()
    images.clear()
    hideBanner()
    renderAll()
}

async function save() {
    if (!isDirty() || state.saving) return
    // Название страницы применяется при потере фокуса
    if (document.activeElement?.classList.contains('commit-on-blur')) document.activeElement.blur()
    state.saving = true
    $('save').classList.add('busy')
    try {
        cleanConfig(state.config)
        const { version } = await api('PUT', '/api/config', { config: state.config })
        state.version = version
        state.savedJson = canon(state.config)
        // Очистка при сохранении — не шаг истории: Ctrl+Z после сохранения отменяет последнюю правку
        history.current = state.savedJson
        // После сохранения утилита сама возвращает кнопки вместо разметки
        state.calibrating = false
        lastCalibration = null
        toast(state.status.connected ? 'Сохранено — кнопки на устройстве обновлены' : 'Сохранено', { type: 'success' })
    } catch (err) {
        toast(err.message, { type: 'error', timeout: 9000 })
        focusError(err.message)
    } finally {
        state.saving = false
        $('save').classList.remove('busy')
        // Очистка могла удалить пустую кнопку, с которой связан инспектор.
        // Настройки страницы зависят от сохранённой версии («Показать на устройстве»)
        renderGlobalPanel()
        if (state.selected === null || !pageKeys()[state.selected]) renderSelectionPanel()
        renderDevice()
        renderDirty()
    }
}

// Ошибка проверки вида «Страница "main", кнопка 3: …» — сразу показать эту кнопку
function focusError(message) {
    const match = /Страница "(.+?)", кнопка (\d+)/.exec(message)
    if (!match || !state.config.pages[match[1]]) return
    state.page = match[1]
    state.selected = Number(match[2])
    renderAll()
}

async function revert() {
    const ok = await confirmDialog({
        title: 'Отменить изменения?',
        text: 'Все несохранённые изменения пропадут, вернётся версия из config.json.',
        okLabel: 'Отменить изменения',
        danger: true,
    })
    if (ok) await load()
}

function onExternalConfig(version) {
    if (state.saving || version === state.version) return
    if (!isDirty()) {
        load().then(() => toast('config.json изменён на диске — конфигурация обновлена'))
        return
    }
    showBanner('config.json изменили вне конфигуратора, а здесь есть несохранённые изменения.', [
        { label: 'Загрузить с диска', run: load },
        { label: 'Оставить мои', run: hideBanner },
    ])
}

/* ---------- Устройство ---------- */

const keyEls = []
const images = new Map()
const measureContext = document.createElement('canvas').getContext('2d')
let paintToken = 0

function loadImage(src) {
    return new Promise(resolve => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

// Иконка из библиотеки нужного цвета, обложка трека или картинка из config.json
function iconImage(spec, color) {
    const id = spec.lucide ? `lucide:${spec.lucide}:${color}` : spec.cover ? `cover:${spec.cover}` : `file:${spec.file}`
    if (!images.has(id)) {
        if (spec.lucide) {
            images.set(id, fetch(`/lucide/${spec.lucide}.svg`).then(res => res.text()).then(text => {
                const svg = text.replace(/currentColor/g, color).replace(/\swidth="24"/, ' width="96"').replace(/\sheight="24"/, ' height="96"')
                return loadImage(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })))
            }).catch(() => null))
        } else if (spec.cover) {
            images.set(id, loadImage(`/api/media/cover?v=${spec.cover}`))
        } else {
            images.set(id, loadImage(iconUrl(spec.file)))
        }
    }
    return images.get(id)
}

// Данные для индикаторов: с утилиты, а без связи — примерные
function previewSources() {
    const { online, audio, system, media, weather } = state.status
    if (!online) return SAMPLE_SOURCES
    return { audio: audio ?? SAMPLE_SOURCES.audio, system: system ?? SAMPLE_SOURCES.system, media, weather }
}

// Состояние кнопки, как на устройстве. У выбранного переключателя — то, что открыто в инспекторе
// (live — всегда состояние с устройства)
function previewState(index, key, live = false) {
    const { audio, toggles } = state.status
    let on = null
    if (key?.toggle) {
        const source = key.toggle.source ?? 'self'
        if (source === 'self') on = !!toggles?.[`${state.page}/${index}`]
        else if (source === 'pin') on = !!state.status.pinned
        else on = !!audio?.[source]?.muted
        if (!live && state.selected === index) on = state.editOn
    }
    return { on, sources: previewSources() }
}

// Тот же код отрисовки, что и на устройстве (src/draw.js)
async function paintKey(canvas, view, style, labelSizes) {
    const token = String(++paintToken)
    canvas.dataset.token = token
    const image = view.icon ? await iconImage(view.icon, iconTint(view.look, style)) : null
    if (canvas.dataset.token !== token) return
    const px = Math.round(CANVAS_PX * Math.max(1, (window.devicePixelRatio || 1) / 2))
    if (canvas.width !== px) {
        canvas.width = px
        canvas.height = px
    }
    // Как на устройстве: кнопка отступает от края окошка на layout.inset, вокруг чёрное поле
    const { size, inset, radius } = layoutOf(state.config.layout)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(px / size, 0, 0, px / size, 0, 0)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, size, size)
    ctx.translate(inset, inset)
    drawKey(ctx, size - 2 * inset, { view, image, style, labelSizes, scale: state.config.contentScale, cornerRadius: radius })
}

function buildDevice() {
    const grid = $('keys')
    for (let i = 0; i < KEY_COUNT; i++) {
        const canvas = h('canvas', { width: CANVAS_PX, height: CANVAS_PX })
        const el = h('div', {
            class: 'key',
            role: 'button',
            tabindex: 0,
            draggable: 'true',
            onclick: () => select(i),
            onkeydown: e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    select(i)
                }
            },
            ondragstart: e => {
                e.dataTransfer.setData('application/x-key', String(i))
                e.dataTransfer.effectAllowed = 'move'
                el.classList.add('dragging')
            },
            ondragend: () => el.classList.remove('dragging'),
            ondragover: e => {
                if (!e.dataTransfer.types.includes('application/x-key')) return
                e.preventDefault()
                el.classList.add('drop')
            },
            ondragleave: () => el.classList.remove('drop'),
            ondrop: e => {
                e.preventDefault()
                el.classList.remove('drop')
                const from = Number(e.dataTransfer.getData('application/x-key'))
                if (from !== i) swapKeys(from, i)
            },
            onanimationend: () => el.classList.remove('flash'),
        }, canvas, h('span', { class: 'key-index' }, i), h('span', { class: 'key-empty' }, icon('plus')))
        keyEls.push({ el, canvas })
        grid.append(el)
    }
}

function renderDevice() {
    const style = currentStyle()
    // Скругление рамки выделения и обрезки — по нарисованному скруглению кнопки, с учётом отступа
    const { size, inset, radius } = layoutOf(state.config.layout)
    const rounded = style === 'flat' ? 0 : radius
    $('keys').style.setProperty('--key-radius', `${((rounded + inset) / size) * 100}%`)
    const views = keyEls.map((_, i) => {
        const key = pageKeys()[i]
        return key ? keyView(key, previewState(i, key)) : keyView({})
    })
    // Один размер подписей на странице, как на устройстве: у переключателей учитываем оба состояния
    const measured = [...views]
    keyEls.forEach((_, i) => {
        const key = pageKeys()[i]
        if (key?.toggle) measured.push(keyView(key, { ...previewState(i, key), on: !views[i].on }))
    })
    const labelSizes = measureLabels(measureContext, measured, innerSize(state.config.layout), style)
    keyEls.forEach(({ el, canvas }, i) => {
        const key = pageKeys()[i]
        el.classList.toggle('selected', state.selected === i)
        el.classList.toggle('is-empty', isEmptyKey(key))
        el.setAttribute('aria-label', `Кнопка ${i}${key?.label ? `: ${key.label}` : ''}`)
        paintKey(canvas, views[i], style, labelSizes)
    })
}

function flashKey({ key, page }) {
    if (page !== state.page) return
    const el = keyEls[key]?.el
    if (!el) return
    el.classList.remove('flash')
    void el.offsetWidth // перезапуск анимации
    el.classList.add('flash')
}

/* ---------- Страницы ---------- */

function renderTabs() {
    const live = state.status.online && state.status.connected ? state.status.page : null
    const idle = idlePage()
    $('tabs').replaceChildren(
        ...pageNames().map(name => h('button', {
            class: `tab${name === state.page ? ' active' : ''}`,
            title: [name === startPage() && 'Стартовая страница', name === idle && 'Окно ожидания',
                name === live && 'Сейчас на устройстве'].filter(Boolean).join(' · ') || null,
            onclick: () => showPage(name),
        },
        name === startPage() && icon('star', 'tab-star'),
        name === idle && icon('moon', 'tab-moon'),
        h('span', {}, name),
        name === live && h('span', { class: 'tab-live' }))),
        h('button', { class: 'tab add', title: 'Новая страница', 'aria-label': 'Новая страница', onclick: () => addPage() }, icon('plus')))
}

function showPage(name) {
    if (name === state.page && state.selected === null) return
    state.page = name
    state.selected = null
    renderAll()
}

function pageNameProblem(name) {
    if (!name) return 'Введите название'
    if (name === 'back') return 'Название «back» зарезервировано для кнопки «Назад»'
    if (state.config.pages[name]) return 'Такая страница уже есть'
    return null
}

async function addPage({ open = true } = {}) {
    let n = pageNames().length + 1
    while (state.config.pages[`page${n}`]) n++
    const name = await askText({ title: 'Новая страница', label: 'Название', value: `page${n}`, okLabel: 'Создать', check: pageNameProblem })
    if (!name) return null
    state.config.pages[name] = {}
    if (open) {
        state.page = name
        state.selected = null
    }
    renderAll()
    return name
}

function renamePage(oldName, raw) {
    const name = raw.trim()
    if (name === oldName) return
    const problem = pageNameProblem(name)
    if (problem) {
        toast(problem, { type: 'error' })
        renderInspector()
        return
    }
    // Пересобрать объект, чтобы сохранить порядок страниц
    const pages = {}
    for (const [pageName, keys] of Object.entries(state.config.pages)) pages[pageName === oldName ? name : pageName] = keys
    state.config.pages = pages
    if (state.config.startPage === oldName) state.config.startPage = name
    if (state.config.idle?.page === oldName) state.config.idle.page = name
    walkActions(action => {
        if (action.type === 'page' && action.page === oldName) action.page = name
    })
    state.page = name
    renderAll()
}

async function deletePage(name) {
    let refs = 0
    walkActions(action => {
        if (action.type === 'page' && action.page === name) refs++
    })
    const keys = Object.values(state.config.pages[name]).filter(key => !isEmptyKey(key)).length
    const idle = idlePage()
    const wasStart = startPage() === name
    const wasIdle = idle === name
    // Новой стартовой станет первая оставшаяся страница, по возможности не окно ожидания
    const rest = pageNames().filter(page => page !== name)
    const nextStart = rest.find(page => page !== idle) ?? rest[0]
    const parts = [keys ? `На странице настроено кнопок: ${keys}.` : 'Страница пустая.']
    if (refs) parts.push(`Переходы на неё с других кнопок (${refs}) будут убраны.`)
    if (wasStart) {
        parts.push(nextStart === idle
            ? `Это стартовая страница. Стартовой станет «${nextStart}» — окно ожидания, других страниц нет.`
            : `Это стартовая страница: стартовой станет «${nextStart}».`)
    }
    if (wasIdle) parts.push('Это окно ожидания: оно перестанет появляться, пока вы не назначите другую страницу.')
    const ok = await confirmDialog({ title: `Удалить страницу «${name}»?`, text: parts.join(' '), okLabel: 'Удалить', danger: true })
    if (!ok) return
    delete state.config.pages[name]
    const prune = steps => steps.filter(step => {
        if (step.type === 'macro') step.steps = prune(step.steps)
        return !(step.type === 'page' && step.page === name)
    })
    for (const pageKeysList of Object.values(state.config.pages)) {
        for (const key of Object.values(pageKeysList)) {
            for (const [holder, prop] of [[key, 'action'], [key.toggle, 'action'], [key, 'longPress']]) {
                const action = holder?.[prop]
                if (action?.type === 'page' && action.page === name) delete holder[prop]
                else if (action?.type === 'macro') action.steps = prune(action.steps)
            }
        }
    }
    if (wasStart) state.config.startPage = nextStart
    if (wasIdle) delete state.config.idle.page
    state.page = startPage()
    state.selected = null
    renderAll()
}

// Назначить страницу окном ожидания. Первое окно ожидания сразу включаем через минуту,
// как и созданное кнопкой «Создать страницу ожидания»; при смене страницы время не трогаем
function makeIdlePage(name) {
    const idle = state.config.idle ?? {}
    const after = !idlePage() && !(idle.after > 0) ? 60 : idle.after
    state.config.idle = { ...idle, after, page: name }
    renderAll()
}

/* ---------- Операции с кнопками ---------- */

function select(index) {
    state.selected = index
    // Переключатель открываем в том состоянии, в котором он сейчас на устройстве
    const key = index === null ? null : pageKeys()[index]
    state.editOn = key?.toggle ? !!previewState(index, key, true).on : false
    renderDevice()
    renderInspector()
}

function swapKeys(from, to) {
    const keys = pageKeys()
    const a = keys[from]
    const b = keys[to]
    if (b) keys[from] = b
    else delete keys[from]
    if (a) keys[to] = a
    else delete keys[to]
    state.selected = to
    changed()
    renderInspector()
}

function copyKey(index) {
    const key = pageKeys()[index]
    if (isEmptyKey(key)) {
        toast('Кнопка пустая — копировать нечего')
        return
    }
    state.clipboard = structuredClone(key)
    toast(`Кнопка ${index} скопирована — выберите другую и нажмите Ctrl+V`)
    renderInspector()
}

function pasteKey(index) {
    if (!state.clipboard) return
    pageKeys()[index] = structuredClone(state.clipboard)
    changed()
    renderInspector()
}

function clearKey(index) {
    const page = state.page
    const previous = state.config.pages[page][index]
    if (isEmptyKey(previous)) return
    delete state.config.pages[page][index]
    changed()
    renderInspector()
    toast(`Кнопка ${index} очищена`, {
        timeout: 6000,
        action: {
            label: 'Вернуть',
            run: () => {
                if (!state.config.pages[page]) return
                state.config.pages[page][index] = previous
                renderAll()
            },
        },
    })
}

/* ---------- Отрисовка состояния ---------- */

function changed() {
    renderDevice()
    renderDirty()
}

function renderAll() {
    renderTabs()
    renderDevice()
    renderInspector()
    renderDirty()
}

function renderDirty() {
    recordHistory()
    $('undo').disabled = !history.past.length
    $('redo').disabled = !history.future.length
    const dirty = isDirty()
    $('save').disabled = !dirty || state.saving
    $('revert').disabled = !dirty
    $('dirty').hidden = !dirty
    document.title = `${dirty ? '● ' : ''}Конфигуратор кнопок`
}

function renderStatus() {
    const { online, connected } = state.status
    const [cls, text] = !online
        ? ['off', 'Утилита не отвечает']
        : connected ? ['on', 'Устройство подключено'] : ['wait', 'Устройство не найдено']
    $('status').className = `status ${cls}`
    $('status').querySelector('.status-text').textContent = text
    $('status').title = online && !connected ? 'Подключите контроллер и закройте Razer Synapse / Loupedeck' : ''
}

function showBanner(text, actions) {
    const banner = $('banner')
    banner.replaceChildren(icon('triangle-alert'), h('span', {}, text), h('span', { class: 'spacer' }),
        ...actions.map(a => h('button', { class: 'btn small', onclick: a.run }, a.label)))
    banner.hidden = false
}

function hideBanner() {
    $('banner').hidden = true
}

/* ---------- Инспектор ---------- */

const section = (title, ...children) => h('section', { class: 'section' }, h('h3', {}, title), ...children)
const field = (label, control, hint) => h('div', { class: 'field' },
    h('span', { class: 'field-label' }, label), control, hint && h('span', { class: 'field-hint' }, hint))
const details = (summary, open, ...children) => h('details', { class: 'more', open }, h('summary', {}, summary), h('div', { class: 'stack' }, ...children))
const checkbox = (label, checked, onChange) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }), h('span', {}, label))
const segmented = (options, value, onChange) => h('div', { class: 'seg' },
    options.map(([id, title]) => h('button', { class: id === value ? 'active' : null, onclick: () => onChange(id) }, title)))
const selectBox = (options, value, onChange) => h('select', { onchange: e => onChange(e.target.value) },
    options.map(([id, title]) => h('option', { value: id, selected: id === value }, title)))

// Слева общие настройки (для всех страниц), справа — выбранное: кнопка, а если её нет, то страница
function renderInspector() {
    renderGlobalPanel()
    renderSelectionPanel()
}

function renderGlobalPanel() {
    $('global-panel').replaceChildren(globalPanel())
}

function renderSelectionPanel() {
    $('inspector').replaceChildren(state.selected === null ? pagePanel() : keyPanel(state.selected))
}

const panelHead = (eyebrow, title) => h('div', { class: 'panel-head' }, h('div', {}, h('div', { class: 'eyebrow' }, eyebrow), h('h2', {}, title)))

function pagePanel() {
    const name = state.page
    const nameInput = h('input', {
        class: 'commit-on-blur',
        value: name,
        onchange: () => renamePage(name, nameInput.value),
        onkeydown: e => { if (e.key === 'Enter') nameInput.blur() },
    })
    return h('div', { class: 'panel' },
        panelHead('Страница', name),
        h('p', { class: 'field-hint flush' }, 'Кликните по кнопке на устройстве, чтобы настроить её. Esc вернёт сюда.'),
        section('Страница', h('div', { class: 'stack' },
            field('Название', nameInput),
            startPage() === name
                ? h('div', { class: 'start-badge' }, icon('star'), 'Стартовая — открывается при запуске утилиты')
                : h('div', {}, h('button', {
                    class: 'btn small',
                    onclick: () => {
                        state.config.startPage = name
                        renderAll()
                    },
                }, icon('star'), 'Сделать стартовой')),
            idlePage() === name
                ? h('div', { class: 'start-badge idle-badge' }, icon('moon'), idleBadgeText())
                : h('div', {}, h('button', { class: 'btn small', onclick: () => makeIdlePage(name) }, icon('moon'), 'Сделать окном ожидания')),
            h('div', {}, h('button', {
                class: 'btn small danger',
                disabled: pageNames().length < 2,
                title: pageNames().length < 2 ? 'Нельзя удалить единственную страницу' : null,
                onclick: () => deletePage(name),
            }, icon('trash-2'), 'Удалить страницу')))),
        section('Перенос', h('div', { class: 'stack' },
            h('div', { class: 'row wrap' },
                h('button', { class: 'btn small', onclick: () => exportCurrentPage(name) }, icon('download'), 'Экспорт в файл'),
                h('button', { class: 'btn small', onclick: () => pickPageFile() }, icon('upload'), 'Импорт страницы…')),
            h('span', { class: 'field-hint' }, 'Страница со всеми кнопками и своими иконками в одном файле. Импорт добавляет её новой страницей.'))))
}

async function exportCurrentPage(name) {
    try {
        // Экспортируем то, что видно сейчас, вместе с несохранёнными правками
        const keys = structuredClone(state.config.pages[name])
        for (const [index, key] of Object.entries(keys)) if (!Object.keys(key).length) delete keys[index]
        await exportPage(name, keys)
    } catch (err) {
        toast(err.message, { type: 'error' })
    }
}

function pickPageFile() {
    const input = h('input', { type: 'file', accept: '.json,application/json' })
    input.addEventListener('change', async () => {
        const file = input.files[0]
        if (!file) return
        try {
            const { name: wanted, keys } = await importPage(file)
            let name = wanted
            for (let n = 2; pageNameProblem(name); n++) name = `${wanted === 'back' ? 'page' : wanted} (${n})`
            state.config.pages[name] = keys
            state.page = name
            state.selected = null
            renderAll()
            // Переходы на страницы, которых здесь нет, проверка при сохранении не пропустит
            const missing = new Set()
            const walk = action => {
                if (action?.type === 'page' && action.page !== 'back' && !state.config.pages[action.page]) missing.add(action.page)
                if (action?.type === 'macro') action.steps.forEach(walk)
            }
            for (const key of Object.values(keys)) [key.action, key.toggle?.action, key.longPress].forEach(walk)
            toast(missing.size
                ? `Страница «${name}» добавлена. Здесь нет страниц ${[...missing].map(p => `«${p}»`).join(', ')}, на которые ведут её кнопки — поправьте их перед сохранением`
                : `Страница «${name}» добавлена — сохраните, чтобы она появилась на устройстве`, { type: missing.size ? 'error' : 'success', timeout: missing.size ? 10000 : 5000 })
        } catch (err) {
            toast(err.message, { type: 'error' })
        }
    })
    input.click()
}

// Плитки стилей: на каждой образец кнопки, нарисованный тем же кодом, что и на устройстве
function stylePicker() {
    const current = currentStyle()
    const view = keyView(STYLE_SAMPLE, { sources: previewSources() })
    return h('div', { class: 'style-grid', role: 'radiogroup' }, STYLES.map(style => {
        const canvas = h('canvas', { width: CANVAS_PX, height: CANVAS_PX })
        paintKey(canvas, view, style, null)
        const [name, hint] = STYLE_OPTIONS[style] ?? [style, '']
        return h('button', {
            class: `style-tile${style === current ? ' active' : ''}`,
            role: 'radio',
            'aria-checked': String(style === current),
            title: hint,
            onclick: () => {
                if (style === current) return
                if (style === DEFAULT_STYLE) delete state.config.keyStyle
                else state.config.keyStyle = style
                changed()
                renderInspector()
            },
        }, canvas, h('span', {}, name))
    }))
}

// Общие настройки: устройство, окно ожидания, копии, подсказки
function globalPanel() {
    const brightness = state.config.brightness ?? 10
    const output = h('output', {}, brightness)
    // Отступ содержимого от края кнопки в пикселях экрана; в конфиге хранится как доля (contentScale)
    const padding = Math.round((KEY_SIZE * (1 - (state.config.contentScale ?? DEFAULT_CONTENT_SCALE))) / 2)
    const paddingOutput = h('output', {}, `${padding} px`)
    const tab = state.globalTab
    return h('div', { class: 'panel' },
        tabBar(GLOBAL_TABS, tab, id => {
            state.globalTab = id
            renderGlobalPanel()
        }),
        tab === 'tips' && [panelHead('Для всех страниц', 'Подсказки'), h('section', { class: 'section' }, h('ul', { class: 'tips' },
            h('li', {}, 'Слева — общие настройки, справа — то, что выбрано: кнопка или, если кнопка не выбрана, страница.'),
            h('li', {}, 'Кликните по кнопке устройства, чтобы настроить её. Esc снимает выбор.'),
            h('li', {}, 'Перетащите кнопку на другую, чтобы поменять их местами.'),
            h('li', {}, 'Ctrl+C / Ctrl+V — копировать и вставить кнопку, Delete — очистить, стрелки — выбрать соседнюю.'),
            h('li', {}, 'На устройство изменения попадают после «Сохранить».')))],
        tab === 'device' && [panelHead('Для всех страниц', 'Устройство'), h('section', { class: 'section' }, h('div', { class: 'stack' },
            field('Яркость экрана', h('div', { class: 'range-row' },
                h('input', {
                    type: 'range',
                    min: 0,
                    max: 10,
                    step: 1,
                    value: brightness,
                    oninput: e => {
                        state.config.brightness = Number(e.target.value)
                        output.textContent = e.target.value
                        renderDirty()
                    },
                }),
                output)),
            field('Вид кнопок', stylePicker(), STYLE_OPTIONS[currentStyle()]?.[1]),
            field('Долгое нажатие', selectBox([[300, '0,3 секунды'], [400, '0,4 секунды'], [500, '0,5 секунды'], [700, '0,7 секунды'],
                [1000, '1 секунда']], state.config.longPressMs ?? 500, value => {
                if (Number(value) === 500) delete state.config.longPressMs
                else state.config.longPressMs = Number(value)
                renderDirty()
            }), 'Сколько держать кнопку, чтобы сработало действие на удержание.'),
            field('Отступ от края кнопки', h('div', { class: 'range-row' },
                h('input', {
                    type: 'range',
                    min: 0,
                    max: 12,
                    step: 1,
                    value: padding,
                    oninput: e => {
                        const px = Number(e.target.value)
                        const value = Math.round(((KEY_SIZE - 2 * px) / KEY_SIZE) * 10000) / 10000
                        if (value === DEFAULT_CONTENT_SCALE) delete state.config.contentScale
                        else state.config.contentScale = value
                        paddingOutput.textContent = `${px} px`
                        changed()
                    },
                }),
                paddingOutput), 'Насколько подписи, иконки и индикаторы отступают от края кнопки; фон остаётся на всю кнопку. Отодвинуть всю кнопку целиком — «Отступ кнопки от края» в подгонке под рамки.'),
            field('Подгонка под рамки', layoutEditor(),
                state.calibrating
                    ? 'На устройстве сейчас зелёные рамки. Двигайте их, пока каждая не будет видна в своём окошке одинаково со всех сторон, затем сохраните.'
                    : 'Если кнопки на устройстве сдвинуты относительно окошек или край обрезан рамкой.'))),
        h('section', { class: 'section', id: 'updates-section' }, h('h3', {}, 'Обновления'), h('div', { id: 'updates' }, updatesView()))],
        tab === 'idle' && [panelHead('Для всех страниц', 'Окно ожидания'), h('section', { class: 'section' }, idleEditor())],
        tab === 'backups' && [panelHead('Для всех страниц', 'Резервные копии'), h('section', { class: 'section' }, backupsEditor())])
}

// Раскладка кнопок на экране устройства (config.layout). Пока открыта подгонка, каждое изменение
// сразу показывается на устройстве разметкой, а в config.json попадает при сохранении
let lastCalibration = null

// Закрыли вкладку посреди подгонки — вернуть кнопки на устройство
window.addEventListener('pagehide', () => {
    if (!state.calibrating) return
    navigator.sendBeacon('/api/device', new Blob([JSON.stringify({ command: 'calibrate', layout: null })], { type: 'application/json' }))
})

/* ---------- Обновления ---------- */

const UPDATE_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

// Пункт трея «Проверить обновления» открывает конфигуратор с #updates: показать раздел и проверить
function openUpdatesFromHash() {
    if (location.hash !== '#updates' || !state.config) return
    window.history.replaceState(null, '', location.pathname)
    state.globalTab = 'device'
    renderGlobalPanel()
    $('updates-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    checkUpdates()
}
window.addEventListener('hashchange', openUpdatesFromHash)

// Перерисовать только раздел обновлений: он меняется по событиям утилиты
function renderUpdates() {
    $('updates')?.replaceChildren(updatesView())
}

async function checkUpdates() {
    try {
        state.update = await api('POST', '/api/update/check', {})
    } catch (err) {
        toast(err.message, { type: 'error' })
    }
    renderUpdates()
}

async function installUpdate() {
    const { latest, mode } = state.update
    const ok = await confirmDialog({
        title: `Обновить до ${latest.version}?`,
        text: mode === 'git'
            ? 'Утилита выполнит git pull и перезапустится.'
            : 'Утилита скачает новую версию, закроется на несколько секунд и запустится снова. Ваши настройки, иконки и резервные копии останутся.',
        okLabel: 'Обновить',
    })
    if (!ok) return
    try {
        await api('POST', '/api/update/install', {})
        toast('Устанавливаю обновление — утилита перезапустится, страница обновится сама', { timeout: 15000 })
        // Ждём, пока утилита поднимется с новой версией, и перезагружаем страницу с новым конфигуратором
        const started = Date.now()
        const poll = setInterval(async () => {
            if (Date.now() - started > 120000) return clearInterval(poll)
            try {
                const info = await api('GET', '/api/update')
                if (info && info.current === latest.version) {
                    clearInterval(poll)
                    location.reload()
                }
            } catch {}
        }, 2000)
    } catch (err) {
        toast(err.message, { type: 'error' })
    }
}

function updatesView() {
    const u = state.update
    if (!u) return h('p', { class: 'field-hint flush' }, 'Загрузка…')
    const rows = [h('p', { class: 'field-hint flush' }, `Установлена версия ${u.current}.`)]
    if (u.checking) rows.push(h('p', { class: 'field-hint flush' }, 'Проверяю…'))
    else if (u.installing) rows.push(h('p', { class: 'field-hint flush' }, 'Устанавливаю обновление…'))
    else if (u.error) rows.push(h('p', { class: 'field-hint flush error-text' }, u.error))
    else if (u.available) {
        rows.push(h('div', { class: 'update-card' },
            h('strong', {}, `Доступна версия ${u.latest.version}`),
            u.latest.published && h('span', { class: 'muted small' }, ` · ${UPDATE_DATE.format(new Date(u.latest.published))}`),
            u.latest.notes && h('pre', { class: 'update-notes' }, u.latest.notes.trim())))
    } else if (u.checked) {
        rows.push(h('p', { class: 'field-hint flush' }, u.latest ? 'Это последняя версия.' : 'На GitHub ещё нет релизов.'))
    }
    rows.push(h('div', { class: 'row-actions' },
        u.available && !u.installing && h('button', { class: 'btn small primary', onclick: installUpdate }, icon('download'), `Обновить до ${u.latest.version}`),
        h('button', { class: 'btn small', disabled: u.checking || u.installing, onclick: checkUpdates }, icon('refresh-cw'), 'Проверить'),
        u.latest?.url && h('a', { class: 'btn small ghost', href: u.latest.url, target: '_blank', rel: 'noopener' }, icon('external-link'), 'Релиз на GitHub')))
    return h('div', { class: 'stack' }, rows)
}

function sendCalibration(layout) {
    const json = JSON.stringify(layout)
    if (json === lastCalibration) return
    lastCalibration = json
    api('POST', '/api/device', { command: 'calibrate', layout }).catch(err => toast(err.message, { type: 'error' }))
}

function layoutEditor() {
    if (!state.calibrating) {
        return h('div', {}, h('button', {
            class: 'btn small',
            onclick: () => {
                state.calibrating = true
                lastCalibration = null
                renderGlobalPanel()
            },
        }, icon('scan'), 'Подогнать положение кнопок'))
    }
    const layout = layoutOf(state.config.layout)
    // Отмена (Ctrl+Z) и сброс тоже должны дойти до устройства
    sendCalibration(layout)
    const apply = next => {
        if (layoutProblem(next)) return toast('Дальше кнопки выйдут за край экрана', { type: 'error' })
        // В конфиг пишем только то, что отличается от умолчаний
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
        const custom = Object.fromEntries(Object.entries(next).filter(([k, v]) => !same(v, DEFAULT_LAYOUT[k])))
        if (Object.keys(custom).length) state.config.layout = custom
        else delete state.config.layout
        // Отступ и размер видны и в предпросмотре кнопок
        changed()
        renderGlobalPanel()
    }
    // Сдвинуть одну колонку/ряд (index) или все сразу (index === null)
    const shift = (axis, index, delta) => apply({
        ...layout,
        [axis]: layout[axis].map((v, i) => (index === null || i === index ? v + delta : v)),
    })
    const stepper = (title, value, onMinus, onPlus, minusTitle, plusTitle) => h('div', { class: 'layout-row' },
        h('span', {}, title),
        h('button', { class: 'icon-btn', title: minusTitle, 'aria-label': minusTitle, onclick: onMinus }, icon('minus')),
        h('output', {}, value),
        h('button', { class: 'icon-btn', title: plusTitle, 'aria-label': plusTitle, onclick: onPlus }, icon('plus')))
    const axisGroup = (axis, heading, name, minus, plus) => h('div', { class: 'layout-grid' },
        h('div', { class: 'layout-head' }, heading),
        stepper('Все сразу', '', () => shift(axis, null, -1), () => shift(axis, null, 1), `Все ${minus} на 1 px`, `Все ${plus} на 1 px`),
        layout[axis].map((value, i) => stepper(`${name} ${i + 1}`, `${value} px`,
            () => shift(axis, i, -1), () => shift(axis, i, 1), `${minus} на 1 px`, `${plus} на 1 px`)))
    return h('div', { class: 'stack' },
        axisGroup('columns', 'Колонки — по горизонтали', 'Колонка', 'влево', 'вправо'),
        axisGroup('rows', 'Ряды — по вертикали', 'Ряд', 'вверх', 'вниз'),
        h('div', { class: 'layout-grid' },
            stepper('Размер окошек', `${layout.size} px`,
                () => apply({ ...layout, size: Math.max(LAYOUT_SIZE_LIMITS[0], layout.size - 1) }),
                () => apply({ ...layout, size: Math.min(LAYOUT_SIZE_LIMITS[1], layout.size + 1) }),
                'Меньше на 1 px', 'Больше на 1 px'),
            stepper('Отступ кнопки от края', `${layout.inset} px`,
                () => apply({ ...layout, inset: Math.max(LAYOUT_INSET_LIMITS[0], layout.inset - 1) }),
                () => apply({ ...layout, inset: Math.min(LAYOUT_INSET_LIMITS[1], layout.inset + 1) }),
                'Меньше на 1 px', 'Больше на 1 px'),
            stepper('Скругление углов', `${layout.radius} px`,
                () => apply({ ...layout, radius: Math.max(LAYOUT_RADIUS_LIMITS[0], layout.radius - 1) }),
                () => apply({ ...layout, radius: Math.min(LAYOUT_RADIUS_LIMITS[1], layout.radius + 1) }),
                'Меньше на 1 px', 'Больше на 1 px')),
        h('div', { class: 'row-actions' },
            h('button', {
                class: 'btn small',
                onclick: () => {
                    state.calibrating = false
                    lastCalibration = null
                    api('POST', '/api/device', { command: 'calibrate', layout: null }).catch(err => toast(err.message, { type: 'error' }))
                    renderGlobalPanel()
                    if (isDirty()) toast('Положение изменено — сохраните, чтобы применить его к кнопкам')
                },
            }, icon('check'), 'Готово'),
            h('button', {
                class: 'btn small ghost',
                onclick: () => {
                    delete state.config.layout
                    renderDirty()
                    renderGlobalPanel()
                },
            }, icon('rotate-ccw'), 'Как было по умолчанию')))
}

// Вкладки левой панели — общих настроек
const GLOBAL_TABS = [['device', 'Устройство', 'monitor'], ['idle', 'Ожидание', 'moon'], ['backups', 'Копии', 'history'],
    ['tips', 'Подсказки', 'lightbulb']]

const BACKUP_TIME = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Список копий грузится с утилиты при открытии вкладки
function backupsEditor() {
    const list = h('div', { class: 'backup-list' }, h('p', { class: 'muted small' }, 'Загрузка…'))
    api('GET', '/api/backups').then(({ backups }) => {
        list.replaceChildren(...(backups.length
            ? backups.map(({ name, time }) => h('div', { class: 'backup-row' },
                h('span', {}, BACKUP_TIME.format(new Date(time))),
                h('button', { class: 'btn small', onclick: () => openBackup(name, time) }, icon('rotate-ccw'), 'Открыть')))
            : [h('p', { class: 'muted small' }, 'Копий пока нет — они появятся после первого сохранения.')]))
    }).catch(err => list.replaceChildren(h('p', { class: 'field-error' }, err.message)))
    return h('div', { class: 'stack' },
        h('p', { class: 'field-hint flush' }, 'Перед каждым сохранением прежняя версия config.json копируется в папку backups рядом с ним. Хранятся последние 30.'),
        list)
}

// Копия открывается как несохранённые изменения: её можно посмотреть, отменить (Ctrl+Z) или сохранить
async function openBackup(name, time) {
    try {
        const { config } = await api('GET', `/api/backup?name=${encodeURIComponent(name)}`)
        state.config = config
        if (!config.pages[state.page]) state.page = startPage()
        state.selected = null
        renderAll()
        toast(`Открыта копия от ${BACKUP_TIME.format(new Date(time))}. Сохраните, чтобы вернуть её на устройство`, {
            timeout: 8000,
            action: { label: 'Отменить', run: undo },
        })
    } catch (err) {
        toast(err.message, { type: 'error' })
    }
}

// Полоса вкладок. tabs: [id, название, иконка, isSet?] — isSet() true рисует точку «здесь что-то настроено»
function tabBar(tabs, current, onPick, subject) {
    // Четыре и больше вкладок в узкой панели не помещаются с подписями — см. .key-tabs-many в style.css
    return h('div', { class: `key-tabs${tabs.length > 3 ? ' key-tabs-many' : ''}`, role: 'tablist' }, tabs.map(([id, title, glyph, isSet]) => h('button', {
        class: `key-tab${current === id ? ' active' : ''}`,
        role: 'tab',
        'aria-selected': current === id ? 'true' : 'false',
        onclick: () => onPick(id),
        title,
    }, icon(glyph), h('span', { class: 'key-tab-label' }, title), isSet?.(subject) && h('span', { class: 'key-tab-dot' }))))
}

// Отметка в панели страницы, которая назначена окном ожидания
function idleBadgeText() {
    const after = state.config.idle?.after
    if (!(after > 0)) return 'Окно ожидания — сейчас выключено, включите его во вкладке «Ожидание»'
    const delay = IDLE_DELAYS.find(([value]) => value === after)?.[1] ?? `через ${after} с`
    return `Окно ожидания — открывается ${delay} без нажатий`
}

// Окно ожидания — обычная страница, которая сама открывается, если кнопки долго не трогать
function idleEditor() {
    const config = state.config
    const idle = config.idle ?? {}
    const setIdle = (field, value) => {
        config.idle = { ...config.idle, [field]: value }
        changed()
        renderTabs()
        renderInspector()
    }
    const createIdlePage = () => {
        let name = 'Ожидание'
        for (let n = 2; config.pages[name]; n++) name = `Ожидание ${n}`
        config.pages[name] = structuredClone(IDLE_PAGE)
        config.idle = { after: idle.after || 60, page: name }
        state.page = name
        state.selected = null
        renderAll()
        toast('Страница ожидания создана — сохраните, чтобы она заработала')
    }
    const current = idlePage()
    // Яркость в ожидании: не задана — как обычно (config.brightness)
    const normal = config.brightness ?? 10
    const idleBrightness = idle.brightness ?? normal
    const brightnessText = value => (value === 0 ? 'выкл' : String(value))
    const brightnessOutput = h('output', {}, brightnessText(idleBrightness))
    const savedIdle = JSON.parse(state.savedJson || '{}').idle
    return h('div', { class: 'stack' },
        field('Окно ожидания', h('div', { class: 'row wrap' },
            selectBox(IDLE_DELAYS, idle.after ?? 0, value => setIdle('after', Number(value))),
            // Окном ожидания можно назначить любую страницу, в том числе после удаления прежней
            h('select', { 'aria-label': 'Страница окна ожидания', onchange: e => makeIdlePage(e.target.value) },
                !current && h('option', { value: '', selected: true, disabled: true }, 'Выберите страницу'),
                pageNames().map(name => h('option', { value: name, selected: name === current }, name)))),
        current
            ? 'Страница со значком луны. Откройте её, чтобы поменять, что на ней показано. Любое нажатие возвращает кнопки.'
            : 'Страница, которая сама открывается, если кнопки не трогать. Выберите любую или создайте новую: с загрузкой системы, музыкой и часами.'),
        !current && h('div', {}, h('button', { class: 'btn small', onclick: createIdlePage },
            icon('moon'), 'Создать страницу ожидания')),
        savedIdle?.page && h('div', {}, h('button', {
            class: 'btn small ghost',
            onclick: () => api('POST', '/api/device', { command: 'idle' }).catch(err => toast(err.message, { type: 'error' })),
        }, icon('monitor'), 'Показать на устройстве')),
        field('Яркость в ожидании', h('div', { class: 'range-row' },
            h('input', {
                type: 'range',
                min: 0,
                max: 10,
                step: 1,
                value: idleBrightness,
                oninput: e => {
                    const value = Number(e.target.value)
                    config.idle = { ...config.idle, brightness: value }
                    // Как обычно — значит, не задана: поменяют общую яркость — поменяется и эта
                    if (value === normal) delete config.idle.brightness
                    brightnessOutput.textContent = brightnessText(value)
                    renderDirty()
                },
            }),
            brightnessOutput), `Пока показано окно ожидания, экран светит так. Первое нажатие возвращает кнопки и обычную яркость (${normal}). 0 — экран гаснет.`))
}

function keyPanel(index) {
    pageKeys()[index] ??= {}
    const key = pageKeys()[index]
    return h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
            h('div', {}, h('div', { class: 'eyebrow' }, `Страница «${state.page}»`), h('h2', {}, `Кнопка ${index}`)),
            h('div', { class: 'head-actions' },
                iconButton('mouse-pointer-click', 'Нажать: выполнить действие, как будто кнопку нажали на устройстве', () => testPress(index)),
                iconButton('copy', 'Копировать (Ctrl+C)', () => copyKey(index)),
                iconButton('clipboard-paste', 'Вставить (Ctrl+V)', () => pasteKey(index), !state.clipboard),
                iconButton('eraser', 'Очистить (Delete)', () => clearKey(index)),
                iconButton('x', 'Закрыть (Esc)', () => select(null)))),
        keyTabs(key),
        // Заголовок раздела повторял бы название вкладки
        state.keyTab === 'look' && h('section', { class: 'section' }, appearanceEditor(key)),
        state.keyTab === 'action' && [
            section('Режим', toggleEditor(key)),
            section('Действие', keyActionEditor(key, 'action', key),
                key.toggle && (key.toggle.source ?? 'self') === 'self' && onActionEditor(key)),
            section('Долгое нажатие', longPressEditor(key, index)),
        ],
        state.keyTab === 'meter' && h('section', { class: 'section' }, meterEditor(key)))
}

// Вкладки настроек кнопки. Точка — на вкладке что-то настроено
const KEY_TABS = [
    ['look', 'Вид', 'palette', key => key.label || key.icon || key.color],
    ['action', 'Действие', 'zap', key => key.action || key.longPress || key.toggle],
    ['meter', 'Индикатор', 'gauge', key => key.meter],
]

function keyTabs(key) {
    return tabBar(KEY_TABS, state.keyTab, id => {
        state.keyTab = id
        renderSelectionPanel()
    }, key)
}

// Нажатие из конфигуратора выполняет то, что сохранено в config.json
async function testPress(index, long = false) {
    if (isDirty()) toast('Нажатие выполнит сохранённую версию кнопки — сначала сохраните изменения, если нужно проверить их')
    try {
        await api('POST', '/api/device', { command: 'press', key: index, long })
    } catch (err) {
        toast(err.message, { type: 'error' })
    }
}

function longPressEditor(key, index) {
    const hold = key.action?.type === 'hotkey' && key.action.hold
    const delay = state.config.longPressMs ?? 500
    return h('div', { class: 'stack' },
        checkbox('Своё действие, если удерживать кнопку', !!key.longPress, checked => {
            if (checked) key.longPress = defaultAction('hotkey')
            else delete key.longPress
            changed()
            renderInspector()
        }),
        key.longPress && hold && h('p', { class: 'field-error' }, 'Не работает вместе с «Удерживать, пока нажата кнопка» — выключите одно из двух.'),
        key.longPress && keyActionEditor(key, 'longPress', key),
        key.longPress && h('div', { class: 'row wrap' },
            h('button', { class: 'btn small ghost', onclick: () => testPress(index, true) }, icon('mouse-pointer-click'), 'Проверить долгое нажатие')),
        h('span', { class: 'field-hint' }, key.longPress
            ? `Держите кнопку дольше ${delay} мс. Обычное действие тогда выполняется при отпускании. Время меняется в настройках страницы → «Устройство».`
            : 'Удвоит возможности кнопки: коротко — одно действие, удержали — другое. В углу кнопки появится отметка.'))
}

function toggleEditor(key) {
    const rerender = () => {
        changed()
        renderInspector()
    }
    const source = key.toggle?.source ?? 'self'
    return h('div', { class: 'stack' },
        h('div', {}, segmented([['normal', 'Обычная'], ['toggle', 'Вкл / Выкл']], key.toggle ? 'toggle' : 'normal', mode => {
            if (mode === 'toggle') key.toggle ??= {}
            else delete key.toggle
            state.editOn = false
            rerender()
        })),
        key.toggle && field('Состояние', selectBox(TOGGLE_SOURCES, source, value => {
            if (value === 'self') {
                delete key.toggle.source
            } else {
                key.toggle.source = value
                // Чтобы кнопка переключала то, что показывает
                if (!key.action || key.action.type === 'mute') key.action = { type: 'mute', target: value }
            }
            state.editOn = !!previewState(state.selected, key, true).on
            rerender()
        }), source === 'self'
            ? 'Кнопка сама помнит, включена ли она. Если переключить то же самое в программе мышкой, кнопка этого не узнает — нажмите её ещё раз.'
            : 'Кнопка показывает настоящее состояние Windows и обновляется сама, даже если звук выключили мышкой.'))
}

function meterEditor(key) {
    const rerender = () => {
        changed()
        renderInspector()
    }
    return h('div', { class: 'stack' },
        field('Что показывать', meterSelect(key.meter ?? '', value => {
            // Подпись индикатора подставляем сами, её можно стереть. Свою подпись не трогаем
            if (!key.label || key.label === METER_CAPTIONS[key.meter]) {
                if (METER_CAPTIONS[value] && value !== 'nowPlaying') key.label = METER_CAPTIONS[value]
                else delete key.label
            }
            if (value) key.meter = value
            else delete key.meter
            // Нажатие на «Сейчас играет» по умолчанию ставит музыку на паузу
            if (value === 'nowPlaying' && !key.action) key.action = defaultAction('media')
            rerender()
        }), meterHint(key.meter)),
        key.meter === 'weather' && weatherPlaceEditor())
}

// Город для погоды — общий для всех кнопок погоды (config.weather)
function weatherPlaceEditor() {
    const current = state.config.weather
    const results = h('div', { class: 'place-results' })
    const input = h('input', {
        type: 'search',
        placeholder: 'Например: Прага',
        onkeydown: e => {
            if (e.key === 'Enter') search()
        },
    })
    async function search() {
        const query = input.value.trim()
        if (query.length < 2) return
        results.replaceChildren(h('p', { class: 'muted small' }, 'Ищу…'))
        try {
            const { places } = await api('GET', `/api/geocode?q=${encodeURIComponent(query)}`)
            results.replaceChildren(...(places.length
                ? places.map(place => h('button', {
                    class: 'place-row',
                    onclick: () => {
                        state.config.weather = { city: place.name, latitude: place.latitude, longitude: place.longitude }
                        changed()
                        renderSelectionPanel()
                        toast(`Город: ${place.name}. Сохраните — погода появится на кнопке`)
                    },
                }, h('strong', {}, place.name), place.region && h('span', { class: 'muted' }, place.region)))
                : [h('p', { class: 'muted small' }, 'Ничего не нашлось — попробуйте написать иначе')]))
        } catch (err) {
            results.replaceChildren(h('p', { class: 'field-error' }, err.message))
        }
    }
    return field('Город', h('div', { class: 'stack' },
        current && h('div', { class: 'start-badge' }, icon('map-pin'), current.city || `${current.latitude}, ${current.longitude}`),
        h('div', { class: 'row' }, input, h('button', { class: 'btn small', onclick: search }, icon('search'), 'Найти')),
        results), 'Один город для всех кнопок погоды.')
}

function meterSelect(value, onChange) {
    return h('select', { onchange: e => onChange(e.target.value) },
        h('option', { value: '', selected: !value }, 'Нет'),
        METER_GROUPS.map(([group, options]) => h('optgroup', { label: group },
            options.map(([id, title]) => h('option', { value: id, selected: id === value }, title)))))
}

function meterHint(meter) {
    if (!meter) return 'Живые данные вместо иконки: громкость, загрузка системы, часы, музыка.'
    if (meter === 'nowPlaying') return 'Обложка, название и исполнитель трека. Берётся Spotify, если он запущен, иначе плеер, который играет сейчас.'
    if (meter === 'weather') return 'Температура и небо сейчас по данным Open-Meteo, обновляется раз в 15 минут. Нужен интернет.'
    if (meter.startsWith('clock-')) return 'Поставьте пять кнопок в ряд: десятки и единицы часов, двоеточие, десятки и единицы минут. Подписи у них нет: цифра занимает всю кнопку.'
    return 'Обновляется на устройстве раз в секунду.'
}

function normalizeHex(color) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()
    if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map(c => c + c).join('')}`.toLowerCase()
    return '#000000'
}

function colorPicker(value, swatches, onChange) {
    const input = h('input', { type: 'color' })
    const row = h('div', { class: 'swatches' })
    const mark = color => {
        input.value = color
        row.querySelectorAll('.swatch[data-color]').forEach(s => s.classList.toggle('active', s.dataset.color === color))
    }
    for (const color of swatches) {
        row.append(h('button', {
            class: 'swatch',
            'data-color': color,
            title: color,
            style: { '--c': color },
            onclick: () => {
                mark(color)
                onChange(color)
            },
        }))
    }
    input.addEventListener('input', () => {
        mark(input.value)
        onChange(input.value)
    })
    row.append(h('label', { class: 'swatch custom', title: 'Свой цвет' }, input))
    mark(normalizeHex(value))
    return row
}

// У переключателя редактируем выключенное состояние (поля кнопки) или включённое (поля key.toggle)
function appearanceEditor(key) {
    const editingOn = !!key.toggle && state.editOn
    const target = editingOn ? key.toggle : key
    const inherited = name => (editingOn ? key[name] : undefined)
    // В тёмных и светлом стилях цвет кнопки — оттенок, а не заливка, и цвет текста выбирать не нужно
    const tinted = styleKind(currentStyle()) !== 'fill'
    const iconBox = iconField(key, target, editingOn)
    return h('div', { class: 'stack' },
        key.toggle && h('div', {}, segmented([['off', 'Выключено'], ['on', 'Включено']], editingOn ? 'on' : 'off', value => {
            state.editOn = value === 'on'
            renderDevice()
            renderInspector()
        })),
        editingOn && h('p', { class: 'field-hint flush' }, 'Что не задано здесь, берётся из выключенного состояния.'),
        // У цифр больших часов подписи нет: цифра занимает всю кнопку (см. meterHint)
        !key.meter?.startsWith('clock-') && field('Подпись', h('textarea', {
            rows: 2,
            placeholder: editingOn ? (key.label ?? '') : (METER_CAPTIONS[key.meter] ?? 'Например: Mute Discord'),
            value: target.label ?? '',
            oninput: e => {
                target.label = e.target.value
                changed()
            },
        }), 'Что написано, то и видно. Оставьте пустой, чтобы на кнопке были только индикатор или картинка — крупно'),
        field(tinted ? 'Цвет' : 'Фон', colorPicker(target.color ?? inherited('color') ?? '#000000', BG_SWATCHES, color => {
            target.color = color
            changed()
            iconBox.refresh()
        }), tinted ? `В стиле «${STYLE_OPTIONS[currentStyle()]?.[0]}» цвет кнопки окрашивает иконку и индикаторы` : null),
        !tinted && field('Цвет текста', colorPicker(target.textColor ?? inherited('textColor') ?? '#ffffff', TEXT_SWATCHES, color => {
            target.textColor = color
            changed()
            iconBox.refresh()
        })),
        field('Иконка', iconBox, key.meter ? 'Пока включён индикатор, кнопка показывает его вместо иконки' : null))
}

function iconField(key, target, editingOn) {
    const box = h('div', { class: 'stack' })
    const current = () => keyView(key, { on: key.toggle ? editingOn : null })
    const edit = mutate => {
        mutate()
        changed()
        box.refresh()
    }
    const pick = () => {
        const { look } = current()
        openIconPicker({
            background: keyBackdrop(look, currentStyle()),
            autoColor: iconTint({ ...look, iconColor: undefined }, currentStyle()),
            onPick: (path, color) => edit(() => {
                target.icon = path
                // color: undefined — не трогать, null — цвет по теме
                if (color === null) delete target.iconColor
                else if (color) target.iconColor = color
            }),
        })
    }
    box.refresh = () => {
        const { look, icon: spec } = current()
        const tint = iconTint(look, currentStyle())
        const value = target.icon
        let name
        if (value === 'none') name = 'Без иконки'
        else if (value?.startsWith('lucide:')) name = value.slice('lucide:'.length)
        else if (value) name = value
        else if (editingOn) name = 'Как в выключенном состоянии'
        else name = spec?.lucide ? `Авто: ${spec.lucide}` : 'Авто'
        const thumb = h('button', {
            class: 'icon-thumb',
            title: 'Выбрать иконку',
            style: { '--thumb-bg': keyBackdrop(look, currentStyle()) },
            onclick: pick,
        }, !spec
            ? icon('image-off')
            : spec.lucide
                ? h('span', { class: 'lib-ico', style: { '--src': `url(/lucide/${spec.lucide}.svg)`, '--icon-color': tint } })
                : h('img', { src: iconUrl(spec.file), alt: '' }))
        box.replaceChildren(
            h('div', { class: 'icon-field' }, thumb,
                h('div', { class: 'icon-meta' },
                    h('div', { class: 'icon-name', title: name }, name),
                    h('div', { class: 'row wrap' },
                        h('button', { class: 'btn small', onclick: pick }, icon('image'), 'Выбрать…'),
                        value && h('button', { class: 'btn small ghost', onclick: () => edit(() => delete target.icon) },
                            editingOn ? 'Как в выключенном' : 'Авто'),
                        value !== 'none' && h('button', { class: 'btn small ghost', onclick: () => edit(() => { target.icon = 'none' }) },
                            'Без иконки')))),
            // Не через &&: replaceChildren выводит undefined как текст «undefined»
            spec?.lucide ? field('Цвет иконки', iconColorPicker(target, () => {
                changed()
                box.refresh()
            })) : '')
    }
    box.refresh()
    return box
}

// «Авто» — цвет по теме: в «Графите» цвет кнопки, в остальных цвет текста
function iconColorPicker(target, onChange) {
    const row = colorPicker(target.iconColor ?? '', ICON_SWATCHES, color => {
        target.iconColor = color
        onChange()
    })
    row.prepend(h('button', {
        class: `chip small${target.iconColor ? '' : ' active'}`,
        onclick: () => {
            delete target.iconColor
            onChange()
        },
    }, 'Авто'))
    return row
}

/* ---------- Редакторы действий ---------- */

// holder[prop] — редактируемое действие: key.action или key.toggle.action
function keyActionEditor(holder, prop, key) {
    const root = h('div')
    const stash = {} // чтобы при переключении типа туда-обратно не терять введённое
    const main = holder === key && prop === 'action'
    const render = () => {
        const action = holder[prop]
        const current = action?.type ?? null
        const types = [null, ...KEY_ACTIONS]
        if (current && !types.includes(current)) types.push(current)
        // «Сейчас играет» без своего действия ставит на паузу (bind.js)
        const none = main
            ? (key.meter === 'nowPlaying' ? 'Нажатие ставит музыку на паузу и снимает с неё.' : 'Кнопка только для показа: нажатие ничего не делает.')
            : prop === 'longPress' ? 'При удержании ничего не происходит.' : 'Во включённом состоянии выполняется то же действие.'
        root.replaceChildren(
            h('div', { class: 'type-grid' }, types.map(type => h('button', {
                class: `type-btn${type === current ? ' active' : ''}`,
                onclick: () => setType(type),
            }, icon(type ? ACTIONS[type].icon : 'ban'), h('span', {}, type ? ACTIONS[type].label : 'Нет')))),
            action ? actionBody(action, main ? { key } : { allowHold: false }) : h('p', { class: 'muted small' }, none))
    }
    const setType = type => {
        const action = holder[prop]
        if ((action?.type ?? null) === type) return
        if (action) stash[action.type] = action
        if (type) holder[prop] = stash[type] ?? defaultAction(type)
        else delete holder[prop]
        // Громкость удобнее сразу с индикатором, «без звука» — сразу переключателем, который показывает звук
        let modeChanged = false
        if (main && type === 'volume' && !key.meter) {
            key.meter = 'volume'
            modeChanged = true
        }
        if (main && type === 'mute' && !key.toggle) {
            key.toggle = { source: holder[prop].target ?? 'speakers' }
            state.editOn = !!previewState(state.selected, key, true).on
            modeChanged = true
        }
        // «Закрепить» — всегда переключатель, который показывает, закреплён ли экран
        if (main && type === 'pin' && key.toggle?.source !== 'pin') {
            key.toggle = { ...(key.toggle ?? {}), source: 'pin' }
            state.editOn = !!previewState(state.selected, key, true).on
            modeChanged = true
        }
        changed()
        if (modeChanged) renderInspector()
        else render()
    }
    render()
    return root
}

// Отдельное действие во включённом состоянии (только у переключателя, который помнит себя сам)
function onActionEditor(key) {
    const enabled = !!key.toggle.action
    return h('div', { class: 'stack on-action' },
        checkbox('Во включённом состоянии — другое действие', enabled, checked => {
            if (checked) key.toggle.action = key.action ? structuredClone(key.action) : defaultAction('hotkey')
            else delete key.toggle.action
            changed()
            renderInspector()
        }),
        enabled && keyActionEditor(key.toggle, 'action', key))
}

// key — кнопка, если действие основное (для индикатора и переключателя), в шагах макроса null.
// Удержание не имеет смысла в макросе, у переключателя и вместе с долгим нажатием
function actionBody(action, { inMacro = false, key = null, allowHold = !inMacro && !key?.toggle && !key?.longPress } = {}) {
    switch (action.type) {
        case 'hotkey': return hotkeyEditor(action, { allowHold })
        case 'text': return textEditor(action)
        case 'run': return runEditor(action)
        case 'open': return openEditor(action)
        case 'macro': return macroEditor(action)
        case 'page': return pageEditor(action)
        case 'volume': return volumeEditor(action, key)
        case 'mute': return muteEditor(action, key)
        case 'mixer': return mixerEditor(action)
        case 'pin': return h('p', { class: 'field-hint flush' }, 'Вкл / выкл. Пока включено, страница на устройстве закреплена: '
            + 'окно ожидания не появляется, переходы на другие страницы не срабатывают. Панели плеера и громкости открываются как обычно. '
            + 'Состояние запоминается и после перезапуска.')
        case 'idle': return h('p', { class: 'field-hint flush' }, idlePage()
            ? 'Сразу показывает окно ожидания — как будто деку «заблокировали». Первое нажатие любой кнопки только возвращает кнопки.'
            : 'Окно ожидания ещё не настроено — выберите для него страницу на вкладке «Ожидание» слева.')
        case 'player': return h('p', { class: 'field-hint flush' }, 'Кнопки устройства на время превращаются в пульт плеера: '
            + 'по бокам треки и перемотка на 10 и 30 с, в центре пауза, сверху обложка, перемешивание и повтор, '
            + 'снизу «Закрыть». Сам закрывается через 5 секунд без нажатий. '
            + 'Удобно повесить на долгое нажатие кнопки «Сейчас играет».')
        case 'volumeSet': return volumeSetEditor(action)
        case 'media': return mediaEditor(action)
        case 'system': return systemEditor(action)
        case 'delay': return delayEditor(action)
        default: return h('div')
    }
}

function volumeEditor(action, key) {
    const stepInput = h('input', {
        type: 'number',
        class: 'num',
        min: 1,
        max: 50,
        step: 1,
        value: Math.abs(action.step),
        oninput: () => {
            const size = Math.min(50, Math.max(1, Math.round(Number(stepInput.value) || 1)))
            action.step = (action.step < 0 ? -1 : 1) * size
            changed()
        },
    })
    const target = action.target ?? 'speakers'
    const meter = target === 'mic' ? 'mic' : 'volume'
    return h('div', { class: 'stack' },
        field('Что менять', selectBox([['speakers', 'Громкость звука'], ['mic', 'Громкость микрофона']], target, value => {
            if (value === 'speakers') delete action.target
            else action.target = value
            // Индикатор кнопки следует за тем, что она меняет
            if (key?.meter === 'volume' || key?.meter === 'mic') key.meter = value === 'mic' ? 'mic' : 'volume'
            changed()
            renderInspector()
        })),
        h('div', {}, segmented([['up', 'Громче'], ['down', 'Тише']], action.step > 0 ? 'up' : 'down', direction => {
            action.step = (direction === 'up' ? 1 : -1) * Math.abs(action.step)
            changed()
            renderInspector()
        })),
        field('Шаг', h('div', { class: 'row' }, stepInput, h('span', { class: 'muted' }, '%')),
            'Громкость встаёт на ближайшее значение, кратное шагу: 47 → 50 → 55. Это громкость Windows по умолчанию.'),
        key && checkbox(target === 'mic' ? 'Показывать уровень микрофона на кнопке' : 'Показывать уровень громкости на кнопке',
            key.meter === meter, checked => {
                if (checked) key.meter = meter
                else delete key.meter
                changed()
                renderInspector()
            }))
}

function mediaEditor(action) {
    const box = h('div', { class: 'stack' })
    const render = () => box.replaceChildren(
        field('Команда плееру', selectBox(MEDIA_COMMANDS, action.command, value => {
            action.command = value
            if (value === 'seek') action.seconds ??= 10
            else delete action.seconds
            changed()
            render()
        }), 'Уходит в Spotify, если он запущен, иначе в плеер, который играет сейчас: браузер, YouTube, медиаплеер. '
            + 'Перемотку, перемешивание и повтор поддерживают не все плееры.'),
        action.command === 'seek' && field('На сколько секунд', h('input', {
            type: 'number',
            class: 'num',
            step: 5,
            value: action.seconds ?? 10,
            oninput: e => {
                action.seconds = Math.round(Number(e.target.value)) || 10
                changed()
            },
        }), 'Минус — назад, например −10.'))
    render()
    return box
}

function systemEditor(action) {
    return field('Что сделать', selectBox(SYSTEM_COMMANDS, action.command, value => {
        action.command = value
        changed()
    }), 'Сочетание Win+L, отправленное программой, Windows игнорирует, поэтому блокировка — отдельная команда.')
}

function mixerEditor(action) {
    return h('div', { class: 'stack' },
        field('Чем управлять', selectBox(MUTE_TARGETS, action.target ?? 'speakers', value => {
            action.target = value
            changed()
        })),
        h('p', { class: 'field-hint flush' }, 'Кнопки устройства на время превращаются в регулятор: по бокам −/+ с шагом 1, 5 и 10, '
            + 'в центре 0, 25, 50, 75 и 100%, сверху уровень, снизу «Закрыть». Сам закрывается через 5 секунд без нажатий. '
            + 'Удобно повесить на долгое нажатие кнопки звука или микрофона.'))
}

function volumeSetEditor(action) {
    return h('div', { class: 'stack' },
        field('Чей уровень', selectBox(MUTE_TARGETS, action.target ?? 'speakers', value => {
            action.target = value
            changed()
        })),
        field('Уровень, %', h('input', {
            type: 'number',
            class: 'num',
            min: 0,
            max: 100,
            value: action.value ?? 50,
            oninput: e => {
                action.value = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)))
                changed()
            },
        })))
}

function muteEditor(action, key) {
    const target = action.target ?? 'speakers'
    return h('div', { class: 'stack' },
        field('Что выключать', selectBox(MUTE_TARGETS, target, value => {
            if (key?.toggle?.source === target) key.toggle.source = value
            action.target = value
            changed()
            renderInspector()
        })),
        key && checkbox('Показывать на кнопке, выключен ли звук (режим «Вкл / Выкл»)', key.toggle?.source === target, checked => {
            if (checked) key.toggle = { ...(key.toggle ?? {}), source: target }
            else delete key.toggle
            state.editOn = checked && !!previewState(state.selected, key, true).on
            changed()
            renderInspector()
        }))
}

function hotkeyEditor(action, { allowHold }) {
    const modButtons = MODIFIERS.map(m => h('button', {
        class: 'chip',
        onclick: () => update(combo => {
            if (combo.mods.has(m.name)) combo.mods.delete(m.name)
            else combo.mods.add(m.name)
        }),
    }, m.label))
    const keySelect = h('select', { onchange: () => update(combo => { combo.keys = keySelect.value ? [keySelect.value] : [] }) },
        h('option', { value: '' }, '— клавиша —'),
        KEY_GROUPS.map(group => h('optgroup', { label: group.label },
            group.keys.map(([name, label]) => h('option', { value: name }, label)))))
    const knownOptions = new Set([...keySelect.options].map(o => o.value))
    const preview = h('div', { class: 'combo-preview' })
    const text = h('input', {
        class: 'mono',
        spellcheck: 'false',
        placeholder: 'ctrl+shift+m',
        oninput: () => {
            action.keys = text.value.replace(/\s+/g, '').toLowerCase()
            sync(false)
            changed()
        },
    })
    const error = h('div', { class: 'field-error' })
    const recordLabel = h('span', {}, 'Записать')
    const recordButton = h('button', { class: 'btn small', onclick: () => (recording ? stopRecording() : startRecording()) },
        icon('circle-dot'), recordLabel)

    function update(mutate) {
        const combo = parseCombo(action.keys)
        mutate(combo)
        action.keys = buildCombo(combo.mods, combo.keys)
        sync()
        changed()
    }

    function sync(updateText = true) {
        const { mods, keys } = parseCombo(action.keys)
        modButtons.forEach((button, i) => button.classList.toggle('active', mods.has(MODIFIERS[i].name)))
        keySelect.value = keys.length === 1 && knownOptions.has(keys[0]) ? keys[0] : ''
        if (updateText) text.value = action.keys
        const tokens = action.keys.split('+').filter(Boolean)
        preview.replaceChildren(...(tokens.length
            ? tokens.map(k => h('kbd', {}, keyLabel(k)))
            : [h('span', { class: 'muted small' }, 'Сочетание не задано — выберите клавишу или нажмите «Записать»')]))
        const unknown = tokens.filter(k => !state.keyNames.has(k))
        error.textContent = unknown.length ? `Неизвестные клавиши: ${unknown.join(', ')}` : ''
    }

    // Запись сочетания с клавиатуры. Используется физическая клавиша (code), поэтому раскладка не важна
    let recording = false
    function onKey(e) {
        e.preventDefault()
        e.stopPropagation()
        if (e.type !== 'keydown' || MODIFIER_CODES.has(e.code)) return
        const key = keyFromCode(e.code)
        if (!key) return
        const mods = new Set()
        if (e.ctrlKey) mods.add('ctrl')
        if (e.shiftKey) mods.add('shift')
        if (e.altKey) mods.add('alt')
        if (e.metaKey) mods.add('win')
        action.keys = buildCombo(mods, [key])
        stopRecording()
        sync()
        changed()
    }
    function onOutside(e) {
        if (!recordButton.contains(e.target)) stopRecording()
    }
    function startRecording() {
        recording = true
        recordButton.classList.add('recording')
        recordLabel.textContent = 'Нажмите сочетание…'
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('keyup', onKey, true)
        window.addEventListener('blur', stopRecording)
        document.addEventListener('mousedown', onOutside, true)
    }
    function stopRecording() {
        recording = false
        recordButton.classList.remove('recording')
        recordLabel.textContent = 'Записать'
        window.removeEventListener('keydown', onKey, true)
        window.removeEventListener('keyup', onKey, true)
        window.removeEventListener('blur', stopRecording)
        document.removeEventListener('mousedown', onOutside, true)
    }

    sync()
    return h('div', { class: 'stack' },
        h('div', { class: 'combo-row' }, modButtons, h('span', { class: 'combo-plus' }, '+'), keySelect),
        h('div', { class: 'row' }, preview, h('span', { style: { flex: '1' } }), recordButton),
        error,
        details('Ввести текстом', false, field('Сочетание', text, 'Например: ctrl+shift+m, win+d, f13. Все названия клавиш — в README.')),
        h('span', { class: 'field-hint' }, 'Ctrl+W, Ctrl+T и сочетания с Win перехватывают браузер и Windows — их соберите кнопками выше.'),
        allowHold && checkbox('Удерживать, пока нажата кнопка (push-to-talk)', !!action.hold, checked => {
            if (checked) action.hold = true
            else delete action.hold
            changed()
        }))
}

function textEditor(action) {
    return field('Текст для ввода', h('textarea', {
        rows: 4,
        value: action.text,
        placeholder: 'Привет! 👋',
        oninput: e => {
            action.text = e.target.value
            changed()
        },
    }), 'Печатается в активное окно при любой раскладке. Перенос строки нажимает Enter.')
}

async function pick(kind, filter) {
    try {
        const { path } = await api('POST', '/api/pick', { kind, filter })
        return path
    } catch (err) {
        toast(err.message, { type: 'error' })
        return null
    }
}

function runEditor(action) {
    const pathInput = h('input', {
        class: 'mono',
        value: action.path,
        placeholder: 'C:\\Program Files\\…\\app.exe',
        oninput: () => {
            action.path = pathInput.value.trim()
            changed()
        },
    })
    const browse = h('button', {
        class: 'btn small',
        onclick: async () => {
            const path = await pick('file', 'programs')
            if (!path) return
            action.path = path
            pathInput.value = path
            changed()
        },
    }, icon('folder-open'), 'Обзор…')
    return h('div', { class: 'stack' },
        field('Программа', h('div', { class: 'row' }, pathInput, browse),
            '.exe, .bat, .cmd, .ps1 или ярлык .lnk. «Обзор» открывается в меню «Пуск» — там ярлыки всех программ.'),
        details('Аргументы и рабочая папка', !!(action.args?.length || action.cwd),
            field('Аргументы', h('textarea', {
                class: 'mono',
                rows: 2,
                value: (action.args ?? []).join('\n'),
                placeholder: 'по одному на строку',
                oninput: e => {
                    action.args = e.target.value.split('\n').map(s => s.trim()).filter(Boolean)
                    changed()
                },
            })),
            field('Рабочая папка', h('input', {
                class: 'mono',
                value: action.cwd ?? '',
                placeholder: 'по умолчанию — папка программы',
                oninput: e => {
                    action.cwd = e.target.value.trim()
                    changed()
                },
            }))))
}

function openEditor(action) {
    const input = h('input', {
        class: 'mono',
        value: action.target,
        placeholder: 'https://… или C:\\путь',
        oninput: () => {
            action.target = input.value.trim()
            changed()
        },
    })
    const choose = (kind, filter) => async () => {
        const path = await pick(kind, filter)
        if (!path) return
        action.target = path
        input.value = path
        changed()
    }
    return h('div', { class: 'stack' },
        field('Что открыть', input, 'Ссылка, файл, папка или путь вида shell:Downloads.'),
        h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: choose('file', 'all') }, icon('file'), 'Файл…'),
            h('button', { class: 'btn small', onclick: choose('folder') }, icon('folder'), 'Папка…')))
}

function pageEditor(action) {
    const select = h('select', {
        onchange: () => {
            action.page = select.value
            changed()
        },
    },
    h('option', { value: 'back', selected: action.page === 'back' }, '← Назад (предыдущая страница)'),
    pageNames().map(name => h('option', { value: name, selected: action.page === name }, name)))
    return h('div', { class: 'stack' },
        field('Перейти на страницу', select),
        h('div', {}, h('button', {
            class: 'btn small ghost',
            onclick: async () => {
                const name = await addPage({ open: false })
                if (!name) return
                action.page = name
                renderAll()
            },
        }, icon('plus'), 'Создать страницу')))
}

function delayEditor(action) {
    return h('div', { class: 'row' },
        h('input', {
            type: 'number',
            class: 'num',
            min: 0,
            step: 50,
            value: action.ms,
            oninput: e => {
                action.ms = Math.max(0, Number(e.target.value) || 0)
                changed()
            },
        }),
        h('span', { class: 'muted' }, 'мс'))
}

function macroEditor(action) {
    const list = h('ol', { class: 'steps' })
    const render = () => {
        list.replaceChildren(...action.steps.map(stepRow))
        if (!action.steps.length) list.append(h('li', { class: 'muted small empty-steps' }, 'Шагов пока нет — добавьте первый.'))
    }
    const edit = mutate => {
        mutate()
        changed()
        render()
    }
    const stepRow = (step, i) => {
        const types = STEP_ACTIONS.includes(step.type) ? STEP_ACTIONS : [...STEP_ACTIONS, step.type]
        return h('li', { class: 'step' },
            h('div', { class: 'step-head' },
                h('span', { class: 'step-num' }, i + 1),
                h('select', { onchange: e => edit(() => { action.steps[i] = defaultAction(e.target.value) }) },
                    types.map(type => h('option', { value: type, selected: type === step.type }, ACTIONS[type].label))),
                h('div', { class: 'step-tools' },
                    iconButton('chevron-up', 'Выше', () => edit(() => action.steps.splice(i - 1, 0, ...action.steps.splice(i, 1))), i === 0),
                    iconButton('chevron-down', 'Ниже', () => edit(() => action.steps.splice(i + 1, 0, ...action.steps.splice(i, 1))), i === action.steps.length - 1),
                    iconButton('trash-2', 'Удалить шаг', () => edit(() => action.steps.splice(i, 1))))),
            h('div', { class: 'step-body' }, actionBody(step, { inMacro: true })))
    }
    render()
    return h('div', { class: 'stack' },
        list,
        h('div', { class: 'add-step' },
            h('span', { class: 'muted small' }, 'Добавить шаг:'),
            STEP_ACTIONS.map(type => h('button', { class: 'chip', onclick: () => edit(() => action.steps.push(defaultAction(type))) },
                icon(ACTIONS[type].icon), ACTIONS[type].label))),
        field('Пауза между шагами', h('div', { class: 'row' },
            h('input', {
                type: 'number',
                class: 'num',
                min: 0,
                step: 10,
                value: action.stepDelay ?? 0,
                oninput: e => {
                    action.stepDelay = Math.max(0, Number(e.target.value) || 0)
                    changed()
                },
            }),
            h('span', { class: 'muted' }, 'мс')), 'Помогает, если программа не успевает за быстрыми нажатиями'))
}

/* ---------- Связь с утилитой ---------- */

function connectEvents() {
    const events = new EventSource('/api/events')
    events.addEventListener('status', async e => {
        const wasOffline = !state.status.online
        state.status = { ...JSON.parse(e.data), online: true }
        renderStatus()
        if (!state.config) {
            await init()
            return
        }
        renderTabs()
        // Громкость и состояния переключателей приходят вместе со статусом
        renderDevice()
        // Пока связи не было, config.json мог измениться
        if (wasOffline) {
            api('GET', '/api/config').then(({ version }) => onExternalConfig(version)).catch(() => {})
        }
    })
    events.addEventListener('press', e => flashKey(JSON.parse(e.data)))
    events.addEventListener('update', e => {
        state.update = JSON.parse(e.data)
        renderUpdates()
    })
    events.addEventListener('config', e => onExternalConfig(JSON.parse(e.data).version))
    events.addEventListener('error', () => {
        if (!state.status.online) return
        state.status.online = false
        renderStatus()
        renderTabs()
    })
}

document.addEventListener('keydown', e => {
    if (document.querySelector('.overlay')) return
    const mod = e.ctrlKey || e.metaKey
    // e.code, чтобы сочетания работали и в русской раскладке
    if (mod && e.code === 'KeyS') {
        e.preventDefault()
        save()
        return
    }
    // В текстовых полях Ctrl+Z отменяет ввод, как обычно
    if (mod && (e.code === 'KeyZ' || e.code === 'KeyY') && !isTextField(e.target)) {
        e.preventDefault()
        if (e.code === 'KeyY' || e.shiftKey) redo()
        else undo()
        return
    }
    if (e.target.closest?.('input, textarea, select') || state.selected === null) return
    const i = state.selected
    if (e.key === 'Escape') select(null)
    else if (e.key === 'Delete') clearKey(i)
    else if (mod && e.code === 'KeyC') copyKey(i)
    else if (mod && e.code === 'KeyV') pasteKey(i)
    else if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        const col = i % COLUMNS
        const row = Math.floor(i / COLUMNS)
        const next = {
            ArrowLeft: col > 0 ? i - 1 : i,
            ArrowRight: col < COLUMNS - 1 ? i + 1 : i,
            ArrowUp: row > 0 ? i - COLUMNS : i,
            ArrowDown: row < KEY_COUNT / COLUMNS - 1 ? i + COLUMNS : i,
        }[e.key]
        if (next !== undefined && next !== i) {
            select(next)
            keyEls[next].el.focus()
        }
    }
})

$('stage').addEventListener('click', e => {
    if (state.selected !== null && !e.target.closest('.key, .tabs')) select(null)
})

window.addEventListener('beforeunload', e => {
    if (isDirty()) e.preventDefault()
})

const isTextField = el => !!el.closest?.('textarea, [contenteditable], input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=button])')

$('save').addEventListener('click', save)
$('revert').addEventListener('click', revert)
$('undo').addEventListener('click', undo)
$('redo').addEventListener('click', redo)

let initializing = null
function init() {
    initializing ??= (async () => {
        try {
            const meta = await api('GET', '/api/meta')
            state.keyNames = new Set(meta.keyNames)
            await load()
            state.update = await api('GET', '/api/update').catch(() => null)
            renderUpdates()
            openUpdatesFromHash()
        } catch (err) {
            $('global-panel').replaceChildren(h('div', { class: 'fatal' }, err.message))
        } finally {
            initializing = null
        }
    })()
    return initializing
}

buildDevice()
init()
connectEvents()
