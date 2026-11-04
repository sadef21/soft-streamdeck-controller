// Регулятор громкости во весь экран: открывается долгим нажатием на кнопку звука (действие "mixer")
// и временно заменяет кнопки страницы.
//
//   [ −1  ] [ Без звука ] [  64%  ] [ К микрофону ] [ +1  ]
//   [ −5  ] [    25%    ] [  50%  ] [    75%      ] [ +5  ]
//   [ −10 ] [     0%    ] [Закрыть] [   100%      ] [ +10 ]
//
// По бокам — шаги (удержание повторяет), в центре — пресеты, сверху — уровень, снизу — «Закрыть».
// Кнопки — обычные описания кнопок, как в config.json, поэтому рисуются и нажимаются как все остальные

export const MIXER_TIMEOUT_MS = 5000 // без нажатий регулятор закрывается сам

const TARGETS = {
    speakers: { name: 'Звук', color: '#26a69a', icon: 'volume-2', muteIcon: 'volume-x', other: 'mic', otherName: 'К микрофону', otherIcon: 'mic' },
    mic: { name: 'Микрофон', color: '#ec407a', icon: 'mic', muteIcon: 'mic-off', other: 'speakers', otherName: 'К звуку', otherIcon: 'volume-2' },
}

const STEPS = [1, 5, 10] // сверху вниз
const PRESETS = { 6: 25, 7: 50, 8: 75, 11: 0, 13: 100 }

// target — 'speakers' | 'mic', level — текущее состояние { volume, muted } (для подсветки пресета)
export function mixerKeys(target, level) {
    const t = TARGETS[target]
    const keys = {}
    STEPS.forEach((step, row) => {
        // icon: 'none' — крупный текст без автоиконки действия
        keys[row * 5] = { label: `−${step}`, icon: 'none', color: t.color, action: { type: 'volume', step: -step, target } }
        keys[row * 5 + 4] = { label: `+${step}`, icon: 'none', color: t.color, action: { type: 'volume', step, target } }
    })
    keys[1] = {
        label: 'Без звука',
        color: t.color,
        icon: `lucide:${t.muteIcon}`,
        action: { type: 'mute', target },
        toggle: { source: target, label: 'Выключен', color: '#c62828' },
    }
    // Уровень — кольцо на всю кнопку, без подписи: так число крупнее
    keys[2] = { meter: target === 'mic' ? 'mic' : 'volume', color: t.color }
    keys[3] = { label: t.otherName, color: TARGETS[t.other].color, icon: `lucide:${t.otherIcon}`, action: { type: 'mixer', target: t.other } }
    for (const [index, value] of Object.entries(PRESETS)) {
        // Пресет с текущим уровнем подсвечен цветом регулятора, остальные — серые
        const current = level && !level.muted && level.volume === value
        keys[index] = { label: `${value}%`, icon: 'none', color: current ? t.color : '#64748b', action: { type: 'volumeSet', value, target } }
    }
    keys[12] = { label: 'Закрыть', color: '#64748b', icon: 'lucide:x', action: { type: 'mixer' } }
    return keys
}
