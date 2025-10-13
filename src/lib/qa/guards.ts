/**
 * ============================================================================
 *  Seiyo Academy – Data Guards / Validators
 *  Input:  QuestionForValidate[]  (tối thiểu: courseId, subjectId, examYear, options[{isAnswer}], id?/questionId?)
 *  Output: { errors, warns, issues }  (chuẩn hóa, kèm questionId/id để map hiển thị)
 * ----------------------------------------------------------------------------
 *  Quy tắc (tối thiểu, an toàn):
 *   - ERR  NO_CORRECT:        không có đáp án đúng
 *   - ERR  TOO_MANY_CORRECT:  có hơn 1 đáp án đúng (single-choice)
 *   - ERR  EMPTY_OPTIONS:     không có phương án nào
 *   - ERR  MISSING_FIELD:     thiếu courseId/subjectId/examYear
 *   - ERR  BAD_EXAM_YEAR:     examYear không phải số 4 chữ số (0000 cho unknown vẫn hợp lệ)
 *   - WARN OPTIONS_OUT_OF_RANGE: số phương án không nằm trong [1..5]
 *   - WARN DUPLICATE_QUESTION:  trùng id/questionId (khuyến nghị unique)
 *
 *  Lưu ý:
 *   - Validator này không chạm text/ảnh/ngôn ngữ; chỉ kiểm các rule về cấu trúc/đáp án.
 *   - Có thể mở rộng thêm rule sau (ví dụ: bắt buộc >=2 phương án) → chuyển WARN/ERR tuỳ policy.
 * ============================================================================
 */

import type { QuestionForValidate } from './schema';

/* =============================================================================
 * SECTION 1. Types of validation results
 * ========================================================================== */

export type ValidationLevel = 'error' | 'warn';

export type ValidationErrorCode =
  | 'NO_CORRECT'
  | 'TOO_MANY_CORRECT'
  | 'EMPTY_OPTIONS'
  | 'MISSING_FIELD'
  | 'BAD_EXAM_YEAR';

export type ValidationWarnCode =
  | 'OPTIONS_OUT_OF_RANGE'
  | 'DUPLICATE_QUESTION';

export interface BaseFinding {
  level: ValidationLevel;
  message: string;
  /** Optional identification to map finding to a question */
  id?: string;
  questionId?: string;
}

export interface ValidationError extends BaseFinding {
  level: 'error';
  code: ValidationErrorCode;
  /** số lượng đáp án đúng (chỉ dùng cho TOO_MANY_CORRECT) */
  count?: number;
}

export interface ValidationWarn extends BaseFinding {
  level: 'warn';
  code: ValidationWarnCode;
  /** số phương án phát hiện (dùng cho OPTIONS_OUT_OF_RANGE) */
  count?: number;
}

export type ValidationIssue = ValidationError | ValidationWarn;

export interface ValidationResult {
  errors: ValidationError[];
  warns: ValidationWarn[];
  /** chừa đường mở rộng nếu sau này cần phân loại thêm */
  issues: ValidationIssue[];
}

/* =============================================================================
 * SECTION 2. Helpers
 * ========================================================================== */

function idOf(q: QuestionForValidate): { id?: string; questionId?: string } {
  const id = q.id ?? undefined;
  const questionId = q.questionId ?? undefined;
  return { id, questionId };
}

function isFourDigitYear(y: number): boolean {
  return Number.isInteger(y) && y >= 0 && y <= 9999 && String(y).length === 4;
}

/* =============================================================================
 * SECTION 3. Main validator
 * ========================================================================== */

/**
 * Validate danh sách câu hỏi ở mức data-level.
 * - Không đụng tới text/ảnh/JA-VI.
 * - Mục tiêu: dữ liệu an toàn để publish RAW snapshot (Option B).
 */
export function validateQuestions(list: QuestionForValidate[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warns: ValidationWarn[] = [];

  // Track trùng lặp id/questionId
  const seenIds = new Set<string>();
  const seenQIds = new Set<string>();

  for (const q of list) {
    const { id, questionId } = idOf(q);

    // --- [E1] Thiếu trường bắt buộc ----------------------------------------------------
    const missing: string[] = [];
    if (!q.courseId) missing.push('courseId');
    if (!q.subjectId) missing.push('subjectId');

    // examYear cho phép string hoặc number: cast ra number (0000 hợp lệ cho unknown)
    const examYearNum =
      typeof q.examYear === 'string'
        ? Number.parseInt(q.examYear, 10)
        : Number(q.examYear);

    if (Number.isNaN(examYearNum)) {
      errors.push({
        level: 'error',
        code: 'BAD_EXAM_YEAR',
        message: `examYear is not a number: "${q.examYear}"`,
        id,
        questionId,
      });
    } else if (!isFourDigitYear(examYearNum)) {
      // Cho phép 0000 làm unknown → vẫn là 4 chữ số nên pass
      errors.push({
        level: 'error',
        code: 'BAD_EXAM_YEAR',
        message: `examYear must be a 4-digit number (0000 allowed). Got: ${examYearNum}`,
        id,
        questionId,
      });
    }

    if (missing.length > 0) {
      errors.push({
        level: 'error',
        code: 'MISSING_FIELD',
        message: `Missing required field(s): ${missing.join(', ')}`,
        id,
        questionId,
      });
    }

    // --- [E2] Kiểm số phương án & số đáp án đúng ---------------------------------------
    const opts = Array.isArray(q.options) ? q.options : [];
    const optCount = opts.length;

    if (optCount === 0) {
      errors.push({
        level: 'error',
        code: 'EMPTY_OPTIONS',
        message: 'No options found.',
        id,
        questionId,
      });
    } else {
      if (optCount < 1 || optCount > 5) {
        warns.push({
          level: 'warn',
          code: 'OPTIONS_OUT_OF_RANGE',
          message: 'Options count should be within [1..5] for snapshots.',
          count: optCount,
          id,
          questionId,
        });
      }

      const correctCount = opts.reduce((acc, o) => acc + (o?.isAnswer ? 1 : 0), 0);

      if (correctCount === 0) {
        errors.push({
          level: 'error',
          code: 'NO_CORRECT',
          message: 'No correct answer marked.',
          id,
          questionId,
        });
      } else if (correctCount > 1) {
        errors.push({
          level: 'error',
          code: 'TOO_MANY_CORRECT',
          message: `Too many correct answers: ${correctCount}. Single-choice expected.`,
          count: correctCount,
          id,
          questionId,
        });
      }
    }

    // --- [W1] Cảnh báo trùng ID/questionId ---------------------------------------------
    if (id) {
      if (seenIds.has(id)) {
        warns.push({
          level: 'warn',
          code: 'DUPLICATE_QUESTION',
          message: `Duplicated id: "${id}"`,
          id,
          questionId,
        });
      } else {
        seenIds.add(id);
      }
    }

    if (questionId) {
      if (seenQIds.has(questionId)) {
        warns.push({
          level: 'warn',
          code: 'DUPLICATE_QUESTION',
          message: `Duplicated questionId: "${questionId}"`,
          id,
          questionId,
        });
      } else {
        seenQIds.add(questionId);
      }
    }
  }

  const issues: ValidationIssue[] = [...errors, ...warns];
  return { errors, warns, issues };
}

/* =============================================================================
 * SECTION 4. (Optional) Utility to summarize result
 *  - Hữu ích nếu Admin Page muốn hiện thống kê nhanh mà không loop lại.
 * ========================================================================== */

export function summarizeValidation(result: ValidationResult) {
  const errByCode = new Map<ValidationErrorCode, number>();
  const warnByCode = new Map<ValidationWarnCode, number>();

  for (const e of result.errors) {
    errByCode.set(e.code, (errByCode.get(e.code) ?? 0) + 1);
  }
  for (const w of result.warns) {
    warnByCode.set(w.code, (warnByCode.get(w.code) ?? 0) + 1);
  }

  return {
    errorTotal: result.errors.length,
    warnTotal: result.warns.length,
    errByCode: Object.fromEntries(errByCode),
    warnByCode: Object.fromEntries(warnByCode),
  };
}
