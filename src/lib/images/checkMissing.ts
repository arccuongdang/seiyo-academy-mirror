// src/lib/images/checkMissing.ts
/**
 * Utility: build expected image filenames per question and compare with a picked local folder.
 *
 * FINAL NAMING CONVENTION (confirmed 2025-10-24):
 *   images/{courseId}/{examYear}/{questionId}_question.jpg
 *   images/{courseId}/{examYear}/{questionId}_opt1.jpg .. _opt5.jpg
 *   images/{courseId}/{examYear}/{questionId}_explanation.jpg  (optional)
 */
export type MinimalQuestionRow = {
  questionId: string;
  courseId: string;
  examYear: number | string;
  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string;
  option1Image?: string; option2Image?: string; option3Image?: string; option4Image?: string; option5Image?: string;
  explanationImage?: string;
};
export type ExpectedSlot = {
  key: 'question' | 'opt1' | 'opt2' | 'opt3' | 'opt4' | 'opt5' | 'explanation';
  filename: string;
  fullPath: string;
  required: boolean;
};
export type ExpectedEntry = {
  questionId: string;
  courseId: string;
  examYear: number;
  slots: ExpectedSlot[];
};
export function toYear4(v: number | string | undefined | null): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
export function containsZuno(textJA?: string, textVI?: string): boolean {
  const s = `${textJA ?? ''} ${textVI ?? ''}`;
  return /図の|図に/.test(s);
}
export function buildKey(courseId: string, examYear: number, filename: string): string {
  const c = (courseId || 'KTS2').trim();
  const y = String(examYear);
  return `images/${c}/${y}/${filename}`;
}
export function expectedForQuestion(row: MinimalQuestionRow): ExpectedEntry {
  const qid = String(row.questionId || '').trim();
  const courseId = String(row.courseId || 'KTS2').trim();
  const year = toYear4(row.examYear);
  const needStrongQuestion = containsZuno(row.questionTextJA, row.questionTextVI);
  const slots: ExpectedSlot[] = [];
  const add = (key: ExpectedSlot['key'], explicit?: string | null, fallbackName?: string, required = false) => {
    const filename = (explicit && explicit.trim() !== '') ? explicit.trim() : (fallbackName || '');
    if (!filename) return;
    slots.push({
      key,
      filename,
      fullPath: buildKey(courseId, year, filename),
      required,
    });
  };
  add('question', row.questionImage ?? null, `${qid}_question.jpg`, needStrongQuestion);
  add('opt1', row.option1Image ?? null, `${qid}_opt1.jpg`);
  add('opt2', row.option2Image ?? null, `${qid}_opt2.jpg`);
  add('opt3', row.option3Image ?? null, `${qid}_opt3.jpg`);
  add('opt4', row.option4Image ?? null, `${qid}_opt4.jpg`);
  add('opt5', row.option5Image ?? null, `${qid}_opt5.jpg`);
  add('explanation', row.explanationImage ?? null, `${qid}_explanation.jpg`);
  return { questionId: qid, courseId, examYear: year, slots };
}
export function buildExpectedSet(rows: MinimalQuestionRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const entry = expectedForQuestion(r);
    for (const slot of entry.slots) {
      if (slot.filename) set.add(slot.fullPath);
    }
  }
  return set;
}
export function diffExpectedActual(expected: Set<string>, actualRelativePaths: string[], courseId?: string): {
  missing: string[];
  unused: string[];
} {
  const actualSet = new Set(actualRelativePaths.map(p => p.replace(/^[/.]+/, '')));
  const missing: string[] = [];
  expected.forEach(k => { if (!actualSet.has(k)) missing.push(k); });
  missing.sort();
  const imagesPrefix = `images/${(courseId || '').trim()}`;
  const unused = actualRelativePaths
    .map(p => p.replace(/^[/.]+/, ''))
    .filter(k => imagesPrefix ? (k.startsWith(imagesPrefix + '/') || k === imagesPrefix) : k.startsWith('images/'))
    .filter(k => !expected.has(k))
    .sort();
  return { missing, unused };
}
export function makeCsvBlob(missing: string[], unused: string[]): Blob {
  const lines = ['type,path', ...missing.map(m => `missing,${m}`), ...unused.map(u => `unused,${u}`)];
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}
