import { requireStore } from "@/lib/session";
import { createPost } from "@/lib/actions";
import { db } from "@/lib/db";
import { AGE_BANDS, POST_FEE, PREF_FIELDS } from "@/lib/const";
import { Back } from "@/components/ui";
import { todayLocal, won } from "@/lib/format";

export default async function NewPost() {
  const { store } = await requireStore();
  const avg = await db.jobPost.aggregate({ _avg: { hourlyWage: true }, where: { store: { region: store.region } } });
  const regionAvg = Math.round((avg._avg.hourlyWage ?? 20000) / 500) * 500;
  const today = todayLocal();

  return (
    <div className="shell">
      <Back right={<span className="k">{store.subscribed ? "구독 중 · 무료" : `게재비 ${won(POST_FEE)} · 크레딧 ${won(store.credits)}`}</span>} />
      <h1 className="big" style={{ fontSize: 24 }}>어떤 딜러가<br />필요하세요?</h1>
      <form action={createPost} className="pb-8">
        <h2 className="text-[16px] mt-7 text-accent">① 일시 · 인원</h2>
        <label className="lbl">날짜</label><input type="date" name="date" defaultValue={today} min={today} required />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="lbl">시작</label><input type="time" name="start" defaultValue="20:00" required /></div>
          <div><label className="lbl">종료 (자정 넘김 가능)</label><input type="time" name="end" defaultValue="02:00" required /></div>
        </div>
        <label className="lbl">필요 인원</label><input type="number" name="headcount" defaultValue={1} min={1} max={40} />

        <h2 className="text-[16px] mt-8 text-accent">② 조건</h2>
        <label className="lbl">시급 <span className="k">· {store.region} 평균 {won(regionAvg)}</span></label>
        <input type="number" name="wage" defaultValue={regionAvg} step={500} min={10000} required className="mono" />
        <label className="lbl">경력</label>
        <div className="seg"><label><input type="radio" name="minYears" value="0" defaultChecked />무관</label><label><input type="radio" name="minYears" value="1" />1년+</label><label><input type="radio" name="minYears" value="3" />3년+</label></div>
        {PREF_FIELDS && (
          <>
            <label className="lbl">성별 (선호)</label>
            <div className="seg"><label><input type="radio" name="genderPref" value="ANY" defaultChecked />무관</label><label><input type="radio" name="genderPref" value="F" />여성</label><label><input type="radio" name="genderPref" value="M" />남성</label></div>
            <label className="lbl">나이대 (선호 · 복수 선택)</label>
            <div className="flex flex-wrap gap-1.5">{AGE_BANDS.map((a) => <label key={a} className="chip relative"><input type="checkbox" name="agePref" value={a} />{a}</label>)}</div>
          </>
        )}

        <h2 className="text-[16px] mt-8 text-accent">③ 추가사항</h2>
        <label className="lbl">딜러가 알아야 할 것</label>
        <textarea name="notes" rows={3} placeholder="야식 제공, 택시비 별도, 검정 셔츠 …" />

        <h2 className="text-[16px] mt-8 text-accent">④ 확인</h2>
        <div className="card kv mt-2">
          <span>게재비</span><span>{store.subscribed ? "구독 · 무료" : won(POST_FEE) + " (크레딧 차감, 미매칭 시 반환)"}</span>
          <span>견적</span><span>딜러들이 희망 시급과 메시지로 견적을 보내면 비교해서 확정해요</span>
          <span>급구</span><span>24시간 이내 시작이면 자동으로 급구 표시 + 선호 지역 딜러 알림</span>
        </div>
        <button className={`btn btn-full mt-4 ${store.subscribed ? "btn-pri" : "btn-wine"}`}>{store.subscribed ? "딜러 요청하기" : `${won(POST_FEE)} 차감하고 요청하기`}</button>
      </form>
    </div>
  );
}
