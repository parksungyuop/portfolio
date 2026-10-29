import { describe, expect, it } from 'vitest'
import { APPS_WRITE_TOOLS, pickApp } from '../tools/apps.js'
import { WRITE_TOOLS } from '../brain/gate.js'

const apps = [{ Name: 'Instagram', AppID: 'ig' }, { Name: 'Visual Studio Code', AppID: 'code' }, { Name: 'Visual Studio Installer', AppID: 'vsi' }, { Name: '카카오톡', AppID: 'kakao' }]

describe('앱 실행 도구', () => {
  it('완전일치 > 앞부분 > 포함, 대소문자·공백 무시', () => {
    expect(pickApp(apps, 'instagram')?.AppID).toBe('ig')
    expect(pickApp(apps, 'visualstudiocode')?.AppID).toBe('code')
    expect(pickApp(apps, 'Visual Studio')?.AppID).toBe('code')
    expect(pickApp(apps, 'installer')?.AppID).toBe('vsi')
    expect(pickApp(apps, '카카오톡')?.AppID).toBe('kakao')
  })
  it('없는 앱·빈 이름은 null — 목록 밖의 것은 실행하지 않는다', () => {
    expect(pickApp(apps, 'calc.exe & del')).toBeNull()
    expect(pickApp(apps, '  ')).toBeNull()
  })
  it('실행은 확인 게이트 대상', () => { for (const t of APPS_WRITE_TOOLS) expect(WRITE_TOOLS.has(t)).toBe(true) })
})
