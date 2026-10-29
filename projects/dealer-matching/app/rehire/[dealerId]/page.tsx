import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/session";
import { rehire } from "@/lib/actions";
import { Avatar, Back } from "@/components/ui";
import { fmtDate, todayLocal, won } from "@/lib/format";

export default async function Rehire({ params }: { params: Promise<{ dealerId: string }> }) {
  const { store } = await requireStore();
  const { dealerId } = await params;
  const d = await db.dealerProfile.findUnique({ where: { id: dealerId } });
  const last = await db.match.findFirst({ where: { storeId: store.id, dealerId, status: "COMPLETED" }, orderBy: { startsAt: "desc" } });
  if (!d || !last) notFound();
  const today = todayLocal();
  const t = (x: Date) => `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="shell">
      <Back href="/my" />
      <div className="flex items-center gap-3"><Avatar name={d.nickname} /><div><div className="big" style={{ fontSize: 20 }}>{d.nickname} 다시 부르기</div><div className="k">최근 {fmtDate(last.startsAt)} · {won(last.hourlyWage)}</div></div></div>
      <form action={rehire} className="mt-4">
        <input type="hidden" name="dealerId" value={d.id} />
        <label className="lbl">날짜</label><input type="date" name="date" defaultValue={today} min={today} required />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="lbl">시작</label><input type="time" name="start" defaultValue={t(last.startsAt)} required /></div>
          <div><label className="lbl">종료</label><input type="time" name="end" defaultValue={t(last.endsAt)} required /></div>
        </div>
        <label className="lbl">시급</label><input type="number" name="wage" defaultValue={last.hourlyWage} step={500} required className="mono" />
        <label className="lbl">메모</label><input type="text" name="memo" placeholder="지난번처럼 부탁드려요" />
        <div className="k mt-4">{store.subscribed ? "구독 중이라 무료예요. " : ""}딜러가 수락하면 바로 확정되고, 정산서와 근무 이력이 자동으로 남아요.</div>
        <button className="btn btn-pri btn-full mt-3">제안 보내기</button>
      </form>
    </div>
  );
}
