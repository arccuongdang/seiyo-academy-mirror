/**
 * ============================================================================
 *  Seiyo Academy – Formatters (RAW → RENDER + shuffle + i18n fallback)
 *  Strategy: Option B (RAW JA/VI with fixed 5 options)
 * ----------------------------------------------------------------------------
 *  Public API:
 *   - toQARenderItemFromSnapshot(raw, lang)  → QARenderItem
 *   - toQARenderList(rawList, lang, opts)    → QARenderItem[]
 *   - shuffleOptions(options, seed?)         → QARenderOption[] (new array)
 * ============================================================================
 */

import type {
  QuestionSnapshotItem,
  QARenderItem,
  QARenderOption,
  Difficulty,
  SourceCode,
} from './schema';

/* =============================================================================
 * SECTION 1. Utilities – language selection & small helpers
 * ========================================================================== */

export type UILang = 'JA' | 'VI';

function pickText(ja?: string, vi?: string, lang: UILang = 'JA'): string | undefined {
  const a = (ja ?? '').trim();
  const v = (vi ?? '').trim();
  if (lang === 'VI') {
    if (v) return v;
    if (a) return a; // fallback JA
  } else {
    if (a) return a;
    if (v) return v; // fallback VI
  }
  return undefined;
}

function pickExplanation(ja?: string, vi?: string, lang: UILang = 'JA'): string | undefined {
  // cùng logic fallback như text
  return pickText(ja, vi, lang);
}

/** Kiểm tra option có "nội dung" để hiển thị (text hoặc image) */
function hasOptionContent(text?: string, image?: string | null): boolean {
  if (text && text.trim() !== '') return true;
  if (image && String(image).trim() !== '') return true;
  return false;
}

/** Chuẩn hoá tag có thể là string CSV hoặc array */
function normalizeTags(tags?: string[] | string | null): string[] | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.filter(Boolean);
  // CSV
  return String(tags)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** (NEW) đọc cờ TF từ RAW, chấp nhận 'answerIsOption' hoặc 'AnswerIsOption' */
function readTFAnswer(raw: any): boolean | undefined {
  const v = raw?.answerIsOption ?? raw?.AnswerIsOption;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return undefined;
}

/* =============================================================================
 * SECTION 2. Deterministic shuffle (seeded)
 *  - Xáo trộn mà vẫn reproducible theo seed
 *  - Fisher–Yates dựa trên PRNG xorshift32
 * ========================================================================== */

function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 1; // tránh 0
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // chuyển về [0, 1)
    return ((x >>> 0) % 0x100000000) / 0x100000000;
  };
}

/**
 * Shuffle QARenderOption[] theo seed (không mutate input).
 * - Mỗi option đã "tự mang" isAnswer + explanation → chỉ cần đổi thứ tự
 */
export function shuffleOptions(options: QARenderOption[], seed?: number | string): QARenderOption[] {
  const arr = options.slice();
  if (!seed && seed !== 0) return arr;

  const s =
    typeof seed === 'number'
      ? seed
      : Array.from(String(seed)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const rnd = xorshift32(s || 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* =============================================================================
 * SECTION 3. RAW → RENDER (single item)
 *  - Đọc QuestionSnapshotItem (Option B, 5 phương án) và sinh QARenderItem cho UI
 *  - Chọn ngôn ngữ theo lang, có fallback qua pickText/pickExplanation
 *  - Filter các option rỗng (không text + không image)
 * ========================================================================== */

export function toQARenderItemFromSnapshot(
  raw: QuestionSnapshotItem,
  lang: UILang = 'JA'
): QARenderItem {
  // Text & image (thân đề)
  const text = pickText(raw.questionTextJA, raw.questionTextVI, lang);
  const image = raw.questionImage ?? null;

  // Explanation chung (fallback)
  const explanation = pickExplanation(raw.explanationGeneralJA, raw.explanationGeneralVI, lang);

  // Build 5 options (1..5)
  const buildOption = (
    textJA?: string,
    textVI?: string,
    image?: string | null,
    isAnswer?: boolean,
    expJA?: string,
    expVI?: string
  ): QARenderOption | null => {
    const t = pickText(textJA, textVI, lang);
    const e = pickExplanation(expJA, expVI, lang);
    const img = image ?? null;
    const ans = !!isAnswer;

    if (!hasOptionContent(t, img)) {
      // option rỗng → bỏ qua
      return null;
    }
    return {
      isAnswer: ans,
      text: t,
      image: img,
      explanation: e,
    };
  };

  const options: Array<QARenderOption | null> = [
    buildOption(
      raw.option1TextJA,
      raw.option1TextVI,
      raw.option1Image ?? null,
      raw.option1IsAnswer,
      raw.option1ExplanationJA,
      raw.option1ExplanationVI
    ),
    buildOption(
      raw.option2TextJA,
      raw.option2TextVI,
      raw.option2Image ?? null,
      raw.option2IsAnswer,
      raw.option2ExplanationJA,
      raw.option2ExplanationVI
    ),
    buildOption(
      raw.option3TextJA,
      raw.option3TextVI,
      raw.option3Image ?? null,
      raw.option3IsAnswer,
      raw.option3ExplanationJA,
      raw.option3ExplanationVI
    ),
    buildOption(
      raw.option4TextJA,
      raw.option4TextVI,
      raw.option4Image ?? null,
      raw.option4IsAnswer,
      raw.option4ExplanationJA,
      raw.option4ExplanationVI
    ),
    buildOption(
      raw.option5TextJA,
      raw.option5TextVI,
      raw.option5Image ?? null,
      raw.option5IsAnswer,
      raw.option5ExplanationJA,
      raw.option5ExplanationVI
    ),
  ];

  const filteredOptions = options.filter(Boolean) as QARenderOption[];

  // (NEW) TF fallback: nếu không có option 1..5 mà là TF → tự sinh 2 option
  let finalOptions = filteredOptions;
  const qt = (raw as any).questionType?.toString().toUpperCase();
  if ((!finalOptions || finalOptions.length === 0) && qt === 'TF') {
    const ans = readTFAnswer(raw); // true = "Đúng", false = "Sai"
    // Bạn có thể thay text bằng "True" / "False" hoặc JA "正しい" / "誤り"
    const tTrueJA = '正しい';
    const tFalseJA = '誤り';
    const tTrueVI = 'Đúng';
    const tFalseVI = 'Sai';

    const trueText  = pickText(tTrueJA,  tTrueVI,  lang) || tTrueJA;
    const falseText = pickText(tFalseJA, tFalseVI, lang) || tFalseJA;

    finalOptions = [
      { isAnswer: ans === true,  text: trueText,  image: null, explanation: undefined },
      { isAnswer: ans === false, text: falseText, image: null, explanation: undefined },
    ];
  }


  return {
    id: raw.questionId,
    courseId: raw.courseId,
    subjectId: raw.subjectId,
    examYear: Number(raw.examYear) || 0,

    text,
    image,
    explanation,

    options: finalOptions, // ← dùng finalOptions thay vì filteredOptions

    difficulty: (raw.difficulty ?? null) as Difficulty | null,
    sourceNote: (raw.sourceNote ?? null) as SourceCode | string | null,
    tags: normalizeTags(raw.tags),
  };

}

/* =============================================================================
 * SECTION 4. RAW → RENDER (list) + optional shuffle
 *  - Cho phép filter trước khi format, hoặc sau khi format (tuỳ nhu cầu)
 *  - Có thể seed để ổn định thứ tự shuffle giữa các lần render
 * ========================================================================== */

export interface RenderListOptions {
  shuffle?: boolean;
  seed?: number | string;
  /** Filter RAW trước khi format (ví dụ by examYear, subjectId…) */
  filterRaw?: (q: QuestionSnapshotItem) => boolean;
  /** Filter RENDER sau khi format (ví dụ bỏ câu ít phương án…) */
  filterRender?: (q: QARenderItem) => boolean;
}

export function toQARenderList(
  rawList: QuestionSnapshotItem[],
  lang: UILang = 'JA',
  opts: RenderListOptions = {}
): QARenderItem[] {
  const {
    shuffle: doShuffle = false,
    seed,
    filterRaw,
    filterRender,
  } = opts;

  const filteredRaw = filterRaw ? rawList.filter(filterRaw) : rawList.slice();

  const rendered = filteredRaw.map((r) => toQARenderItemFromSnapshot(r, lang));

  const final = filterRender ? rendered.filter(filterRender) : rendered;

  if (!doShuffle) return final;

  // Shuffle từng item (options), giữ thứ tự câu
  return final.map((item) => ({
    ...item,
    options: shuffleOptions(item.options, seed),
  }));
}

/* =============================================================================
 * SECTION 5. Convenience helpers (optional)
 *  - Ví dụ: filter theo năm, môn, độ khó… để tái sử dụng ở nhiều trang
 * ========================================================================== */

export function byExamYear(years: number[] | number) {
  const set = new Set(Array.isArray(years) ? years : [years]);
  return (q: QuestionSnapshotItem) => set.has(Number(q.examYear) || 0);
}

export function bySubject(subjectId: string) {
  const id = subjectId.trim();
  return (q: QuestionSnapshotItem) => q.subjectId === id;
}

export function byDifficulty(ds: Array<Difficulty | null> | Difficulty) {
  const set = new Set(Array.isArray(ds) ? ds : [ds]);
  return (q: QuestionSnapshotItem) => set.has((q.difficulty ?? null) as Difficulty | null);
}
