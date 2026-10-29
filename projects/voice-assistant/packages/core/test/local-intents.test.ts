import { isNoiseUtterance } from '../src/local-intents.js'
import { describe, expect, it } from 'vitest'
import { matchLocalIntent } from '../src/local-intents.js'

describe('matchLocalIntent (완전일치)', () => {
  it('그만. / 그만해 → STOP', () => {
    expect(matchLocalIntent('그만.')).toBe('STOP')
    expect(matchLocalIntent(' 그만해 ')).toBe('STOP')
  })
  it('접두 포함은 매치하지 않는다 (F-14)', () => {
    expect(matchLocalIntent('그만 말고 계속해')).toBeNull()
    expect(matchLocalIntent('실행 확인해 줘', ['STOP', 'CONFIRM_WRITE'])).toBeNull()
  })
  it('켜지 않은 의도는 무시', () => {
    expect(matchLocalIntent('실행 확인')).toBeNull()
    expect(matchLocalIntent('실행 확인', ['CONFIRM_WRITE'])).toBe('CONFIRM_WRITE')
  })
})

describe('화면 의도는 포함 매치', () => {
  it('"화면 작게 해줘" → COLLAPSE, "전체 화면으로 켜줘" → EXPAND', () => {
    expect(matchLocalIntent('화면 작게 해줘.', ['STOP', 'COLLAPSE', 'EXPAND'])).toBe('COLLAPSE')
    expect(matchLocalIntent('전체 화면으로 켜줘', ['STOP', 'COLLAPSE', 'EXPAND'])).toBe('EXPAND')
  })
  it('긴 문장 속 포함은 무시, STOP 은 포함 매치 없음', () => {
    expect(matchLocalIntent('아까 화면 작게 했던 거 다시 크게 하고 노래 틀어줘', ['COLLAPSE', 'EXPAND'])).toBeNull()
    expect(matchLocalIntent('그만 말고 계속', ['STOP'])).toBeNull()
  })
})

it('끄기 명령은 완전일치만: "마이크 꺼줘" → SLEEP, "이거 너무 꺼져" → 없음', () => {
  expect(matchLocalIntent('마이크 꺼줘.', ['QUIET', 'SLEEP'])).toBe('SLEEP')
  expect(matchLocalIntent('음성인식 꺼', ['QUIET', 'SLEEP'])).toBe('SLEEP')
  expect(matchLocalIntent('이거 너무 꺼져.', ['QUIET', 'SLEEP'])).toBeNull()
  expect(matchLocalIntent('조용히 해 줘', ['QUIET', 'SLEEP'])).toBe('QUIET')
})

describe('isNoiseUtterance', () => {
  it('한 글자·환청은 잡음, 짧은 명령은 아니다', () => {
    for (const t of ['아', '뱅!', ' . ', '시청해주셔서 감사합니다.', '감사합니다']) expect(isNoiseUtterance(t)).toBe(true)
    for (const t of ['그만', '취침', '오늘 날씨 어때?', '감사합니다 자비스 오늘 일정 알려줘']) expect(isNoiseUtterance(t)).toBe(false)
  })
})

import { isConfirmUtterance, isDenyUtterance } from '../src/local-intents.js'
describe('isConfirmUtterance', () => {
  it('Whisper 오인식은 받아 주고 거절은 받지 않는다', () => {
    for (const t of ['실행 확인', '실형 확인', '실환 왕인', '응답 화긴', '확인', '실행 확인.', '네', '응', '진행해', '실행해 줘']) expect(isConfirmUtterance(t)).toBe(true)
    for (const t of ['취소', '아니', '하지 마', '확인하지 말고 취소해']) expect(isDenyUtterance(t)).toBe(true)
    for (const t of ['오늘 날씨 어때', '음', '실행 확인']) expect(isDenyUtterance(t)).toBe(false)
    for (const t of ['취소', '아니', '하지 마', '그만', '실행하지 마', '확인하지 말고 취소해', '아']) expect(isConfirmUtterance(t)).toBe(false)
  })
})

import { matchLocalIntent as mli } from '../src/local-intents.js'
describe('QUIT', () => {
  it('종료 말은 QUIT, 취침은 여전히 SLEEP, 문장 속 "종료"는 아니다', () => {
    for (const t of ['자비스 종료', '프로그램 종료해 줘.', '종료']) expect(mli(t, ['QUIT', 'SLEEP'])).toBe('QUIT')
    expect(mli('취침', ['QUIT', 'SLEEP'])).toBe('SLEEP')
    expect(mli('회의 종료 시간 알려줘', ['QUIT', 'SLEEP'])).toBeNull()
  })
})
