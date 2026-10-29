import Link from "next/link";

export function Stars({ v, count }: { v: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="stars">★</span>
      <span className="mono text-[13px] font-700" style={{ fontWeight: 700 }}>{v.toFixed(1)}</span>
      {count !== undefined && <span className="k">({count})</span>}
    </span>
  );
}

const icons = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v11H8l-4 4z" /></svg>,
  community: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 18c0-2 2-3.5 4-3.5s3 1.5 3 3.5" /></svg>,
  my: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>,
};

export function Tabs({ active, dealer }: { active: "home" | "chat" | "community" | "my"; dealer?: boolean }) {
  const t = [["home", dealer ? "요청" : "홈", "/home"], ["chat", "채팅", "/chat"], ["community", "커뮤니티", "/community"], ["my", "MY", "/my"]] as const;
  return (
    <nav className="tabs"><div>
      {t.map(([k, l, href]) => <Link key={k} href={href} className={k === active ? "on" : ""}>{icons[k]}{l}</Link>)}
    </div></nav>
  );
}

export function Back({ href = "/home", right }: { href?: string; right?: React.ReactNode }) {
  return (
    <div className="hdr">
      <Link href={href} className="no-underline text-[15px] font-semibold" aria-label="뒤로">‹ 뒤로</Link>
      <div>{right}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card text-center k py-10">{children}</div>;
}

export function Avatar({ name, square }: { name: string; square?: boolean }) {
  return <span className={`avatar ${square ? "avatar-sq" : ""}`}>{name.trim()[0]}</span>;
}

export function NoShowBadge({ noShow, disputed }: { noShow: number; disputed: number }) {
  if (noShow > 0) return <span className="badge badge-bad">노쇼 {noShow}회</span>;
  if (disputed > 0) return <span className="badge badge-warn">미출근 신고 {disputed}건 · 소명 있음</span>;
  return <span className="badge badge-ok">노쇼 0회</span>;
}

export function tier(workCount: number, rating: number) {
  if (workCount >= 30 && rating >= 4.7) return "프로";
  if (workCount >= 10 && rating >= 4.3) return "우수";
  if (workCount >= 3) return "일반";
  return "신입";
}

export function timeAgo(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60e3);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
