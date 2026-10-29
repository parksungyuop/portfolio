const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const won = (n: number) => "₩" + n.toLocaleString("ko-KR");

export function fmtDate(d: Date) {
  return `${d.getMonth() + 1}.${d.getDate()} (${DAYS[d.getDay()]})`;
}
export function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function fmtRange(a: Date, b: Date) {
  return `${fmtDate(a)} ${fmtTime(a)}–${fmtTime(b)}`;
}
export function hours(a: Date, b: Date) {
  return Math.round(((b.getTime() - a.getTime()) / 36e5) * 10) / 10;
}
export function dayLabel(d: Date) {
  const now = new Date();
  const diff = Math.floor((startOfDay(d) - startOfDay(now)) / 864e5);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  return fmtDate(d);
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
export function avg(nums: number[]) {
  return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;
}
export function scoreAvg(scoresJson: string[]) {
  const all = scoresJson.flatMap((s) => Object.values(JSON.parse(s) as Record<string, number>));
  return avg(all);
}
// <input type=date> 기본값용. toISOString()은 UTC라 KST 새벽엔 전날이 된다.
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const list = (csv: string) => csv.split(",").map((s) => s.trim()).filter(Boolean);
