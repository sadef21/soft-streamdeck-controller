// Иконки и замеры подписей для отрисовки на устройстве (node-canvas)
import canvas from 'canvas'
import fs from 'node:fs'
import path from 'node:path'
import { KEY_SIZE, measureLabels } from './draw.js'
import { LUCIDE_ICONS_DIR } from './paths.js'

const iconCache = new Map()

async function loadLucide(name, color) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Некорректное имя иконки: ${name}`)
    const svg = (await fs.promises.readFile(path.join(LUCIDE_ICONS_DIR, `${name}.svg`), 'utf8'))
        .replace(/currentColor/g, color)
        .replace(/\swidth="24"/, ' width="96"')
        .replace(/\sheight="24"/, ' height="96"')
    return canvas.loadImage(Buffer.from(svg))
}

// spec: { lucide: 'mic' } — иконка из библиотеки нужного цвета, { file: 'icons/x.png' } — картинка
export function loadIcon(spec, color, baseDir) {
    const file = spec.file && path.resolve(baseDir, spec.file)
    const id = spec.lucide ? `lucide:${spec.lucide}:${color}` : `file:${file}`
    if (!iconCache.has(id)) {
        const promise = spec.lucide ? loadLucide(spec.lucide, color) : canvas.loadImage(file)
        promise.catch(() => iconCache.delete(id))
        iconCache.set(id, promise)
    }
    return iconCache.get(id)
}

export function clearIconCache() {
    iconCache.clear()
}

const measureContext = canvas.createCanvas(1, 1).getContext('2d')

export function measurePage(views, style, size = KEY_SIZE) {
    return measureLabels(measureContext, views, size, style)
}
