import type { QARenderItem, QuestionSnapshotItem, QAOption } from "./schema";

export function pickJV(ja?: string, vi?: string): { ja?: string; vi?: string; display: string } {
  const display = (vi && String(vi).trim()) || (ja && String(ja).trim()) || "";
  return { ja, vi, display };
}

export function toQARenderItem(q: QuestionSnapshotItem): QARenderItem {
  const opts: QAOption[] = [];
  for (let i = 1; i <= 5; i++) {
    const textJA = (q as any)[`option${i}TextJA`];
    const textVI = (q as any)[`option${i}TextVI`];
    const image  = (q as any)[`option${i}Image`];
    const isAns  = Boolean((q as any)[`option${i}IsAnswer`]);
    const expJA  = (q as any)[`option${i}ExplanationJA`];
    const expVI  = (q as any)[`option${i}ExplanationVI`];
    if (!(textJA || textVI || image)) continue;
    opts.push({ key: i, textJA, textVI, image, isAnswer: isAns, explanationJA: expJA, explanationVI: expVI });
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
