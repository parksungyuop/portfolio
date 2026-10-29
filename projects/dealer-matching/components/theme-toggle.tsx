import { cookies } from "next/headers";
import { setTheme } from "@/lib/actions";

// 기본은 밝은 화면(숨고 스타일). 쿠키 dark 일 때만 어둡게.
export async function currentTheme() {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}

export async function ThemeToggle() {
  const theme = await currentTheme();
  const next = theme === "light" ? "dark" : "light";
  return (
    <form action={setTheme}>
      <input type="hidden" name="theme" value={next} />
      <button className="chip" type="submit" aria-label={`${next === "light" ? "밝은" : "어두운"} 화면으로`}>{next === "light" ? "☀ 밝게" : "☾ 어둡게"}</button>
    </form>
  );
}
