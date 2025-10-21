// src/lib/images/checkMissing.ts
/**
 * Utility: build expected image filenames per question and compare with a picked local folder.
 *
 * Naming convention:
 *   images/{courseId}/{subjectId}/{examYear}/{questionId}_question.jpg
 *   images/{courseId}/{subjectId}/{examYear}/{questionId}_opt1.jpg .. _opt5.jpg
 *   images/{courseId}/{subjectId}/{examYear}/{questionId}_explanation.jpg (optional)
 *
 * Notes:
 * - This library is UI-agnostic (no DOM APIs), so it can be used by any tab (Admin Images).
 * - Detection of "図の/図に" to prioritize question images.
 */

export type MinimalQuestionRow = {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number | string;
  // optional text fields (for図の/図に detection)
  questionTextJA?: string;
  questionTextVI?: string;
  // optional explicit filenames if Excel provided them
  questionImage?: string;
  option1Image?: string; option2Image?: string; option3Image?: string; option4Image?: string; option5Image?: string;
  explanationImage?: string;
};

export type ExpectedSlot = {
  key: 'question' | 'opt1' | 'opt2' | 'opt3' | 'opt4' | 'opt5' | 'explanation';
  filename: string;        // e.g., "000123_opt1.jpg"
  fullPath: string;        // e.g., "images/KTS2/TK/2024/000123_opt1.jpg"
  required: boolean;       // true if must-have (e.g., question image when containsZuno(...))
};

export type ExpectedEntry = {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number;
  slots: ExpectedSlot[];
};

/** Sanitize year into integer (default 0 if invalid) */
export function toYear4(v: number | string | undefined | null): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Detects presence of "図の" or "図に" in Japanese/Vietnamese texts */
export function containsZuno(textJA?: string, textVI?: string): boolean {
  const s = `${textJA ?? ''} ${textVI ?? ''}`;
  return /図の|図に/.test(s);
}

/** Build filename with folder convention */
export function buildKey(courseId: string, subjectId: string, examYear: number, filename: string): string {
  const c = (courseId || 'KTS2').trim();
  const s = (subjectId || 'GEN').trim();
  const y = String(examYear);
  return `images/${c}/${s}/${y}/${filename}`;
}

/**
 * Build the list of expected image keys for a given question row.
 * If explicit filenames exist in Excel, use them; otherwise, use default pattern with {questionId}_*.
 * If containsZuno(...), mark question slot as required.
 */
export function expectedForQuestion(row: MinimalQuestionRow): ExpectedEntry {
  const qid = String(row.questionId || '').trim();
  const courseId = String(row.courseId || 'KTS2').trim();
  const subjectId = String(row.subjectId || 'GEN').trim();
  const year = toYear4(row.examYear);
  const needStrongQuestion = containsZuno(row.questionTextJA, row.questionTextVI);

  const slots: ExpectedSlot[] = [];

  const add = (key: ExpectedSlot['key'], explicit?: string | null, fallbackName?: string, required = false) => {
    const filename = (explicit && explicit.trim() !== '') ? explicit.trim() : (fallbackName || '');
    if (!filename) return;
    slots.push({
      key,
      filename,
      fullPath: buildKey(courseId, subjectId, year, filename),
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

  return { questionId: qid, courseId, subjectId, examYear: year, slots };
}

/**
 * Build a flat set of expected keys for multiple questions.
 * - If a slot is marked required, it should definitely appear in "missing" if absent.
 * - If not required, it's still included by default. You can post-filter non-required if needed.
 */
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

/**
 * Compare expected set vs actual picked file list (web File API with webkitRelativePath).
 * Returns:
 *  - missing: sorted list that are in expected but not in actual
 *  - unused:  sorted list that are in actual under the images/ prefix but not in expected
 */
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
    .filter(k => imagesPrefix ? k.startsWith(imagesPrefix + '/') : k.startsWith('images/'))
    .filter(k => !expected.has(k))
    .sort();

  return { missing, unused };
}

/** Export CSV content (UTF-8) for results */
export function makeCsvBlob(missing: string[], unused: string[]): Blob {
  const lines = ['type,path', ...missing.map(m => `missing,${m}`), ...unused.map(u => `unused,${u}`)];
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}
