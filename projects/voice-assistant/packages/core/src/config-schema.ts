import { z } from 'zod'
import { DEFAULT_VOICE_ID } from './voice-presets.js'

// 명세 §8 설정 JSON. 알 수 없는 키는 거부한다 (오타를 조용히 무시하지 않는다).
export const ConfigSchema = z.object({
  hud: z.object({ displayName: z.string().min(1).max(20).default('JARVIS'), captions: z.boolean().default(false), /** 사용자를 부르는 호칭 (한국어 / 영어로 말할 때) */ honorific: z.string().min(1).max(20).default('보스'), honorificEn: z.string().min(1).max(30).default('boss') }).strict().default({}),
  brain: z.object({
    model: z.string().default('claude-sonnet-5'),
    auth: z.enum(['subscription', 'api_key']).default('subscription'),
    maxTurns: z.number().int().min(1).max(20).default(8),
    timeoutMs: z.number().int().min(5000).max(120000).default(20000),
    idleCloseMs: z.number().int().min(60000).default(5 * 60 * 1000),
  }).strict().default({}),
  stt: z.object({
    endpointSilenceMs: z.number().int().min(300).max(3000).default(1800),
    // macOS 밖(Whisper 귀)에서만 쓴다. vadRms 는 마이크·방마다 다르니 조정 손잡이로 남긴다.
    whisperModel: z.string().default('onnx-community/whisper-small'),
    vadRms: z.number().min(0.001).max(0.2).default(0.015),
  }).strict().default({}),
  tts: z.object({
    voiceId: z.string().regex(/^[A-Za-z0-9]{20}$/).default(DEFAULT_VOICE_ID),
    model: z.string().default('eleven_flash_v2_5'),
    maxSpeakChars: z.number().int().min(80).max(600).default(240),
    // ElevenLabs 키가 없을 때 쓰는 로컬 목소리(Supertonic 2): M1~M5 남성, F1~F5 여성
    localVoice: z.enum(['M1', 'M2', 'M3', 'M4', 'M5', 'F1', 'F2', 'F3', 'F4', 'F5']).default('M1'),
    localSpeed: z.number().min(0.7).max(1.5).default(1.05),
  }).strict().default({}),
  voice: z.object({ followUpMs: z.number().int().min(0).max(60000).default(25000), listenSilenceMs: z.number().int().min(2000).default(12000), hudHoldMs: z.number().int().min(0).max(600000).default(90000), /** 호출되면 "Yes, boss" 라고 소리 내어 대답할지. 기본은 화면만 뜬다. */ wakeAck: z.boolean().default(false), /** Ctrl+J 를 누르고 있는 동안 듣기 (Windows) */ pushToTalk: z.boolean().default(true), /** 앱이 켜질 때 한 번 인사할지 */ greet: z.boolean().default(true), /** 듣는 동안 컴퓨터 소리(음악 등)를 잠시 끄고, 컴퓨터 소리가 나는 동안 항상 듣기를 쉰다 */ echoGuard: z.boolean().default(true) }).strict().default({}),
  weather: z.object({ city: z.string().optional(), lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional() }).strict().default({}),
  wake: z.object({ threshold: z.number().min(0.2).max(0.95).default(0.45), /** 박수 두 번으로 부르기 (Windows). 민감도 0(둔감)~1(민감) */ clap: z.boolean().default(false), clapSensitivity: z.number().min(0).max(1).default(0.5) }).strict().default({}),
  // 자비스 외의 비서 슬롯. 비운 칸은 자비스 값(hud.displayName·tts.voiceId·기본 인격)을 물려받는다.
  assistants: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,20}$/),
    displayName: z.string().min(1).max(20),
    persona: z.string().max(2000).optional(),
    voiceId: z.string().regex(/^[A-Za-z0-9]{20}$/).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).strict()).max(8).default([{ id: 'assistant-2', displayName: 'ASSISTANT 2' }]),
  mcp: z.record(z.string(), z.boolean()).default({}),
}).strict()

export type JarvisConfig = z.infer<typeof ConfigSchema>

export function parseConfig(raw: unknown): JarvisConfig {
  return ConfigSchema.parse(raw ?? {})
}
