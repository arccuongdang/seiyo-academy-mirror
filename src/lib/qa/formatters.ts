// src/lib/qa/formatters.ts
// -------------------------------------------------------------------
// Nhiệm vụ:
// 1) Map 1 hàng snapshot (QuestionSnapshotItem) -> QARenderItem cho UI.
// 2) Xáo trộn đáp án (hỗ trợ seed).
//
// Cập nhật/fix:
// - Thêm trường id cho mỗi QAOption (bắt buộc theo schema):
//     id = `${q.questionId}__opt${i}`
// - Pass-through 2 field mới: officialPosition, cognitiveLevel
// - Không dùng alias "@/..." để tránh lỗi đường dẫn trên Vercel.
// -------------------------------------------------------------------

import type { QARenderItem, QuestionSnapshotItem, QAOption } from "./schema";

/** Ưu tiên hiển thị VI, fallback JA */
export function pickJV(
  ja?: string,
  vi?: string
): { ja?: string; vi?: string; display: string } {
  const display =
    (vi && String(vi).trim()) || (ja && String(ja).trim()) || "";
  return { ja, vi, display };
}

/**
 * Map 1 snapshot -> QARenderItem
 * - Duyệt 5 option (1..5)
 * - BỔ SUNG id cho option theo quy ước `${questionId}__opt${i}`
 * - Pass-through officialPosition & cognitiveLevel
 */
export function toQARenderItem(q: QuestionSnapshotItem): QARenderItem {
  const opts: QAOption[] = [];

  for (let i = 1; i <= 5; i++) {
    const textJA = (q as any)[`option${i}TextJA`];
    const textVI = (q as any)[`option${i}TextVI`];
    const image  = (q as any)[`option${i}Image`];
    const isAns  = Boolean((q as any)[`option${i}IsAnswer`]);
    const expJA  = (q as any)[`option${i}ExplanationJA`];
    const expVI  = (q as any)[`option${i}ExplanationVI`];

    // Bỏ option rỗng hoàn toàn
    if (!(textJA || textVI || image)) continue;

    // ✅ BẮT BUỘC id cho QAOption
    const id = `${q.questionId}__opt${i}`;

    opts.push({
      id,            // <-- fix TypeScript: QAOption yêu cầu id:string
      key: i,        // key:number (1..5)
      textJA,
      textVI,
      image,
      isAnswer: isAns,
      explanationJA: expJA,
      explanationVI: expVI,
    } as QAOption);
  }

  return {
    id: q.questionId,
    courseId: q.courseId,
    subjectId: q.subjectId,
    examYear: q.examYear,

    difficulty: q.difficulty,
    sourceNote: q.sourceNote,
    tags: q.tags,

    questionTextJA: q.questionTextJA,
    questionTextVI: q.questionTextVI,
    questionImage: q.questionImage,

    options: opts,

    explanationGeneralJA: q.explanationGeneralJA,
    explanationGeneralVI: q.explanationGeneralVI,
    explanationImage: q.explanationImage,

    // Pass-through 2 field mới
    officialPosition: (q as any).officialPosition ?? null,
    cognitiveLevel: (q as any).cognitiveLevel ?? null,
  };
}

/** Xáo trộn Fisher–Yates, hỗ trợ seed tái lập */
export function shuffleOptions<T extends QAOption>(arr: T[], seed?: number): T[] {
  const a = [...arr];
  const rnd = seedRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** PRNG đơn giản dựa trên xorshift; fallback Math.random khi không có seed */
function seedRandom(seed?: number) {
  if (typeof seed !== "number") return Math.random;
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}
