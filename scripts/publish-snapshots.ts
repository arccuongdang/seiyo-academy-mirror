/**
 * =============================================================================
 *  Seiyo Academy – Publisher Script (Excel → RAW snapshots)
 *  Strategy: Option B (RAW JA/VI, fixed 5 options)
 * -----------------------------------------------------------------------------
 *  Usage:
 *    npx tsx scripts/publish-snapshots.ts --input data-source/SeiyoQuestions.xlsx --out public/snapshots
 *
 *  Flags:
 *    --input <path>        (mặc định: data-source/SeiyoQuestions.xlsx)
 *    --out <dir>           (mặc định: public/snapshots)
 *    --allow-errors        (không exit non-zero nếu vẫn còn errors; loại bỏ câu lỗi rồi xuất)
 *    --fresh               (ghi manifest mới hoàn toàn)
 * =============================================================================
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

import { buildSubjectsMeta } from '../src/lib/qa/normalize';
import { validateQuestions } from '../src/lib/qa/guards';
import type {
  SubjectsJSON,
  SnapshotManifest,
  SnapshotManifestEntry,
  QuestionForValidate,
  QuestionSnapshotItem,
} from '../src/lib/qa/schema';

/* =============================================================================
 * SECTION A. CLI args & constants
 * ========================================================================== */

type CLI = {
  input: string;
  outDir: string;
  allowErrors: boolean;
  fresh: boolean;
};

function parseArgs(argv: string[]): CLI {
  const get = (key: string, fallback?: string) => {
    const i = argv.indexOf(`--${key}`);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    return fallback;
  };
  const has = (key: string) => argv.includes(`--${key}`);

  return {
    input: get('input', 'data-source/SeiyoQuestions.xlsx')!,
    outDir: get('out', 'public/snapshots')!,
    allowErrors: has('allow-errors'),
    fresh: has('fresh'),
  };
}

const cli = parseArgs(process.argv.slice(2));

/* =============================================================================
 * SECTION B. Helper: type & coercion
 * ========================================================================== */

type QuestionRow = {
  id?: string;
  questionId?: string;
  courseId?: string;
  subjectId?: string;
  examYear?: number | string;
  difficulty?: string;
  sourceNote?: string;
  tags?: string | string[];

  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string;

  option1TextJA?: string; option1TextVI?: string; option1Image?: string; option1IsAnswer?: boolean | string | number; option1ExplanationJA?: string; option1ExplanationVI?: string;
  option2TextJA?: string; option2TextVI?: string; option2Image?: string; option2IsAnswer?: boolean | string | number; option2ExplanationJA?: string; option2ExplanationVI?: string;
  option3TextJA?: string; option3TextVI?: string; option3Image?: string; option3IsAnswer?: boolean | string | number; option3ExplanationJA?: string; option3ExplanationVI?: string;
  option4TextJA?: string; option4TextVI?: string; option4Image?: string; option4IsAnswer?: boolean | string | number; option4ExplanationJA?: string; option4ExplanationVI?: string;
  option5TextJA?: string; option5TextVI?: string; option5Image?: string; option5IsAnswer?: boolean | string | number; option5ExplanationJA?: string; option5ExplanationVI?: string;

  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string;

  officialPosition?: string;
  cognitiveLevel?: string;

  status?: string;
  version?: number | string;
  AnswerIsOption?: number | string;
};

type SubjectRow = Record<string, unknown>;

function toBool(v: any): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'y') return true;
    if (s === 'false' || s === '0' || s === 'n') return false;
  }
  return undefined;
}

function toInt(v: any): number | undefined {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toYear4(v: any): number {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function hasAnyContent(q: Partial<QuestionRow>): boolean {
  const keysToCheck = [
    'questionId','courseId','subjectId','examYear','difficulty',
    'questionTextJA','questionTextVI','questionImage',
    'option1TextJA','option1TextVI','option1Image','option1IsAnswer',
    'option2TextJA','option2TextVI','option2Image','option2IsAnswer',
    'option3TextJA','option3TextVI','option3Image','option3IsAnswer',
    'option4TextJA','option4TextVI','option4Image','option4IsAnswer',
    'option5TextJA','option5TextVI','option5Image','option5IsAnswer',
    'explanationGeneralJA','explanationGeneralVI','explanationImage',
    'status','version','AnswerIsOption','tags','sourceNote'
  ];
  return keysToCheck.some((k) => {
    const v = (q as any)[k];
    if (typeof v === 'number') return true;
    if (typeof v === 'boolean') return true;
    if (typeof v === 'string') return v.trim() !== '';
    return false;
  });
}

function filterReadyRows(rows: QuestionRow[]): QuestionRow[] {
  return rows.filter((r) => {
    if (!hasAnyContent(r)) return false;
    const st = String(r.status ?? '').trim().toUpperCase();
    return st === 'READY';
  });
}

function applyAnswerFromIndex(q: QuestionRow & Record<string, any>) {
  const idx = toInt(q.AnswerIsOption);
  if (!idx || idx < 1 || idx > 5) return;
  const flags = [
    toBool(q.option1IsAnswer),
    toBool(q.option2IsAnswer),
    toBool(q.option3IsAnswer),
    toBool(q.option4IsAnswer),
    toBool(q.option5IsAnswer),
  ];
  const allUndef = flags.every((f) => typeof f === 'undefined');
  if (allUndef) {
    for (let i = 1; i <= 5; i++) q[`option${i}IsAnswer`] = i === idx;
  }
}

function normalizeQuestionRow(r: QuestionRow): QuestionRow {
  const q: any = { ...r };

  q.examYear = toYear4(q.examYear);
  if (q.difficulty) q.difficulty = String(q.difficulty).toUpperCase();

  for (let i = 1; i <= 5; i++) {
    const k = `option${i}IsAnswer`;
    const b = toBool(q[k]);
    if (typeof b !== 'undefined') q[k] = b;
  }

  applyAnswerFromIndex(q);

  if (typeof q.version !== 'undefined') {
    const v = toInt(q.version);
    if (typeof v !== 'undefined') q.version = v;
  }

  return q;
}

function groupByCourseSubject(rows: QuestionRow[]) {
  const map = new Map<string, Map<string, QuestionRow[]>>();
  for (const q of rows) {
    const cid = String(q.courseId ?? 'KTS2');
    const sid = String(q.subjectId ?? 'GEN');
    if (!map.has(cid)) map.set(cid, new Map());
    const bySubject = map.get(cid)!;
    if (!bySubject.has(sid)) bySubject.set(sid, []);
    bySubject.get(sid)!.push(q);
  }
  return map;
}

/* =============================================================================
 * SECTION C. Excel IO
 * ========================================================================== */

async function readExcel(filePath: string) {
  const buf = await fs.readFile(filePath);
  const wb = XLSX.read(buf);

  const subjectsSheet = wb.Sheets['Subjects'];
  const subjectsRows: SubjectRow[] = subjectsSheet
    ? (XLSX.utils.sheet_to_json(subjectsSheet, { defval: '' }) as SubjectRow[])
    : [];

  const wsQuestions = wb.Sheets['Questions'] ?? wb.Sheets['questions'];
  if (!wsQuestions) {
    throw new Error('Sheet "Questions" not found in workbook.');
  }
  const questionsRaw: QuestionRow[] = XLSX.utils.sheet_to_json<QuestionRow>(wsQuestions, { defval: '' });

  return { subjectsRows, questionsRaw };
}

/* =============================================================================
 * SECTION D. Build payloads
 * ========================================================================== */

function toValidateItems(rows: QuestionRow[]): QuestionForValidate[] {
  return rows.map((q) => {
    const hasContent = (txt?: string, img?: string) =>
      (txt && txt.trim() !== '') || (img && img.trim() !== '');
    const opts = [];
    for (let i = 1; i <= 5; i++) {
      const t: string | undefined = (q as any)[`option${i}TextJA`] ?? (q as any)[`option${i}TextVI`] ?? '';
      const img: string | undefined = (q as any)[`option${i}Image`] ?? '';
      if (hasContent(t, img)) {
        const isAns = !!toBool((q as any)[`option${i}IsAnswer`]);
        opts.push({ isAnswer: isAns });
      }
    }
    return {
      id: q.id ?? q.questionId,
      questionId: q.questionId ?? q.id,
      courseId: String(q.courseId ?? 'KTS2'),
      subjectId: String(q.subjectId ?? 'GEN'),
      examYear: typeof q.examYear === 'number' || typeof q.examYear === 'string' ? q.examYear : '0000',
      options: opts,
    };
  });
}

function toSnapshotItems(list: QuestionRow[], courseId: string, subjectId: string): QuestionSnapshotItem[] {
  return list.map((r) => {
    const qid =
      r.questionId ??
      r.id ??
      `${String(subjectId)}_${String(r.examYear ?? '0000')}_${Math.random().toString(36).slice(2, 7)}`;

    const asNull = (v?: string) => (v && v.trim() !== '' ? v : null);
    const asStr = (v?: string) => (v ?? '');
    const ans = (i: 1 | 2 | 3 | 4 | 5) => !!toBool((r as any)[`option${i}IsAnswer`]);

    const out: QuestionSnapshotItem = {
      questionId: String(qid),
      courseId: String(r.courseId ?? courseId),
      subjectId: String(r.subjectId ?? subjectId),
      examYear: Number(r.examYear) || 0,

      questionTextJA: asStr(r.questionTextJA),
      questionTextVI: asStr(r.questionTextVI),
      questionImage: asNull(r.questionImage),

      explanationGeneralJA: asStr(r.explanationGeneralJA),
      explanationGeneralVI: asStr(r.explanationGeneralVI),
      explanationImage: asNull(r.explanationImage),

      difficulty: (r.difficulty as any) ?? null,
      sourceNote: (r.sourceNote as any) ?? null,
      tags: (r.tags as any) ?? null,
      officialPosition: (r.officialPosition as any) ?? null,
      cognitiveLevel: (r.cognitiveLevel as any) ?? null,

      option1TextJA: asStr(r.option1TextJA),
      option1TextVI: asStr(r.option1TextVI),
      option1Image: asNull(r.option1Image),
      option1IsAnswer: ans(1),
      option1ExplanationJA: asStr(r.option1ExplanationJA),
      option1ExplanationVI: asStr(r.option1ExplanationVI),

      option2TextJA: asStr(r.option2TextJA),
      option2TextVI: asStr(r.option2TextVI),
      option2Image: asNull(r.option2Image),
      option2IsAnswer: ans(2),
      option2ExplanationJA: asStr(r.option2ExplanationJA),
      option2ExplanationVI: asStr(r.option2ExplanationVI),

      option3TextJA: asStr(r.option3TextJA),
      option3TextVI: asStr(r.option3TextVI),
      option3Image: asNull(r.option3Image),
      option3IsAnswer: ans(3),
      option3ExplanationJA: asStr(r.option3ExplanationJA),
      option3ExplanationVI: asStr(r.option3ExplanationVI),

      option4TextJA: asStr(r.option4TextJA),
      option4TextVI: asStr(r.option4TextVI),
      option4Image: asNull(r.option4Image),
      option4IsAnswer: ans(4),
      option4ExplanationJA: asStr(r.option4ExplanationJA),
      option4ExplanationVI: asStr(r.option4ExplanationVI),

      option5TextJA: asStr(r.option5TextJA),
      option5TextVI: asStr(r.option5TextVI),
      option5Image: asNull(r.option5Image),
      option5IsAnswer: ans(5),
      option5ExplanationJA: asStr(r.option5ExplanationJA),
      option5ExplanationVI: asStr(r.option5ExplanationVI),
    };

    return out;
  });
}

/* =============================================================================
 * SECTION E. FS helpers
 * ========================================================================== */

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJSON(filePath: string, data: any) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function readManifest(manifestPath: string): Promise<SnapshotManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(raw) as SnapshotManifest;
  } catch {
    return null;
  }
}

/* =============================================================================
 * SECTION F. Main
 * ========================================================================== */

async function main() {
  const { input, outDir, allowErrors, fresh } = cli;

  console.log('⏳ Reading workbook:', input);
  const { subjectsRows, questionsRaw } = await readExcel(input);

  console.log('• Subjects rows:', subjectsRows.length);
  console.log('• Questions rows:', questionsRaw.length);

  // Subjects JSON
  const subjectsJson: SubjectsJSON = buildSubjectsMeta(subjectsRows);

  // Ready + normalize
  const questionsReady = filterReadyRows(questionsRaw).map(normalizeQuestionRow);
  console.log('• Ready questions:', questionsReady.length, `(skipped: ${questionsRaw.length - questionsReady.length})`);

  // Validate
  const itemsForValidate: QuestionForValidate[] = toValidateItems(questionsReady);
  const v = validateQuestions(itemsForValidate);

  // Print findings
  if (v.errors.length) {
    console.log('❌ Errors:', v.errors.length);
    v.errors.slice(0, 20).forEach((e) => {
      const idish = e.questionId ?? e.id ?? '?';
      const extra = 'count' in e ? ` (count=${e.count})` : '';
      console.log(`  - [${e.code}] Q${idish}${extra}: ${e.message}`);
    });
    if (v.errors.length > 20) console.log(`  ...and ${v.errors.length - 20} more`);
  } else {
    console.log('✅ No validation errors.');
  }

  if (v.warns.length) {
    console.log('⚠️  Warns:', v.warns.length);
    v.warns.slice(0, 20).forEach((w) => {
      const idish = w.questionId ?? w.id ?? '';
      console.log(`  - [${w.code}] ${idish ? `Q${idish}: ` : ''}${w.message}`);
    });
    if (v.warns.length > 20) console.log(`  ...and ${v.warns.length - 20} more`);
  }

  if (!allowErrors && v.errors.length > 0) {
    console.error('\nBuild failed due to validation errors. Use --allow-errors to proceed anyway.');
    process.exit(1);
  }

  // Filter OK rows
  const invalidIds = new Set((v.errors ?? []).map((e: any) => e.questionId ?? e.id).filter(Boolean));
  const okRows = questionsReady.filter((q) => !invalidIds.has(q.questionId ?? q.id));
  console.log('• OK questions to publish:', okRows.length);

  // Group & build outputs
  const ts = Date.now();
  const outRoot = path.resolve(outDir); // e.g. public/snapshots
  await ensureDir(outRoot);

  // 1) subjects.json
  const subjectsPath = path.join(outRoot, 'subjects.json');
  await writeJSON(subjectsPath, subjectsJson);
  console.log('📄 Wrote:', path.relative(process.cwd(), subjectsPath));

  // 2) per-subject jsons + entries
  const grouped = groupByCourseSubject(okRows);
  const entries: SnapshotManifestEntry[] = [];

  for (const [courseId, subMap] of grouped) {
    for (const [subjectId, list] of subMap) {
      const items = toSnapshotItems(list, courseId, subjectId);
      const filename = `${subjectId}-questions.v${ts}.json`;
      const relPath = `${courseId}/${filename}`;        // relative path inside snapshots/
      const absPath = path.join(outRoot, relPath);

      await writeJSON(absPath, items);
      console.log('📄 Wrote:', path.relative(process.cwd(), absPath), `(${items.length} items)`);

      entries.push({
        path: relPath.replace(/\\/g, '/'),
        courseId,
        subjectId,
        version: ts,
      });
    }
  }

  // 3) manifest.json
  const manifestPath = path.join(outRoot, 'manifest.json');
  let manifest: SnapshotManifest | null = await readManifest(manifestPath);

  // strategy: fresh (default we rebuild anyway). If you want to merge with previous,
  // turn off --fresh and merge entries that are not replaced.
  if (!manifest || fresh) {
    manifest = {
      version: ts,
      generatedAt: new Date(ts).toISOString(),
      files: [],
    };
  }

  // Replace entries for subjects we just published
  const keyOf = (e: SnapshotManifestEntry) => `${e.courseId}__${e.subjectId}`;
  const keepMap = new Map<string, SnapshotManifestEntry>();
  for (const e of manifest.files) {
    keepMap.set(keyOf(e), e);
  }
  for (const e of entries) {
    keepMap.set(keyOf(e), e); // overwrite with latest
  }
  manifest.files = Array.from(keepMap.values()).sort((a, b) => (a.courseId + a.subjectId).localeCompare(b.courseId + b.subjectId));
  manifest.version = ts;
  manifest.generatedAt = new Date(ts).toISOString();

  await writeJSON(manifestPath, manifest);
  console.log('📄 Wrote:', path.relative(process.cwd(), manifestPath));
  console.log('\n✅ Publish snapshots completed.');
}

main().catch((err) => {
  console.error('💥 Publisher failed:', err);
  process.exit(1);
});
