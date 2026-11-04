// Погода с Open-Meteo (бесплатно, без ключа). Город задаётся в конфиге: weather { city, latitude, longitude }
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search'
const REFRESH_MS = 15 * 60 * 1000
const RETRY_MS = 2 * 60 * 1000
const TIMEOUT_MS = 10000

async function getJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'streamx-bind' } })
    if (!res.ok) throw new Error(`сервер погоды ответил ${res.status}`)
    return res.json()
}

// Поиск города по названию для конфигуратора
export async function findPlaces(query) {
    const url = `${GEOCODING}?${new URLSearchParams({ name: query, count: '6', language: 'ru', format: 'json' })}`
    const { results = [] } = await getJson(url)
    return results.map(place => ({
        name: place.name,
        region: [place.admin1, place.country].filter(Boolean).join(', '),
        latitude: place.latitude,
        longitude: place.longitude,
    }))
}

// state — { temperature, code, isDay, city, updated } или null, пока данных нет.
// onChange вызывается, когда пришли новые данные
export function createWeather({ onChange }) {
    let place = null
    let timer = null
    let state = null
    let request = 0

    async function update() {
        clearTimeout(timer)
        if (!place) return
        const id = ++request
        try {
            const params = new URLSearchParams({
                latitude: String(place.latitude),
                longitude: String(place.longitude),
                current: 'temperature_2m,weather_code,is_day',
                timezone: 'auto',
            })
            const { current } = await getJson(`${FORECAST}?${params}`)
            if (id !== request) return // пока ждали ответа, город сменили
            state = {
                temperature: current.temperature_2m,
                code: current.weather_code,
                isDay: current.is_day === 1,
                city: place.city ?? '',
                updated: Date.now(),
            }
            onChange()
            timer = setTimeout(update, REFRESH_MS)
        } catch (err) {
            if (id !== request) return
            console.error(`Погода не обновилась: ${err.message}`)
            timer = setTimeout(update, RETRY_MS)
        }
    }

    return {
        get state() {
            return state
        },
        // Вызывать при загрузке и каждой перезагрузке конфига
        setPlace(next) {
            const valid = next && Number.isFinite(next.latitude) && Number.isFinite(next.longitude)
            const same = valid && place && place.latitude === next.latitude && place.longitude === next.longitude
            if (same) {
                place = next
                return
            }
            place = valid ? next : null
            request++
            clearTimeout(timer)
            if (state) {
                state = null
                onChange()
            }
            update()
        },
        stop() {
            request++
            clearTimeout(timer)
        },
    }
}
