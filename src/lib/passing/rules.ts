// src/lib/passing/rules.ts
import { Firestore, Timestamp, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

export type PassingRule = {
  passPercent?: number;     // % đạt (ví dụ 70)
  minCorrect?: number;      // số câu tối thiểu (ví dụ 18/25)
  timeLimitSec?: number;    // giới hạn thời gian (year-mode)
  showClock?: boolean;      // hiển/ẩn đồng hồ
  enabled?: boolean;        // bật/tắt rule
  version?: number;         // tăng dần mỗi lần publish
  effectiveFrom?: Timestamp | null;
  effectiveTo?: Timestamp | null;
  publishedAt?: Timestamp | null;
  note?: string | null;
};

export type ResolveContext = {
  mode: 'year' | 'subject'; // year-mode hay start-mode
  subjectId?: string | null;
  year?: number | null;
  at?: Date;                // thời điểm đánh giá (mặc định: now)
};

function inRange(now: Date, from?: Timestamp | null, to?: Timestamp | null) {
  const t = now.getTime();
  if (from && t < from.toDate().getTime()) return false;
  if (to && t > to.toDate().getTime()) return false;
  return true;
}

/**
 * Trả về rule đã resolve theo chuỗi ưu tiên:
 *   1) year+subject  2) year  3) subject  4) default
 * Đồng thời trả kèm metadata để log/snapshot vào attempt.
 */
export async function getPassingRule(db: Firestore, courseId: string, ctx: ResolveContext) {
  const now = ctx.at ?? new Date();
  const settingsRef = doc(db, 'courses', courseId, 'settings', 'passing');
  const baseSnap = await getDoc(settingsRef);
  const base = (baseSnap.exists() ? (baseSnap.data().default as PassingRule) : {}) || {};

  // overrides
  const ovCol = collection(db, 'courses', courseId, 'settings', 'passing', 'overrides');
  const ovSnap = await getDocs(
    query(ovCol, where('enabled', '==', true), orderBy('publishedAt', 'desc'), limit(50))
  );
  const overrides = ovSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => inRange(now, r.effectiveFrom ?? null, r.effectiveTo ?? null));

  // chọn theo ưu tiên
  const pick = (scope: 'year+subject'|'year'|'subject') => {
    return overrides.find((r) => {
      if (r.scope !== scope) return false;
      if (scope.includes('year') && (r.year ?? null) !== (ctx.year ?? null)) return false;
      if (scope.includes('subject') && (r.subjectId ?? null) !== (ctx.subjectId ?? null)) return false;
      return true;
    });
  };

  const chosen =
    (ctx.year && ctx.subjectId && pick('year+subject')) ||
    (ctx.year && pick('year')) ||
    (ctx.subjectId && pick('subject')) ||
    null;

  // merge override lên default
  const resolved: PassingRule = {
    ...base,
    ...(chosen ? {
      passPercent: chosen.passPercent ?? base.passPercent,
      minCorrect: chosen.minCorrect ?? base.minCorrect,
      timeLimitSec: chosen.timeLimitSec ?? base.timeLimitSec,
      showClock: chosen.showClock ?? base.showClock,
      enabled: chosen.enabled ?? base.enabled,
    } : {})
  };

  // đảm bảo enabled default
  if (typeof resolved.enabled === 'undefined') resolved.enabled = true;

  return {
    rule: resolved,
    source: chosen ? chosen.scope : 'default',
    overrideId: chosen?.id ?? null,
    version: chosen?.version ?? (baseSnap.exists() ? (baseSnap.data().default?.version ?? 1) : 1),
    publishedAt: chosen?.publishedAt ?? (baseSnap.exists() ? (baseSnap.data().default?.publishedAt ?? null) : null),
  };
}
