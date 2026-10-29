// 미디어 (열기·재생 — 되돌릴 수 있어 무확인, §6.2 UNCONFIRMED). 크롬 열기, 유튜브 재생, Music 앱 제어.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { esc, fail, open, osascript, text } from './util.js'

const httpOnly = (u: string): string | null => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:' ? x.toString() : null } catch { return null } }

export async function findYoutubeVideo(query: string): Promise<{ id: string; title: string } | null> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000)
  try {
    const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { signal: c.signal, headers: { 'accept-language': 'ko', 'user-agent': 'Mozilla/5.0' } })
    const html = await r.text()
    const m = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/s.exec(html)
    return m ? { id: m[1]!, title: JSON.parse(`"${m[2]}"`) as string } : null
  } finally { clearTimeout(t) }
}

export const mediaServer = createSdkMcpServer({
  name: 'media', version: '0.1.0',
  instructions: '브라우저(크롬)로 URL 열기, 유튜브 재생, Music 앱 제어. 확인 없이 실행해도 된다(되돌릴 수 있음).',
  tools: [
    tool('open_url', 'URL 을 크롬에서 연다 (http/https 만)', { url: z.string() }, async ({ url }) => {
      const u = httpOnly(url); if (!u) return fail('http/https URL 만 열 수 있습니다')
      try { await open(['-a', 'Google Chrome', u]) } catch { await open([u]) }
      return text(`열었습니다: ${u}`)
    }),
    tool('youtube_play', '유튜브에서 검색해 첫 영상을 크롬으로 재생', { query: z.string().min(1) }, async ({ query }) => {
      const v = await findYoutubeVideo(query).catch(() => null)
      const u = v ? `https://www.youtube.com/watch?v=${v.id}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      try { await open(['-a', 'Google Chrome', u]) } catch { await open([u]) }
      return text(v ? `재생: ${v.title}` : `검색 결과를 열었습니다: ${query}`)
    }),
    tool('music_control', 'Music 앱 제어: play/pause/next/previous/now(현재 곡)', { action: z.enum(['play', 'pause', 'next', 'previous', 'now']) }, async ({ action }) => {
      try {
        if (action === 'now') { const r = await osascript('tell application "Music" to if player state is playing then return (name of current track) & " — " & (artist of current track) else return "정지"'); return text(r) }
        const cmd = { play: 'play', pause: 'pause', next: 'next track', previous: 'previous track' }[action]
        await osascript(`tell application "Music" to ${cmd}`)
        return text(`Music: ${action}`)
      } catch (e) { return fail(`Music 제어 실패: ${(e as Error).message}`) }
    }),
    tool('music_play', 'Music 앱 보관함에서 곡·아티스트·앨범 이름으로 검색해 재생', { query: z.string().min(1) }, async ({ query }) => {
      const q = esc(query)
      try {
        const r = await osascript(`tell application "Music"
          set hits to (every track of library playlist 1 whose name contains "${q}" or artist contains "${q}" or album contains "${q}")
          if (count of hits) = 0 then return "NONE"
          play (item 1 of hits)
          return (name of item 1 of hits) & " — " & (artist of item 1 of hits)
        end tell`)
        if (r === 'NONE') return fail(`보관함에 없음: ${query}. 유튜브로 재생할까요?`)
        return text(`재생: ${r}`)
      } catch (e) { return fail(`Music 검색 실패: ${(e as Error).message}`) }
    }),
  ],
})
