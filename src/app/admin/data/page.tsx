"use client";

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { saveAs } from "file-saver";

// Libs (giữ nguyên theo dự án của bạn)
import { buildSubjectsMeta } from "../../../lib/qa/normalize";
import { validateQuestions } from "../../../lib/qa/guards";
import type {
  QuestionForValidate,
  SubjectsJSON,
  QuestionSnapshotItem,
  SnapshotManifest,
  SnapshotManifestEntry,
} from "../../../lib/qa/schema";

// NEW: đọc TagsList + TF helpers
import { parseTagsIndexFromWorkbook, isTFRow } from "../../../lib/qa/excel";

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

  questionType?: string;
  QuestionType?: string;
  type?: string;
  Type?: string;
};

type SubjectRow = Record<string, any>;

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

function hasAnyContent(q: Partial<QuestionRow>): boolean {
  const keys = [
    "questionId","courseId","subjectId","examYear","difficulty",
    "questionTextJA","questionTextVI","questionImage",
    "option1TextJA","option1TextVI","option1Image","option1IsAnswer",
    "option2TextJA","option2TextVI","option2Image","option2IsAnswer",
    "option3TextJA","option3TextVI","option3Image","option3IsAnswer",
    "option4TextJA","option4TextVI","option4Image","option4IsAnswer",
    "option5TextJA","option5TextVI","option5Image","option5IsAnswer",
    "explanationGeneralJA","explanationGeneralVI","explanationImage",
    "status","version","AnswerIsOption","tags","sourceNote",
    "questionType","QuestionType","type","Type"
  ];
  return keys.some((k) => {
    const v = (q as any)[k];
    if (typeof v === "number" || typeof v === "boolean") return true;
    if (typeof v === "string") return v.trim() !== "";
    return false;
  });
}

function filterReadyRows(rows: QuestionRow[]): QuestionRow[] {
  return rows.filter((r) => {
    if (!hasAnyContent(r)) return false;
    return String(r.status ?? "").trim().toUpperCase() === "READY";
  });
}

function applyAnswerFromIndex(q: QuestionRow & Record<string, any>) {
  const idx = toInt(q.AnswerIsOption);
  if (!idx || idx < 1 || idx > 5) return;
  const f = [1,2,3,4,5].map(i => toBool(q[`option${i}IsAnswer`]));
  if (f.every(x => typeof x === "undefined")) {
    for (let i = 1; i <= 5; i++) q[`option${i}IsAnswer`] = i === idx;
  }
}

function normalizeQuestionRow(r: QuestionRow): QuestionRow {
  const q: any = { ...r };
  q.examYear = toYear4(q.examYear);
  if (q.difficulty) q.difficulty = String(q.difficulty).toUpperCase();
  for (let i = 1; i <= 5; i++) {
    const b = toBool(q[`option${i}IsAnswer`]);
    if (typeof b !== "undefined") q[`option${i}IsAnswer`] = b;
  }
  applyAnswerFromIndex(q);
  if (typeof q.version !== "undefined") {
    const v = toInt(q.version); if (typeof v !== "undefined") q.version = v;
  }
  return q;
}

function groupByCourseSubject(rows: QuestionRow[]) {
  const map = new Map<string, Map<string, QuestionRow[]>>();
  for (const q of rows) {
    const cid = String(q.courseId ?? "KTS2");
    const sid = String(q.subjectId ?? "GEN");
    if (!map.has(cid)) map.set(cid, new Map());
    const bySub = map.get(cid)!;
    if (!bySub.has(sid)) bySub.set(sid, []);
    bySub.get(sid)!.push(q);
  }
  return map;
}

function buildManifestIndex(entries: SnapshotManifestEntry[]) {
  const index: Record<string, Record<string, { versions: { ts: number; path: string }[]; latest: { ts: number; path: string } }>> = {};
  for (const e of entries) {
    const { courseId, subjectId, version, path } = e;
    index[courseId] ??= {};
    index[courseId][subjectId] ??= { versions: [], latest: { ts: 0, path } };
    index[courseId][subjectId].versions.push({ ts: version, path });
    if (version >= index[courseId][subjectId].latest.ts) index[courseId][subjectId].latest = { ts: version, path };
  }
  return index;
}

type Tab = "publish" | "images" | "access";

export default function AdminDataPage() {
  const [tab, setTab] = useState<Tab>("publish");

  const [fileName, setFileName] = useState<string>("");
  const [subjectsCount, setSubjectsCount] = useState<number>(0);
  const [questionsCount, setQuestionsCount] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [warns, setWarns] = useState<string[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [okRowsCache, setOkRowsCache] = useState<QuestionRow[]>([]);

  const [imgFiles, setImgFiles] = useState<FileList | null>(null);
  const [imgCourseId, setImgCourseId] = useState<string>("KTS2");
  const [missingList, setMissingList] = useState<string[]>([]);
  const [unusedList, setUnusedList] = useState<string[]>([]);
  const [csvBlob, setCsvBlob] = useState<Blob | null>(null);
  // Access Control states
  const [emailsText, setEmailsText] = useState<string>('');
  const [uidsText, setUidsText] = useState<string>('');
  const [allowB, setAllowB] = useState<boolean>(true);
  const [allowC, setAllowC] = useState<boolean>(true);
  const [accessMsg, setAccessMsg] = useState<string>('');


  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setFileName(f.name);
    setErrors([]); setWarns([]); setZipBlob(null);
    setSubjectsCount(0); setQuestionsCount(0); setSkippedCount(0);
    setOkRowsCache([]);

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);

    const subjectsSheet = wb?.Sheets?.["Subjects"];
    const subjectsRows: SubjectRow[] = subjectsSheet
      ? (XLSX.utils.sheet_to_json(subjectsSheet, { defval: "" }) as SubjectRow[])
      : [];

    const wsQuestions = wb.Sheets["Questions"] ?? wb.Sheets["questions"] ?? {};
    const questionsRaw: QuestionRow[] = XLSX.utils.sheet_to_json<QuestionRow>(wsQuestions, { defval: "" });

    const tagsIndex = parseTagsIndexFromWorkbook(wb);

    const subjectsJson: SubjectsJSON = buildSubjectsMeta(subjectsRows);
    setSubjectsCount(subjectsJson.items.length);

    const ready = filterReadyRows(questionsRaw).map(normalizeQuestionRow);
    setSkippedCount(questionsRaw.length - ready.length);

    const itemsForValidate: QuestionForValidate[] = ready.map((q) => {
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

    const v = validateQuestions(itemsForValidate);

    // Suppress EMPTY_OPTIONS for TF
    const tfIdSet = new Set<string>();
    for (const r of ready) {
      const idish = String(r.questionId ?? r.id ?? "").trim();
      if (!idish) continue;
      if (isTFRow(r)) tfIdSet.add(idish);
    }
    const filteredErrors = (v.errors ?? []).filter((e: any) => {
      const idish = String(e.questionId ?? e.id ?? "").trim();
      if (e.code === "EMPTY_OPTIONS" && tfIdSet.has(idish)) return false;
      return true;
    });

    setErrors(
      filteredErrors.map((e: any) => {
        const idish = e.questionId ?? e.id ?? "?";
        const extra = "count" in e ? ` (count=${e.count})` : "";
        return `[${e.code}] Q${idish}${extra}: ${e.message}`;
      })
    );
    setWarns((v.warns ?? []).map((w: any) => {
      const idish = w.questionId ?? w.id ?? "";
      return idish ? `[${w.code}] Q${idish}: ${w.message}` : `[${w.code}] ${w.message}`;
    }));

    const invalidIds = new Set(filteredErrors.map((e: any) => e.questionId ?? e.id).filter(Boolean));
    const okRows = ready.filter((q) => !invalidIds.has(q.questionId ?? q.id));
    setQuestionsCount(okRows.length);
    setOkRowsCache(okRows);

    const ts = Date.now();
    const zip = new JSZip();

    // subjects.json
    zip.file(`snapshots/subjects.json`, JSON.stringify(subjectsJson, null, 2));

    const grouped = groupByCourseSubject(okRows);

    const manifest: SnapshotManifest & { index?: any; tagsIndex?: any } = {
      version: ts,
      generatedAt: new Date(ts).toISOString(),
      files: [],
    };

    for (const [courseId, subMap] of grouped) {
      for (const [subjectId, list] of subMap) {
        const items: QuestionSnapshotItem[] = list.map((r) => {
          const qid =
            r.questionId ??
            r.id ??
            `${String(subjectId)}_${String(r.examYear ?? "0000")}_${Math.random().toString(36).slice(2, 7)}`;

          const asNull = (v?: string) => (v && v.trim() !== "" ? v : null);
          const asStr = (v?: string) => (v ?? "");
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

            tags: (r as any).tags ?? null,
            tagsText: (r as any).tags ?? null,

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

        // write versioned
        const filename = `${subjectId}-questions.v${ts}.json`;
        const relativePath = `${courseId}/${filename}`;
        const zipPath = `snapshots/${relativePath}`;
        zip.file(zipPath, JSON.stringify(items, null, 2));

        // write alias latest
        const latestZipPath = `snapshots/${courseId}/${subjectId}-questions.latest.json`;
        zip.file(latestZipPath, JSON.stringify(items, null, 2));

        const entry: SnapshotManifestEntry = { path: relativePath, courseId, subjectId, version: ts };
        manifest.files.push(entry);
      }
    }

    (manifest as any).index = (function buildIndex(entries: SnapshotManifestEntry[]) {
      const index: Record<string, Record<string, { versions: { ts: number; path: string }[]; latest: { ts: number; path: string } }>> = {};
      for (const e of entries) {
        const { courseId, subjectId, version, path } = e;
        index[courseId] ??= {};
        index[courseId][subjectId] ??= { versions: [], latest: { ts: 0, path } };
        index[courseId][subjectId].versions.push({ ts: version, path });
        if (version >= index[courseId][subjectId].latest.ts) index[courseId][subjectId].latest = { ts: version, path };
      }
      return index;
    })(manifest.files);

    (manifest as any).tagsIndex = tagsIndex;

    zip.file(`snapshots/manifest.json`, JSON.stringify(manifest, null, 2));

    const content = await zip.generateAsync({ type: "blob" });
    setZipBlob(content);
  }

  function triggerFilePicker() { inputRef.current?.click(); }
  function downloadZip() { if (zipBlob) saveAs(zipBlob, "snapshots_publish.zip"); }

  /* Images Check (như trước) */
  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    setImgFiles(files && files.length ? files : null);
    setMissingList([]); setUnusedList([]); setCsvBlob(null);
  }
  function normalizeImgKey(courseId: string, examYear: number | string, fileName: string) {
    const y = String(examYear ?? "0000").trim();
    const fname = String(fileName || "").trim();
    return `images/${courseId}/${y}/${fname}`;
  }
  function makeExpectedList(rows: QuestionRow[], courseId: string) {
    const expected = new Set<string>();
    for (const r of rows) {
      const qid = String(r.questionId ?? r.id ?? "").trim();
      const year = Number(r.examYear) || 0;
      if (!qid) continue;
      const qImg = (r as any).questionImage as string | undefined;
      if (qImg && qImg.trim() !== "") expected.add(normalizeImgKey(courseId, year, qImg));
      else expected.add(normalizeImgKey(courseId, year, `${qid}_question.jpg`));
      for (let i = 1; i <= 5; i++) {
        const optImg = (r as any)[`option${i}Image`] as string | undefined;
        if (optImg && optImg.trim() !== "") expected.add(normalizeImgKey(courseId, year, optImg));
        else expected.add(normalizeImgKey(courseId, year, `${qid}_opt${i}.jpg`));
      }
    }
    return expected;
  }
  
  function handleCheckImages() {
    if (!okRowsCache.length) { alert("Upload Excel & Validate trước (tab Publish)."); return; }
    if (!imgFiles || imgFiles.length === 0) { alert("Hãy chọn thư mục ảnh (webkitdirectory)."); return; }

    const expected = makeExpectedList(okRowsCache, imgCourseId);
    const actual = new Set<string>();
    const actualList: string[] = [];

    for (const f of Array.from(imgFiles)) {
      const rel = (f as any).webkitRelativePath as string | undefined;
      const key = rel ? rel.replace(/^[/.]+/, "") : f.name;
      actual.add(key);
      actualList.push(key);
    }

    const missing = Array.from(expected).filter((k) => !actual.has(k)).sort();
    const unused = actualList
      .filter((k) => k.startsWith(`images/${imgCourseId}/`))
      .filter((k) => !expected.has(k))
      .sort();

    setMissingList(missing);
    setUnusedList(unused);

    const csvLines = [
      "type,path",
      ...missing.map((m) => `missing,${m}`),
      ...unused.map((u) => `unused,${u}`),
    ];

    setCsvBlob(
      new Blob([csvLines.join("\\n")], { type: "text/csv;charset=utf-8" })
    );
  }
  
  function downloadCsv() { if (csvBlob) saveAs(csvBlob, "images_check.csv"); }

  const canCheckImages = useMemo(() => !!okRowsCache.length, [okRowsCache]);
  const filePicked = !!fileName;

  return (
    <main className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Admin — Data</h1>
      <p className="text-sm text-gray-500">
        Bước 8: Excel → Validate → Publish snapshots (ZIP) &amp; Images Check (NO upload)
      </p>

      <div className="inline-flex rounded-lg border overflow-hidden">
        <button
          className={`px-3 py-2 text-sm ${tab === "publish" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setTab("publish")}
        >
          Publish
        </button>
        <button
          className={`px-3 py-2 text-sm ${tab === "images" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setTab("images")}
        >
          Images Check
        </button>
      </div>

      {tab === "publish" && (
        <>
          <section className="space-y-3">
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />
            <button
              onClick={triggerFilePicker}
              className="w-full sm:w-auto px-4 py-3 rounded-md border font-medium bg-white hover:bg-gray-50"
              title={filePicked ? fileName : "Chọn file Excel ngân hàng câu hỏi"}
            >
              {filePicked ? `Đã chọn: ${fileName}` : "Chọn file Excel ngân hàng câu hỏi"}
            </button>
          </section>

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

          {(errors.length > 0 || warns.length > 0) && (
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">Errors ({errors.length})</div>
                <ul className="list-disc pl-5 space-y-1 text-red-700 text-sm max-h-56 overflow-auto">
                  {errors.map((e, idx) => <li key={`err-${idx}`}>{e}</li>)}
                </ul>
              </div>
              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">Warnings ({warns.length})</div>
                <ul className="list-disc pl-5 space-y-1 text-amber-700 text-sm max-h-56 overflow-auto">
                  {warns.map((w, idx) => <li key={`warn-${idx}`}>{w}</li>)}
                </ul>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <button
              onClick={downloadZip}
              disabled={!zipBlob || errors.length > 0}
              className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            >
              Tải snapshots_publish.zip
            </button>
            <div className="text-sm text-gray-500 space-y-1">
              <div>Trong ZIP có: <code>snapshots/**</code> và <code>publish.sh</code>.</div>
              <div>Giải nén → copy <code>snapshots/**</code> vào <code>public/snapshots/**</code> → chạy <code>bash publish.sh</code> nếu muốn auto push.</div>
            </div>
          </section>
        </>
      )}

      {tab === "images" && (
        <>
          <section className="space-y-2">
            <div className="text-sm text-gray-600">
              So sánh ảnh theo quy ước:
              <code className="ml-1">images/{`{courseId}`}/{`{examYear}`}/{`{questionId}`}_question.jpg</code>,
              <code className="ml-1">{`{questionId}`}_opt1..5.jpg</code>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm">
                Course ID:&nbsp;
                <input
                  value={imgCourseId}
                  onChange={(e) => setImgCourseId(e.target.value.trim() || "KTS2")}
                  className="border rounded px-2 py-1"
                  placeholder="KTS2"
                />
              </label>

              <input
                type="file"
                // @ts-ignore
                webkitdirectory="true"
                // @ts-ignore
                directory="true"
                multiple
                onChange={onPickImages}
                className="block"
              />
              <button
                onClick={handleCheckImages}
                disabled={!imgFiles || !canCheckImages}
                className="px-3 py-2 rounded border bg-white disabled:opacity-50"
              >
                Check Missing / Unused
              </button>
              <button
                onClick={downloadCsv}
                disabled={!csvBlob}
                className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
              >
                Tải CSV kết quả
              </button>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded border p-3">
              <div className="font-semibold mb-2">Thiếu (missing) — {missingList.length}</div>
              <ul className="text-sm max-h-72 overflow-auto list-disc pl-5">
                {missingList.map((p, i) => <li key={`m-${i}`}>{p}</li>)}
              </ul>
            </div>
            <div className="rounded border p-3">
              <div className="font-semibold mb-2">Không dùng (unused) — {unusedList.length}</div>
              <ul className="text-sm max-h-72 overflow-auto list-disc pl-5">
                {unusedList.map((p, i) => <li key={`u-${i}`}>{p}</li>)}
              </ul>
            </div>
          </section>
        </>
      )}

      {tab === "access" && (
        <>
          <section className="space-y-4">
            <div className="text-sm text-gray-600">
              Cấu hình quyền theo <code>sourceNote</code>:<br/>
              <b>A</b> = 過去問 / Đề cũ ・ <b>B</b> = 練習問題 / Đề luyện tập ・ <b>C</b> = 厳選問題 / Sít Rịt
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">Emails (mỗi dòng 1 email)</div>
                <textarea
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  placeholder="student1@example.com\nstudent2@example.com"
                  className="w-full h-40 border rounded p-2 text-sm"
                />
              </div>
              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">UIDs (mỗi dòng 1 UID)</div>
                <textarea
                  value={uidsText}
                  onChange={(e) => setUidsText(e.target.value)}
                  placeholder="uid_abc123\nuid_def456"
                  className="w-full h-40 border rounded p-2 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowB} onChange={e => setAllowB(e.target.checked)} /> Allow B (練習問題)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowC} onChange={e => setAllowC(e.target.checked)} /> Allow C (厳選問題)
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setAccessMsg('Đang tải...');
                  try {
                    const db = getFirestore();
                    const ref = doc(db, 'config/access/sourceNote');
                    const snap = await getDoc(ref);
                    if (snap.exists()) {
                      const data = snap.data() as any;
                      const emails = Object.keys(data.allowByEmail || {});
                      const uids = Object.keys(data.allowByUid || {});
                      setEmailsText(emails.join('\n'));
                      setUidsText(uids.join('\n'));
                    } else {
                      setEmailsText('');
                      setUidsText('');
                    }
                    setAccessMsg('Đã tải cấu hình.');
                  } catch (e: any) {
                    setAccessMsg('Lỗi tải: ' + (e?.message || ''));
                  }
                }}
                className="px-4 py-2 rounded border bg-white"
              >
                Tải cấu hình
              </button>

              <button
                onClick={async () => {
                  setAccessMsg('Đang lưu...');
                  try {
                    const toLines = (t: string) => t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                    const emails = toLines(emailsText);
                    const uids = toLines(uidsText);
                    const db = getFirestore();

                    const allowByEmail: Record<string, ('B'|'C')[]> = {};
                    const allowByUid: Record<string, ('B'|'C')[]> = {};
                    const grants: ('B'|'C')[] = [];
                    if (allowB) grants.push('B');
                    if (allowC) grants.push('C');

                    emails.forEach(em => allowByEmail[em] = grants.slice());
                    uids.forEach(id => allowByUid[id] = grants.slice());

                    const ref = doc(db, 'config/access/sourceNote');
                    await setDoc(ref, {
                      defaultAllowed: ['A'],
                      allowByEmail,
                      allowByUid
                    }, { merge: true });

                    setAccessMsg('Đã lưu.');
                  } catch (e: any) {
                    setAccessMsg('Lỗi lưu: ' + (e?.message || ''));
                  }
                }}
                className="px-4 py-2 rounded bg-black text-white"
              >
                Lưu
              </button>

              {accessMsg && <div className="text-sm text-gray-600 self-center">{accessMsg}</div>}
            </div>
          </section>
        </>
      )}

    </main>
  );
}
