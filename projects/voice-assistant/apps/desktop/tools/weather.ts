// 날씨·위치 (읽기). 위치: 설정값 > IP 기반(ipapi.co). 날씨: Open-Meteo (키 없음, 출처 표기). 10분 캐시.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { fetchJson, fail, text } from './util.js'

export interface Loc { lat: number; lon: number; city: string; source: 'config' | 'ip' }
const cache = new Map<string, { at: number; v: unknown }>()
async function cached<T>(k: string, ttlMs: number, f: () => Promise<T>): Promise<T> {
  const c = cache.get(k); if (c && Date.now() - c.at < ttlMs) return c.v as T
  const v = await f(); cache.set(k, { at: Date.now(), v }); return v
}
const WMO: Record<number, string> = { 0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림', 45: '안개', 48: '안개', 51: '이슬비', 53: '이슬비', 55: '이슬비', 61: '약한 비', 63: '비', 65: '강한 비', 71: '약한 눈', 73: '눈', 75: '강한 눈', 80: '소나기', 81: '소나기', 82: '강한 소나기', 95: '뇌우', 96: '뇌우·우박', 99: '뇌우·우박' }

export function weatherServer(getConfigLoc: () => { lat?: number | undefined; lon?: number | undefined; city?: string | undefined }) {
  async function locate(): Promise<Loc> {
    const c = getConfigLoc()
    if (c.lat != null && c.lon != null) return { lat: c.lat, lon: c.lon, city: c.city ?? '설정 위치', source: 'config' }
    return cached('loc', 30 * 60 * 1000, async () => {
      const j = await fetchJson<{ latitude: number; longitude: number; city: string; region: string }>('https://ipapi.co/json/')
      return { lat: j.latitude, lon: j.longitude, city: `${j.city}${j.region ? ' · ' + j.region : ''}`, source: 'ip' as const }
    })
  }
  return createSdkMcpServer({
    name: 'weather', version: '0.1.0',
    instructions: '위치와 날씨. 결과의 숫자·시각은 그대로 말한다. 출처 Open-Meteo.',
    tools: [
      tool('location_now', '현재 위치(도시, 위도·경도, 출처)', {}, async () => {
        try { const l = await locate(); return text(JSON.stringify(l)) } catch (e) { return fail(`위치 확인 실패: ${(e as Error).message}`) }
      }),
      tool('weather_today', '오늘 현재 날씨와 시간별(24h) 예보', {}, async () => {
        try {
          const l = await locate()
          const j = await cached(`today:${l.lat},${l.lon}`, 10 * 60 * 1000, () => fetchJson<Record<string, unknown>>(`https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=1&timezone=auto`))
          const cur = j.current as { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; relative_humidity_2m: number }
          const h = j.hourly as { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] }
          const now = new Date().getHours()
          const hours = h.time.map((t, i) => ({ h: Number(t.slice(11, 13)), temp: h.temperature_2m[i], rain: h.precipitation_probability[i], sky: WMO[h.weather_code[i] ?? 0] ?? '알 수 없음' })).filter((x) => x.h >= now)
          return text(JSON.stringify({ city: l.city, source: 'Open-Meteo', now: { temp: cur.temperature_2m, feels: cur.apparent_temperature, sky: WMO[cur.weather_code] ?? '알 수 없음', wind_kmh: cur.wind_speed_10m, humidity: cur.relative_humidity_2m }, hourly: hours }))
        } catch (e) { return fail(`날씨 조회 실패: ${(e as Error).message}`) }
      }),
      tool('weather_daily', '앞으로 며칠 일별 예보', { days: z.number().int().min(1).max(7).default(3) }, async ({ days }) => {
        try {
          const l = await locate()
          const j = await cached(`daily:${l.lat},${l.lon}:${days}`, 10 * 60 * 1000, () => fetchJson<Record<string, unknown>>(`https://api.open-meteo.com/v1/forecast?latitude=${l.lat}&longitude=${l.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=${days}&timezone=auto`))
          const d = j.daily as { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; weather_code: number[] }
          return text(JSON.stringify({ city: l.city, source: 'Open-Meteo', days: d.time.map((t, i) => ({ date: t, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max[i], sky: WMO[d.weather_code[i] ?? 0] ?? '알 수 없음' })) }))
        } catch (e) { return fail(`예보 조회 실패: ${(e as Error).message}`) }
      }),
    ],
  })
}
