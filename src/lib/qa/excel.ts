
/**
 * Snapshots helpers (patched):
 * - Works even if subjects.json has NO `courses` array (infers from `items[]`)
 * - getCourseDisplayNameJA/VI fall back to a local mapping (KTS2)
 */

import type {
  SnapshotManifest,
  SubjectsJSON,
  QuestionSnapshotItem,
  TagsIndex,
  TagDef,
} from './schema';

export type ThinCourse = {
  courseId: string;
  courseNameJA?: string;
  courseNameVI?: string;
  active?: boolean;
};

export type ThinSubjectsItem = {
  courseId: string;
  subjectId: string;
  nameJA?: string;
  nameVI?: string;
  descriptionJA?: string;
  descriptionVI?: string;
  order?: number;
};

const SNAPSHOT_BASE = '/snapshots';
const manifestCache: { value: SnapshotManifest | null } = { value: null };
const subjectsCache: { value: SubjectsJSON | null } = { value: null };
const rawCache = new Map<string, QuestionSnapshotItem[]>();

/** Optional fallback names if Courses sheet is absent */
const COURSE_NAME_MAP: Record<string, { JA: string; VI?: string }> = {
  KTS2: { JA: '２級建築士', VI: 'Kiến trúc sư cấp 2' },
  // Add more defaults if needed
};

async function fetchJSON<T = any>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed ${path}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function loadManifest(): Promise<SnapshotManifest> {
  if (manifestCache.value) return manifestCache.value;
  const data = await fetchJSON<SnapshotManifest>(`${SNAPSHOT_BASE}/manifest.json`);
  manifestCache.value = data;
  return data;
}

export async function loadSubjectsJson(): Promise<SubjectsJSON> {
  if (subjectsCache.value) return subjectsCache.value;
  const data = await fetchJSON<SubjectsJSON>(`${SNAPSHOT_BASE}/subjects.json`);
  subjectsCache.value = data;
  return data;
}

/** Era labels */
export function eraJP(year: number): string {
  if (year >= 2019) return `R${year - 2018}`;      // Reiwa
  if (year >= 1989) return `H${year - 1988}`;      // Heisei
  if (year >= 1926) return `S${year - 1925}`;      // Showa
  return `${year}`;
}

/** Courses */
function coerceBool(v: any): boolean {
  if (v === true) return true;
  const s = String(v || '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}

/**
 * Prefer sj.courses when present; otherwise infer from sj.items[] (subjects list).
 * Inferred courses are considered active=true and get names from fallback map.
 */
export function listActiveCourses(subjectsJson?: SubjectsJSON | null): ThinCourse[] {
  const sj: any = subjectsJson || subjectsCache.value || {};
  const out: ThinCourse[] = [];

  if (Array.isArray(sj.courses) && sj.courses.length > 0) {
    for (const r of sj.courses) {
      const active = coerceBool(r?.active ?? true);
      if (!active) continue;
      out.push({
        courseId: String(r.courseId),
        courseNameJA: r.courseNameJA || r.nameJA || COURSE_NAME_MAP[String(r.courseId)]?.JA,
        courseNameVI: r.courseNameVI || r.nameVI || COURSE_NAME_MAP[String(r.courseId)]?.VI,
        active: true,
      });
    }
    return out;
  }

  // Fallback: infer unique courseIds from items[]
  const items: any[] = Array.isArray(sj.items) ? sj.items : [];
  const uniq = Array.from(new Set(items.map(it => String(it.courseId))).values());
  for (const courseId of uniq) {
    out.push({
      courseId,
      courseNameJA: COURSE_NAME_MAP[courseId]?.JA || courseId,
      courseNameVI: COURSE_NAME_MAP[courseId]?.VI,
      active: true,
    });
  }
  return out;
}

export function getCourseDisplayNameJA(courseId: string, subjectsJson?: SubjectsJSON | null): string | null {
  const list = listActiveCourses(subjectsJson);
  const hit = list.find(c => c.courseId === courseId);
  return (hit?.courseNameJA || COURSE_NAME_MAP[courseId]?.JA || null);
}
export function getCourseDisplayNameVI(courseId: string, subjectsJson?: SubjectsJSON | null): string | null {
  const list = listActiveCourses(subjectsJson);
  const hit = list.find(c => c.courseId === courseId);
  return (hit?.courseNameVI || COURSE_NAME_MAP[courseId]?.VI || null);
}

/** Subjects */
export function listSubjectsForCourse(courseId: string, subjectsJson: SubjectsJSON): ThinSubjectsItem[] {
  const items = (subjectsJson.items || []).filter((it: any) => it.courseId === courseId);
  const thin: ThinSubjectsItem[] = items.map((it: any) => ({
    courseId: it.courseId,
    subjectId: it.subjectId,
    nameJA: it.nameJA,
    nameVI: it.nameVI,
    descriptionJA: it.descriptionJA,
    descriptionVI: it.descriptionVI,
    order: it.order,
  }));
  return thin.sort((a, b) => {
    const ao = a.order ?? 9999;
    const bo = b.order ?? 9999;
    if (ao !== bo) return ao - bo;
    return a.subjectId.localeCompare(b.subjectId);
  });
}

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
        descriptionJA: found.descriptionJA,
        descriptionVI: found.descriptionVI,
        order: found.order,
      }
    : null;
}

/* Snapshot & raw loaders */

type ThinManifestFileEntry = { courseId: string; subjectId: string; path: string; version?: number; };

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

export function selectLatestFile(courseId: string, subjectId: string, manifest: SnapshotManifest): ThinManifestFileEntry | null {
  const files = collectFilesFor(courseId, subjectId, manifest);
  if (!files.length) return null;
  files.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return files[0];
}

async function fetchJSONSnapshot<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json() as Promise<T>;
}

export async function loadRawQuestionsFor(courseId: string, subjectId: string): Promise<QuestionSnapshotItem[]> {
  const cacheKey = `${courseId}:${subjectId}`;
  if (rawCache.has(cacheKey)) return rawCache.get(cacheKey)!;

  const manifest = await loadManifest();
  const file = selectLatestFile(courseId, subjectId, manifest);
  if (!file) {
    rawCache.set(cacheKey, []);
    return [];
  }
  const url = `${SNAPSHOT_BASE}/${file.path}`;
  const data = await fetchJSONSnapshot<QuestionSnapshotItem[] | { items: QuestionSnapshotItem[] }>(url);
  const arr: QuestionSnapshotItem[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any).items)
    ? ((data as any).items as QuestionSnapshotItem[])
    : [];

  rawCache.set(cacheKey, arr);
  return arr;
}

export async function listYearsForSubject(courseId: string, subjectId: string): Promise<number[]> {
  const raws = await loadRawQuestionsFor(courseId, subjectId);
  const set = new Set<number>();
  for (const q of raws) {
    const y = Number((q as any).examYear);
    if (Number.isFinite(y)) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

export async function listSubjectsForYear(courseId: string, year: number, subjectsJson?: SubjectsJSON): Promise<ThinSubjectsItem[]> {
  const sj = subjectsJson ?? (await loadSubjectsJson());
  const subjects = listSubjectsForCourse(courseId, sj);
  const result: ThinSubjectsItem[] = [];
  for (const s of subjects) {
    const raws = await loadRawQuestionsFor(courseId, s.subjectId);
    if (raws.some((q) => Number((q as any).examYear) === year)) result.push(s);
  }
  return result;
}

export async function listAvailableYearsForCourse(courseId: string, subjectsJson?: SubjectsJSON): Promise<number[]> {
  const sj = subjectsJson ?? (await loadSubjectsJson());
  const subjects = listSubjectsForCourse(courseId, sj);
  const set = new Set<number>();
  for (const s of subjects) {
    const years = await listYearsForSubject(courseId, s.subjectId);
    years.forEach((y) => set.add(y));
  }
  return Array.from(set).sort((a, b) => b - a);
}

/* Admin: TagsIndex helpers */

import * as XLSX from 'xlsx';
export type TagDefLocal = TagDef;
export type TagsIndexLocal = TagsIndex;

export function buildTagsIndexFromSheet(ws: XLSX.WorkSheet): TagsIndex {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
  const H = rows.length;
  const W = Math.max(...rows.map(r => r.length));

  type Col = { course: string; subject: string; lang: string; j: number };
  const cols: Col[] = [];
  for (let j = 0; j < W; j++) {
    const course = (rows[0]?.[j] || '').trim();
    const subject = (rows[1]?.[j] || '').trim();
    const lang = (rows[2]?.[j] || '').trim().toUpperCase();
    if (!course || !subject) continue;
    if (subject.toLowerCase() === 'no') continue;
    cols.push({ course, subject, lang, j });
  }

  const groups = new Map<string, { ja?: Col; vi?: Col }>();
  for (const c of cols) {
    const key = `${c.course}__${c.subject}`;
    const g = groups.get(key) || {};
    if (c.lang === 'JA' || !g.ja) g.ja = c;
    if (c.lang === 'JV' || c.lang === 'VI') g.vi = c;
    groups.set(key, g);
  }

  const out: TagsIndex = {};
  for (const [key, g] of groups) {
    const [courseId, subjectId] = key.split('__');
    out[courseId] ??= {};
    const arr: TagDef[] = [];
    for (let i = 3; i < H; i++) {
      const nameJA = g.ja ? (rows[i]?.[g.ja.j] || '').trim() : '';
      const nameVI = g.vi ? (rows[i]?.[g.vi.j] || '').trim() : '';
      if (!nameJA && !nameVI) continue;
      const id = `${subjectId}-${i - 3}`;
      arr.push({ id, nameJA, nameVI: nameVI || undefined });
    }
    out[courseId][subjectId] = arr;
  }
  return out;
}

export function parseTagsIndexFromWorkbook(wb: XLSX.WorkBook): TagsIndex {
  const ws = wb.Sheets['TagsList'] || wb.Sheets['Taglists'];
  return ws ? buildTagsIndexFromSheet(ws) : {};
}

export function pickTagIdsFromIndex(tagsIndex: TagsIndex | null | undefined, courseId: string, subjectId: string): string[] {
  const arr = tagsIndex?.[courseId]?.[subjectId];
  if (!Array.isArray(arr)) return [];
  return arr.map(t => String(t.id)).filter(Boolean);
}
