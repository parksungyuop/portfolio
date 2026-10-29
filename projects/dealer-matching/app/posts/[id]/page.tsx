import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { applyToPost, confirmApplication, withdrawQuote } from "@/lib/actions";
import { storeRatings, dealerSummary } from "@/lib/queries";
import { Avatar, Back, Empty, NoShowBadge, Stars, tier, timeAgo } from "@/components/ui";
import { condText, isUrgent } from "@/components/post-card";
import { DEALER_REVIEW_ITEMS } from "@/lib/const";
import { fmtRange, hours, list, won } from "@/lib/format";

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; edit?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const { sent, edit } = await searchParams;
  const post = await db.jobPost.findUnique({ where: { id }, include: { store: { include: { user: true } }, applications: { include: { dealer: true }, orderBy: { createdAt: "asc" } } } });
  if (!post) notFound();
  const h = hours(post.startsAt, post.endsAt);
  const cond = condText(post);

  // ---------- 가게: 받은 견적 비교 → 확정 ----------
  if (u.store) {
    const mine = u.store.id === post.storeId;
    const sums = await Promise.all(post.applications.map((a) => dealerSummary(a.dealerId)));
    const worked = await db.match.groupBy({ by: ["dealerId"], where: { storeId: u.store.id, status: "COMPLETED" }, _count: true });
    const workedMap = Object.fromEntries(worked.map((w) => [w.dealerId, w._count]));
    const apps = post.applications.map((a, i) => ({ a, s: sums[i], ours: workedMap[a.dealerId] ?? 0 }))
      .sort((x, y) => y.ours - x.ours || (x.a.askedWage ?? 0) - (y.a.askedWage ?? 0));
    const live = apps.filter((x) => x.a.status !== "REJECTED");
    return (
      <div className="shell">
        <Back />
        <div className="flex justify-between items-start"><div><div className="k">내 요청 · {timeAgo(post.createdAt)}</div><div className="big">{fmtRange(post.startsAt, post.endsAt)}</div><div className="k mt-0.5">{cond} · 요청 시급 {won(post.hourlyWage)}{post.notes && ` · ${post.notes}`}</div></div>{isUrgent(post) && post.status === "OPEN" && <span className="badge badge-bad">급구</span>}</div>
        {post.status !== "OPEN" && <div className="card mt-3 k">이 요청은 {post.status === "CONFIRMED" ? "확정되었어요" : post.status === "COMPLETED" ? "완료되었어요" : "마감되었어요"}.</div>}
        <h2 className="text-[17px] mt-7 mb-2">받은 견적 {live.length}개</h2>
        <div className="grid gap-3">
          {apps.length === 0 && <Empty>아직 견적이 없어요.<br />급구 요청은 선호 지역 딜러에게 알림이 갔어요.</Empty>}
          {apps.map(({ a, s, ours }) => (
            <div key={a.id} className={`card ${ours ? "card-hi" : ""}`}>
              <div className="flex items-center gap-3">
                <Avatar name={a.dealer.nickname} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{a.dealer.nickname} <span className={`badge ${tier(a.dealer.workCount, s.rating) === "프로" ? "badge-gold" : "badge-mute"}`}>{tier(a.dealer.workCount, s.rating)}</span></div>
                  <div className="k">경력 {a.dealer.years}년 · {list(a.dealer.games).join("/")} · {a.dealer.neighborhood} · {a.dealer.age}세 · {a.dealer.gender === "F" ? "여" : "남"}</div>
                </div>
                <div className="text-right"><div className="pay text-[18px]">{won(a.askedWage ?? post.hourlyWage)}</div><div className="k">/시간</div></div>
              </div>
              {a.message && <div className="mt-3 text-[14px] rounded-xl px-3 py-2.5" style={{ background: "var(--surface2)" }}>“{a.message}”</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 items-center text-[13px]">
                {s.reviews.length ? <Stars v={s.rating} count={a.dealer.workCount} /> : <span className="k">평가 준비 중 ({a.dealer.workCount}회)</span>}
                <NoShowBadge noShow={a.dealer.noShowCount} disputed={s.disputed} />
                {ours > 0 && <span className="badge">우리 가게 {ours}회</span>}
                {a.status !== "APPLIED" && <span className="badge badge-mute">{a.status === "ACCEPTED" ? "확정" : "마감"}</span>}
              </div>
              {mine && post.status === "OPEN" && a.status === "APPLIED" && (
                <div className="flex gap-2 mt-4">
                  <Link href={`/dealers/${a.dealerId}`} className="btn btn-ghost btn-sm flex-1">프로필 · 채팅</Link>
                  <form action={confirmApplication} className="flex-1"><input type="hidden" name="applicationId" value={a.id} /><button className="btn btn-pri btn-sm btn-full">이 견적으로 확정</button></form>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- 딜러: 요청 상세 + 견적 보내기 ----------
  const dealer = u.dealer!;
  const rating = (await storeRatings([post.storeId]))[post.storeId];
  const myApp = post.applications.find((a) => a.dealerId === dealer.id);
  const breakdown = rating ? await db.review.findMany({ where: { authorRole: "DEALER", storeId: post.storeId }, select: { scores: true, tags: true } }) : [];
  const item = (k: string) => breakdown.length ? breakdown.reduce((s, r) => s + (JSON.parse(r.scores)[k] ?? 0), 0) / breakdown.length : 0;
  const tagCount = breakdown.flatMap((r) => list(r.tags)).reduce<Record<string, number>>((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {});
  const showForm = post.status === "OPEN" && (!myApp || edit) && myApp?.status !== "ACCEPTED";

  return (
    <div className="shell" style={{ paddingBottom: showForm ? 24 : 110 }}>
      <Back right={<Link href={`/report?target=${post.store.userId}&back=/posts/${post.id}`} className="k">신고</Link>} />
      {sent && <div className="card mb-3" style={{ borderColor: "var(--ok)" }}><b style={{ color: "var(--ok)" }}>견적을 보냈어요.</b> <span className="k">가게가 견적을 비교하고 확정하면 알려드릴게요.</span></div>}
      <div className="flex justify-between items-start gap-3">
        <div>
          <div className="k">딜러매칭 · {post.store.region} · {timeAgo(post.createdAt)} {isUrgent(post) && post.status === "OPEN" && <span className="badge badge-bad ml-1">급구</span>}</div>
          <div className="big mt-1">{post.store.name}</div>
          <div className="k">{post.store.address}</div>
        </div>
        <Avatar name={post.store.name} square />
      </div>

      <h2 className="text-[16px] mt-6 mb-2">요청 내용</h2>
      <div className="card kv">
        <span>일시</span><span>{fmtRange(post.startsAt, post.endsAt)} ({h}h)</span>
        <span>시급</span><span><span className="pay">{won(post.hourlyWage)}</span> <span className="k">· 예상 {won(Math.round(post.hourlyWage * h))}</span></span>
        <span>조건</span><span>{cond}</span>
        {post.headcount > 1 && <><span>인원</span><span>{post.headcount}명</span></>}
        {post.notes && <><span>추가</span><span>{post.notes}</span></>}
      </div>

      <h2 className="text-[16px] mt-6 mb-2">가게 정보</h2>
      <div className="card kv">
        <span>테이블</span><span>{post.store.tables}개 · 블라인드 {post.store.blinds}</span>
        <span>영업</span><span>{post.store.hours}</span>
        <span>위치</span><span>{post.store.address}</span>
      </div>

      <div className="card mt-3">
        <div className="flex justify-between items-center"><b>딜러 평가</b>{rating ? <Stars v={rating.v} count={rating.n} /> : <span className="k">평가 준비 중 (3건 이상일 때 공개)</span>}</div>
        {rating && (
          <div className="kv mt-3">
            {DEALER_REVIEW_ITEMS.map(([k, l]) => <Fragment key={k}><span>{l}</span><span className="bar self-center"><i style={{ width: `${item(k) * 20}%` }} /></span></Fragment>)}
          </div>
        )}
        {Object.keys(tagCount).length > 0 && <div className="flex gap-1.5 flex-wrap mt-3">{Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => <span key={t} className="chip">{t} {n}</span>)}</div>}
        <div className="k mt-2">이 평가는 딜러만 볼 수 있어요.</div>
      </div>

      {/* 견적 보내기 (숨고의 견적서) */}
      {showForm ? (
        <form action={applyToPost} className="card mt-6" style={{ borderColor: "var(--accent)" }}>
          <input type="hidden" name="postId" value={post.id} />
          <div className="text-[17px] font-bold">{myApp ? "견적 수정" : "견적 보내기"}</div>
          <div className="k mt-0.5">희망 시급과 한마디를 보내면 가게가 견적을 비교해 확정해요.</div>
          <label className="lbl">희망 시급 <span className="k font-normal">· 요청 시급 {won(post.hourlyWage)}</span></label>
          <input type="number" name="askedWage" defaultValue={myApp?.askedWage ?? post.hourlyWage} step={500} min={10000} required className="mono text-[18px] font-bold" />
          <label className="lbl">가게에 한마디</label>
          <textarea name="message" rows={3} maxLength={200} defaultValue={myApp?.message} placeholder="가능 게임, 도착 예정 시간, 조건 …" />
          <button className="btn btn-pri btn-full mt-5">{myApp ? "견적 수정하기" : "견적 보내기"}</button>
        </form>
      ) : (
        <div className="cta"><div>
          {post.status !== "OPEN" && myApp?.status !== "ACCEPTED" ? <div className="btn btn-ghost btn-full" aria-disabled>마감된 요청이에요</div>
            : myApp?.status === "ACCEPTED" ? <Link href="/my" className="btn btn-pri btn-full">확정됐어요 · MY에서 확인</Link>
            : myApp && (
              <div className="flex items-center gap-2">
                <div className="flex-1"><div className="k">내 견적</div><div className="pay text-[18px]">{won(myApp.askedWage ?? post.hourlyWage)} <span className="badge">대기 중</span></div></div>
                <Link href={`/posts/${post.id}?edit=1`} className="btn btn-ghost btn-sm">수정</Link>
                <form action={withdrawQuote}><input type="hidden" name="postId" value={post.id} /><button className="btn btn-ghost btn-sm">철회</button></form>
              </div>
            )}
        </div></div>
      )}
    </div>
  );
}
