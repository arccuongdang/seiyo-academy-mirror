"use client";

/**
 * =============================================================================
 *  Admin — Data Publisher (Excel → Validate → Export RAW snapshots ZIP)
 *  Strategy: Option B (RAW JA/VI, fixed 5 options)
 * -----------------------------------------------------------------------------
 *  Flow tổng quát:
 *   1) Upload Excel (Subjects, Questions)
 *   2) Chuẩn hoá & lọc READY
 *   3) Map -> QuestionForValidate[] → validateQuestions()
 *   4) Lọc câu hợp lệ (không dính error)
 *   5) Xuất ZIP:
 *        - snapshots/subjects.json
 *        - snapshots/manifest.json  (files: [{path, courseId, subjectId, version}])
 *        - snapshots/{courseId}/{subjectId}-questions.v{ts}.json  (RAW QuestionSnapshotItem[])
 * =============================================================================
 */

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// ---- Libs (đã chuẩn hoá ở bước trước)
import { buildSubjectsMeta } from "../../../lib/qa/normalize";
import { validateQuestions } from "../../../lib/qa/guards";
import type {
  QuestionForValidate,
  SubjectsJSON,
  QuestionSnapshotItem,
  SnapshotManifest,
  SnapshotManifestEntry,
} from "../../../lib/qa/schema";

/* =============================================================================
 * SECTION A. Types & small helpers
 * ========================================================================== */

/** Hình dáng row Questions đọc trực tiếp từ Excel (linh hoạt, giữ nguyên tên cột phổ biến) */
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

  status?: string;                 // READY/DRAFT/...
  version?: number | string;
  AnswerIsOption?: number | string; // nếu bạn dùng cột chỉ mục 1..5 để đánh đáp án
};

type SubjectRow = Record<string, any>;

/** ép boolean an toàn từ (boolean | number | string) */
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

/** ép int an toàn */
function toInt(v: any): number | undefined {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** ép năm 4 chữ số (cho phép 0000 như unknown) */
function toYear4(v: any): number {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/** có nội dung ở mức tối thiểu để coi như một row "có gì đó" */
function hasAnyContent(q: Partial<QuestionRow>): boolean {
  const keysToCheck = [
    "questionId", "courseId", "subjectId", "examYear", "difficulty",
    "questionTextJA", "questionTextVI", "questionImage",
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

/** filter những row có trạng thái READY và có nội dung */
function filterReadyRows(rows: QuestionRow[]): QuestionRow[] {
  return rows.filter((r) => {
    if (!hasAnyContent(r)) return false;
    const st = String(r.status ?? "").trim().toUpperCase();
    return st === "READY";
  });
}

/** Nếu có cột AnswerIsOption (1..5), và các cờ option{i}IsAnswer đều rỗng → set theo chỉ mục */
function applyAnswerFromIndex(q: QuestionRow & Record<string, any>) {
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
    for (let i = 1; i <= 5; i++) (q as any)[`option${i}IsAnswer`] = i === idx;
  }
}

/** Chuẩn hoá row (ép kiểu, upper, boolean hoá isAnswer, apply AnswerIsOption, …) */
function normalizeQuestionRow(r: QuestionRow): QuestionRow {
  const q: any = { ...r };

  // năm 4 chữ số
  q.examYear = toYear4(q.examYear);
  // difficulty upper
  if (q.difficulty) q.difficulty = String(q.difficulty).toUpperCase();

  // ép boolean cho option{i}IsAnswer
  for (let i = 1; i <= 5; i++) {
    const k = `option${i}IsAnswer`;
    const b = toBool(q[k]);
    if (typeof b !== "undefined") q[k] = b;
  }

  // nếu dùng AnswerIsOption
  applyAnswerFromIndex(q);

  // ép version -> int (nếu có)
  if (typeof q.version !== "undefined") {
    const v = toInt(q.version);
    if (typeof v !== "undefined") q.version = v;
  }

  return q;
}

/** Group theo (courseId, subjectId) để xuất từng file */
function groupByCourseSubject(rows: QuestionRow[]) {
  const map = new Map<string, Map<string, QuestionRow[]>>();
  for (const q of rows) {
    const cid = String(q.courseId ?? "KTS2");
    const sid = String(q.subjectId ?? "GEN");
    if (!map.has(cid)) map.set(cid, new Map());
    const bySubject = map.get(cid)!;
    if (!bySubject.has(sid)) bySubject.set(sid, []);
    bySubject.get(sid)!.push(q);
  }
  return map;
}

/* =============================================================================
 * SECTION B. React Component (UI + handlers)
 * ========================================================================== */

export default function AdminDataPage() {
  // --- UI state --------------------------------------------------------------
  const [fileName, setFileName] = useState<string>("");
  const [subjectsCount, setSubjectsCount] = useState<number>(0);
  const [questionsCount, setQuestionsCount] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [warns, setWarns] = useState<string[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Handlers --------------------------------------------------------------
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    // reset trước khi xử lý file mới
    setFileName(f.name);
    setErrors([]);
    setWarns([]);
    setZipBlob(null);
    setSubjectsCount(0);
    setQuestionsCount(0);
    setSkippedCount(0);

    // [1] Đọc workbook
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);

    // [2] Parse sheets → JSON
    const subjectsSheet = wb?.Sheets?.["Subjects"];
    const subjectsRows: SubjectRow[] = subjectsSheet
      ? (XLSX.utils.sheet_to_json(subjectsSheet, { defval: "" }) as SubjectRow[])
      : [];

    const wsQuestions = wb.Sheets["Questions"] ?? wb.Sheets["questions"] ?? {};
    const questionsRaw: QuestionRow[] = XLSX.utils.sheet_to_json<QuestionRow>(wsQuestions, { defval: "" });

    // [3] Build subjects.json (từ sheet "Subjects")
    const subjectsJson: SubjectsJSON = buildSubjectsMeta(subjectsRows);
    setSubjectsCount(subjectsJson.items.length);

    // [4] Lọc row READY + có nội dung, chuẩn hoá
    const questionsReady = filterReadyRows(questionsRaw).map(normalizeQuestionRow);
    setSkippedCount(questionsRaw.length - questionsReady.length);

    // [5] Map → QuestionForValidate[] (chỉ cần isAnswer để validate)
    const itemsForValidate: QuestionForValidate[] = questionsReady.map((q) => {
      // gồm những option có nội dung thực sự (text hoặc image)
      const hasContent = (txt?: string, img?: string) =>
        (txt && txt.trim() !== "") || (img && img.trim() !== "");

      const opts = [];
      for (let i = 1; i <= 5; i++) {
        const t: string | undefined = (q as any)[`option${i}TextJA`] ?? (q as any)[`option${i}TextVI`] ?? "";
        const img: string | undefined = (q as any)[`option${i}Image`] ?? "";
        if (hasContent(t, img)) {
          const isAns = !!toBool((q as any)[`option${i}IsAnswer`]);
          opts.push({ isAnswer: isAns });
        }
      }

      return {
        id: q.id ?? q.questionId,
        questionId: q.questionId ?? q.id,
        courseId: String(q.courseId ?? "KTS2"),
        subjectId: String(q.subjectId ?? "GEN"),
        examYear: typeof q.examYear === "number" || typeof q.examYear === "string" ? q.examYear : "0000",
        options: opts,
      };
    });

    // [6] Validate
    const v = validateQuestions(itemsForValidate);

    // map errors & warns về string[] cho UI (nếu muốn giữ object → sửa state type)
    setErrors(
      v.errors.map((e: any) => {
        const idish = e.questionId ?? e.id ?? "?";
        const extra = "count" in e ? ` (count=${e.count})` : "";
        return `[${e.code}] Q${idish}${extra}: ${e.message}`;
      })
    );
    setWarns(
      (v.warns ?? []).map((w: any) => {
        const idish = w.questionId ?? w.id ?? "";
        return idish ? `[${w.code}] Q${idish}: ${w.message}` : `[${w.code}] ${w.message}`;
      })
    );

    // [7] Tập câu hợp lệ để xuất
    const invalidIds = new Set((v.errors ?? []).map((e: any) => e.questionId ?? e.id).filter(Boolean));
    const okRows = questionsReady.filter((q) => !invalidIds.has(q.questionId ?? q.id));
    setQuestionsCount(okRows.length);

    // [8] Xuất ZIP theo RAW (Option B)
    //  - snapshots/subjects.json
    //  - snapshots/manifest.json
    //  - snapshots/{course}/{subject}-questions.v{ts}.json (QuestionSnapshotItem[])
    const ts = Date.now();
    const zip = new JSZip();

    // 8.1 subjects.json (1 file ở gốc snapshots/)
    zip.file(`snapshots/subjects.json`, JSON.stringify(subjectsJson, null, 2));

    // 8.2 group câu hợp lệ theo courseId/subjectId
    const grouped = groupByCourseSubject(okRows);

    // 8.3 manifest (files[])
    const manifest: SnapshotManifest = {
      version: ts,
      generatedAt: new Date(ts).toISOString(),
      files: [],
    };

    for (const [courseId, subMap] of grouped) {
      for (const [subjectId, list] of subMap) {
        // map từng row → QuestionSnapshotItem (RAW JA/VI, 5 options)
        const items: QuestionSnapshotItem[] = list.map((r) => {
          const qid =
            r.questionId ??
            r.id ??
            `${String(subjectId)}_${String(r.examYear ?? "0000")}_${Math.random()
              .toString(36)
              .slice(2, 7)}`;

          // ép giúp ảnh/chuỗi trống -> null/'' đúng chỗ
          const asNull = (v?: string) => (v && v.trim() !== "" ? v : null);
          const asStr = (v?: string) => (v ?? "");

          // ép boolean đáp án
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

        // tên file theo quy ước Plan B
        const filename = `${subjectId}-questions.v${ts}.json`;
        const relativePath = `${courseId}/${filename}`;            // dùng trong manifest
        const zipPath = `snapshots/${relativePath}`;                // đường dẫn trong ZIP

        // ghi file vào ZIP
        zip.file(zipPath, JSON.stringify(items, null, 2));

        // push manifest entry
        const entry: SnapshotManifestEntry = {
          path: relativePath, // không có "public/" prefix
          courseId,
          subjectId,
          version: ts,
        };
        manifest.files.push(entry);
      }
    }

    // 8.4 manifest.json
    zip.file(`snapshots/manifest.json`, JSON.stringify(manifest, null, 2));

    // 8.5 tạo blob ZIP
    const content = await zip.generateAsync({ type: "blob" });
    setZipBlob(content);
  }

  function triggerFilePicker() {
    if (inputRef.current) inputRef.current.click();
  }

  function downloadZip() {
    if (!zipBlob) return;
    saveAs(zipBlob, "snapshots_publish.zip");
  }

  const filePicked = !!fileName;

  // --- UI -------------------------------------------------------------------
  return (
    <main className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Admin — Data Publisher (Excel → RAW snapshots)</h1>
      <p className="text-sm text-gray-500">
        Bước: Upload Excel → Validate → Export ZIP (snapshots/subjects.json, snapshots/manifest.json, snapshots/&lt;course&gt;/&lt;subject&gt;-questions.v&lt;ts&gt;.json)
      </p>

      {/* [UI-1] File picker */}
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
          className="w-full sm:w-auto px-4 py-3 rounded-md border font-medium bg-white hover:bg-gray-50"
          title={filePicked ? fileName : "Chọn file Excel ngân hàng câu hỏi"}
        >
          {filePicked ? `Đã chọn: ${fileName}` : "Chọn file Excel ngân hàng câu hỏi"}
        </button>
      </section>

      {/* [UI-2] Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Số môn (Subjects)</div>
          <div className="text-xl font-semibold">{subjectsCount}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Câu hợp lệ (Questions OK)</div>
          <div className="text-xl font-semibold">{questionsCount}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Bỏ qua (không READY / trống)</div>
          <div className="text-xl font-semibold">{skippedCount}</div>
        </div>
      </section>

      {/* [UI-3] Findings */}
      {(errors.length > 0 || warns.length > 0) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Errors ({errors.length})</div>
            <ul className="list-disc pl-5 space-y-1 text-red-700 text-sm max-h-56 overflow-auto">
              {errors.map((e, idx) => (
                <li key={`err-${idx}`}>{e}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Warnings ({warns.length})</div>
            <ul className="list-disc pl-5 space-y-1 text-amber-700 text-sm max-h-56 overflow-auto">
              {warns.map((w, idx) => (
                <li key={`warn-${idx}`}>{w}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* [UI-4] Export */}
      <section className="space-y-2">
        <button
          onClick={downloadZip}
          disabled={!zipBlob || errors.length > 0}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          Tải về snapshots_publish.zip
        </button>
        <div className="text-sm text-gray-500">
          Hãy giải nén và <code>git add</code> nội dung vào <code>public/snapshots/**</code> →
          commit &amp; push. (Gợi ý: xoá phiên bản cũ nếu không dùng.)
        </div>
      </section>
    </main>
  );
}
