import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/session";
import { dealerSummary } from "@/lib/queries";
import { Back, NoShowBadge, Stars, tier } from "@/components/ui";
import { STORE_REVIEW_ITEMS } from "@/lib/const";
import { fmtDate, list } from "@/lib/format";

export default async function DealerPage({ params }: { params: Promise<{ id: string }> }) {
  const { store } = await requireStore();
  const { id } = await params;
  const d = await db.dealerProfile.findUnique({ where: { id }, include: { user: true } });
  if (!d) notFound();
  const s = await dealerSummary(d.id);
  const [ours, room, disputes] = await Promise.all([
    db.match.findMany({ where: { storeId: store.id, dealerId: d.id, status: "COMPLETED" } }),
    db.chatRoom.findUnique({ where: { dealerId_storeId: { dealerId: d.id, storeId: store.id } } }),
    db.noShowCase.findMany({ where: { match: { dealerId: d.id }, outcome: { in: ["DISPUTED", "AUTO_CONFIRMED"] } }, include: { match: { include: { store: true } } } }),
  ]);
  const rehired = new Set(s.reviews.filter((r) => (JSON.parse(r.scores).rehire ?? 0) >= 4).map((r) => r.match.storeId)).size;

  return (
    <div className="shell">
      <Back right={<Link href={`/report?target=${d.userId}&back=/dealers/${d.id}`} className="k">신고</Link>} />
      <div className="flex items-center gap-3">
        <span className="avatar" style={{ width: 52, height: 52, fontSize: 20 }}>{d.nickname[0]}</span>
        <div>
          <div className="big" style={{ fontSize: 20 }}>{d.nickname} <span className={`badge ${tier(d.workCount, s.rating) === "프로" ? "badge-gold" : "badge-mute"}`}>{tier(d.workCount, s.rating)}</span></div>
          <div className="k">{d.age}세 · {d.gender === "F" ? "여" : "남"} · {d.neighborhood} · 선호: {list(d.preferredRegions).join("·")}</div>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap mt-3"><span className="chip">경력 {d.years}년</span>{list(d.games).map((g) => <span key={g} className="chip">{g}</span>)}{d.cert && <span className="chip">{d.cert}</span>}</div>

      <div className="card mt-4">
        <div className="flex justify-between items-center"><b>가게 후기</b>{s.reviews.length ? <Stars v={s.rating} count={s.reviews.length} /> : <span className="k">평가 준비 중</span>}</div>
        <div className="kv mt-2">
          <span>근무</span><span>{d.workCount}회</span>
          <span>노쇼</span><span><NoShowBadge noShow={d.noShowCount} disputed={s.disputed} /></span>
          <span>늦은 취소</span><span>{d.lateCancels}회</span>
          <span>재고용</span><span>{rehired ? `가게 ${rehired}곳이 다시 부를 의사가 있어요` : "—"}</span>
          {ours.length > 0 && <><span>우리 가게</span><span>근무 {ours.length}회 · 최근 {fmtDate(ours[ours.length - 1].startsAt)}</span></>}
        </div>
      </div>

      {disputes.length > 0 && (
        <div className="card mt-2">
          <b>미출근 신고 기록</b><div className="k mb-2">플랫폼은 판정하지 않아요. 양쪽 진술을 보고 판단하세요.</div>
          {disputes.map((c) => (
            <div key={c.id} className="kv py-2 border-t border-line">
              <span>{fmtDate(c.match.startsAt)}</span><span>{c.match.store.name} 신고 · {c.outcome === "AUTO_CONFIRMED" ? <span style={{ color: "var(--bad)" }}>소명 없음 → 노쇼 확정</span> : <span style={{ color: "var(--warn)" }}>딜러 소명</span>}</span>
              {c.defenseText && <><span>소명</span><span className="text-muted">&ldquo;{c.defenseText}&rdquo;</span></>}
            </div>
          ))}
        </div>
      )}

      <div className="card mt-2">
        <div className="k mb-1">최근 후기 · 가게만 볼 수 있어요</div>
        {s.reviews.length === 0 && <div className="k">아직 후기가 없어요.</div>}
        {s.reviews.slice(0, 5).map((r) => {
          const sc = JSON.parse(r.scores) as Record<string, number>;
          return (
            <div key={r.id} className="py-2 border-t border-line">
              <div className="flex justify-between"><b>{r.match.store.name}</b><span className="k">{fmtDate(r.createdAt)}</span></div>
              <div className="k">{STORE_REVIEW_ITEMS.map(([k, l]) => `${l} ${sc[k] ?? "-"}`).join(" · ")}</div>
              {r.tags && <div className="flex gap-1 mt-1 flex-wrap">{list(r.tags).map((t) => <span key={t} className="chip" style={{ fontSize: 11 }}>{t}</span>)}</div>}
            </div>
          );
        })}
      </div>
      {d.videoUrl && <a href={d.videoUrl} target="_blank" className="card mt-2 no-underline"><div className="k">딜링 영상</div><div>{d.videoUrl} ↗</div></a>}

      <div className="flex gap-2 mt-5">
        {room && <Link href={`/chat/${room.id}`} className="btn btn-ghost flex-1">채팅</Link>}
        {ours.length > 0 ? <Link href={`/rehire/${d.id}`} className="btn btn-pri flex-1">다시 부르기</Link> : <span className="k self-center flex-1 text-center">근무 이력이 생기면 원탭으로 다시 부를 수 있어요</span>}
      </div>
    </div>
  );
}
