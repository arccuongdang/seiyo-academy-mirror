// src/lib/qa/excel.ts
/**
 * =============================================================================
 *  Snapshots loader & helpers (Plan B)
 *  - Đọc public/snapshots/manifest.json và subjects.json
 *  - Chọn snapshot mới nhất theo (courseId, subjectId)
 *  - Helpers cho UI:
 *      * listSubjectsForCourse
 *      * listYearsForSubject
 *      * listSubjectsForYear
 *      * listAvailableYearsForCourse
 *
 *  Ghi chú:
 *  - Tránh phụ thuộc vào các type không được export trong schema.ts
 *    → định nghĩa "type mỏng" cục bộ cho ManifestFileEntry, SubjectsItem.
 * =============================================================================
 */

import type {
  SnapshotManifest,
  SubjectsJSON,
  QuestionSnapshotItem,
} from './schema';

/* =============================================================================
 * SECTION A. Local thin types (giảm phụ thuộc)
 * ========================================================================== */

/** Bản ghi 1 file trong manifest (type mỏng, theo format manifest.json) */
type ThinManifestFileEntry = {
  courseId: string;
  subjectId: string;
  path: string;        // đường dẫn tương đối bên trong /snapshots
  version?: number;    // timestamp/number; càng lớn càng mới
};

/** Bản ghi môn (type mỏng theo subjects.json) */
export type ThinSubjectsItem = {
  courseId: string;
  subjectId: string;
  nameJA?: string;
  nameVI?: string;
  descriptionJA?: string;  // <-- thêm
  descriptionVI?: string;  // <-- thêm 
  order?: number;
};

/* =============================================================================
 * SECTION B. Constants & in-memory caches
 * ========================================================================== */

const SNAPSHOT_BASE = '/snapshots'; // served from public/snapshots/*
const manifestCache: { value: SnapshotManifest | null } = { value: null };
const subjectsCache: { value: SubjectsJSON | null } = { value: null };
const rawCache = new Map<string, QuestionSnapshotItem[]>(); // key: `${courseId}:${subjectId}`

/* =============================================================================
 * SECTION C. Low-level fetchers
 * ========================================================================== */

async function fetchJSON<T = any>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Fetch failed ${path}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Load manifest.json (cached in-memory) */
export async function loadManifest(): Promise<SnapshotManifest> {
  if (manifestCache.value) return manifestCache.value;
  const data = await fetchJSON<SnapshotManifest>(`${SNAPSHOT_BASE}/manifest.json`);
  manifestCache.value = data;
  return data;
}

/** Load subjects.json (cached in-memory) */
export async function loadSubjectsJson(): Promise<SubjectsJSON> {
  if (subjectsCache.value) return subjectsCache.value;
  const data = await fetchJSON<SubjectsJSON>(`${SNAPSHOT_BASE}/subjects.json`);
  subjectsCache.value = data;
  return data;
}

/* =============================================================================
 * SECTION D. Subjects helpers
 * ========================================================================== */

/** Liệt kê các môn của 1 khóa theo subjects.json, sắp theo 'order' rồi subjectId */
export function listSubjectsForCourse(courseId: string, subjectsJson: SubjectsJSON): ThinSubjectsItem[] {
  const items = (subjectsJson.items || []).filter((it: any) => it.courseId === courseId);
  const thin: ThinSubjectsItem[] = items.map((it: any) => ({
    courseId: it.courseId,
    subjectId: it.subjectId,
    nameJA: it.nameJA,
    nameVI: it.nameVI,
    descriptionJA: it.descriptionJA,   // <-- thêm
    descriptionVI: it.descriptionVI,   // <-- thêm
    order: it.order,
  }));
  return thin.sort((a, b) => {
    const ao = a.order ?? 9999;
    const bo = b.order ?? 9999;
    if (ao !== bo) return ao - bo;
    return a.subjectId.localeCompare(b.subjectId);
  });
}

/** Tìm metadata 1 môn (type mỏng) */
export function findSubjectMeta(
  courseId: string,
  subjectId: string,
  subjectsJson?: SubjectsJSON | null
): ThinSubjectsItem | null {
  const list: any[] = subjectsJson?.items || subjectsCache.value?.items || [];
  const found = list.find((it) => it.courseId === courseId && it.subjectId === subjectId);
  return found
    ? {
        courseId: found.courseId,
        subjectId: found.subjectId,
        nameJA: found.nameJA,
        nameVI: found.nameVI,
        descriptionJA: found.descriptionJA,  // <-- thêm
        descriptionVI: found.descriptionVI,  // <-- thêm
        order: found.order,
      }
    : null;
}

/* =============================================================================
 * SECTION E. Snapshot file selection & RAW loader
 * ========================================================================== */

/** Trích các file của (courseId, subjectId) từ manifest → mảng thin entries */
function collectFilesFor(courseId: string, subjectId: string, manifest: SnapshotManifest): ThinManifestFileEntry[] {
  const files = (manifest.files || []) as any[];
  const filtered = files.filter((f) => f.courseId === courseId && f.subjectId === subjectId);
  return filtered.map((f) => ({
    courseId: String(f.courseId),
    subjectId: String(f.subjectId),
    path: String(f.path),
    version: typeof f.version === 'number' ? f.version : undefined,
  }));
}

/** Chọn entry snapshot mới nhất cho (courseId, subjectId) từ manifest.files */
export function selectLatestFile(
  courseId: string,
  subjectId: string,
  manifest: SnapshotManifest
): ThinManifestFileEntry | null {
  const files = collectFilesFor(courseId, subjectId, manifest);
  if (!files.length) return null;
  files.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return files[0];
}

/** Tải RAW snapshot mới nhất → mảng QuestionSnapshotItem */
export async function loadRawQuestionsFor(
  courseId: string,
  subjectId: string
): Promise<QuestionSnapshotItem[]> {
  const cacheKey = `${courseId}:${subjectId}`;
  if (rawCache.has(cacheKey)) return rawCache.get(cacheKey)!;

  const manifest = await loadManifest();
  const file = selectLatestFile(courseId, subjectId, manifest);
  if (!file) {
    rawCache.set(cacheKey, []);
    return [];
  }

  // path trong manifest là tương đối với /snapshots
  const url = `${SNAPSHOT_BASE}/${file.path}`;
  const data = await fetchJSON<QuestionSnapshotItem[] | { items: QuestionSnapshotItem[] }>(url);

  // Chấp nhận 2 format: array thuần, hoặc { items: [...] }
  const arr: QuestionSnapshotItem[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any).items)
    ? ((data as any).items as QuestionSnapshotItem[])
    : [];

  rawCache.set(cacheKey, arr);
  return arr;
}

/* =============================================================================
 * SECTION F. Years & subjects availability (dùng cho Courses/Filter)
 * ========================================================================== */

/**
 * Trả về danh sách năm (giảm dần) có thật trong snapshot mới nhất của (course, subject).
 * Đọc trực tiếp từ field examYear của từng câu hỏi.
 */
export async function listYearsForSubject(
  courseId: string,
  subjectId: string,
  manifest?: SnapshotManifest
): Promise<number[]> {
  // manifest arg optional để caller đã load sẵn thì truyền vào cho tiết kiệm (không bắt buộc)
  const raws = await loadRawQuestionsFor(courseId, subjectId);
  const set = new Set<number>();
  for (const q of raws) {
    const y = Number((q as any).examYear);
    if (Number.isFinite(y)) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

/**
 * Liệt kê các môn (type mỏng) có ít nhất 1 câu hỏi của (course, year).
 * Duyệt qua toàn bộ môn của khóa và kiểm tra snapshot mới nhất từng môn.
 */
export async function listSubjectsForYear(
  courseId: string,
  year: number,
  manifest?: SnapshotManifest,
  subjectsJson?: SubjectsJSON
): Promise<ThinSubjectsItem[]> {
  const sj = subjectsJson ?? (await loadSubjectsJson());
  const subjects = listSubjectsForCourse(courseId, sj); // đã trả về type mỏng

  const result: ThinSubjectsItem[] = [];
  for (const s of subjects) {
    const raws = await loadRawQuestionsFor(courseId, s.subjectId);
    if (raws.some((q) => Number((q as any).examYear) === year)) {
      result.push(s);
    }
  }
  return result;
}

/**
 * Tập hợp tất cả năm (giảm dần) xuất hiện trong khóa (gộp qua mọi môn).
 * Hữu ích cho Courses page để render năm thật.
 */
export async function listAvailableYearsForCourse(
  courseId: string,
  manifest?: SnapshotManifest,
  subjectsJson?: SubjectsJSON
): Promise<number[]> {
  const sj = subjectsJson ?? (await loadSubjectsJson());
  const subjects = listSubjectsForCourse(courseId, sj);

  const set = new Set<number>();
  for (const s of subjects) {
    const years = await listYearsForSubject(courseId, s.subjectId);
    years.forEach((y) => set.add(y));
  }
  return Array.from(set).sort((a, b) => b - a);
}

/* =============================================================================
 * SECTION G. Convenience helpers for Filter logic
 * ========================================================================== */

/** Lấy N năm gần nhất từ danh sách đã có (nếu ít hơn N thì trả tất cả) */
export function pickLastYears(allYears: number[], n: 5 | 10): number[] {
  if (!allYears?.length) return [];
  return allYears.slice(0, n);
}
