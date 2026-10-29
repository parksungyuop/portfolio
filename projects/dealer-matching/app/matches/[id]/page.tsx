import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { cancelMatch, completeMatch, defendNoShow, reportNoShow, settleNoShows, submitReview } from "@/lib/actions";
import { Back } from "@/components/ui";
import { DEALER_REVIEW_ITEMS, DEALER_REVIEW_TAGS, LATE_CANCEL_HOURS, NO_SHOW_REPORT_AFTER_MIN, STORE_REVIEW_ITEMS, STORE_REVIEW_TAGS } from "@/lib/const";
import { fmtDate, fmtRange, fmtTime, hours, won } from "@/lib/format";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  await settleNoShows();
  const { id } = await params;
  const m = await db.match.findUnique({ where: { id }, include: { dealer: true, store: true, reviews: true, noShowCase: true } });
  if (!m) notFound();
  const asDealer = u.dealer?.id === m.dealerId;
  const asStore = u.store?.id === m.storeId;
  if (!asDealer && !asStore) notFound();
  const now = new Date();
  const h = hours(m.startsAt, m.endsAt);
  const total = Math.round(m.hourlyWage * h);
  const myRole = asDealer ? "DEALER" : "STORE";
  const myReview = m.reviews.find((r) => r.authorRole === myRole);
  const items = asDealer ? DEALER_REVIEW_ITEMS : STORE_REVIEW_ITEMS;
  const tags = asDealer ? DEALER_REVIEW_TAGS : STORE_REVIEW_TAGS;
  const late = m.startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 36e5;
  const canReportNoShow = asStore && m.status === "CONFIRMED" && !m.noShowCase && now.getTime() >= m.startsAt.getTime() + NO_SHOW_REPORT_AFTER_MIN * 60e3;
  const room = await db.chatRoom.findUnique({ where: { dealerId_storeId: { dealerId: m.dealerId, storeId: m.storeId } } });
  const status = { CONFIRMED: ["확정", ""], COMPLETED: ["완료", "badge-ok"], CANCELLED: ["취소", "badge-mute"], NO_SHOW: ["노쇼", "badge-bad"] }[m.status]!;

  return (
    <div className="shell">
      <Back href="/my" right={room && <Link href={`/chat/${room.id}`} className="k">채팅</Link>} />
      <div className="flex justify-between items-start">
        <div><div className="k">{asDealer ? "근무" : "딜러"}</div><div className="big" style={{ fontSize: 22 }}>{asDealer ? m.store.name : m.dealer.nickname}</div></div>
        <span className={`badge ${status[1]}`}>{status[0]}</span>
      </div>

      <div className="card kv mt-4">
        <span>일시</span><span>{fmtRange(m.startsAt, m.endsAt)} ({h}h)</span>
        <span>시급</span><span className="pay">{won(m.hourlyWage)}</span>
        <span>{m.status === "COMPLETED" ? "정산액" : "예상"}</span><span className="pay">{won(total)}</span>
        {m.status === "COMPLETED" && <><span>안내</span><span className="text-muted">사업소득 3.3% 원천징수 시 실수령 {won(Math.round(total * 0.967))}. 송금은 당사자 간 진행.</span></>}
        {asDealer && <><span>위치</span><span>{m.store.address}</span></>}
        {m.cancelledBy && <><span>취소</span><span>{m.cancelledBy === "DEALER" ? "딜러" : "가게"}가 취소</span></>}
      </div>

      {m.noShowCase && (
        <div className="card mt-2" style={{ borderColor: m.noShowCase.outcome === "AUTO_CONFIRMED" ? "var(--bad)" : "var(--warn)" }}>
          <b>미출근 신고</b> <span className="k">{fmtDate(m.noShowCase.reportedAt)} {fmtTime(m.noShowCase.reportedAt)}</span>
          {m.noShowCase.outcome === "PENDING" && <div className="k mt-1">소명 기한 {fmtDate(m.noShowCase.deadline)} {fmtTime(m.noShowCase.deadline)}. 기한 안에 소명이 없으면 노쇼로 확정돼요.</div>}
          {m.noShowCase.outcome === "AUTO_CONFIRMED" && <div className="k mt-1" style={{ color: "var(--bad)" }}>소명 없음 → 노쇼 확정</div>}
          {m.noShowCase.defenseText && <div className="mt-2"><div className="k">딜러 소명</div><div>&ldquo;{m.noShowCase.defenseText}&rdquo;</div><div className="k mt-1">플랫폼은 판정하지 않아요. 양쪽 진술이 가게 화면에 함께 표시됩니다.</div></div>}
          {asDealer && m.noShowCase.outcome === "PENDING" && (
            <form action={defendNoShow} className="mt-3"><input type="hidden" name="caseId" value={m.noShowCase.id} /><textarea name="text" rows={3} placeholder="무슨 일이 있었는지 적어 주세요. 가게에 그대로 보여요." required /><button className="btn btn-pri btn-full mt-2">소명 제출</button></form>
          )}
        </div>
      )}

      {/* 상태 액션 */}
      {m.status === "CONFIRMED" && !m.noShowCase && (
        <div className="grid gap-2 mt-4">
          {asStore && m.endsAt <= now && <form action={completeMatch}><input type="hidden" name="matchId" value={m.id} /><button className="btn btn-pri btn-full">근무 완료 처리 · 정산서 만들기</button></form>}
          {asStore && m.endsAt > now && <div className="k text-center">근무가 끝나면 여기서 완료 처리해요.</div>}
          {canReportNoShow && <form action={reportNoShow}><input type="hidden" name="matchId" value={m.id} /><button className="btn btn-ghost btn-full" style={{ color: "var(--bad)" }}>미출근 신고</button></form>}
          {m.startsAt > now && <form action={cancelMatch}><input type="hidden" name="matchId" value={m.id} /><button className="btn btn-ghost btn-full">확정 취소{late && ` · 근무 ${LATE_CANCEL_HOURS}시간 이내라 페널티`}</button></form>}
        </div>
      )}

      {/* 평가 */}
      {m.status === "COMPLETED" && (myReview ? (
        <div className="card mt-4"><b>평가 완료</b><div className="k">{asDealer ? "다른 딜러들에게만 보여요." : "다른 가게 사장들에게만 보여요."}</div></div>
      ) : (
        <form action={submitReview} className="card mt-4" style={{ borderColor: "var(--accent)" }}>
          <input type="hidden" name="matchId" value={m.id} />
          <div className="big" style={{ fontSize: 18 }}>{asDealer ? "이 가게, 어땠나요?" : "이 딜러, 어땠나요?"}</div>
          <div className="k mt-1">{asDealer ? "이 평가는 다른 딜러만 볼 수 있어요. 가게에는 보이지 않아요." : "이 후기는 다른 가게 사장만 볼 수 있어요."}</div>
          {items.map(([k, l]) => (
            <div key={k} className="flex justify-between items-center mt-3"><span>{l}</span>
              <div className="rate">{[5, 4, 3, 2, 1].map((n) => <Fragment key={n}><input type="radio" id={`${k}${n}`} name={`s_${k}`} value={n} defaultChecked={n === 5} /><label htmlFor={`${k}${n}`}>★</label></Fragment>)}</div>
            </div>
          ))}
          <label className="lbl">해당하는 것 (선택)</label>
          <div className="flex flex-wrap gap-1.5">{tags.map((t) => <label key={t} className="chip relative"><input type="checkbox" name="tags" value={t} />{t}</label>)}</div>
          <button className="btn btn-pri btn-full mt-4">평가 남기기</button>
        </form>
      ))}
    </div>
  );
}
