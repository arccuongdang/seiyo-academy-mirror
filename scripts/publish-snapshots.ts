/* scripts/publish-snapshots.ts (v2) */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const ROOT = process.cwd();
const EXCEL_PATH = path.join(ROOT, "data-source", "SeiyoQuestions.xlsx");
const SNAPSHOTS_DIR = path.join(ROOT, "public", "snapshots");

type Course = {
  courseId: string;
  courseNameJA?: string;
  courseNameVI?: string;
  active?: boolean;
  coverImage?: string;
};

type Subject = {
  subjectId: string;
  courseId: string;
  subjectNameJA?: string;
  subjectNameVI?: string;
  active?: boolean;
};

type Question = {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number | string;
  difficulty: "A" | "AA" | "AAA" | string;
  sourceNote?: string;
  tags?: string;

  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string;

  option1TextJA?: string; option1TextVI?: string; option1Image?: string; option1IsAnswer?: boolean | string; option1ExplanationJA?: string; option1ExplanationVI?: string;
  option2TextJA?: string; option2TextVI?: string; option2Image?: string; option2IsAnswer?: boolean | string; option2ExplanationJA?: string; option2ExplanationVI?: string;
  option3TextJA?: string; option3TextVI?: string; option3Image?: string; option3IsAnswer?: boolean | string; option3ExplanationJA?: string; option3ExplanationVI?: string;
  option4TextJA?: string; option4TextVI?: string; option4Image?: string; option4IsAnswer?: boolean | string; option4ExplanationJA?: string; option4ExplanationVI?: string;
  option5TextJA?: string; option5TextVI?: string; option5Image?: string; option5IsAnswer?: boolean | string; option5ExplanationJA?: string; option5ExplanationVI?: string;

  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string;

  status?: string;
  version?: number | string;

  /** Cột mới bạn thêm: 1/2/3/4/5 */
  AnswerIsOption?: number | string;
};

// ---------- Helpers ----------
function hasAnyContent(q: Partial<Question>): boolean {
  const keysToCheck = [
    "questionId","courseId","subjectId","examYear","difficulty",
    "questionTextJA","questionTextVI","questionImage",
    "option1TextJA","option1TextVI","option1Image","option1IsAnswer",
    "option2TextJA","option2TextVI","option2Image","option2IsAnswer",
    "option3TextJA","option3TextVI","option3Image","option3IsAnswer",
    "option4TextJA","option4TextVI","option4Image","option4IsAnswer",
    "option5TextJA","option5TextVI","option5Image","option5IsAnswer",
    "explanationGeneralJA","explanationGeneralVI","explanationImage",
    "status","version","AnswerIsOption","tags","sourceNote"
  ];
  return keysToCheck.some((k) => {
    const v = (q as any)[k];
    if (typeof v === "number") return true;
    if (typeof v === "boolean") return true;
    if (typeof v === "string") return v.trim() !== "";
    return false;
  });
}

function filterReadyRows(rows: Question[]): Question[] {
  return rows.filter((r) => {
    if (!hasAnyContent(r)) return false; // bỏ dòng trống
    const st = String(r.status ?? "").trim().toUpperCase();
    return st === "READY"; // chỉ giữ READY
  });
}


function readSheet<T = any>(wb: XLSX.WorkBook, sheetName: string): T[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  // sheet_to_json sẽ dùng "cached value" của ô công thức; nếu Excel chưa lưu cache,
  // ta vẫn ổn vì có AnswerIsOption để tự suy luận.
  return XLSX.utils.sheet_to_json<T>(ws, { defval: "" });
}

function toBool(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "1") return true;
    if (s === "0") return false;
  }
  return undefined; // không xác định
}

function toYear4(v: any): number {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function toInt(v: any): number | undefined {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// Dùng AnswerIsOption để "đặt" optionXIsAnswer nếu thiếu hoặc không rõ
function applyAnswerFromIndex(q: Question & any) {
  const idx = toInt(q.AnswerIsOption); // 1..5
  if (!idx || idx < 1 || idx > 5) return;

  // nếu tất cả optionXIsAnswer đều “không xác định”, thì set theo AnswerIsOption
  const flags = [
    toBool(q.option1IsAnswer),
    toBool(q.option2IsAnswer),
    toBool(q.option3IsAnswer),
    toBool(q.option4IsAnswer),
    toBool(q.option5IsAnswer),
  ];

  const allUndef = flags.every((f) => typeof f === "undefined");
  if (allUndef) {
    for (let i = 1; i <= 5; i++) {
      q[`option${i}IsAnswer`] = i === idx;
    }
    return;
  }

  // Nếu đã có cờ TRUE/FALSE, kiểm tra nhất quán
  // (Không bắt buộc sửa, chỉ cảnh báo nếu mâu thuẫn)
  const truthIndex = flags.findIndex((f) => f === true);
  if (truthIndex >= 0 && truthIndex + 1 !== idx) {
    console.warn(
      `! Warning: questionId=${q.questionId} has AnswerIsOption=${idx} but option${truthIndex + 1}IsAnswer=TRUE`
    );
  }
}

// Chuẩn hóa 1 câu hỏi: ép kiểu, upper-case difficulty, áp AnswerIsOption
function normalizeQuestion(r: Question): Question {
  const q: any = { ...r };

  // examYear
  q.examYear = toYear4(q.examYear);
  // difficulty
  q.difficulty = String(q.difficulty || "").toUpperCase() as any;

  // ép TRUE/FALSE
  for (let i = 1; i <= 5; i++) {
    const k = `option${i}IsAnswer`;
    const b = toBool((q as any)[k]);
    if (typeof b !== "undefined") (q as any)[k] = b;
  }

  // dùng AnswerIsOption nếu cần
  applyAnswerFromIndex(q);

  // version (optional)
  if (typeof q.version !== "undefined") {
    const v = toInt(q.version);
    if (typeof v !== "undefined") q.version = v;
  }

  return q;
}

function validateQuestions(rows: Question[]): { ok: Question[]; errors: string[] } {
  const errors: string[] = [];
  const ok: Question[] = [];
  const allowedDiff = new Set(["A", "AA", "AAA"]);

  rows.forEach((raw, idx) => {
    const rowNo = idx + 2;
    const r = normalizeQuestion(raw);

    if (!r.questionId) errors.push(`Row ${rowNo}: missing questionId`);
    if (!r.courseId) errors.push(`Row ${rowNo}: missing courseId`);
    if (!r.subjectId) errors.push(`Row ${rowNo}: missing subjectId`);

    if (!Number.isFinite(r.examYear)) errors.push(`Row ${rowNo}: examYear must be 4-digit number`);
    else if (String(r.examYear).length !== 4) errors.push(`Row ${rowNo}: examYear should be 4 digits (e.g., 2024)`);

    if (!allowedDiff.has(String(r.difficulty))) errors.push(`Row ${rowNo}: difficulty must be A/AA/AAA`);

    // Nếu có AnswerIsOption thì validate 1..5
    if (typeof r.AnswerIsOption !== "undefined" && r.AnswerIsOption !== "") {
      const ansIdx = toInt(r.AnswerIsOption);
      if (!ansIdx || ansIdx < 1 || ansIdx > 5) {
        errors.push(`Row ${rowNo}: AnswerIsOption must be 1..5 when provided`);
      }
    }

    const answers = [
      toBool((r as any).option1IsAnswer),
      toBool((r as any).option2IsAnswer),
      toBool((r as any).option3IsAnswer),
      toBool((r as any).option4IsAnswer),
      toBool((r as any).option5IsAnswer),
    ].map(Boolean);

    if (!answers.includes(true)) errors.push(`Row ${rowNo}: at least one optionXIsAnswer must be TRUE (or set AnswerIsOption)`);

    ok.push(r as Question);
  });

  return { ok, errors };
}

function groupByCourseSubject(rows: Question[]) {
  const map = new Map<string, Map<string, Question[]>>();
  for (const q of rows) {
    if (!map.has(q.courseId)) map.set(q.courseId, new Map());
    const bySubject = map.get(q.courseId)!;
    if (!bySubject.has(q.subjectId)) bySubject.set(q.subjectId, []);
    bySubject.get(q.subjectId)!.push(q);
  }
  return map;
}

function writeJSON(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log("✓ wrote", path.relative(ROOT, filePath));
}

(function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("✗ Excel not found at:", EXCEL_PATH);
    process.exit(1);
  }
  const wb = XLSX.readFile(EXCEL_PATH);
  const courses = readSheet<Course>(wb, "Courses");
  const subjects = readSheet<Subject>(wb, "Subjects");
  const questionsRaw = readSheet<Question>(wb, "Questions");

  // Lọc chỉ giữ READY trước khi validate
  const questionsReady = filterReadyRows(questionsRaw);

  const { ok, errors } = validateQuestions(questionsReady);

  if (errors.length) {
    console.error("Validation errors:");
    errors.forEach((e) => console.error(" -", e));
    process.exit(1);
  }

  // Build manifest skeleton from Subjects
  const manifest: Record<string, Record<string, string[]>> = {};
  for (const s of subjects) {
    if (!s.courseId || !s.subjectId) continue;
    if (!manifest[s.courseId]) manifest[s.courseId] = {};
    if (!manifest[s.courseId][s.subjectId]) manifest[s.courseId][s.subjectId] = [];
  }

  // Group & write snapshots
  const grouped = groupByCourseSubject(ok.map(normalizeQuestion));
  const ts = Date.now();
  for (const [courseId, subMap] of grouped) {
    for (const [subjectId, list] of subMap) {
      const payload = {
        meta: { courseId, subjectId, count: list.length, generatedAt: ts },
        items: list
      };
      const outFile = path.join(SNAPSHOTS_DIR, courseId, `${subjectId}-questions.v${ts}.json`);
      writeJSON(outFile, payload);

      if (!manifest[courseId]) manifest[courseId] = {};
      if (!manifest[courseId][subjectId]) manifest[courseId][subjectId] = [];
      manifest[courseId][subjectId].unshift(`${subjectId}-questions.v${ts}.json`);
    }
  }

  writeJSON(path.join(SNAPSHOTS_DIR, "manifest.json"), manifest);

  console.log("\nAll done. Commit & push the generated JSON files.");
})();
