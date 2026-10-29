import { db } from "./db";
import { REVIEW_MIN_COUNT } from "./const";
import { scoreAvg } from "./format";

// 딜러만 보는 가게 별점. 3건 미만이면 null (계획서 4장).
export async function storeRatings(storeIds: string[]) {
  const rows = await db.review.findMany({ where: { authorRole: "DEALER", storeId: { in: storeIds } }, select: { storeId: true, scores: true } });
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.storeId!, [...(by.get(r.storeId!) ?? []), r.scores]);
  const out: Record<string, { v: number; n: number } | null> = {};
  for (const id of storeIds) {
    const s = by.get(id) ?? [];
    out[id] = s.length >= REVIEW_MIN_COUNT ? { v: scoreAvg(s), n: s.length } : null;
  }
  return out;
}

// 가게만 보는 딜러 후기 요약.
export async function dealerSummary(dealerId: string) {
  const [reviews, disputed] = await Promise.all([
    db.review.findMany({ where: { authorRole: "STORE", dealerId }, include: { match: { include: { store: true } } }, orderBy: { createdAt: "desc" } }),
    db.noShowCase.count({ where: { outcome: "DISPUTED", match: { dealerId } } }),
  ]);
  const rating = reviews.length ? scoreAvg(reviews.map((r) => r.scores)) : 0;
  return { reviews, rating, disputed };
}
