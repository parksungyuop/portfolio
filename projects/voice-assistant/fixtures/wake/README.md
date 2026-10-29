# 호출어 픽스처

`spike:wake` 가 사람 없이 재현되도록 WAV 를 여기에 둔다. 전부 **16kHz · mono · PCM16**.

- `hey-jarvis-01.wav` … `hey-jarvis-10.wav`: "헤이 자비스" 한 번씩, 각 2~3초. 거리·톤을 조금씩 바꿔 녹음한다.
- `negative-01.wav` …: 호출어가 없는 한국어 발화(전화 통화 톤으로 읽기, 잡담). 합쳐서 10분 목표. 크기가 커서 git 에는 넣지 않는다(`.gitignore`), 대신 `spike:wake` 가 픽스처 해시를 verification.md 에 남긴다.

녹음은 `jarvis-ear` 의 `--dump` 로 한다 (마이크는 이 헬퍼만 연다):

```bash
pnpm build:ear
native/jarvis-ear/build/jarvis-ear --dump fixtures/wake/hey-jarvis-01.wav
# "헤이 자비스" 를 말한 뒤 Ctrl-C (또는 stdin 에 {"cmd":"stop"})
```

`--dump` 는 `start` 명령 없이도 마이크를 바로 파일에 쓴다.
