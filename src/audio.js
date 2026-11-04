// Громкость и «без звука» Windows через Core Audio (IAudioEndpointVolume), без сторонних программ
import koffi from 'koffi'

const ole32 = koffi.load('ole32.dll')

const GUID = koffi.struct('GUID', {
    Data1: 'uint32',
    Data2: 'uint16',
    Data3: 'uint16',
    Data4: koffi.array('uint8', 8),
})

function guid(text) {
    const hex = text.replace(/-/g, '')
    return {
        Data1: parseInt(hex.slice(0, 8), 16),
        Data2: parseInt(hex.slice(8, 12), 16),
        Data3: parseInt(hex.slice(12, 16), 16),
        Data4: Array.from({ length: 8 }, (_, i) => parseInt(hex.slice(16 + i * 2, 18 + i * 2), 16)),
    }
}

const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E')
const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6')
const IID_IAudioEndpointVolume = guid('5CDF2C82-841E-4546-9722-0CF74078229A')
const CLSCTX_INPROC_SERVER = 0x1
const CLSCTX_ALL = 0x17
const COINIT_MULTITHREADED = 0x0
const FLOW = { speakers: 0, mic: 1 } // eRender, eCapture
const ROLE_CONSOLE = 0

const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *reserved, uint32 coInit)')
const CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(GUID *clsid, void *outer, uint32 context, GUID *iid, _Out_ void **object)')

// Методы COM-объектов: номер в таблице виртуальных функций и сигнатура.
// Порядок методов взят из mmdeviceapi.h и endpointvolume.h
const METHODS = {
    release: [2, koffi.proto('uint32 __stdcall ComRelease(void *self)')],
    getDefaultAudioEndpoint: [4, koffi.proto('long __stdcall ComGetDefaultAudioEndpoint(void *self, int flow, int role, _Out_ void **device)')],
    activate: [3, koffi.proto('long __stdcall ComActivate(void *self, GUID *iid, uint32 context, void *params, _Out_ void **object)')],
    setMasterVolumeLevelScalar: [7, koffi.proto('long __stdcall ComSetMasterVolumeLevelScalar(void *self, float level, GUID *context)')],
    getMasterVolumeLevelScalar: [9, koffi.proto('long __stdcall ComGetMasterVolumeLevelScalar(void *self, _Out_ float *level)')],
    setMute: [14, koffi.proto('long __stdcall ComSetMute(void *self, int mute, GUID *context)')],
    getMute: [15, koffi.proto('long __stdcall ComGetMute(void *self, _Out_ int *mute)')],
}
const POINTER_SIZE = koffi.sizeof('void *')

function invoke(object, method, ...args) {
    const [index, proto] = METHODS[method]
    const vtable = koffi.decode(object, 'void *')
    const fn = koffi.decode(vtable, index * POINTER_SIZE, 'void *')
    return koffi.call(fn, proto, object, ...args)
}

const hex = hr => `0x${(hr >>> 0).toString(16)}`

// state: { speakers: { volume: 0…100, muted } | null, mic: … | null }. null — устройства нет
export function createAudio({ onChange, interval = 200 } = {}) {
    CoInitializeEx(null, COINIT_MULTITHREADED)
    const out = [null]
    const hr = CoCreateInstance(CLSID_MMDeviceEnumerator, null, CLSCTX_INPROC_SERVER, IID_IMMDeviceEnumerator, out)
    if (hr < 0) throw new Error(`Core Audio недоступен (${hex(hr)})`)
    const enumerator = out[0]
    const endpoints = { speakers: null, mic: null }
    const state = { speakers: null, mic: null }
    let refreshedAt = 0

    // Устройство по умолчанию может смениться (подключили наушники), поэтому периодически берём его заново
    function refreshEndpoints() {
        for (const target of Object.keys(endpoints)) {
            if (endpoints[target]) invoke(endpoints[target], 'release')
            endpoints[target] = null
            const device = [null]
            if (invoke(enumerator, 'getDefaultAudioEndpoint', FLOW[target], ROLE_CONSOLE, device) < 0) continue
            const volume = [null]
            const result = invoke(device[0], 'activate', IID_IAudioEndpointVolume, CLSCTX_ALL, null, volume)
            invoke(device[0], 'release')
            if (result >= 0) endpoints[target] = volume[0]
        }
        refreshedAt = Date.now()
    }

    function read(target) {
        const endpoint = endpoints[target]
        if (!endpoint) return null
        const level = [0]
        const mute = [0]
        if (invoke(endpoint, 'getMasterVolumeLevelScalar', level) < 0) return null
        if (invoke(endpoint, 'getMute', mute) < 0) return null
        return { volume: Math.round(level[0] * 100), muted: !!mute[0] }
    }

    function poll() {
        if (Date.now() - refreshedAt > 2000) refreshEndpoints()
        let changed = false
        for (const target of Object.keys(state)) {
            const next = read(target)
            if (JSON.stringify(next) !== JSON.stringify(state[target])) {
                state[target] = next
                changed = true
            }
        }
        if (changed) onChange?.(state)
    }

    refreshEndpoints()
    poll()
    const timer = setInterval(() => {
        try {
            poll()
        } catch (err) {
            console.error(`Ошибка чтения громкости: ${err.message}`)
        }
    }, interval)

    function setVolume(target, percent) {
        const endpoint = endpoints[target]
        if (!endpoint) return
        invoke(endpoint, 'setMasterVolumeLevelScalar', Math.min(100, Math.max(0, percent)) / 100, null)
        poll()
    }

    function setMute(target, muted) {
        const endpoint = endpoints[target]
        if (!endpoint) return
        invoke(endpoint, 'setMute', muted ? 1 : 0, null)
        poll()
    }

    return {
        state,
        setVolume,
        setMute,
        // Шаг в процентах. Громкость встаёт на ближайшее значение, кратное шагу: 47 → 50 → 55
        changeVolume(target, step) {
            const current = state[target]
            if (!current || !step) return
            const size = Math.abs(step)
            const next = step > 0
                ? (Math.floor(current.volume / size) + 1) * size
                : (Math.ceil(current.volume / size) - 1) * size
            setVolume(target, next)
            // Как в Windows: прибавление громкости включает звук
            if (step > 0 && current.muted) setMute(target, false)
        },
        toggleMute(target) {
            const current = state[target]
            if (current) setMute(target, !current.muted)
        },
        close() {
            clearInterval(timer)
        },
    }
}
