// 비밀은 safeStorage 로 암호화한 secrets.bin 에만 (§8). 개발 중엔 env 가 우선하되 값은 절대 로그하지 않는다.
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { secretsPath } from './paths.js'

type SecretKey = 'elevenlabsApiKey'
type SecretMap = Partial<Record<SecretKey, string>>

function readAll(): SecretMap {
  const p = secretsPath()
  if (!existsSync(p) || !safeStorage.isEncryptionAvailable()) return {}
  try { return JSON.parse(safeStorage.decryptString(readFileSync(p))) as SecretMap } catch { return {} }
}
export function getSecret(k: SecretKey): string | undefined {
  if (k === 'elevenlabsApiKey' && process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY
  return readAll()[k]
}
export function setSecret(k: SecretKey, v: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage 사용 불가')
  const all = readAll()
  if (v) all[k] = v; else delete all[k]
  writeFileSync(secretsPath(), safeStorage.encryptString(JSON.stringify(all)))
}
export function hasSecret(k: SecretKey): boolean { return Boolean(getSecret(k)) }
