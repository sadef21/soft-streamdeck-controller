// Чтение, проверка и запись config.json
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { validate } from './actions.js'
import { METERS, STYLES, layoutProblem } from './draw.js'
import { LUCIDE_ICONS_DIR } from './paths.js'

export const KEY_COUNT = 15 // 5 колонок × 3 ряда, нумерация слева направо, сверху вниз

export function startPageOf(config) {
    return config.startPage ?? Object.keys(config.pages)[0]
}

// Иконка: путь к картинке, "lucide:имя" из библиотеки или "none"
function checkIcon(icon, where, configDir) {
    if (icon === undefined || icon === 'none') return
    if (typeof icon !== 'string' || !icon) throw new Error(`${where}: "icon" должен быть путём к картинке, "lucide:имя" или "none"`)
    if (icon.startsWith('lucide:')) {
        const name = icon.slice('lucide:'.length)
        if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(path.join(LUCIDE_ICONS_DIR, `${name}.svg`))) {
            throw new Error(`${where}: в библиотеке нет иконки "${name}"`)
        }
        return
    }
    const iconPath = path.resolve(configDir, icon)
    if (!fs.existsSync(iconPath)) throw new Error(`${where}: иконка не найдена: ${iconPath}`)
}

export function validateConfig(config, configDir) {
    if (!config || typeof config !== 'object') throw new Error('Конфиг должен быть объектом')
    if (!config.pages || typeof config.pages !== 'object' || !Object.keys(config.pages).length) {
        throw new Error('В конфиге нет "pages"')
    }
    if (config.startPage !== undefined && !config.pages[config.startPage]) {
        throw new Error(`Стартовая страница "${config.startPage}" не найдена`)
    }
    const { brightness, contentScale, keyStyle } = config
    if (keyStyle !== undefined && !STYLES.includes(keyStyle)) {
        throw new Error(`"keyStyle" должен быть одним из: ${STYLES.map(s => `"${s}"`).join(', ')}`)
    }
    if (brightness !== undefined && !(typeof brightness === 'number' && brightness >= 0 && brightness <= 10)) {
        throw new Error('"brightness" должен быть числом от 0 до 10')
    }
    if (contentScale !== undefined && !(typeof contentScale === 'number' && contentScale >= 0.3 && contentScale <= 1)) {
        throw new Error('"contentScale" должен быть числом от 0.3 до 1')
    }
    const isNumber = (value, min, max) => typeof value === 'number' && value >= min && value <= max
    if (config.longPressMs !== undefined && !isNumber(config.longPressMs, 200, 3000)) {
        throw new Error('"longPressMs" должен быть числом от 200 до 3000 (миллисекунды)')
    }
    if (config.idle !== undefined) {
        const { after, page, brightness: idleBrightness } = config.idle ?? {}
        if (after !== undefined && !isNumber(after, 0, 86400)) throw new Error('"idle.after" — через сколько секунд показать окно ожидания (0 — никогда)')
        if (page !== undefined && !config.pages[page]) throw new Error(`Страница окна ожидания "${page}" не найдена`)
        if (idleBrightness !== undefined && !isNumber(idleBrightness, 0, 10)) throw new Error('"idle.brightness" — яркость в окне ожидания, от 0 до 10')
    }
    // "sleep" (сон экрана) больше не используется: старые конфиги с ним просто его игнорируют
    if (config.layout !== undefined) {
        const problem = layoutProblem(config.layout)
        if (problem) throw new Error(`"layout": ${problem}`)
    }
    if (config.weather !== undefined) {
        const { city, latitude, longitude } = config.weather ?? {}
        if (!isNumber(latitude, -90, 90) || !isNumber(longitude, -180, 180)) {
            throw new Error('"weather" — город для погоды: { "city": "Прага", "latitude": 50.09, "longitude": 14.42 }')
        }
        if (city !== undefined && typeof city !== 'string') throw new Error('"weather.city" должен быть строкой')
    }
    for (const [pageName, page] of Object.entries(config.pages)) {
        if (pageName === 'back') throw new Error('Имя страницы "back" зарезервировано для кнопки «Назад»')
        if (!page || typeof page !== 'object') throw new Error(`Страница "${pageName}" должна быть объектом`)
        for (const [index, key] of Object.entries(page)) {
            const where = `Страница "${pageName}", кнопка ${index}`
            const n = Number(index)
            if (!Number.isInteger(n) || n < 0 || n >= KEY_COUNT) throw new Error(`${where}: номер должен быть от 0 до ${KEY_COUNT - 1}`)
            if (!key || typeof key !== 'object') throw new Error(`${where}: описание кнопки должно быть объектом`)
            if (key.action) validate(key.action, where, config.pages)
            checkIcon(key.icon, where, configDir)
            if (key.meter !== undefined && !METERS.includes(key.meter)) {
                throw new Error(`${where}: неизвестный индикатор "${key.meter}"`)
            }
            if (key.longPress) {
                validate(key.longPress, `${where}, долгое нажатие`, config.pages)
                if (key.longPress.hold) throw new Error(`${where}, долгое нажатие: "hold" здесь не работает`)
            }
            if (key.toggle !== undefined) {
                const toggle = key.toggle
                const toggleWhere = `${where}, включённое состояние`
                if (!toggle || typeof toggle !== 'object') throw new Error(`${where}: "toggle" должен быть объектом`)
                if (toggle.source !== undefined && !['self', 'speakers', 'mic'].includes(toggle.source)) {
                    throw new Error(`${toggleWhere}: "source" должен быть "self", "speakers" или "mic"`)
                }
                if (toggle.action) validate(toggle.action, toggleWhere, config.pages)
                checkIcon(toggle.icon, toggleWhere, configDir)
            }
        }
    }
}

export function configVersion(text) {
    return crypto.createHash('sha1').update(text).digest('hex')
}

export function readConfig(configPath) {
    const text = fs.readFileSync(configPath, 'utf8')
    let config
    try {
        config = JSON.parse(text.replace(/^﻿/, ''))
    } catch (err) {
        throw new Error(`Некорректный JSON: ${err.message}`)
    }
    validateConfig(config, path.dirname(configPath))
    return { config, version: configVersion(text) }
}

// JSON в одну строку с пробелами: { "label": "Mute", "color": "#B71C1C" }
function inline(value) {
    if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`
    if (value && typeof value === 'object') {
        const parts = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`)
        return parts.length ? `{ ${parts.join(', ')} }` : '{}'
    }
    return JSON.stringify(value)
}

// Конфиг, сохранённый из веб-конфигуратора, остаётся удобным для ручной правки:
// настройки и страницы раскрыты, а каждая кнопка по возможности занимает одну строку
function pretty(value, indent, depth) {
    if (!value || typeof value !== 'object') return JSON.stringify(value)
    const flat = inline(value)
    if (depth >= 3 && indent.length + flat.length <= 140) return flat
    const next = `${indent}  `
    const items = Array.isArray(value)
        ? value.map(v => next + pretty(v, next, depth + 1))
        : Object.entries(value).map(([k, v]) => `${next}${JSON.stringify(k)}: ${pretty(v, next, depth + 1)}`)
    if (!items.length) return flat
    const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}']
    return `${open}\n${items.join(',\n')}\n${indent}${close}`
}

export function formatConfig(config) {
    return `${pretty(config, '', 0)}\n`
}
