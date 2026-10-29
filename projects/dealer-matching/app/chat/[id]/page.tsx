import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { respondOffer, sendMessage, sendOffer } from "@/lib/actions";
import { Avatar, Back } from "@/components/ui";
import { LATE_CANCEL_HOURS } from "@/lib/const";
import { fmtRange, fmtTime, hours, todayLocal, won } from "@/lib/format";

export default async function ChatRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ offer?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const { offer: showOffer } = await searchParams;
  const room = await db.chatRoom.findUnique({ where: { id }, include: { dealer: { include: { user: true } }, store: { include: { user: true } }, messages: { include: { offer: true }, orderBy: { createdAt: "asc" } } } });
  if (!room) notFound();
  const mine = u.dealer?.id === room.dealerId || u.store?.id === room.storeId;
  if (!mine) notFound();
  const other = u.dealer ? room.store.name : room.dealer.nickname;
  const otherHref = u.store ? `/dealers/${room.dealerId}` : undefined;
  const today = todayLocal();

  return (
    <div className="shell flex flex-col" style={{ paddingBottom: 0, minHeight: "100dvh" }}>
      <Back href="/chat" right={otherHref ? <Link href={otherHref} className="k">프로필</Link> : <span className="k">{room.store.address.split(" · ")[0]}</span>} />
      <div className="flex items-center gap-2 mb-3"><Avatar name={other} square={!!u.dealer} /><b>{other}</b></div>

      <div className="flex flex-col gap-2 flex-1">
        {room.messages.length === 0 && <div className="k text-center py-6">첫 메시지를 보내거나 근무 제안을 보내 보세요.</div>}
        {room.messages.map((m) => {
          const me = m.senderId === u.id;
          if (m.offer) {
            const o = m.offer;
            const h = hours(o.startsAt, o.endsAt);
            return (
              <div key={m.id} className={`offer ${me ? "offer-me" : ""}`}>
                <div className="serif font-bold text-accent mb-1">근무 제안 {o.status !== "PENDING" && <span className={`badge ${o.status === "ACCEPTED" ? "badge-ok" : "badge-mute"}`}>{o.status === "ACCEPTED" ? "확정" : "거절"}</span>}</div>
                <div className="kv">
                  <span>일시</span><span>{fmtRange(o.startsAt, o.endsAt)}</span>
                  <span>시급</span><span className="pay">{won(o.hourlyWage)}</span>
                  <span>예상</span><span>{won(Math.round(o.hourlyWage * h))} · {h}h</span>
                  {o.memo && <><span>메모</span><span>{o.memo}</span></>}
                </div>
                {o.status === "PENDING" && !me && (
                  <div className="flex gap-2 mt-3">
                    <form action={respondOffer} className="flex-1"><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="decision" value="decline" /><button className="btn btn-ghost btn-sm btn-full">거절</button></form>
                    <form action={respondOffer} className="flex-1"><input type="hidden" name="offerId" value={o.id} /><input type="hidden" name="decision" value="accept" /><button className="btn btn-pri btn-sm btn-full">수락 · 확정</button></form>
                  </div>
                )}
                {o.status === "PENDING" && me && <div className="k mt-2">상대가 수락하면 확정돼요.</div>}
                {o.status === "PENDING" && !me && <div className="k mt-2 text-center">수락하면 바로 확정돼요. 확정 후 근무 {LATE_CANCEL_HOURS}시간 이내 취소는 페널티가 있어요.</div>}
              </div>
            );
          }
          return <div key={m.id} className={`bub ${me ? "bub-me" : "bub-them"}`} title={fmtTime(m.createdAt)}>{m.body}</div>;
        })}
      </div>

      {showOffer ? (
        <form action={sendOffer} className="card mt-4 mb-4" style={{ borderColor: "var(--accent)" }}>
          <div className="flex justify-between"><b>근무 제안 보내기</b><Link href={`/chat/${room.id}`} className="k">닫기</Link></div>
          <input type="hidden" name="roomId" value={room.id} />
          <label className="lbl">날짜</label><input type="date" name="date" defaultValue={today} min={today} required />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">시작</label><input type="time" name="start" defaultValue="20:00" required /></div>
            <div><label className="lbl">종료</label><input type="time" name="end" defaultValue="02:00" required /></div>
          </div>
          <label className="lbl">시급</label><input type="number" name="wage" defaultValue={20000} step={500} required className="mono" />
          <label className="lbl">메모</label><input type="text" name="memo" placeholder="야식 제공, 택시비 별도" />
          <button className="btn btn-pri btn-full mt-4">제안 보내기</button>
        </form>
      ) : (
        <div className="sticky bottom-0 py-3 flex gap-2 items-center" style={{ background: "var(--bg)" }}>
          <Link href={`/chat/${room.id}?offer=1`} className="btn btn-ghost btn-sm" title="근무 제안">＋ 제안</Link>
          <form action={sendMessage} className="flex-1 flex gap-2">
            <input type="hidden" name="roomId" value={room.id} />
            <input type="text" name="body" placeholder="메시지" autoComplete="off" className="flex-1" />
            <button className="btn btn-wine btn-sm">전송</button>
          </form>
        </div>
      )}
    </div>
  );
}
