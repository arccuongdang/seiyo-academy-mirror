/**
 * ============================================================================
 *  Seiyo Academy – Normalizers (Subjects sheet → subjects.json)
 *  Strategy: Option B (RAW JA/VI snapshots)
 * ----------------------------------------------------------------------------
 *  Public API:
 *   - buildSubjectsMeta(rows) → SubjectsJSON
 *   - validateSubjectsRows(rows) → { errors, warns }
 *   - helpers: normalizeCourseId, normalizeSubjectId
 * ============================================================================
 */

import type {
  SubjectsJSON,
  SubjectMeta,
  CourseId,
  SubjectId,
  UnixMillis,
} from './schema';

/* =============================================================================
 * SECTION 1. Row shape & utils
 *  - Linh hoạt theo Excel: chấp nhận nhiều tên cột phổ biến
 * ========================================================================== */

export type SubjectRow = Record<string, unknown>;

function s(v: unknown): string {
  return (v ?? '').toString().trim();
}

function toInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Chuẩn hoá ID về dạng viết hoa không space */
export function normalizeCourseId(v: unknown): CourseId {
  return s(v).replace(/\s+/g, '').toUpperCase() as CourseId;
}
export function normalizeSubjectId(v: unknown): SubjectId {
  return s(v).replace(/\s+/g, '').toUpperCase() as SubjectId;
}

/** Pick theo nhiều alias tên cột thường gặp */
function pickField(row: SubjectRow, keys: string[]): string {
  for (const k of keys) {
    const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

/* =============================================================================
 * SECTION 2. Core: normalize one row → SubjectMeta | null
 * ========================================================================== */

function normalizeSubjectRow(row: SubjectRow): SubjectMeta | null {
  // ID & tên (chấp nhận nhiều alias)
  const courseId = normalizeCourseId(
    pickField(row, ['courseId', 'Course', 'COURSE', 'コースID'])
  );
  const subjectId = normalizeSubjectId(
    pickField(row, ['subjectId', 'Subject', 'SUBJECT', '科目ID'])
  );

  const nameJA =
    pickField(row, ['nameJA', 'subjectNameJA', 'NameJA', '科目名JA']) ||
    pickField(row, ['name', 'subjectName', '科目名']); // fallback nếu chỉ có 1 cột tên

  const nameVI =
    pickField(row, ['nameVI', 'subjectNameVI', 'NameVI', '科目名VI']) || '';

  const order = toInt(
    pickField(row, ['order', 'displayOrder', 'sort', '順序'])
  );

  const descriptionJA = pickField(row, ['descriptionJA', 'descJA', '説明JA']);
  const descriptionVI = pickField(row, ['descriptionVI', 'descVI', '説明VI']);

  // Thiếu tối thiểu thì bỏ
  if (!courseId || !subjectId || !nameJA) return null;

  const meta: SubjectMeta = {
    courseId,
    subjectId,
    nameJA,
  };

  if (nameVI) meta.nameVI = nameVI;
  if (typeof order === 'number') meta.order = order;
  if (descriptionJA) meta.descriptionJA = descriptionJA;
  if (descriptionVI) meta.descriptionVI = descriptionVI;

  return meta;
}

/* =============================================================================
 * SECTION 3. Validate subjects rows (nhẹ, phục vụ Admin UI)
 *  - Kiểm tra thiếu field, trùng khoá, order lỗi
 * ========================================================================== */

export type SubjectsValidationFinding = {
  level: 'error' | 'warn';
  code:
    | 'MISSING_FIELD'
    | 'DUPLICATE_SUBJECT'
    | 'BAD_ORDER'
    | 'EMPTY_FILE';
  message: string;
  atRow?: number; // 1-based index trong Excel (nếu biết)
  key?: string;   // "COURSE__SUBJECT"
};

export function validateSubjectsRows(rows: SubjectRow[]): {
  errors: SubjectsValidationFinding[];
  warns: SubjectsValidationFinding[];
} {
  const errors: SubjectsValidationFinding[] = [];
  const warns: SubjectsValidationFinding[] = [];

  if (!rows || rows.length === 0) {
    errors.push({
      level: 'error',
      code: 'EMPTY_FILE',
      message: 'No subject rows found in sheet "Subjects".',
    });
    return { errors, warns };
  }

  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const atRow = idx + 2; // nếu hàng 1 là header
    const courseId = normalizeCourseId(
      pickField(row, ['courseId', 'Course', 'COURSE', 'コースID'])
    );
    const subjectId = normalizeSubjectId(
      pickField(row, ['subjectId', 'Subject', 'SUBJECT', '科目ID'])
    );
    const nameJA =
      pickField(row, ['nameJA', 'subjectNameJA', 'NameJA', '科目名JA']) ||
      pickField(row, ['name', 'subjectName', '科目名']);

    if (!courseId || !subjectId || !nameJA) {
      errors.push({
        level: 'error',
        code: 'MISSING_FIELD',
        message: `Missing required field(s). Required: courseId, subjectId, nameJA.`,
        atRow,
      });
      return;
    }

    const key = `${courseId}__${subjectId}`;
    if (seen.has(key)) {
      errors.push({
        level: 'error',
        code: 'DUPLICATE_SUBJECT',
        message: `Duplicated subject key: ${key}`,
        atRow,
        key,
      });
    } else {
      seen.add(key);
    }

    const orderStr =
      pickField(row, ['order', 'displayOrder', 'sort', '順序']) || '';
    if (orderStr) {
      const n = toInt(orderStr);
      if (n === undefined) {
        warns.push({
          level: 'warn',
          code: 'BAD_ORDER',
          message: `Invalid "order": "${orderStr}". Expected integer.`,
          atRow,
          key,
        });
      }
    }
  });

  return { errors, warns };
}

/* =============================================================================
 * SECTION 4. Build subjects.json
 *  - Lọc null, dedupe, sort theo order nếu có
 * ========================================================================== */

export function buildSubjectsMeta(rows: SubjectRow[]): SubjectsJSON {
  const normalized: SubjectMeta[] = [];
  const seen = new Set<string>();

  for (const row of rows ?? []) {
    const meta = normalizeSubjectRow(row);
    if (!meta) continue;

    const key = `${meta.courseId}__${meta.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push(meta);
  }

  // sort theo order (nếu không có order → cuối)
  normalized.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));

  const out: SubjectsJSON = {
    version: Date.now() as UnixMillis,
    items: normalized,
  };

  return out;
}

/* =============================================================================
 * SECTION 5. Optional helpers (merge/update)
 * ========================================================================== */

/** Gộp 2 subjects.json (ưu tiên next theo key courseId__subjectId; order giữ theo next nếu có) */
export function mergeSubjects(prev: SubjectsJSON, next: SubjectsJSON): SubjectsJSON {
  const map = new Map<string, SubjectMeta>();
  for (const it of prev.items) map.set(`${it.courseId}__${it.subjectId}`, it);
  for (const it of next.items) map.set(`${it.courseId}__${it.subjectId}`, it);

  const items = Array.from(map.values());
  items.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));

  return {
    version: next.version || Date.now(),
    items,
  };
}
