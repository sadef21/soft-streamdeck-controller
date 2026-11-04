// Окно выбора иконки: библиотека Lucide, эмодзи и свои картинки.
// Любая иконка превращается в браузере в PNG 128×128 и сохраняется в папку icons
import { api, h, icon, iconUrl, openModal, toast } from '/ui.js'

const SIZE = 128

const POPULAR = ['mic', 'mic-off', 'volume-2', 'volume-1', 'volume-x', 'headphones', 'music', 'play', 'pause',
    'skip-forward', 'skip-back', 'square', 'circle-dot', 'radio', 'video', 'video-off', 'camera', 'monitor',
    'screen-share', 'gamepad-2', 'keyboard', 'mouse', 'terminal', 'code', 'globe', 'folder', 'folder-open',
    'file-text', 'image', 'scissors', 'copy', 'clipboard-paste', 'undo-2', 'redo-2', 'save', 'search', 'settings',
    'house', 'power', 'lock', 'sun', 'moon', 'zap', 'flame', 'star', 'heart', 'thumbs-up', 'sparkles', 'trophy',
    'crown', 'gift', 'smile', 'message-circle', 'mail', 'bell', 'clock', 'timer', 'calendar', 'coffee', 'rocket',
    'lightbulb', 'wifi', 'bluetooth', 'cloud', 'download', 'upload', 'refresh-cw', 'trash-2', 'plus', 'minus',
    'check', 'x', 'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down', 'layers', 'app-window', 'users', 'user',
    'phone', 'eye', 'eye-off']

const EMOJI = ['🎤', '🔇', '🔊', '🔉', '🎧', '🎵', '⏯️', '⏭️', '⏮️', '⏹️', '🔴', '🎬', '📷', '🎥', '🖥️', '💻', '🎮',
    '🕹️', '⌨️', '🖱️', '📁', '📂', '🌐', '🔍', '⚙️', '🏠', '🔒', '💡', '🔥', '⭐', '❤️', '👍', '👎', '😂', '😎', '🤔',
    '🎉', '✅', '❌', '⚠️', '💬', '📧', '🔔', '⏰', '⏱️', '📅', '☕', '🍕', '🚀', '💰', '🏆', '👑', '🎁', '📋', '✂️',
    '📌', '🗑️', '⬅️', '➡️', '⬆️', '⬇️', '🔁', '💤', '🌙', '☀️', '🌈', '🐱', '🐶', '👋', '🙏', '💯', '🆘']

const COLORS = ['#ffffff', '#000000', '#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#c084fc', '#f472b6', '#2dd4bf', '#fb923c']

// Теги библиотеки английские, поэтому русские запросы переводим по началу слова
const RU = {
    микрофон: ['mic', 'microphone'], звук: ['volume', 'speaker', 'audio'], громк: ['volume'], тише: ['volume'], выключ: ['power', 'off'],
    музык: ['music'], наушник: ['headphones'], песн: ['music'], играть: ['play'], плей: ['play'], пауз: ['pause'],
    стоп: ['square', 'stop'], следующ: ['skip-forward', 'next'], предыдущ: ['skip-back', 'previous'],
    запис: ['circle-dot', 'record', 'disc'], камер: ['camera', 'webcam'], видео: ['video', 'film'], фото: ['camera', 'image'],
    картин: ['image'], экран: ['monitor', 'screen'], монитор: ['monitor'], скриншот: ['screenshot', 'scan', 'camera'],
    трансл: ['radio', 'cast'], стрим: ['radio', 'cast', 'video'], эфир: ['radio'], игр: ['gamepad', 'joystick'],
    геймп: ['gamepad'], джойст: ['joystick', 'gamepad'], клавиат: ['keyboard'], мыш: ['mouse'], папк: ['folder'],
    файл: ['file'], документ: ['file-text'], браузер: ['globe', 'browser'], интернет: ['globe'], сайт: ['globe', 'link'],
    ссылк: ['link'], терминал: ['terminal'], консол: ['terminal'], код: ['code'], программ: ['app-window', 'code'],
    копир: ['copy'], встав: ['clipboard-paste', 'paste'], буфер: ['clipboard'], вырез: ['scissors'], отмен: ['undo'],
    повтор: ['redo', 'repeat'], сохран: ['save'], поиск: ['search'], найти: ['search'], настрой: ['settings', 'sliders'],
    дом: ['house', 'home'], питан: ['power'], замок: ['lock'], блок: ['lock'], солн: ['sun'], ярк: ['sun'],
    луна: ['moon'], ночь: ['moon'], молни: ['zap'], огон: ['flame'], огн: ['flame'], звезд: ['star'], сердц: ['heart'],
    лайк: ['thumbs-up', 'heart'], чат: ['message'], сообщ: ['message'], почт: ['mail'], письм: ['mail'],
    уведомл: ['bell'], колокол: ['bell'], час: ['clock'], время: ['clock'], таймер: ['timer'], календар: ['calendar'],
    кофе: ['coffee'], ракет: ['rocket'], лампа: ['lightbulb'], свет: ['lightbulb', 'sun'], идея: ['lightbulb'],
    облак: ['cloud'], скача: ['download'], загруз: ['download', 'upload'], обнов: ['refresh'], удал: ['trash'],
    корзин: ['trash', 'shopping-cart'], плюс: ['plus'], минус: ['minus'], галочк: ['check'], крест: ['x'],
    стрелк: ['arrow'], назад: ['arrow-left', 'undo'], вперед: ['arrow-right'], вперёд: ['arrow-right'],
    вверх: ['arrow-up'], вниз: ['arrow-down'], страниц: ['layers', 'file'], окн: ['app-window'],
    пользоват: ['user'], люди: ['users'], друз: ['users'], телефон: ['phone'], звон: ['phone'], батар: ['battery'],
    принтер: ['printer'], карт: ['map'], флаг: ['flag'], закладк: ['bookmark'], подар: ['gift'],
    деньг: ['dollar', 'coins', 'wallet'], корон: ['crown'], трофе: ['trophy'], кубок: ['trophy'], искр: ['sparkles'],
    смайл: ['smile'], улыб: ['smile'], глаз: ['eye'], скрыт: ['eye-off'], сеть: ['wifi', 'network'], блютуз: ['bluetooth'],
}

let library = null
function loadLibrary() {
    library ??= api('GET', '/api/icon-library').then(r => r.icons).catch(err => {
        library = null
        throw err
    })
    return library
}

// Совпадение по целым словам названия и тегов: иначе «mic» находит и «chemical».
// Для переведённых с русского слов нужно точное совпадение, для английских хватает начала слова
function termScore(item, term, exact) {
    if (item.name === term) return 5
    if (term.includes('-')) return item.name.includes(term) ? 3 : 0
    const segments = item.name.split('-')
    if (segments.includes(term)) return 4
    if (!exact && segments.some(s => s.startsWith(term))) return 3
    item.words ??= item.tags.flatMap(tag => tag.split(/[\s-]+/))
    if (item.words.includes(term)) return 2
    if (!exact && item.words.some(w => w.startsWith(term))) return 1
    return 0
}

function searchLibrary(icons, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!tokens.length) {
        const byName = new Map(icons.map(item => [item.name, item]))
        return POPULAR.map(name => byName.get(name)).filter(Boolean)
    }
    const queries = tokens.map(token => (/[а-яё]/.test(token)
        ? { exact: true, terms: Object.entries(RU).filter(([ru]) => ru.startsWith(token) || token.startsWith(ru)).flatMap(([, en]) => en) }
        : { exact: false, terms: [token] }))
    const found = []
    for (const item of icons) {
        let score = 0
        for (const { exact, terms } of queries) {
            const best = Math.max(0, ...terms.map(term => termScore(item, term, exact)))
            if (!best) {
                score = 0
                break
            }
            score += best
        }
        if (score) found.push({ item, score })
    }
    return found.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).map(f => f.item)
}

/* ---------- Превращение в PNG ---------- */

function makeCanvas() {
    return h('canvas', { width: SIZE, height: SIZE })
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Не удалось открыть изображение'))
        img.src = src
    })
}

function emojiToPng(emoji) {
    const canvas = makeCanvas()
    const ctx = canvas.getContext('2d')
    const font = size => `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
    let size = SIZE * 0.78
    ctx.font = font(size)
    let metrics = ctx.measureText(emoji)
    if (metrics.width > SIZE * 0.92) {
        size *= (SIZE * 0.92) / metrics.width
        ctx.font = font(size)
        metrics = ctx.measureText(emoji)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(emoji, SIZE / 2, SIZE / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2)
    return canvas.toDataURL('image/png')
}

// Вписать картинку (File или Blob) в квадрат без обрезки
export async function fileToPng(file) {
    const url = URL.createObjectURL(file)
    try {
        const img = await loadImage(url)
        const width = img.naturalWidth || SIZE
        const height = img.naturalHeight || SIZE
        const scale = Math.min(SIZE / width, SIZE / height)
        const canvas = makeCanvas()
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, (SIZE - width * scale) / 2, (SIZE - height * scale) / 2, width * scale, height * scale)
        return canvas.toDataURL('image/png')
    } finally {
        URL.revokeObjectURL(url)
    }
}

const emojiName = emoji => `emoji-${[...emoji].map(c => c.codePointAt(0).toString(16)).join('-')}`

/* ---------- Окно ---------- */

// Запоминаем между открытиями окна. Цвет 'auto' — по теме кнопок
let lastTab = 'library'
let lastQuery = ''
let lastColor = 'auto'

// Иконка из библиотеки сохраняется ссылкой "lucide:имя" и красится при отрисовке:
// onPick('lucide:mic', null | '#rrggbb'). Эмодзи и картинки сохраняются в PNG: onPick('icons/x.png').
// autoColor — каким цветом иконку покрасит тема
export function openIconPicker({ background = '#000000', autoColor = '#ffffff', onPick }) {
    let tab = lastTab
    const root = h('div', { class: 'picker drop-zone', style: { '--tile-bg': background } })
    const fileInput = h('input', {
        type: 'file',
        accept: 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml',
        hidden: true,
        onchange: () => {
            if (fileInput.files[0]) uploadFile(fileInput.files[0])
        },
    })
    const tabsEl = h('div', { class: 'seg' })
    const content = h('div')
    root.append(
        h('div', { class: 'picker-top' }, tabsEl,
            h('button', { class: 'btn small', onclick: () => fileInput.click() }, icon('upload'), 'Загрузить картинку…'),
            fileInput),
        content)

    const TABS = [['library', 'Библиотека'], ['emoji', 'Эмодзи'], ['files', 'Мои иконки']]
    function renderTabs() {
        tabsEl.replaceChildren(...TABS.map(([id, label]) => h('button', {
            class: id === tab ? 'active' : null,
            onclick: () => {
                tab = lastTab = id
                renderTabs()
                renderContent()
            },
        }, label)))
    }
    function renderContent() {
        content.replaceChildren(tab === 'library' ? libraryTab() : tab === 'emoji' ? emojiTab() : filesTab())
    }

    async function choose(makePng, name) {
        root.classList.add('busy')
        try {
            const data = await makePng()
            const { path } = await api('POST', '/api/icons', { name, data })
            modal.close()
            onPick(path)
        } catch (err) {
            toast(err.message, { type: 'error' })
        } finally {
            root.classList.remove('busy')
        }
    }
    const uploadFile = file => choose(() => fileToPng(file), file.name.replace(/\.[^.]+$/, ''))

    root.addEventListener('dragover', e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        root.classList.add('dragover')
    })
    root.addEventListener('dragleave', e => {
        if (!root.contains(e.relatedTarget)) root.classList.remove('dragover')
    })
    root.addEventListener('drop', e => {
        e.preventDefault()
        root.classList.remove('dragover')
        const file = e.dataTransfer.files[0]
        if (file) uploadFile(file)
    })

    function libraryTab() {
        const grid = h('div', { class: 'icon-grid' }, h('p', { class: 'muted small' }, 'Загрузка библиотеки…'))
        const info = h('div', { class: 'picker-info' })
        const search = h('input', {
            type: 'search',
            placeholder: 'Поиск: микрофон, громкость, play, folder…',
            value: lastQuery,
            oninput: () => {
                lastQuery = search.value
                renderGrid()
            },
        })
        const custom = h('input', { type: 'color', oninput: () => setColor(custom.value) })
        const auto = h('button', { class: 'chip small', title: 'Цвет по теме кнопок', onclick: () => setColor('auto') }, 'Авто')
        const colorRow = h('div', { class: 'swatches' },
            h('span', { class: 'field-label', style: { marginRight: '4px' } }, 'Цвет иконки'),
            auto,
            COLORS.map(color => h('button', {
                class: 'swatch',
                'data-color': color,
                title: color,
                style: { '--c': color },
                onclick: () => setColor(color),
            })),
            h('label', { class: 'swatch custom', title: 'Свой цвет' }, custom))
        function setColor(color) {
            lastColor = color
            if (color !== 'auto') custom.value = color
            grid.style.setProperty('--icon-color', color === 'auto' ? autoColor : color)
            auto.classList.toggle('active', color === 'auto')
            colorRow.querySelectorAll('.swatch[data-color]').forEach(s => s.classList.toggle('active', s.dataset.color === color))
        }

        let icons = null
        function renderGrid() {
            if (!icons) return
            const found = searchLibrary(icons, lastQuery)
            const shown = found.slice(0, 240)
            grid.replaceChildren(...shown.map(item => h('button', {
                class: 'icon-tile',
                title: item.name,
                onclick: () => {
                    modal.close()
                    onPick(`lucide:${item.name}`, lastColor === 'auto' ? null : lastColor)
                },
            },
            h('span', { class: 'tile-face' }, h('span', { class: 'lib-ico', style: { '--src': `url(/lucide/${item.name}.svg)` } })),
            h('span', { class: 'tile-name' }, item.name))))
            if (!lastQuery.trim()) info.textContent = `Популярные иконки. Всего в библиотеке ${icons.length} — ищите по названию.`
            else if (!found.length) info.textContent = 'Ничего не нашлось. Попробуйте другое слово или по-английски: mic, volume, play…'
            else info.textContent = `Найдено: ${found.length}${found.length > shown.length ? `, показаны первые ${shown.length}` : ''}`
        }

        setColor(lastColor)
        loadLibrary().then(list => {
            icons = list
            renderGrid()
        }).catch(err => grid.replaceChildren(h('p', { class: 'field-error' }, err.message)))
        setTimeout(() => search.focus())
        return h('div', { class: 'stack' }, search, colorRow, grid, info)
    }

    function emojiTab() {
        const input = h('input', { class: 'emoji-input', placeholder: '🙂', onkeydown: e => { if (e.key === 'Enter') use() } })
        const use = () => {
            const value = input.value.trim()
            if (value) choose(() => emojiToPng(value), emojiName(value))
        }
        setTimeout(() => input.focus())
        return h('div', { class: 'stack' },
            h('div', { class: 'row' },
                input,
                h('button', { class: 'btn primary small', onclick: use }, 'Использовать'),
                h('span', { class: 'muted small' }, 'Win + . — панель эмодзи Windows')),
            h('div', { class: 'emoji-grid' }, EMOJI.map(emoji => h('button', {
                class: 'emoji-tile',
                onclick: () => choose(() => emojiToPng(emoji), emojiName(emoji)),
            }, emoji))))
    }

    function filesTab() {
        const grid = h('div', { class: 'icon-grid' }, h('p', { class: 'muted small' }, 'Загрузка…'))
        api('GET', '/api/icons').then(({ icons }) => {
            if (!icons.length) {
                grid.replaceChildren(h('p', { class: 'muted small' }, 'Папка icons пока пуста. Загрузите картинку или выберите иконку из библиотеки.'))
                return
            }
            grid.replaceChildren(...icons.map(path => h('button', {
                class: 'icon-tile',
                title: path,
                onclick: () => {
                    modal.close()
                    onPick(path)
                },
            },
            h('span', { class: 'tile-face' }, h('img', { src: iconUrl(path), alt: '', loading: 'lazy' })),
            h('span', { class: 'tile-name' }, path.replace(/^icons\//, '')))))
        }).catch(err => grid.replaceChildren(h('p', { class: 'field-error' }, err.message)))
        return h('div', { class: 'stack' },
            h('p', { class: 'muted small', style: { margin: '0' } }, 'Картинки из папки icons рядом с config.json. Файл можно просто перетащить в это окно.'),
            grid)
    }

    renderTabs()
    renderContent()
    const modal = openModal({ title: 'Иконка кнопки', body: root, wide: true })
}
