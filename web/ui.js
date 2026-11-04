// Мелкие помощники интерфейса: создание элементов, запросы к утилите, уведомления, диалоги

const DOM_PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'multiple'])

export function h(tag, props, ...children) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props ?? {})) {
        if (v == null || v === false) continue
        if (k === 'class') el.className = v
        else if (k === 'style') {
            for (const [name, value] of Object.entries(v)) {
                if (name.startsWith('--')) el.style.setProperty(name, value)
                else el.style[name] = value
            }
        } else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
        else if (DOM_PROPS.has(k)) el[k] = v
        else el.setAttribute(k, v === true ? '' : v)
    }
    for (const child of children.flat(Infinity)) {
        if (child == null || child === false) continue
        el.append(child instanceof Node ? child : String(child))
    }
    return el
}

// Иконка интерфейса из библиотеки Lucide, красится в цвет текста (currentColor)
export function icon(name, cls = '') {
    return h('span', { class: `ui-ico ${cls}`, style: { '--src': `url(/lucide/${name}.svg)` }, 'aria-hidden': 'true' })
}

// Картинка иконки кнопки (путь из config.json) через утилиту
export function iconUrl(path) {
    return `/api/icon?path=${encodeURIComponent(path)}`
}

export function iconButton(name, title, onclick, disabled = false) {
    return h('button', { class: 'icon-btn', title, 'aria-label': title, onclick, disabled }, icon(name))
}

export async function api(method, url, body) {
    let res
    try {
        res = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined,
        })
    } catch {
        throw new Error('Нет связи с утилитой — она запущена?')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`)
    return data
}

export function toast(message, { type = 'info', action, timeout = 3500 } = {}) {
    const el = h('div', { class: `toast ${type}`, role: 'status' },
        h('span', {}, message),
        action && h('button', { class: 'btn small ghost', onclick: () => { action.run(); el.remove() } }, action.label))
    document.getElementById('toasts').append(el)
    setTimeout(() => el.classList.add('out'), timeout)
    setTimeout(() => el.remove(), timeout + 400)
}

export function openModal({ title, body, footer, wide = false, onClose }) {
    const onKey = e => {
        if (e.key === 'Escape') {
            e.stopPropagation()
            close()
        }
    }
    const overlay = h('div', { class: 'overlay', onmousedown: e => { if (e.target === overlay) close() } },
        h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
            h('header', { class: 'modal-head' },
                h('h2', {}, title),
                iconButton('x', 'Закрыть', () => close())),
            h('div', { class: 'modal-body' }, body),
            footer && h('footer', { class: 'modal-foot' }, footer)))
    function close() {
        overlay.remove()
        document.removeEventListener('keydown', onKey, true)
        onClose?.()
    }
    document.addEventListener('keydown', onKey, true)
    document.body.append(overlay)
    const first = overlay.querySelector('input:not([hidden]), textarea, select') ?? overlay.querySelector('button:not(.icon-btn)')
    first?.focus()
    return { close, overlay }
}

export function askText({ title, label, value = '', okLabel = 'OK', check }) {
    return new Promise(resolve => {
        let result = null
        const input = h('input', { value, onkeydown: e => { if (e.key === 'Enter') submit() } })
        const error = h('div', { class: 'field-error' })
        const submit = () => {
            const text = input.value.trim()
            const problem = check?.(text)
            if (problem) {
                error.textContent = problem
                return
            }
            result = text
            modal.close()
        }
        const modal = openModal({
            title,
            body: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, error),
            footer: [
                h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Отмена'),
                h('button', { class: 'btn primary', onclick: submit }, okLabel),
            ],
            onClose: () => resolve(result),
        })
        input.select()
    })
}

export function confirmDialog({ title, text, okLabel = 'OK', danger = false }) {
    return new Promise(resolve => {
        let result = false
        const modal = openModal({
            title,
            body: h('p', { class: 'confirm-text' }, text),
            footer: [
                h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Отмена'),
                h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => { result = true; modal.close() } }, okLabel),
            ],
            onClose: () => resolve(result),
        })
    })
}
