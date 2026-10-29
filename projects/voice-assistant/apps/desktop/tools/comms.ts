// 연락 (연락처 검색·메일 읽기 = 읽기, 전화·메일 발송 = 쓰기 → 확인 게이트 §6.3). Mail.app · Contacts.app · FaceTime(tel:).
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { esc, escLines, fail, open, osascript, text } from './util.js'

export const COMMS_WRITE_TOOLS = ['mcp__comms__phone_call', 'mcp__comms__mail_send'] as const

export const commsServer = createSdkMcpServer({
  name: 'comms', version: '0.1.0',
  instructions: '연락처 검색, 전화 걸기(FaceTime·iPhone 연동), Mail 앱의 안 읽은 메일 확인과 발송. 전화와 발송은 보스의 "실행 확인"이 필요하다 — 걸기 전 상대와 번호를 한 문장으로 읽어 준다.',
  tools: [
    tool('contacts_find', '이름으로 연락처(전화·이메일) 검색', { name: z.string().min(1) }, async ({ name }) => {
      try {
        const r = await osascript(`tell application "Contacts"
          set out to ""
          repeat with p in (every person whose name contains "${esc(name)}")
            set ph to ""
            repeat with x in phones of p
              set ph to ph & (value of x) & " "
            end repeat
            set em to ""
            repeat with x in emails of p
              set em to em & (value of x) & " "
            end repeat
            set out to out & (name of p) & " | " & ph & "| " & em & linefeed
          end repeat
          return out
        end tell`)
        return r ? text(r) : fail(`연락처 없음: ${name}`)
      } catch (e) { return fail(`연락처 검색 실패: ${(e as Error).message}`) }
    }),
    tool('phone_call', '전화를 건다 (iPhone 연동 FaceTime). 확인 필요', { number: z.string().min(3), name: z.string().optional(), confirmation: z.string().optional() }, async ({ number, name }) => {
      const digits = number.replace(/[^\d+]/g, '')
      if (!/^\+?\d{3,15}$/.test(digits)) return fail('전화번호 형식이 아닙니다')
      try { await open([`tel:${digits}`]); return text(`전화 거는 중: ${name ? name + ' ' : ''}${digits}`) } catch (e) { return fail(`전화 실패: ${(e as Error).message}`) }
    }),
    tool('mail_unread', 'Mail 앱의 안 읽은 메일 목록(보낸 사람·제목·시각)', { limit: z.number().int().min(1).max(20).default(5) }, async ({ limit }) => {
      try {
        const r = await osascript(`tell application "Mail"
          set out to ""
          set n to 0
          repeat with acct in accounts
            repeat with mb in (mailboxes of acct whose name is "INBOX" or name is "받은 편지함" or name is "Inbox")
              repeat with m in (messages of mb whose read status is false)
                if n ≥ ${limit} then exit repeat
                set out to out & (sender of m) & " | " & (subject of m) & " | " & (date received of m as string) & linefeed
                set n to n + 1
              end repeat
            end repeat
          end repeat
          return out
        end tell`, 20000)
        return text(r || '안 읽은 메일 없음')
      } catch (e) { return fail(`메일 확인 실패(Mail 앱 계정 설정 필요): ${(e as Error).message}`) }
    }),
    tool('mail_send', 'Mail 앱으로 메일을 보낸다. 확인 필요', { to: z.string().email(), subject: z.string().min(1).max(200), body: z.string().min(1).max(4000), confirmation: z.string().optional() }, async ({ to, subject, body }) => {
      try {
        await osascript(`tell application "Mail"
          set m to make new outgoing message with properties {subject:"${esc(subject)}", content:"${escLines(body)}", visible:false}
          tell m to make new to recipient at end of to recipients with properties {address:"${esc(to)}"}
          send m
        end tell`, 15000)
        return text(`보냈습니다: ${to} · ${subject}`)
      } catch (e) { return fail(`메일 발송 실패: ${(e as Error).message}`) }
    }),
  ],
})
