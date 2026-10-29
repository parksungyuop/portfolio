import { requireUser } from "@/lib/session";
import { submitReport } from "@/lib/actions";
import { Back } from "@/components/ui";

export default async function Report({ searchParams }: { searchParams: Promise<{ target: string; back?: string }> }) {
  const u = await requireUser();
  const { target, back } = await searchParams;
  const types = u.dealer
    ? [["UNPAID", "시급 미지급"], ["ABUSE", "부당 대우 · 폭언"], ["ETC", "기타"]]
    : [["GHOST", "잠수 · 연락 두절"], ["ABUSE", "태도 · 손님과의 마찰"], ["ETC", "기타"]];
  return (
    <div className="shell">
      <Back href={back ?? "/home"} />
      <div className="big" style={{ fontSize: 22 }}>신고</div>
      <div className="k mt-1">채팅 기록이 자동으로 첨부돼요. 관리자가 인정한 신고만 누적 횟수에 반영됩니다. 기각이 3회 쌓이면 신고 기능이 30일 잠겨요.</div>
      <form action={submitReport} className="mt-4">
        <input type="hidden" name="targetUserId" value={target} /><input type="hidden" name="back" value={back ?? "/home"} />
        <label className="lbl">유형</label>
        <select name="type">{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label className="lbl">내용</label><textarea name="detail" rows={4} required placeholder="언제, 무슨 일이 있었는지" />
        <button className="btn btn-wine btn-full mt-4">신고 접수</button>
      </form>
    </div>
  );
}
