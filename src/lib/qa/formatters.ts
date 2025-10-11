// src/lib/qa/formatters.ts
import type { QARenderItem, QuestionSnapshotItem, QAOption } from "./schema";

/** Chọn JA/VI với display ưu tiên VI nếu có, fallback JA */
export function pickJV(ja?: string, vi?: string): { ja?: string; vi?: string; display: string } {
  const display = (vi && String(vi).trim()) || (ja && String(ja).trim()) || "";
  return { ja, vi, display };
}

/** Tạo 1 QARenderItem từ 1 dòng snapshot, ĐÃ gán option.id ổn định và lọc option rỗng */
export function toQARenderItem(q: QuestionSnapshotItem): QARenderItem {
  const opts: QAOption[] = [];
  for (let i = 1; i <= 5; i++) {
    const textJA = (q as any)[`option${i}TextJA`];
    const textVI = (q as any)[`option${i}TextVI`];
    const image  = (q as any)[`option${i}Image`];
    const isAns  = Boolean((q as any)[`option${i}IsAnswer`]);
    const expJA  = (q as any)[`option${i}ExplanationJA`];
    const expVI  = (q as any)[`option${i}ExplanationVI`];

    // Bỏ option trống hoàn toàn
    if (!(textJA || textVI || image)) continue;

    // GÁN id ổn định để giữ mapping khi shuffle (vẫn giữ key cho UI nếu đang dùng)
    const id = `${q.questionId}__opt${i}`;

    opts.push({
      key: i,
      id,                   // <- id ổn định
      textJA,
      textVI,
      image,
      isAnswer: isAns,
      explanationJA: expJA,
      explanationVI: expVI,
    });
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
  };
}

/** Validator cho 1 câu: 0 đúng → error; 1 đúng → OK; 2 đúng → warn (cho qua); >2 đúng → error */
function validateOne(item: QARenderItem) {
  const correctCount = (item.options || []).filter(o => !!o.isAnswer).length;
  if (correctCount === 0) throw new Error(`[QA:ERROR] ${item.id}: no correct answer`);
  if (correctCount === 1) return; // OK
  if (correctCount === 2) {
    // Cho phép (multi-correct <1%), chỉ cảnh báo một lần
    // eslint-disable-next-line no-console
    console.warn(`[QA:WARN] ${item.id}: two correct answers (allowed)`);
    return;
  }
  throw new Error(`[QA:ERROR] ${item.id}: more than 2 correct answers (${correctCount})`);
}

/** Chuẩn hóa & validate cả danh sách snapshot → render items */
export function toQARenderItems(rows: QuestionSnapshotItem[]): QARenderItem[] {
  const items = rows.map(toQARenderItem);
  for (const it of items) validateOne(it);
  return items;
}

/** Fisher–Yates shuffle với seed (nếu cần) — GIỮ nguyên id để chấm điểm an toàn */
export function shuffleOptions<T extends QAOption>(arr: T[], seed?: number): T[] {
  let a = [...arr];
  let rnd = seedRandom(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seedRandom(seed?: number) {
  if (typeof seed !== "number") return Math.random;
  let x = seed || 123456789;
  return () => {
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}
