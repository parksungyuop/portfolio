import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Avatar, Empty, Tabs } from "@/components/ui";
import { fmtTime } from "@/lib/format";

export default async function ChatList() {
  const u = await requireUser();
  const rooms = await db.chatRoom.findMany({
    where: u.dealer ? { dealerId: u.dealer.id } : { storeId: u.store!.id },
    include: { dealer: true, store: true, messages: { orderBy: { createdAt: "desc" }, take: 1 }, offers: { where: { status: "PENDING" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div className="shell">
      <div className="hdr"><h1>채팅</h1></div>
      <div className="grid gap-1.5">
        {rooms.length === 0 && <Empty>{u.dealer ? "공고에 지원하면 가게와의 채팅방이 열려요." : "딜러가 지원하면 채팅방이 열려요."}</Empty>}
        {rooms.map((r) => {
          const other = u.dealer ? r.store.name : r.dealer.nickname;
          const last = r.messages[0];
          return (
            <Link key={r.id} href={`/chat/${r.id}`} className="card flex items-center gap-3 no-underline">
              <Avatar name={other} square={!!u.dealer} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between"><b>{other}</b>{last && <span className="k">{fmtTime(last.createdAt)}</span>}</div>
                <div className="k truncate">{r.offers.length ? <span style={{ color: "var(--accent)" }}>근무 제안 대기 중</span> : last?.body ?? "대화를 시작해 보세요"}</div>
              </div>
            </Link>
          );
        })}
      </div>
      <Tabs active="chat" dealer={!!u.dealer} />
    </div>
  );
}
