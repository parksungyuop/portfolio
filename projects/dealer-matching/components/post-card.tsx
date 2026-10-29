import Link from "next/link";
import { Stars, timeAgo } from "./ui";
import { dayLabel, fmtTime, hours, list, won } from "@/lib/format";
import { URGENT_WITHIN_HOURS } from "@/lib/const";

type Post = {
  id: string; startsAt: Date; endsAt: Date; hourlyWage: number; headcount: number; minYears: number;
  genderPref: string; agePref: string; notes: string; status: string; createdAt: Date;
  store: { name: string; region: string; address: string };
  _count?: { applications: number };
};

export const isUrgent = (p: { startsAt: Date }) => p.startsAt.getTime() - Date.now() < URGENT_WITHIN_HOURS * 36e5;

export function condText(p: { minYears: number; genderPref: string; agePref: string }) {
  return [
    p.minYears ? `경력 ${p.minYears}년+` : "경력 무관",
    p.genderPref === "F" ? "여성 선호" : p.genderPref === "M" ? "남성 선호" : null,
    ...list(p.agePref),
  ].filter(Boolean).join(" · ");
}

// 숨고 "받은 요청" 카드. 딜러에게는 견적 보내기, 가게에게는 받은 견적 수.
export function PostCard({ p, rating, mine, myQuote }: { p: Post; rating?: { v: number; n: number } | null; mine?: boolean; myQuote?: number | null }) {
  const urgent = isUrgent(p) && p.status === "OPEN";
  const n = p._count?.applications ?? 0;
  const statusLabel = { CONFIRMED: "확정", COMPLETED: "완료", CANCELLED: "취소", EXPIRED: "마감" }[p.status];
  return (
    <Link href={`/posts/${p.id}`} className={`card no-underline ${urgent ? "card-hi" : ""}`}>
      <div className="flex justify-between items-center">
        <span className="k">딜러매칭 · {p.store.region} · {timeAgo(p.createdAt)}</span>
        {urgent ? <span className="badge badge-bad">급구</span> : statusLabel && <span className="badge badge-mute">{statusLabel}</span>}
      </div>
      <div className="text-[17px] font-bold mt-1.5" style={{ letterSpacing: "-0.02em" }}>{p.store.name}</div>
      <div className="text-[14px] mt-0.5">{dayLabel(p.startsAt)} {fmtTime(p.startsAt)}–{fmtTime(p.endsAt)} <span className="k">({hours(p.startsAt, p.endsAt)}h)</span></div>
      <div className="k mt-0.5">{condText(p)}{p.headcount > 1 && ` · ${p.headcount}명`}{p.notes && ` · ${p.notes}`}</div>
      {rating !== undefined && <div className="mt-1.5">{rating ? <Stars v={rating.v} count={rating.n} /> : <span className="k">평가 준비 중</span>}</div>}
      <hr className="divider" />
      <div className="flex justify-between items-center">
        <span><span className="pay text-[17px]">{won(p.hourlyWage)}</span><span className="k"> /시간 · 견적 {n}개</span></span>
        {mine
          ? <span className="btn btn-soft btn-sm">{n ? `견적 ${n}개 보기` : "대기 중"}</span>
          : myQuote ? <span className="badge">내 견적 {won(myQuote)}</span>
          : p.status === "OPEN" && <span className="btn btn-pri btn-sm">견적 보내기</span>}
      </div>
    </Link>
  );
}
