// Панель плеера во весь экран: открывается долгим нажатием на «Сейчас играет» (действие "player")
// и временно заменяет кнопки страницы — как регулятор громкости (src/mixer.js).
//
//   [  ⏮   ] [ Перемешать ] [ обложка ] [ Повтор ] [  ⏭   ]
//   [ −10 с ] [            ] [    ⏯    ] [        ] [ +10 с ]
//   [ −30 с ] [            ] [ Закрыть ] [        ] [ +30 с ]
//
// По бокам — треки и перемотка, в центре — пауза, сверху — обложка, снизу — «Закрыть».
// Что плеер не разрешает менять (перемотку, перемешивание, повтор), показано бледным и не нажимается

const COLOR = '#1db954'
const NEUTRAL = '#64748b'

const REPEAT_LABELS = { list: 'Повтор: все', track: 'Повтор: трек' }

// media — состояние плеера (media.state.media), может быть null
export function playerKeys(media) {
    const m = media ?? {}
    const playing = m.status === 'playing'
    const keys = {}
    const off = (label, icon) => ({ label, icon: icon ? `lucide:${icon}` : 'none', color: NEUTRAL, disabled: true })

    keys[0] = { label: 'Назад', icon: 'lucide:skip-back', color: COLOR, action: { type: 'media', command: 'prev' } }
    keys[4] = { label: 'Вперёд', icon: 'lucide:skip-forward', color: COLOR, action: { type: 'media', command: 'next' } }
    for (const [index, seconds] of [[5, -10], [10, -30], [9, 10], [14, 30]]) {
        const label = `${seconds > 0 ? '+' : '−'}${Math.abs(seconds)} с`
        keys[index] = m.canSeek
            ? { label, icon: 'none', color: COLOR, action: { type: 'media', command: 'seek', seconds } }
            : off(label)
    }

    keys[1] = m.canShuffle
        ? { label: 'Перемешать', icon: 'lucide:shuffle', color: COLOR, action: { type: 'media', command: 'shuffle' }, toggle: { source: 'shuffle' } }
        : off('Перемешать', 'shuffle')
    keys[3] = m.canRepeat
        ? {
            label: REPEAT_LABELS[m.repeat] ?? 'Повтор',
            icon: m.repeat === 'track' ? 'lucide:repeat-1' : 'lucide:repeat',
            color: COLOR,
            action: { type: 'media', command: 'repeat' },
            toggle: { source: 'repeat' },
        }
        : off('Повтор', 'repeat')

    // Обложка: нажатие — пауза, как у кнопки «Сейчас играет»
    keys[2] = { meter: 'nowPlaying', color: COLOR }
    keys[7] = { label: playing ? 'Пауза' : 'Играть', icon: playing ? 'lucide:pause' : 'lucide:play', color: COLOR, action: { type: 'media', command: 'playpause' } }

    keys[12] = { label: 'Закрыть', color: NEUTRAL, icon: 'lucide:x', action: { type: 'mixer' } }
    return keys
}
