import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const H = 36e5;
const at = (dayOffset: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  await db.$transaction([
    db.message.deleteMany(), db.offer.deleteMany(), db.chatRoom.deleteMany(),
    db.review.deleteMany(), db.noShowCase.deleteMany(), db.match.deleteMany(),
    db.application.deleteMany(), db.jobPost.deleteMany(), db.report.deleteMany(),
    db.dealerProfile.deleteMany(), db.storeProfile.deleteMany(), db.user.deleteMany(),
  ]);

  const mkDealer = (phone: string, name: string, d: { gender: string; age: number; neighborhood: string; preferredRegions: string; years: number; games: string; workCount?: number; noShowCount?: number }) =>
    db.user.create({ data: { phone, name, role: "DEALER", birthDate: new Date(new Date().getFullYear() - d.age, 0, 1), dealer: { create: { nickname: name, ...d } } }, include: { dealer: true } });
  const mkStore = (phone: string, name: string, s: { region: string; address: string; tables: number; games: string; blinds: string; hours: string; subscribed?: boolean }) =>
    db.user.create({ data: { phone, name: name + " 사장", role: "STORE", birthDate: new Date(1985, 4, 1), store: { create: { name, bizNo: "123-45-" + phone.slice(-5), ...s } } }, include: { store: true } });

  const [j, m, h] = await Promise.all([
    mkDealer("01011110001", "지원 J", { gender: "F", age: 25, neighborhood: "마포", preferredRegions: "강남,홍대", years: 3, games: "NLH,PLO,토너먼트", workCount: 42 }),
    mkDealer("01011110002", "민수 M", { gender: "M", age: 28, neighborhood: "강남", preferredRegions: "강남,서초", years: 1, games: "NLH", workCount: 8 }),
    mkDealer("01011110003", "하늘 H", { gender: "F", age: 22, neighborhood: "서초", preferredRegions: "강남", years: 0, games: "NLH", workCount: 2 }),
  ]);
  const [gangnam, river, hongdae] = await Promise.all([
    mkStore("01022220001", "강남 홀덤 라운지", { region: "강남", address: "역삼동 · 강남역 3번 출구 4분", tables: 6, games: "NLH,PLO", blinds: "2/5", hours: "19:00–04:00", subscribed: true }),
    mkStore("01022220002", "더 리버 홀덤", { region: "강남", address: "논현동 · 학동역 2분", tables: 4, games: "NLH", blinds: "1/3", hours: "18:00–02:00" }),
    mkStore("01022220003", "홍대 카드룸", { region: "홍대", address: "서교동 · 홍대입구역 9번 출구 5분", tables: 5, games: "NLH,토너먼트", blinds: "2/5", hours: "20:00–05:00" }),
  ]);
  const J = j.dealer!, M = m.dealer!, HH = h.dealer!;
  const G = gangnam.store!, R = river.store!, HD = hongdae.store!;

  // 공고
  const urgent = await db.jobPost.create({ data: { storeId: G.id, startsAt: at(0, 20), endsAt: at(1, 2), hourlyWage: 22000, minYears: 1, genderPref: "F", agePref: "20대", notes: "야식 제공, 택시비 별도" } });
  await db.jobPost.create({ data: { storeId: R.id, startsAt: at(1, 19), endsAt: at(2, 1), hourlyWage: 20000, minYears: 1, notes: "PLO 딜링 가능자 우선" } });
  await db.jobPost.create({ data: { storeId: HD.id, startsAt: at(2, 20), endsAt: at(3, 3), hourlyWage: 21000, notes: "토너먼트 데이" } });
  await db.jobPost.create({ data: { storeId: HD.id, startsAt: at(5, 14), endsAt: at(5, 23), hourlyWage: 180000 / 9, headcount: 12, notes: "월례 토너먼트 · 딜러 12명" } });

  // 급구 공고에 지원 3명
  await db.application.createMany({ data: [
    { postId: urgent.id, dealerId: J.id, askedWage: 23000, message: "PLO도 가능합니다. 택시비 포함이면 22,000도 괜찮아요." },
    { postId: urgent.id, dealerId: M.id, askedWage: 22000, message: "바로 갈 수 있습니다." },
    { postId: urgent.id, dealerId: HH.id, askedWage: 20000, message: "경력은 짧지만 성실히 하겠습니다." },
  ] });
  await db.chatRoom.createMany({ data: [{ dealerId: J.id, storeId: G.id }, { dealerId: M.id, storeId: G.id }, { dealerId: HH.id, storeId: G.id }] });

  // 과거 완료 근무 + 평가 (J는 강남 2회·리버 3회, M은 홍대 1회)
  const done = async (dealerId: string, storeId: string, dayAgo: number, wage: number, dScore: number, sScore: number) => {
    const mt = await db.match.create({ data: { dealerId, storeId, startsAt: at(-dayAgo, 20), endsAt: at(-dayAgo + 1, 2), hourlyWage: wage, status: "COMPLETED", completedAt: at(-dayAgo + 1, 2) } });
    await db.review.createMany({ data: [
      { matchId: mt.id, authorRole: "DEALER", storeId, scores: JSON.stringify({ pay: dScore, mood: dScore, guests: dScore - 1, rest: dScore - 1, again: dScore }), tags: "시급 제때" },
      { matchId: mt.id, authorRole: "STORE", dealerId, scores: JSON.stringify({ skill: sScore, attitude: sScore, time: 5, rehire: sScore }), tags: "딜링 정확" },
    ] });
    return mt;
  };
  await done(J.id, G.id, 7, 22000, 5, 5);
  await done(J.id, G.id, 14, 22000, 5, 5);
  await done(J.id, R.id, 3, 20000, 4, 5);
  await done(J.id, R.id, 10, 20000, 4, 5);
  await done(J.id, R.id, 21, 20000, 5, 4);
  await done(M.id, HD.id, 5, 21000, 4, 4);
  await done(HH.id, G.id, 4, 20000, 5, 4);
  await done(HH.id, G.id, 12, 20000, 4, 4);

  // 지난 근무 하나는 완료 처리 안 됨 (가게가 완료 버튼 눌러야 함) — 강남 ↔ J
  await db.match.create({ data: { dealerId: J.id, storeId: G.id, startsAt: at(-1, 20), endsAt: at(0, 2), hourlyWage: 22000 } });

  // M은 홍대에서 미출근 신고 1건, 소명 있음
  const disputed = await db.match.create({ data: { dealerId: M.id, storeId: HD.id, startsAt: at(-2, 20), endsAt: at(-1, 2), hourlyWage: 21000 } });
  await db.noShowCase.create({ data: { matchId: disputed.id, reportedAt: at(-2, 21), deadline: at(-1, 21), defenseText: "가게에서 19:40에 오늘 안 와도 된다고 카톡으로 통보했습니다.", outcome: "DISPUTED" } });

  // 채팅 예시
  const room = await db.chatRoom.findUniqueOrThrow({ where: { dealerId_storeId: { dealerId: J.id, storeId: G.id } } });
  await db.message.createMany({ data: [
    { roomId: room.id, senderId: gangnam.id, body: "안녕하세요! 오늘 8시 가능하신가요?", createdAt: new Date(Date.now() - 3 * H) },
    { roomId: room.id, senderId: j.id, body: "네 가능합니다. PLO도 가능해요.", createdAt: new Date(Date.now() - 2.9 * H) },
  ] });

  console.log("seeded. 로그인 계정: 딜러 J / M / H, 가게 강남 · 리버 · 홍대");
}

main().finally(() => db.$disconnect());
