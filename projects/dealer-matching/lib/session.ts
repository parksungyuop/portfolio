import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

// ponytail: 쿠키에 userId만 넣는 데모 로그인. 카카오/네이버 OAuth + 본인인증은 이 함수 하나만 교체하면 된다.
export async function currentUser() {
  const uid = (await cookies()).get("uid")?.value;
  if (!uid) return null;
  return db.user.findUnique({ where: { id: uid }, include: { dealer: true, store: true } });
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/");
  return u;
}

export async function requireDealer() {
  const u = await requireUser();
  if (!u.dealer) redirect("/home");
  return { user: u, dealer: u.dealer };
}

export async function requireStore() {
  const u = await requireUser();
  if (!u.store) redirect("/home");
  return { user: u, store: u.store };
}
