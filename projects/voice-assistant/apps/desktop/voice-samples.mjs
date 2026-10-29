// Supertonic 2 남성 음성 M1~M5 샘플을 만든다: node voice-samples.mjs <출력폴더>
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { env, pipeline } from '@huggingface/transformers'

const out = process.argv[2] ?? 'voice-samples'
const cache = path.join(process.env.APPDATA ?? '.', 'Jarvis', 'models')
env.cacheDir = cache
mkdirSync(out, { recursive: true })
const REPO = 'onnx-community/Supertonic-TTS-2-ONNX'
const tts = await pipeline('text-to-speech', REPO)
const text = '<ko>JARVIS 온라인입니다, 홍길동 님. 오늘 서울은 맑고 최고 기온은 26도입니다. 무엇을 도와드리겠습니까?</ko>'
for (const v of ['M1', 'M2', 'M3', 'M4', 'M5']) {
  const bin = path.join(cache, `supertonic-${v}.bin`)
  if (!existsSync(bin)) writeFileSync(bin, Buffer.from(await (await fetch(`https://huggingface.co/${REPO}/resolve/main/voices/${v}.bin`)).arrayBuffer()))
  const b = readFileSync(bin)
  const emb = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
  const t0 = Date.now()
  const audio = await tts(text, { speaker_embeddings: emb, num_inference_steps: 5, speed: 1.05 })
  await audio.save(path.join(out, `jarvis-${v}.wav`))
  console.log(v, `${Date.now() - t0}ms`, `${(audio.audio.length / audio.sampling_rate).toFixed(1)}s`)
}
