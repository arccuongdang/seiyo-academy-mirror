"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { buildSubjectsMeta } from '../../../lib/qa/normalize';

// ===== Types
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
  AnswerIsOption?: number | string;
};
type Subject = { subjectId: string; courseId: string; subjectNameJA?: string; subjectNameVI?: string; active?: boolean };
type Manifest = Record<string, Record<string, string[]>>;

// ===== Helpers
function toBool(v: any): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return undefined;
}
function toInt(v: any): number | undefined {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function toYear4(v: any): number {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

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
    if (!hasAnyContent(r)) return false;
    const st = String(r.status ?? "").trim().toUpperCase();
    return st === "READY";
  });
}

function applyAnswerFromIndex(q: Question & any) {
  const idx = toInt(q.AnswerIsOption); // 1..5
  if (!idx || idx < 1 || idx > 5) return;
  const flags = [
    toBool(q.option1IsAnswer),
    toBool(q.option2IsAnswer),
    toBool(q.option3IsAnswer),
    toBool(q.option4IsAnswer),
    toBool(q.option5IsAnswer),
  ];
  const allUndef = flags.every((f) => typeof f === "undefined");
  if (allUndef) {
    for (let i = 1; i <= 5; i++) q[`option${i}IsAnswer`] = i === idx;
    return;
  }
  const truthIndex = flags.findIndex((f) => f === true);
  if (truthIndex >= 0 && truthIndex + 1 !== idx) {
    console.warn(`! Warning: questionId=${q.questionId} AnswerIsOption=${idx} but option${truthIndex + 1}IsAnswer=TRUE`);
  }
}

function normalizeQuestion(r: Question): Question {
  const q: any = { ...r };
  q.examYear = toYear4(q.examYear);
  q.difficulty = String(q.difficulty || "").toUpperCase();
  for (let i = 1; i <= 5; i++) {
    const k = `option${i}IsAnswer`;
    const b = toBool((q as any)[k]);
    if (typeof b !== "undefined") (q as any)[k] = b;
  }
  applyAnswerFromIndex(q);
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

    if (typeof r.AnswerIsOption !== "undefined" && r.AnswerIsOption !== "") {
      const ansIdx = toInt(r.AnswerIsOption);
      if (!ansIdx || ansIdx < 1 || ansIdx > 5) errors.push(`Row ${rowNo}: AnswerIsOption must be 1..5 when provided`);
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

export default function AdminDataPage() {
  const [fileName, setFileName] = useState<string>("");
  const [subjectsCount, setSubjectsCount] = useState<number>(0);
  const [questionsCount, setQuestionsCount] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setErrors([]);
    setZipBlob(null);

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);

    const subjects = XLSX.utils.sheet_to_json<Subject>(wb.Sheets["Subjects"] ?? {}, { defval: "" });
    const wsQuestions = wb.Sheets["Questions"] ?? wb.Sheets["questions"] ?? {};
    const questionsRaw = XLSX.utils.sheet_to_json<Question>(wsQuestions, { defval: "" });
    
    // ... sau khi parse workbook thành các sheet JSON:
    const subjectsSheet = wb?.Sheets?.['Subjects'];
    const subjectsRows: Array<Record<string, any>> =
       subjectsSheet ? XLSX.utils.sheet_to_json(subjectsSheet, { defval: '' }) : [];
    const subjectsMeta = buildSubjectsMeta(subjectsRows);

    const questionsReady = filterReadyRows(questionsRaw);
    setSkippedCount(questionsRaw.length - questionsReady.length);

    const { ok, errors } = validateQuestions(questionsReady);
    setErrors(errors);
    setSubjectsCount(subjects.length);
    setQuestionsCount(ok.length);
    if (errors.length) return;

    // Build manifest skeleton
    const manifest: Manifest = {};
    for (const s of subjects) {
      if (!s.courseId || !s.subjectId) continue;
      if (!manifest[s.courseId]) manifest[s.courseId] = {};
      if (!manifest[s.courseId][s.subjectId]) manifest[s.courseId][s.subjectId] = [];
    }

    // Group & build snapshots
    const grouped = groupByCourseSubject(ok);

    const ts = Date.now();
    const zip = new JSZip();
    // ghi subjects.json vào zip mỗi course 1 lần
    const wroteSubjects = new Set<string>();


    for (const [courseId, subMap] of grouped) {
      for (const [subjectId, list] of subMap) {
        const payload = {
          meta: { courseId, subjectId, count: list.length, generatedAt: ts },
          items: list,
        };
        const filename = `${subjectId}-questions.v${ts}.json`;
        const outPath = `public/snapshots/${courseId}/${filename}`;
        zip.file(outPath, JSON.stringify(payload, null, 2));

        // ĐƯA subjects.json vào gói ZIP (mỗi course chỉ ghi 1 lần)
        if (!wroteSubjects.has(courseId)) {
          zip.file(
            `public/snapshots/${courseId}/subjects.json`,
            JSON.stringify(subjectsMeta, null, 2)
          );
          wroteSubjects.add(courseId);
        }


        if (!manifest[courseId]) manifest[courseId] = {};
        if (!manifest[courseId][subjectId]) manifest[courseId][subjectId] = [];
        manifest[courseId][subjectId].unshift(filename);
      }
    }

    zip.file("public/snapshots/manifest.json", JSON.stringify(manifest, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    setZipBlob(content);
  }

  function triggerFilePicker() {
    if (inputRef.current && !fileName) inputRef.current.click();
  }
  function downloadZip() {
    if (!zipBlob) return;
    saveAs(zipBlob, "snapshots_publish.zip");
  }

  const filePicked = !!fileName;

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Admin — Dữ liệu (Upload → Validate → Publish)</h1>

      {/* Nút chọn file Excel kiểu vuông */}
      <section className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={triggerFilePicker}
          disabled={filePicked}
          className={[
            "w-full sm:w-auto px-4 py-3 rounded-md border font-medium",
            filePicked ? "bg-gray-200 text-gray-600 cursor-not-allowed" : "bg-white hover:bg-gray-50"
          ].join(" ")}
          title={filePicked ? fileName : "Chọn file Excel ngân hàng câu hỏi"}
        >
          {filePicked ? fileName : "Chọn file Excel ngân hàng câu hỏi"}
        </button>
        {filePicked && (
          <div className="text-sm text-gray-500">
            Đã chọn: <b>{fileName}</b>
          </div>
        )}
      </section>

      {/* Kết quả */}
      <section className="space-y-2">
        <div className="text-lg font-semibold">Kết quả kiểm tra</div>
        <div>Subjects: <b>{subjectsCount}</b></div>
        <div>Questions (READY): <b>{questionsCount}</b></div>
        <div>Bỏ qua (không READY / trống): <b>{skippedCount}</b></div>

        {errors.length > 0 ? (
          <div className="mt-2">
            <div className="text-red-600 font-semibold">Lỗi ({errors.length}):</div>
            <ul className="list-disc pl-6 text-red-600">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            <div className="text-gray-600 mt-2">
              Sửa lỗi trong Excel rồi upload lại để tiếp tục.
            </div>
          </div>
        ) : (
          <>
            <div className="text-green-700">✔ Hợp lệ. Bạn có thể Publish.</div>
            <button
              onClick={downloadZip}
              disabled={!zipBlob}
              className="mt-2 px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              Tải về snapshots_publish.zip
            </button>
            <div className="text-sm text-gray-500 mt-1">
              Giải nén và <code>git add</code> toàn bộ nội dung vào repo (đè <code>public/snapshots/**</code>) → commit &amp; push.
            </div>
          </>
        )}
      </section>
    </main>
  );
}
