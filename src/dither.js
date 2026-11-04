// Перевод картинки в 16-битный цвет экрана (RGB565: 32 оттенка красного и синего, 64 зелёного)
// с упорядоченным дизерингом. Без него плавные градиенты на экране идут ступеньками: соседние пиксели
// попадают в один и тот же оттенок. С дизерингом промежуточный цвет набирается из двух соседних
// оттенков мелким узором, и глаз видит плавный переход.
// Узор Байера фиксирован: одна и та же картинка всегда даёт те же пиксели, ничего не мерцает

// Матрица Байера 8×8, значения 0…63
const BAYER = [
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
]
// Порог для клетки: от −0.5 до +0.5 шага квантования
const THRESHOLD = BAYER.map(v => (v + 0.5) / 64 - 0.5)

const quantize = (value, levels, offset) => {
    const q = Math.round((value / 255) * levels + offset)
    return q < 0 ? 0 : q > levels ? levels : q
}

// rgba — данные ImageData (width × height × 4). originX/originY — где картинка на экране:
// узор привязан к экрану, а не к кнопке. Возвращает буфер RGB565 little-endian, как ждёт устройство
export function toRgb565(rgba, width, height, originX = 0, originY = 0) {
    const out = Buffer.alloc(width * height * 2)
    for (let y = 0; y < height; y++) {
        const row = ((y + originY) & 7) * 8
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const offset = THRESHOLD[row + ((x + originX) & 7)]
            const r = quantize(rgba[i], 31, offset)
            const g = quantize(rgba[i + 1], 63, offset)
            const b = quantize(rgba[i + 2], 31, offset)
            out.writeUInt16LE((r << 11) | (g << 5) | b, (y * width + x) * 2)
        }
    }
    return out
}
