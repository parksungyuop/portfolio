import { requireUser } from "@/lib/session";
import { Tabs } from "@/components/ui";

export default async function Community() {
  const u = await requireUser();
  return (
    <div className="shell">
      <div className="hdr"><h1>{u.dealer ? "딜러" : "가게"} 커뮤니티</h1></div>
      <div className="card text-center py-10">
        <div className="serif text-lg font-bold">2차 출시 예정</div>
        <div className="k mt-1">자유 · 후기 · 전략 · 공지 게시판. 대회 공고가 여기 상단에 노출돼요.</div>
      </div>
      <Tabs active="community" dealer={!!u.dealer} />
    </div>
  );
}
