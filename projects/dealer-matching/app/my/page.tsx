import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logout, settleNoShows, toggleSubscription } from "@/lib/actions";
import { Avatar, Empty, Tabs, tier } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { dealerSummary } from "@/lib/queries";
import { POST_FEE, SUBSCRIPTION_FEE } from "@/lib/const";
import { dayLabel, fmtDate, fmtTime, hours, list, won } from "@/lib/format";

const statusBadge: Record<string, [string, string]> = {
  CONFIRMED: ["확정", ""], COMPLETED: ["완료", "badge-ok"], CANCELLED: ["취소", "badge-mute"], NO_SHOW: ["노쇼", "badge-bad"],
};

export default async function My() {
  const u = await requireUser();
  await settleNoShows();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (u.dealer) {
    const d = u.dealer;
    const matches = await db.match.findMany({ where: { dealerId: d.id }, include: { store: true, reviews: true, noShowCase: true }, orderBy: { startsAt: "desc" } });
    const next = [...matches].reverse().find((m) => m.status === "CONFIRMED" && m.endsAt > now);
    const done = matches.filter((m) => m.status === "COMPLETED");
    const monthIncome = done.filter((m) => m.completedAt! >= monthStart).reduce((s, m) => s + m.hourlyWage * hours(m.startsAt, m.endsAt), 0);
    const pendingReview = done.filter((m) => !m.reviews.some((r) => r.authorRole === "DEALER"));
    const unfinished = matches.filter((m) => m.status === "CONFIRMED" && m.endsAt <= now);
    const s = await dealerSummary(d.id);
    const apps = await db.application.findMany({ where: { dealerId: d.id, status: "APPLIED", post: { status: "OPEN" } }, include: { post: { include: { store: true } } } });

    return (
      <div className="shell">
        <div className="hdr"><h1>MY</h1><div className="flex items-center gap-3"><ThemeToggle /><form action={logout}><button className="k">로그아웃</button></form></div></div>
        <div className="flex items-center gap-3"><Avatar name={d.nickname} /><div><b>{d.nickname}</b> <span className={`badge ${tier(d.workCount, s.rating) === "프로" ? "badge-gold" : "badge-mute"}`}>{tier(d.workCount, s.rating)}</span><div className="k">근무 {d.workCount}회 · 노쇼 {d.noShowCount}회 · 늦은 취소 {d.lateCancels}회</div></div></div>

        <div className="card card-hi mt-4">
          <div className="k">{now.getMonth() + 1}월 수입 (완료 기준)</div>
          <div className="big">{Math.round(monthIncome).toLocaleString("ko-KR")}<span className="text-sm text-muted"> 원</span></div>
          <div className="k">근무 {done.filter((m) => m.completedAt! >= monthStart).length}회 · 전체 평균 시급 {done.length ? won(Math.round(done.reduce((a, m) => a + m.hourlyWage, 0) / done.length)) : "—"}</div>
        </div>

        {next && (
          <Link href={`/matches/${next.id}`} className="card mt-2 no-underline">
            <div className="flex justify-between"><b>다음 근무</b><span className="badge">확정</span></div>
            <div className="k">{dayLabel(next.startsAt)} {fmtTime(next.startsAt)} · {next.store.name} · {won(next.hourlyWage)}</div>
          </Link>
        )}
        {pendingReview.length > 0 && <Link href={`/matches/${pendingReview[0].id}`} className="card mt-2 no-underline" style={{ borderColor: "var(--accent)" }}><b>평가할 근무 {pendingReview.length}건</b><div className="k">{pendingReview[0].store.name} · {fmtDate(pendingReview[0].startsAt)} — 이 평가는 다른 딜러만 볼 수 있어요</div></Link>}
        {unfinished.filter((m) => !m.noShowCase).length > 0 && <div className="card mt-2 k">가게가 완료 처리하지 않은 근무 {unfinished.filter((m) => !m.noShowCase).length}건이 있어요. 채팅으로 요청해 보세요.</div>}
        {matches.filter((m) => m.noShowCase?.outcome === "PENDING").map((m) => <Link key={m.id} href={`/matches/${m.id}`} className="card mt-2 no-underline" style={{ borderColor: "var(--bad)" }}><b style={{ color: "var(--bad)" }}>미출근 신고가 접수됐어요</b><div className="k">{m.store.name} · 소명 기한 {fmtDate(m.noShowCase!.deadline)} {fmtTime(m.noShowCase!.deadline)}</div></Link>)}

        <h2 className="text-[17px] mt-7 mb-2">보낸 견적 · 대기 중 {apps.length}</h2>
        <div className="grid gap-1.5">
          {apps.length === 0 && <Empty>대기 중인 견적이 없어요.</Empty>}
          {apps.map((a) => <Link key={a.id} href={`/posts/${a.postId}`} className="card flex justify-between no-underline"><span><b>{a.post.store.name}</b> <span className="k">{dayLabel(a.post.startsAt)} {fmtTime(a.post.startsAt)}</span></span><span className="pay">{won(a.askedWage ?? a.post.hourlyWage)}</span></Link>)}
        </div>

        <h2 className="text-[17px] mt-7 mb-2">근무 이력 · 정산서</h2>
        <div className="grid gap-1.5">
          {matches.length === 0 && <Empty>아직 근무 이력이 없어요.</Empty>}
          {matches.map((m) => { const [l, c] = statusBadge[m.status]; return (
            <Link key={m.id} href={`/matches/${m.id}`} className="card flex justify-between items-center no-underline">
              <span><b>{m.store.name}</b><div className="k">{fmtDate(m.startsAt)} {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)} · {won(m.hourlyWage)} × {hours(m.startsAt, m.endsAt)}h</div></span>
              <span className="text-right"><span className={`badge ${c}`}>{l}</span>{m.status === "COMPLETED" && <div className="pay mt-1">{won(Math.round(m.hourlyWage * hours(m.startsAt, m.endsAt)))}</div>}</span>
            </Link>
          ); })}
        </div>
        <div className="card mt-4 k">내 조건: {list(d.preferredRegions).join("·")} · {list(d.games).join("/")} · 경력 {d.years}년</div>
        <Tabs active="my" dealer />
      </div>
    );
  }

  // ---------- 가게 ----------
  const st = u.store!;
  const [posts, matches] = await Promise.all([
    db.jobPost.findMany({ where: { storeId: st.id, createdAt: { gte: monthStart } } }),
    db.match.findMany({ where: { storeId: st.id }, include: { dealer: true, reviews: true, noShowCase: true }, orderBy: { startsAt: "desc" } }),
  ]);
  const toComplete = matches.filter((m) => m.status === "CONFIRMED" && m.endsAt <= now && !m.noShowCase);
  const pendingReview = matches.filter((m) => m.status === "COMPLETED" && !m.reviews.some((r) => r.authorRole === "STORE"));
  const upcoming = matches.filter((m) => m.status === "CONFIRMED" && m.endsAt > now).reverse();
  const past = new Map<string, { dealer: typeof matches[number]["dealer"]; n: number; last: Date }>();
  for (const m of matches.filter((m) => m.status === "COMPLETED")) {
    const p = past.get(m.dealerId);
    past.set(m.dealerId, { dealer: m.dealer, n: (p?.n ?? 0) + 1, last: p?.last ?? m.startsAt });
  }
  const matched = posts.filter((p) => p.status !== "OPEN" && p.status !== "EXPIRED").length;

  return (
    <div className="shell">
      <div className="hdr"><h1>MY</h1><div className="flex items-center gap-3"><ThemeToggle /><form action={logout}><button className="k">로그아웃</button></form></div></div>
      <div className="flex items-center gap-3"><Avatar name={st.name} square /><div><b>{st.name}</b><div className="k">{st.region} · {st.address} · 테이블 {st.tables}</div></div></div>

      <div className="card card-hi mt-4">
        <div className="flex justify-between items-center">
          <div><div className="k">{st.subscribed ? "구독 중" : "비구독"}</div><div className="big" style={{ fontSize: 20 }}>{st.subscribed ? `월 ${won(SUBSCRIPTION_FEE)}` : `크레딧 ${won(st.credits)}`}</div><div className="k">{st.subscribed ? "공고 무제한 · 재고용 무료" : `공고 1건 ${won(POST_FEE)} · 남은 ${Math.floor(st.credits / POST_FEE)}건`}</div></div>
          <form action={toggleSubscription}><button className={`btn btn-sm ${st.subscribed ? "btn-ghost" : "btn-wine"}`}>{st.subscribed ? "구독 해지" : "구독 시작"}</button></form>
        </div>
        <div className="k mt-2">이번 달 요청 {posts.length}건 · 매칭 {matched}건{posts.length ? ` · 매칭률 ${Math.round((matched / posts.length) * 100)}%` : ""}</div>
      </div>

      {toComplete.map((m) => <Link key={m.id} href={`/matches/${m.id}`} className="card mt-2 no-underline" style={{ borderColor: "var(--accent)" }}><b>완료 처리할 근무</b><div className="k">{m.dealer.nickname} · {fmtDate(m.startsAt)} · 완료하면 정산서가 만들어져요</div></Link>)}
      {pendingReview.length > 0 && <Link href={`/matches/${pendingReview[0].id}`} className="card mt-2 no-underline"><b>평가할 딜러 {pendingReview.length}명</b><div className="k">{pendingReview[0].dealer.nickname} · {fmtDate(pendingReview[0].startsAt)}</div></Link>}

      <h2 className="text-[17px] mt-7 mb-2">확정된 근무 {upcoming.length}</h2>
      <div className="grid gap-1.5">
        {upcoming.length === 0 && <Empty>확정된 근무가 없어요.</Empty>}
        {upcoming.map((m) => <Link key={m.id} href={`/matches/${m.id}`} className="card flex justify-between items-center no-underline"><span><b>{m.dealer.nickname}</b><div className="k">{dayLabel(m.startsAt)} {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)}</div></span><span className="pay">{won(m.hourlyWage)}</span></Link>)}
      </div>

      <h2 className="text-[17px] mt-7 mb-2">함께 일한 딜러 · 다시 부르기</h2>
      <div className="grid gap-1.5">
        {past.size === 0 && <Empty>근무를 완료하면 여기서 원탭으로 다시 부를 수 있어요.</Empty>}
        {[...past.values()].sort((a, b) => b.n - a.n).map(({ dealer, n, last }) => (
          <div key={dealer.id} className="card flex items-center gap-3">
            <Avatar name={dealer.nickname} />
            <Link href={`/dealers/${dealer.id}`} className="flex-1 no-underline"><b>{dealer.nickname}</b><div className="k">우리 가게 {n}회 · 최근 {fmtDate(last)} · {list(dealer.games).join("/")}</div></Link>
            <Link href={`/rehire/${dealer.id}`} className="btn btn-pri btn-sm">다시 부르기</Link>
          </div>
        ))}
      </div>

      <h2 className="text-[17px] mt-7 mb-2">근무 기록</h2>
      <div className="grid gap-1.5">
        {matches.filter((m) => m.status !== "CONFIRMED" || m.endsAt <= now).slice(0, 10).map((m) => { const [l, c] = statusBadge[m.status]; return (
          <Link key={m.id} href={`/matches/${m.id}`} className="card flex justify-between items-center no-underline"><span><b>{m.dealer.nickname}</b><div className="k">{fmtDate(m.startsAt)} · {won(m.hourlyWage)} × {hours(m.startsAt, m.endsAt)}h</div></span><span className={`badge ${c}`}>{l}</span></Link>
        ); })}
      </div>
      <Tabs active="my" />
    </div>
  );
}
