// Экспорт и импорт страницы одним файлом. Свои иконки (эмодзи, картинки) кладутся внутрь файла,
// поэтому страницу можно перенести на другой компьютер
import { fileToPng } from '/icon-picker.js'
import { api } from '/ui.js'

const FORMAT = 'streamx-page'

// Кто на кнопке может ссылаться на файл иконки: сама кнопка и её включённое состояние
const iconHolders = key => [key, key?.toggle].filter(Boolean)
const isFileIcon = icon => typeof icon === 'string' && icon !== 'none' && !icon.startsWith('lucide:')

export async function exportPage(name, keys) {
    const icons = {}
    for (const key of Object.values(keys)) {
        for (const holder of iconHolders(key)) {
            const file = holder.icon
            if (!isFileIcon(file) || icons[file]) continue
            const res = await fetch(`/api/icon?path=${encodeURIComponent(file)}`)
            // Файла нет — кнопка уедет без картинки, как и сейчас без неё рисуется
            if (res.ok) icons[file] = await fileToPng(await res.blob())
        }
    }
    const data = { format: FORMAT, version: 1, name, keys, icons }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${name.replace(/[\\/:*?"<>|]+/g, '_')}.streamx.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

// Прочитать файл страницы и сохранить её иконки в папку icons. Возвращает { name, keys }
export async function importPage(file) {
    let data
    try {
        data = JSON.parse(await file.text())
    } catch {
        throw new Error('Файл повреждён или это не JSON')
    }
    if (data?.format !== FORMAT || !data.keys || typeof data.keys !== 'object') {
        throw new Error('Это не файл страницы — его создаёт кнопка «Экспорт в файл»')
    }
    const keys = structuredClone(data.keys)
    const renamed = {}
    for (const [oldPath, png] of Object.entries(data.icons ?? {})) {
        // icons/cat-1a2b3c.png → cat: утилита сама добавит свою метку
        const base = oldPath.split('/').pop().replace(/\.[^.]+$/, '').replace(/-[0-9a-f]{6}$/, '')
        const { path } = await api('POST', '/api/icons', { name: base, data: png })
        renamed[oldPath] = path
    }
    for (const key of Object.values(keys)) {
        for (const holder of iconHolders(key)) {
            if (renamed[holder.icon]) holder.icon = renamed[holder.icon]
        }
    }
    return { name: String(data.name || 'Страница').trim() || 'Страница', keys }
}
