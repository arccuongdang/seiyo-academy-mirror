/**
 * ============================================================================
 *  Seiyo Academy – Data Loader (RAW snapshots loader)
 *  Strategy: Option B (RAW JA/VI with fixed 5 options) – read from manifest
 * ----------------------------------------------------------------------------
 *  Public API:
 *   - loadManifest()                             → SnapshotManifest
 *   - loadSubjectsJson()                         → SubjectsJSON
 *   - pickLatestFile(manifest, courseId, subj)   → SnapshotManifestEntry | null
 *   - loadRawQuestionsFor(courseId, subjectId)   → QuestionSnapshotItem[]
 *   - loadAllRawQuestions(manifest?)             → QuestionSnapshotItem[]
 *   - listSubjectsForCourse(courseId, subjects)  → SubjectMeta[]
 * ============================================================================
 */

import type {
  SnapshotManifest,
  SnapshotManifestEntry,
  SubjectsJSON,
  SubjectMeta,
  QuestionSnapshotItem,
  CourseId,
  SubjectId,
} from './schema';

/* =============================================================================
 * SECTION 1. Constants & simple memo cache
 * ========================================================================== */

/** Gốc public/snapshots – ở runtime mọi file tĩnh sẽ phục vụ dưới URL này */
const SNAPSHOTS_BASE = '/snapshots';

/** Memo cache rất nhẹ để tránh fetch lặp khi client-side chuyển trang */
const _memo = {
  manifest: null as SnapshotManifest | null,
  subjects: null as SubjectsJSON | null,
  files: new Map<string, any>(), // key = absolute path like "/snapshots/KTS2/TK-questions.v*.json"
};

/* =============================================================================
 * SECTION 2. Fetch helpers (safe JSON fetch with basic errors)
 * ========================================================================== */

async function fetchJSON<T>(path: string): Promise<T> {
  const url = path.startsWith('/') ? path : `${SNAPSHOTS_BASE}/${path}`;
  // memo file payloads
  if (_memo.files.has(url)) return _memo.files.get(url) as T;

  const res = await fetch(url, { cache: 'force-cache' }); // let Next.js static file caching do the work
  if (!res.ok) {
    throw new Error(`Failed to fetch JSON: ${url} (status ${res.status})`);
  }
  const data = (await res.json()) as T;
  _memo.files.set(url, data);
  return data;
}

/* =============================================================================
 * SECTION 3. Loaders for manifest & subjects
 * ========================================================================== */

/** Load snapshots/manifest.json (memoized) */
export async function loadManifest(): Promise<SnapshotManifest> {
  if (_memo.manifest) return _memo.manifest;
  const data = await fetchJSON<SnapshotManifest>(`${SNAPSHOTS_BASE}/manifest.json`);
  _memo.manifest = data;
  return data;
}

/** Load snapshots/subjects.json (memoized) */
export async function loadSubjectsJson(): Promise<SubjectsJSON> {
  if (_memo.subjects) return _memo.subjects;
  const data = await fetchJSON<SubjectsJSON>(`${SNAPSHOTS_BASE}/subjects.json`);
  _memo.subjects = data;
  return data;
}

/* =============================================================================
 * SECTION 4. Manifest utilities
 * ========================================================================== */

/**
 * Pick latest file entry for a given course & subject by version (largest).
 * Return null if not found.
 */
export function pickLatestFile(
  manifest: SnapshotManifest,
  courseId: CourseId,
  subjectId: SubjectId
): SnapshotManifestEntry | null {
  const candidates = manifest.files.filter(
    (f) => f.courseId === courseId && f.subjectId === subjectId
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return candidates[0] ?? null;
}

/* =============================================================================
 * SECTION 5. Load RAW questions
 * ========================================================================== */

/**
 * Load RAW questions (QuestionSnapshotItem[]) for given (courseId, subjectId).
 * - Tự động chọn file mới nhất trong manifest.
 * - Ném lỗi nếu không tìm thấy entry hoặc file fetch lỗi.
 */
export async function loadRawQuestionsFor(
  courseId: CourseId,
  subjectId: SubjectId,
  manifest?: SnapshotManifest
): Promise<QuestionSnapshotItem[]> {
  const m = manifest ?? (await loadManifest());
  const latest = pickLatestFile(m, courseId, subjectId);
  if (!latest) {
    throw new Error(`No snapshot file found for ${courseId}/${subjectId}`);
  }
  // latest.path là đường dẫn tương đối dưới "/snapshots"
  const absPath = `${SNAPSHOTS_BASE}/${latest.path.replace(/^\/+/, '')}`;
  const data = await fetchJSON<QuestionSnapshotItem[]>(absPath);
  // Safety: bảo đảm mảng
  return Array.isArray(data) ? data : [];
}

/**
 * Load tất cả RAW questions của toàn bộ entries trong manifest (gộp).
 * - Chỉ dùng khi cần tạo ngân hàng câu hỏi tổng hợp (có thể nặng).
 * - Có thể truyền manifest vào để tái dụng/tiết kiệm fetch.
 */
export async function loadAllRawQuestions(
  manifest?: SnapshotManifest
): Promise<QuestionSnapshotItem[]> {
  const m = manifest ?? (await loadManifest());
  const entries = m.files ?? [];
  const all: QuestionSnapshotItem[][] = await Promise.all(
    entries.map(async (entry) => {
      const absPath = `${SNAPSHOTS_BASE}/${entry.path.replace(/^\/+/, '')}`;
      try {
        const data = await fetchJSON<QuestionSnapshotItem[]>(absPath);
        return Array.isArray(data) ? data : [];
      } catch {
        // Nếu một file lỗi, bỏ qua file đó để tiếp tục các file khác
        return [];
      }
    })
  );
  return all.flat();
}

/* =============================================================================
 * SECTION 6. Convenience helpers for Subjects
 * ========================================================================== */

/** Trả về danh sách môn thuộc 1 course (đã sort theo order nếu có) */
export function listSubjectsForCourse(
  courseId: CourseId,
  subjects: SubjectsJSON
): SubjectMeta[] {
  const items = subjects.items.filter((s) => s.courseId === courseId);
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items;
}

/** Tìm SubjectMeta theo (courseId, subjectId) */
export function findSubjectMeta(
  courseId: CourseId,
  subjectId: SubjectId,
  subjects: SubjectsJSON
): SubjectMeta | undefined {
  return subjects.items.find((s) => s.courseId === courseId && s.subjectId === subjectId);
}

/* =============================================================================
 * SECTION 7. Type guards (tuỳ chọn, nhẹ nhàng)
 *  - Có thể mở rộng để kiểm tra shape của QuestionSnapshotItem nếu cần chặt hơn
 * ========================================================================== */

export function isQuestionSnapshotItemArray(
  v: unknown
): v is QuestionSnapshotItem[] {
  return Array.isArray(v);
}
