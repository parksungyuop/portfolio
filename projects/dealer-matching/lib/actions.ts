"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireDealer, requireStore, requireUser } from "./session";
import {
  AGE_MIN, LATE_CANCEL_HOURS, NO_SHOW_DEFENSE_HOURS, NO_SHOW_REPORT_AFTER_MIN, POST_FEE,
  STORE_SANCTION_STEPS,
} from "./const";

const H = 36e5;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const csv = (fd: FormData, k: string) => fd.getAll(k).map(String).join(",");

// ---------- 인증 ----------
export async function loginAs(fd: FormData) {
  (await cookies()).set("uid", str(fd, "uid"), { httpOnly: true, path: "/" });
  redirect("/home");
}
export async function setTheme(fd: FormData) {
  (await cookies()).set("theme", str(fd, "theme") === "light" ? "light" : "dark", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
export async function logout() {
  (await cookies()).delete("uid");
  redirect("/");
}

export async function signup(fd: FormData) {
  const role = str(fd, "role");
  const phone = str(fd, "phone");
  if (!/^01\d{8,9}$/.test(phone)) throw new Error("휴대폰 번호를 확인해 주세요.");
  // 연령 확인은 딜러만. 가게는 사업자 계정이라 생년월일·사업자번호를 받지 않는다.
  let birth: Date | null = null, age = 0;
  if (role === "DEALER") {
    birth = new Date(str(fd, "birthDate"));
    age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 864e5));
    if (!(age >= AGE_MIN)) throw new Error(`만 ${AGE_MIN}세 이상만 가입할 수 있어요.`);
  }

  const user = await db.user.create({
    data: {
      phone, birthDate: birth, role, name: str(fd, "name"),
      ...(role === "DEALER"
        ? { dealer: { create: {
            nickname: str(fd, "name"), gender: str(fd, "gender"), age,
            neighborhood: str(fd, "neighborhood"), preferredRegions: csv(fd, "regions"),
            years: num(fd, "years"), games: csv(fd, "games") || "NLH",
          } } }
        : { store: { create: {
            name: str(fd, "storeName"), region: str(fd, "region"),
            address: str(fd, "address"), tables: num(fd, "tables") || 4, games: csv(fd, "games") || "NLH",
            blinds: str(fd, "blinds") || "2/5", hours: str(fd, "hours") || "19:00–03:00",
          } } }),
    },
  });
  (await cookies()).set("uid", user.id, { httpOnly: true, path: "/" });
  redirect("/home");
}

// ---------- 공고 ----------
export async function createPost(fd: FormData) {
  const { store } = await requireStore();
  if (store.sanctionUntil && store.sanctionUntil > new Date())
    throw new Error(`제재 중이라 ${store.sanctionUntil.toLocaleDateString("ko-KR")}까지 공고를 올릴 수 없어요.`);

  const date = str(fd, "date");
  const startsAt = new Date(`${date}T${str(fd, "start")}`);
  let endsAt = new Date(`${date}T${str(fd, "end")}`);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * H); // 자정 넘김

  await db.$transaction(async (tx) => {
    if (!store.subscribed) {
      if (store.credits < POST_FEE) throw new Error("크레딧이 부족해요. MY에서 구독하거나 충전해 주세요.");
      await tx.storeProfile.update({ where: { id: store.id }, data: { credits: { decrement: POST_FEE } } });
    }
    await tx.jobPost.create({
      data: {
        storeId: store.id, startsAt, endsAt,
        hourlyWage: num(fd, "wage"), headcount: num(fd, "headcount") || 1,
        genderPref: str(fd, "genderPref") || "ANY", agePref: csv(fd, "agePref"),
        minYears: num(fd, "minYears"), notes: str(fd, "notes"),
      },
    });
  });
  revalidatePath("/home");
  redirect("/home");
}

// 견적 보내기 (숨고의 견적). 희망 시급 + 메시지. 같은 요청에 다시 보내면 덮어쓴다.
export async function applyToPost(fd: FormData) {
  const { dealer } = await requireDealer();
  const postId = str(fd, "postId");
  const post = await db.jobPost.findUniqueOrThrow({ where: { id: postId } });
  if (post.status !== "OPEN") throw new Error("마감된 요청이에요.");
  const askedWage = num(fd, "askedWage") || post.hourlyWage;
  if (askedWage < 10000 || askedWage > 200000) throw new Error("시급을 확인해 주세요.");
  const message = str(fd, "message");

  await db.$transaction(async (tx) => {
    await tx.application.upsert({
      where: { postId_dealerId: { postId, dealerId: dealer.id } },
      update: { askedWage, message, status: "APPLIED" }, create: { postId, dealerId: dealer.id, askedWage, message },
    });
    await tx.chatRoom.upsert({
      where: { dealerId_storeId: { dealerId: dealer.id, storeId: post.storeId } },
      update: {}, create: { dealerId: dealer.id, storeId: post.storeId },
    });
  });
  revalidatePath(`/posts/${postId}`);
  redirect(`/posts/${postId}?sent=1`);
}

export async function withdrawQuote(fd: FormData) {
  const { dealer } = await requireDealer();
  const postId = str(fd, "postId");
  await db.application.deleteMany({ where: { postId, dealerId: dealer.id, status: "APPLIED" } });
  revalidatePath(`/posts/${postId}`);
  redirect(`/posts/${postId}`);
}

// 기본 확정 경로: 가게가 받은 견적 중 하나를 고른다. 확정 시급은 견적 시급.
export async function confirmApplication(fd: FormData) {
  const { store } = await requireStore();
  const app = await db.application.findUniqueOrThrow({ where: { id: str(fd, "applicationId") }, include: { post: true } });
  if (app.post.storeId !== store.id) throw new Error("권한이 없어요.");
  if (app.post.status !== "OPEN") throw new Error("이미 확정된 요청이에요.");

  await db.$transaction([
    db.match.create({ data: {
      postId: app.postId, dealerId: app.dealerId, storeId: store.id,
      startsAt: app.post.startsAt, endsAt: app.post.endsAt, hourlyWage: app.askedWage ?? app.post.hourlyWage,
    } }),
    db.application.update({ where: { id: app.id }, data: { status: "ACCEPTED" } }),
    db.application.updateMany({ where: { postId: app.postId, id: { not: app.id } }, data: { status: "REJECTED" } }),
    db.jobPost.update({ where: { id: app.postId }, data: { status: "CONFIRMED" } }),
  ]);
  revalidatePath("/home");
  redirect("/my");
}

// ---------- 채팅 · 제안 카드 · 재고용 ----------
export async function sendMessage(fd: FormData) {
  const u = await requireUser();
  const roomId = str(fd, "roomId");
  const body = str(fd, "body");
  if (!body) return;
  await db.message.create({ data: { roomId, senderId: u.id, body } });
  await db.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
  revalidatePath(`/chat/${roomId}`);
}

export async function sendOffer(fd: FormData) {
  const u = await requireUser();
  const roomId = str(fd, "roomId");
  const date = str(fd, "date");
  const startsAt = new Date(`${date}T${str(fd, "start")}`);
  let endsAt = new Date(`${date}T${str(fd, "end")}`);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * H);
  const offer = await db.offer.create({ data: {
    roomId, fromUserId: u.id, startsAt, endsAt, hourlyWage: num(fd, "wage"), memo: str(fd, "memo"),
  } });
  await db.message.create({ data: { roomId, senderId: u.id, body: "근무 제안", offerId: offer.id } });
  await db.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
  revalidatePath(`/chat/${roomId}`);
  redirect(`/chat/${roomId}`);
}

export async function respondOffer(fd: FormData) {
  const u = await requireUser();
  const offer = await db.offer.findUniqueOrThrow({ where: { id: str(fd, "offerId") }, include: { room: true } });
  if (offer.fromUserId === u.id) throw new Error("내가 보낸 제안은 상대가 수락해야 해요.");
  if (offer.status !== "PENDING") return;
  const accept = str(fd, "decision") === "accept";

  await db.$transaction(async (tx) => {
    await tx.offer.update({ where: { id: offer.id }, data: { status: accept ? "ACCEPTED" : "DECLINED" } });
    if (accept) {
      await tx.match.create({ data: {
        dealerId: offer.room.dealerId, storeId: offer.room.storeId,
        startsAt: offer.startsAt, endsAt: offer.endsAt, hourlyWage: offer.hourlyWage,
      } });
      await tx.message.create({ data: { roomId: offer.roomId, senderId: u.id, body: "제안을 수락했어요. 확정됐습니다." } });
    }
  });
  revalidatePath(`/chat/${offer.roomId}`);
}

// 원탭 재고용: 과거 근무 딜러에게 날짜·시간만 골라 제안
export async function rehire(fd: FormData) {
  const { store } = await requireStore();
  const dealerId = str(fd, "dealerId");
  const worked = await db.match.count({ where: { storeId: store.id, dealerId, status: "COMPLETED" } });
  if (!worked) throw new Error("근무 이력이 있는 딜러만 다시 부를 수 있어요.");
  const room = await db.chatRoom.upsert({
    where: { dealerId_storeId: { dealerId, storeId: store.id } },
    update: {}, create: { dealerId, storeId: store.id },
  });
  fd.set("roomId", room.id);
  await sendOffer(fd);
}

// ---------- 근무 상태 ----------
export async function completeMatch(fd: FormData) {
  const { store } = await requireStore();
  const m = await db.match.findUniqueOrThrow({ where: { id: str(fd, "matchId") } });
  if (m.storeId !== store.id || m.status !== "CONFIRMED") throw new Error("완료 처리할 수 없어요.");
  await db.$transaction([
    db.match.update({ where: { id: m.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    db.dealerProfile.update({ where: { id: m.dealerId }, data: { workCount: { increment: 1 } } }),
    ...(m.postId ? [db.jobPost.update({ where: { id: m.postId }, data: { status: "COMPLETED" } })] : []),
  ]);
  revalidatePath(`/matches/${m.id}`);
}

export async function cancelMatch(fd: FormData) {
  const u = await requireUser();
  const m = await db.match.findUniqueOrThrow({ where: { id: str(fd, "matchId") } });
  const mine = (u.dealer && u.dealer.id === m.dealerId) || (u.store && u.store.id === m.storeId);
  if (!mine || m.status !== "CONFIRMED") throw new Error("취소할 수 없어요.");
  const late = m.startsAt.getTime() - Date.now() < LATE_CANCEL_HOURS * H;

  await db.$transaction([
    db.match.update({ where: { id: m.id }, data: { status: "CANCELLED", cancelledBy: u.role } }),
    ...(m.postId ? [db.jobPost.update({ where: { id: m.postId }, data: { status: "OPEN" } })] : []), // 재오픈
    ...(late && u.dealer ? [db.dealerProfile.update({ where: { id: m.dealerId }, data: { lateCancels: { increment: 1 } } })] : []),
    ...(late && u.store ? [db.storeProfile.update({ where: { id: m.storeId }, data: { lateCancels: { increment: 1 } } })] : []),
  ]);
  revalidatePath(`/matches/${m.id}`);
}

export async function reportNoShow(fd: FormData) {
  const { store } = await requireStore();
  const m = await db.match.findUniqueOrThrow({ where: { id: str(fd, "matchId") } });
  if (m.storeId !== store.id || m.status !== "CONFIRMED") throw new Error("신고할 수 없어요.");
  if (Date.now() < m.startsAt.getTime() + NO_SHOW_REPORT_AFTER_MIN * 60e3)
    throw new Error(`근무 시작 ${NO_SHOW_REPORT_AFTER_MIN}분 후부터 신고할 수 있어요.`);
  await db.$transaction([
    db.noShowCase.create({ data: { matchId: m.id, deadline: new Date(Date.now() + NO_SHOW_DEFENSE_HOURS * H) } }),
    ...(m.postId ? [db.jobPost.update({ where: { id: m.postId }, data: { status: "OPEN" } })] : []), // 즉시 재오픈
  ]);
  revalidatePath(`/matches/${m.id}`);
}

export async function defendNoShow(fd: FormData) {
  const { dealer } = await requireDealer();
  const c = await db.noShowCase.findUniqueOrThrow({ where: { id: str(fd, "caseId") }, include: { match: true } });
  if (c.match.dealerId !== dealer.id || c.outcome !== "PENDING") throw new Error("소명할 수 없어요.");
  if (c.deadline < new Date()) throw new Error("소명 기한이 지났어요.");
  // 판정하지 않고 기록한다. 가게에는 양쪽 진술이 보인다.
  await db.noShowCase.update({ where: { id: c.id }, data: { defenseText: str(fd, "text"), outcome: "DISPUTED" } });
  revalidatePath(`/matches/${c.matchId}`);
}

// ponytail: cron 대신 페이지 진입 시 기한 지난 건을 정리. 트래픽 늘면 cron으로.
export async function settleNoShows() {
  const due = await db.noShowCase.findMany({ where: { outcome: "PENDING", deadline: { lt: new Date() } }, include: { match: true } });
  for (const c of due) {
    await db.$transaction([
      db.noShowCase.update({ where: { id: c.id }, data: { outcome: "AUTO_CONFIRMED" } }),
      db.match.update({ where: { id: c.matchId }, data: { status: "NO_SHOW" } }),
      db.dealerProfile.update({ where: { id: c.match.dealerId }, data: { noShowCount: { increment: 1 } } }),
    ]);
  }
  await db.jobPost.updateMany({ where: { status: "OPEN", startsAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
}

// ---------- 평가 ----------
export async function submitReview(fd: FormData) {
  const u = await requireUser();
  const m = await db.match.findUniqueOrThrow({ where: { id: str(fd, "matchId") } });
  if (m.status !== "COMPLETED") throw new Error("완료된 근무만 평가할 수 있어요.");
  const asDealer = !!u.dealer && u.dealer.id === m.dealerId;
  const asStore = !!u.store && u.store.id === m.storeId;
  if (!asDealer && !asStore) throw new Error("권한이 없어요.");

  const scores: Record<string, number> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("s_")) scores[k.slice(2)] = Number(v);
  await db.review.create({ data: {
    matchId: m.id, authorRole: asDealer ? "DEALER" : "STORE",
    storeId: asDealer ? m.storeId : null, dealerId: asStore ? m.dealerId : null,
    scores: JSON.stringify(scores), tags: csv(fd, "tags"),
  } });
  revalidatePath(`/matches/${m.id}`);
  redirect("/my");
}

// ---------- 신고 · 구독 ----------
export async function submitReport(fd: FormData) {
  const u = await requireUser();
  await db.report.create({ data: {
    reporterId: u.id, targetUserId: str(fd, "targetUserId"), type: str(fd, "type"), detail: str(fd, "detail"),
  } });
  redirect(str(fd, "back") || "/home");
}

// 관리자가 신고를 인정할 때 호출. MVP는 관리자 화면이 없으므로 Prisma Studio에서 status를 바꾼 뒤 이 함수를 쓴다.
export async function acceptStoreReport(storeUserId: string) {
  const store = await db.storeProfile.update({ where: { userId: storeUserId }, data: { reportCount: { increment: 1 } } });
  const step = [...STORE_SANCTION_STEPS].reverse().find(([n]) => store.reportCount >= n);
  if (!step) return;
  const until = step[1] === null ? new Date("2999-01-01") : new Date(Date.now() + step[1] * 864e5);
  await db.storeProfile.update({ where: { id: store.id }, data: { sanctionUntil: until } });
}

export async function toggleSubscription() {
  const { store } = await requireStore();
  // ponytail: 토스 빌링키 연동 전까지는 토글. 결제 웹훅이 이 필드를 갱신하게 된다.
  await db.storeProfile.update({ where: { id: store.id }, data: { subscribed: !store.subscribed } });
  revalidatePath("/my");
}
