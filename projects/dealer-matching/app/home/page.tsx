import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { settleNoShows } from "@/lib/actions";
import { storeRatings } from "@/lib/queries";
import { PostCard, isUrgent } from "@/components/post-card";
import { Empty, Tabs } from "@/components/ui";
import { REGIONS } from "@/lib/const";
import { dayLabel, fmtTime, list, won } from "@/lib/format";

export default async function Home({ searchParams }: { searchParams: Promise<{ region?: string; when?: string; urgent?: string; tab?: string }> }) {
  const u = await requireUser();
  await settleNoShows();
  const sp = await searchParams;

  // ---------- 가게: 내 요청 ----------
  if (u.store) {
    const posts = await db.jobPost.findMany({ where: { storeId: u.store.id }, include: { store: true, _count: { select: { applications: { where: { status: "APPLIED" } } } } }, orderBy: { startsAt: "asc" } });
    const open = posts.filter((p) => p.status === "OPEN");
    const rest = posts.filter((p) => p.status !== "OPEN").reverse();
    return (
      <div className="shell">
        <div className="hdr"><h1>{u.store.name}</h1><Link href="/posts/new" className="btn btn-pri btn-sm">+ 딜러 요청</Link></div>
        {u.store.sanctionUntil && u.store.sanctionUntil > new Date() && <div className="card mb-3" style={{ borderColor: "var(--bad)" }}><b style={{ color: "var(--bad)" }}>요청 등록 제한 중</b><div className="k">{u.store.sanctionUntil.toLocaleDateString("ko-KR")}까지. 신고 누적 {u.store.reportCount}회</div></div>}
        <h2 className="text-[17px] mb-2">진행 중인 요청 {open.length}</h2>
        <div className="grid gap-3">
          {open.length ? open.map((p) => <PostCard key={p.id} p={p} mine />) : <Empty>진행 중인 요청이 없어요.<br />위에서 딜러를 요청하거나 MY에서 지난 딜러를 다시 불러보세요.</Empty>}
        </div>
        {rest.length > 0 && <><h2 className="text-[17px] mt-8 mb-2">지난 요청</h2><div className="grid gap-3">{rest.slice(0, 5).map((p) => <PostCard key={p.id} p={p} mine />)}</div></>}
        <Tabs active="home" />
      </div>
    );
  }

  // ---------- 딜러: 받은 요청 | 보낸 견적 ----------
  const dealer = u.dealer!;
  const tab = sp.tab === "sent" ? "sent" : "inbox";

  if (tab === "sent") {
    const apps = await db.application.findMany({ where: { dealerId: dealer.id }, include: { post: { include: { store: true } } }, orderBy: { createdAt: "desc" } });
    const label = (a: (typeof apps)[number]) =>
      a.status === "ACCEPTED" ? ["확정", "badge-ok"] : a.status === "REJECTED" ? ["다른 딜러 확정", "badge-mute"] : a.post.status !== "OPEN" ? ["마감", "badge-mute"] : ["대기 중", ""];
    return (
      <div className="shell">
        <div className="hdr"><h1>요청</h1><span className="k">{dealer.nickname}</span></div>
        <div className="seg mb-4"><Link href="/home" className="">받은 요청</Link><Link href="/home?tab=sent" className="on">보낸 견적</Link></div>
        <div className="grid gap-3">
          {apps.length === 0 && <Empty>아직 보낸 견적이 없어요.<br />받은 요청에서 희망 시급과 메시지를 보내 보세요.</Empty>}
          {apps.map((a) => { const [l, c] = label(a); return (
            <Link key={a.id} href={`/posts/${a.postId}`} className="card no-underline">
              <div className="flex justify-between items-center"><span className="k">{dayLabel(a.post.startsAt)} {fmtTime(a.post.startsAt)} · {a.post.store.region}</span><span className={`badge ${c}`}>{l}</span></div>
              <div className="text-[16px] font-bold mt-1">{a.post.store.name}</div>
              <div className="flex justify-between items-center mt-1.5">
                <span><span className="pay">{won(a.askedWage ?? a.post.hourlyWage)}</span><span className="k"> 내 견적 · 요청 {won(a.post.hourlyWage)}</span></span>
              </div>
              {a.message && <div className="k mt-1 truncate">“{a.message}”</div>}
            </Link>
          ); })}
        </div>
        <Tabs active="home" dealer />
      </div>
    );
  }

  const region = sp.region ?? "";
  const now = new Date();
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (n: number) => new Date(d0.getTime() + n * 864e5);
  const where = {
    status: "OPEN",
    startsAt: sp.when === "today" ? { gt: now, lt: day(1) } : sp.when === "tomorrow" ? { gt: day(1), lt: day(2) } : { gt: now },
    ...(region ? { store: { region } } : {}),
  };
  let posts = await db.jobPost.findMany({ where, include: { store: true, _count: { select: { applications: true } }, applications: { where: { dealerId: dealer.id }, select: { askedWage: true } } }, orderBy: { startsAt: "asc" } });
  if (sp.urgent) posts = posts.filter(isUrgent);
  posts.sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a)) || a.startsAt.getTime() - b.startsAt.getTime());
  const ratings = await storeRatings([...new Set(posts.map((p) => p.storeId))]);
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...sp, ...patch } as Record<string, string>);
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/home?${p}`;
  };
  const prefs = list(dealer.preferredRegions);

  return (
    <div className="shell">
      <div className="hdr"><h1>요청</h1><span className="k">{dealer.nickname}</span></div>
      <div className="seg mb-4"><Link href="/home" className="on">받은 요청</Link><Link href="/home?tab=sent">보낸 견적</Link></div>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: "none" }}>
        <Link href={q({ when: sp.when === "today" ? undefined : "today" })} className={`chip no-underline ${sp.when === "today" ? "chip-on" : ""}`}>오늘</Link>
        <Link href={q({ when: sp.when === "tomorrow" ? undefined : "tomorrow" })} className={`chip no-underline ${sp.when === "tomorrow" ? "chip-on" : ""}`}>내일</Link>
        <Link href={q({ urgent: sp.urgent ? undefined : "1" })} className={`chip no-underline ${sp.urgent ? "chip-on" : "chip-urgent"}`}>급구</Link>
        {[...new Set([...prefs, ...REGIONS])].map((r) => <Link key={r} href={q({ region: region === r ? undefined : r })} className={`chip no-underline ${region === r ? "chip-on" : ""}`}>{r}</Link>)}
      </div>
      <div className="grid gap-3">
        {posts.length ? posts.map((p) => <PostCard key={p.id} p={p} rating={ratings[p.storeId]} myQuote={p.applications[0]?.askedWage} />) : <Empty>조건에 맞는 요청이 없어요.<br />필터를 풀어보세요.</Empty>}
      </div>
      <Tabs active="home" dealer />
    </div>
  );
}
