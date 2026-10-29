import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { loginAs, signup } from "@/lib/actions";
import { AGE_MIN, GAMES, REGIONS } from "@/lib/const";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Landing({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (await currentUser()) redirect("/home");
  const { role } = await searchParams;
  const users = await db.user.findMany({ include: { dealer: true, store: true }, orderBy: { role: "asc" } });

  return (
    <div className="shell">
      <div className="pt-14 pb-8">
        <div className="flex justify-between items-center"><div className="text-[18px] font-extrabold" style={{ color: "var(--accent)", letterSpacing: "-0.03em" }}>딜러매칭</div><ThemeToggle /></div>
        <h1 className="big" style={{ fontSize: 30 }}>딜러 없는 밤이 없게,<br />일 없는 딜러가 없게.</h1>
        <p className="text-muted mt-3">홀덤펍 딜러매칭 매칭. 가게는 오늘 밤 확실히 올 사람을, 딜러는 조건 맞는 가게를.</p>
      </div>

      {!role ? (
        <>
          <h2 className="text-[17px] font-bold mb-2">어떻게 이용하시나요?</h2>
          <div className="grid gap-2">
            <Link href="/?role=DEALER" className="card flex items-center gap-3 no-underline"><span className="avatar">D</span><div><b>딜러예요</b><div className="k">가게를 찾고 지원해요</div></div></Link>
            <Link href="/?role=STORE" className="card flex items-center gap-3 no-underline"><span className="avatar avatar-sq">S</span><div><b>가게예요</b><div className="k">딜러를 구해요 · 대회 딜러 모집도 여기서</div></div></Link>
          </div>
          <div className="k mt-2">역할은 나중에 추가할 수 있어요.</div>

          <h2 className="text-[17px] font-bold mt-10 mb-2">데모 계정으로 둘러보기</h2>
          <div className="k mb-2">카카오·네이버 로그인과 휴대폰 본인인증은 실서비스에서 연결됩니다.</div>
          <div className="grid gap-1.5">
            {users.map((u) => (
              <form key={u.id} action={loginAs}>
                <input type="hidden" name="uid" value={u.id} />
                <button className="card w-full text-left flex items-center gap-3 cursor-pointer">
                  <span className={`avatar ${u.store ? "avatar-sq" : ""}`}>{(u.store?.name ?? u.name)[0]}</span>
                  <div className="flex-1"><b>{u.store?.name ?? u.dealer?.nickname}</b><div className="k">{u.store ? `가게 · ${u.store.region}${u.store.subscribed ? " · 구독 중" : ""}` : `딜러 · 경력 ${u.dealer?.years}년 · 근무 ${u.dealer?.workCount}회`}</div></div>
                  <span className="k">로그인 ›</span>
                </button>
              </form>
            ))}
          </div>
        </>
      ) : (
        <form action={signup} className="pb-10">
          <div className="flex items-center justify-between"><h2 className="text-[17px] font-bold">{role === "DEALER" ? "딜러 프로필" : "가게 정보"}</h2><Link href="/" className="k">역할 다시 선택</Link></div>
          <input type="hidden" name="role" value={role} />
          <label className="lbl">휴대폰 번호 (본인인증 대체)</label><input type="tel" name="phone" placeholder="01012345678" required />
          {role === "DEALER" ? (
            <>
              <label className="lbl">생년월일 · 만 {AGE_MIN}세 이상</label><input type="date" name="birthDate" required />
              <label className="lbl">닉네임</label><input type="text" name="name" required maxLength={12} />
              <label className="lbl">성별</label>
              <div className="seg"><label><input type="radio" name="gender" value="F" defaultChecked />여성</label><label><input type="radio" name="gender" value="M" />남성</label></div>
              <label className="lbl">사는 동네</label><input type="text" name="neighborhood" placeholder="마포" required />
              <label className="lbl">선호 지역</label>
              <div className="flex flex-wrap gap-1.5">{REGIONS.map((r) => <label key={r} className="chip relative"><input type="checkbox" name="regions" value={r} />{r}</label>)}</div>
              <label className="lbl">경력 (년)</label><input type="number" name="years" min={0} defaultValue={0} />
              <label className="lbl">가능 게임</label>
              <div className="flex flex-wrap gap-1.5">{GAMES.map((g) => <label key={g} className="chip relative"><input type="checkbox" name="games" value={g} defaultChecked={g === "NLH"} />{g}</label>)}</div>
            </>
          ) : (
            <>
              <label className="lbl">대표자 이름</label><input type="text" name="name" required />
              <label className="lbl">가게명</label><input type="text" name="storeName" required />
              <label className="lbl">지역</label><select name="region">{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
              <label className="lbl">위치 (동 · 역 출구)</label><input type="text" name="address" placeholder="역삼동 · 강남역 3번 출구 4분" required />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="lbl">테이블 수</label><input type="number" name="tables" defaultValue={4} min={1} /></div>
                <div><label className="lbl">블라인드</label><input type="text" name="blinds" defaultValue="2/5" /></div>
              </div>
              <label className="lbl">영업시간</label><input type="text" name="hours" defaultValue="19:00–03:00" />
              <label className="lbl">게임</label>
              <div className="flex flex-wrap gap-1.5">{GAMES.map((g) => <label key={g} className="chip relative"><input type="checkbox" name="games" value={g} defaultChecked={g === "NLH"} />{g}</label>)}</div>
            </>
          )}
          <div className="k mt-5">가입하면 이용약관·개인정보 처리방침에 동의한 것으로 봅니다.</div>
          <button className="btn btn-pri btn-full mt-3">시작하기</button>
        </form>
      )}
    </div>
  );
}
