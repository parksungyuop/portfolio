-- 009: 오너가 대시보드에서 직접 고치는 봇 규칙 (개발자에게 부탁하지 않아도 되게)
-- 이미 schema.sql 을 실행한 DB 에 1회 실행. 새로 설치하는 DB 는 schema.sql 에 포함돼 있으니 실행 불필요.
alter table public.settings
  -- 답장에 들어 있으면 보내지 않는 표현 (띄어쓰기·문장부호 무시하고 비교)
  add column if not exists banned_phrases text[] not null default '{하자요}',
  -- 내 말 사전·추가 규칙 (한 줄에 하나, 봇 프롬프트에 그대로 들어감)
  add column if not exists my_glossary text not null default '- ㅖㅏ·예ㅏ = 예아, ㅔㅏ = 네아 = 응, 알았다(동의·확인). 상대가 이렇게 말하면 알았다는 뜻이고, 나도 알았다고 할 때 ㅖㅏ 나 예아 를 쓸 수 있다.
- 고트 = GOAT(Greatest Of All Time) = 신과 같다, 최고라는 칭찬.
- 존댓말로 권하거나 제안할 때는 "~하시죠", "~하도록 하죠"를 쓴다.',
  -- 오랜만에 연락 온 사람에게 할 근황 답
  add column if not exists catchup_text text not null default '- 상대가 뭐하고 사냐, 뭐하고 지내냐, 요즘 어떠냐 같은 근황을 물으면 일하면서 지낸다는 식으로 답한다.
- 무슨 일 하냐, 전에 하던 일 계속 하냐고 물으면 개발자 일 하고 있다고 답한다.',
  -- 며칠 만의 연락부터 '오랜만'으로 볼지
  add column if not exists long_gap_days int not null default 90 check (long_gap_days between 7 and 3650);
grant update (banned_phrases, my_glossary, catchup_text, long_gap_days) on public.settings to authenticated;
