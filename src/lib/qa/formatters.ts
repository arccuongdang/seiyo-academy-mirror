
/**
 * ============================================================================
 *  Seiyo Academy – Formatters (RAW → RENDER + shuffle + i18n fallback)
 *  Strategy: Option B (RAW JA/VI with fixed up to 5 options)
 * ----------------------------------------------------------------------------
 *  Public API:
 *   - toQARenderItemFromSnapshot(raw, lang)  → QARenderItem
 *   - toQARenderList(rawList, lang, opts)    → QARenderItem[]
 *   - shuffleOptions(options, seed?)         → QARenderOption[] (new array)
 *   - loadRawQuestionsForClient(courseId, subjectId) → QuestionSnapshotItem[]
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
 * SECTION 0. Firebase Storage (PUBLIC URL builder for images)
 * - Bucket host confirmed by user: seiyo-academy.firebasestorage.app
 * - Build URL like:
 *   https://seiyo-academy.firebasestorage.app/o/images%2FKTS2%2F2023%2F000676_question.jpg?alt=media
 * ========================================================================== */
const STORAGE_HOST = 'https://seiyo-academy.firebasestorage.app';
function buildPublicImageUrl(courseId: string, examYear: number, filename?: string | null): string | undefined {
  if (!filename) return undefined;
  const f = String(filename).trim();
  if (!f) return undefined;
  const y = Number(examYear) || 0;
  const rawPath = `images/${courseId}/${y}/${f}`;
  const encoded = encodeURIComponent(rawPath);
  return `${STORAGE_HOST}/o/${encoded}?alt=media`;
}

/* =============================================================================
 * SECTION 1. Utilities – language selection & small helpers
 * ========================================================================== */

export type UILang = 'JA' | 'VI';

function pickText(ja?: string, vi?: string, lang: UILang = 'JA'): string | undefined {
  const a = (ja ?? '').trim();
  const v = (vi ?? '').trim();
  if (lang === 'VI') {
    if (v) return v;
    if (a) return a;
  } else {
    if (a) return a;
    if (v) return v;
  }
  return undefined;
}

function pickExplanation(ja?: string, vi?: string, lang: UILang = 'JA'): string | undefined {
  return pickText(ja, vi, lang);
}

function hasOptionContent(text?: string, image?: string | null): boolean {
  if (text && text.trim() !== '') return true;
  if (image && String(image).trim() !== '') return true;
  return false;
}

function normalizeTags(tags?: string[] | string | null): string[] | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.filter(Boolean);
  return String(tags).split(',').map(s => s.trim()).filter(Boolean);
}

/** Accept TF answer flag either `answerIsOption` or `AnswerIsOption` (boolean/string) */
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
 * SECTION 2. Deterministic shuffle (seeded) – Fisher–Yates on xorshift32 PRNG
 * ========================================================================== */

function xorshift32(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 0x100000000) / 0x100000000;
  };
}

export function shuffleOptions(options: QARenderOption[], seed?: number | string): QARenderOption[] {
  const arr = options.slice();
  if (!seed && seed !== 0) return arr;
  const s = typeof seed === 'number' ? seed : Array.from(String(seed)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const rnd = xorshift32(s || 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* =============================================================================
 * SECTION 3. RAW → RENDER (single item)
 * ========================================================================== */

export function toQARenderItemFromSnapshot(raw: QuestionSnapshotItem, lang: UILang = 'JA'): QARenderItem {
  // Body text & images → map to PUBLIC URL
  const text = pickText(raw.questionTextJA, raw.questionTextVI, lang);
  const image = buildPublicImageUrl(raw.courseId, Number(raw.examYear), raw.questionImage);
  const explanation = pickExplanation(raw.explanationGeneralJA, raw.explanationGeneralVI, lang);

  const buildOption = (
    textJA?: string,
    textVI?: string,
    imageName?: string | null,
    isAnswer?: boolean,
    expJA?: string,
    expVI?: string
  ): QARenderOption | null => {
    const t = pickText(textJA, textVI, lang);
    const e = pickExplanation(expJA, expVI, lang);
    const img = buildPublicImageUrl(raw.courseId, Number(raw.examYear), imageName ?? undefined) ?? null;
    const ans = !!isAnswer;
    if (!hasOptionContent(t, img)) return null;
    return { isAnswer: ans, text: t, image: img, explanation: e };
  };

  const options: Array<QARenderOption | null> = [
    buildOption(raw.option1TextJA, raw.option1TextVI, raw.option1Image ?? null, raw.option1IsAnswer, raw.option1ExplanationJA, raw.option1ExplanationVI),
    buildOption(raw.option2TextJA, raw.option2TextVI, raw.option2Image ?? null, raw.option2IsAnswer, raw.option2ExplanationJA, raw.option2ExplanationVI),
    buildOption(raw.option3TextJA, raw.option3TextVI, raw.option3Image ?? null, raw.option3IsAnswer, raw.option3ExplanationJA, raw.option3ExplanationVI),
    buildOption(raw.option4TextJA, raw.option4TextVI, raw.option4Image ?? null, raw.option4IsAnswer, raw.option4ExplanationJA, raw.option4ExplanationVI),
    buildOption(raw.option5TextJA, raw.option5TextVI, raw.option5Image ?? null, raw.option5IsAnswer, raw.option5ExplanationJA, raw.option5ExplanationVI),
  ];
  const filteredOptions = options.filter(Boolean) as QARenderOption[];

  // TF fallback: when questionType === 'TF' and options are empty
  let finalOptions = filteredOptions;
  const qt = (raw as any).questionType?.toString().toUpperCase();
  if ((!finalOptions || finalOptions.length === 0) && qt === 'TF') {
    const ans = readTFAnswer(raw);
    const tTrueJA = '正しい'; const tFalseJA = '誤り';
    const tTrueVI = 'Đúng';    const tFalseVI = 'Sai';
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
    options: finalOptions,
    difficulty: (raw.difficulty ?? null) as Difficulty | null,
    sourceNote: (raw.sourceNote ?? null) as SourceCode | string | null,
    tags: normalizeTags(raw.tags),
  };
}

/* =============================================================================
 * SECTION 4. RAW → RENDER (list) + optional shuffle
 * ========================================================================== */

export interface RenderListOptions {
  shuffle?: boolean;
  seed?: number | string;
  filterRaw?: (q: QuestionSnapshotItem) => boolean;
  filterRender?: (q: QARenderItem) => boolean;
}

export function toQARenderList(rawList: QuestionSnapshotItem[], lang: UILang = 'JA', opts: RenderListOptions = {}): QARenderItem[] {
  const { shuffle: doShuffle = false, seed, filterRaw, filterRender } = opts;
  const filteredRaw = filterRaw ? rawList.filter(filterRaw) : rawList.slice();
  const rendered = filteredRaw.map((r) => toQARenderItemFromSnapshot(r, lang));
  const final = filterRender ? rendered.filter(filterRender) : rendered;
  if (!doShuffle) return final;
  return final.map((item) => ({ ...item, options: shuffleOptions(item.options, seed) }));
}

/* =============================================================================
 * SECTION 5. Client-safe fetchers for snapshots
 * ========================================================================== */
export async function safeFetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (_e) {
    return null;
  }
}

/**
 * Load latest snapshot for a given courseId + subjectId on the CLIENT.
 * Requires /snapshots/manifest.json structure like:
 * { files: [{ courseId, subjectId, path, version? }] }
 */
export async function loadRawQuestionsForClient(courseId: string, subjectId: string): Promise<QuestionSnapshotItem[]> {
  type ManifestItem = { courseId: string; subjectId: string; path: string; version?: number } & Record<string, any>;
  type Manifest = { files?: ManifestItem[] } & Record<string, any>;

  const manifest = await safeFetchJson<Manifest>('/snapshots/manifest.json');
  if (!manifest || !Array.isArray(manifest.files)) return [];

  const items = manifest.files.filter(f => f.courseId === courseId && f.subjectId === subjectId);
  if (!items.length) return [];

  const pickLatest = (arr: ManifestItem[]): ManifestItem => {
    const parseVer = (p: string, v?: number) => {
      if (typeof v === 'number') return v;
      const m = p.match(/\.v(\d+)\.json$/);
      return m ? Number(m[1]) : 0;
    };
    return arr.reduce((a, b) => (parseVer(b.path, b.version) > parseVer(a.path, a.version) ? b : a));
  };

  const latest = pickLatest(items);
  const path = latest.path?.startsWith('/') ? latest.path : `/snapshots/${latest.path}`;
  const data = await safeFetchJson<QuestionSnapshotItem[]>(path);
  return Array.isArray(data) ? data : [];
}
