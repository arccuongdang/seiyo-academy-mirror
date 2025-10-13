/**
 * ============================================================================
 *  Seiyo Academy – Grading helpers (RENDER-based)
 *  Strategy: grade trên QARenderItem.options[] (sau khi RAW → RENDER)
 * ----------------------------------------------------------------------------
 *  Public API:
 *    - gradeSingleChoiceByIndex(selectedIndex, options) → { isCorrect, correctIndexes, multiCorrect }
 *    - grade(items, answers) → GradeResult
 *    - summarize(perQuestion) → GradeSummary
 *    - passByRule(summary, rule?) → { passed, ruleUsed }
 *
 *  Ghi chú:
 *   - Hỗ trợ bank có thể có 1 hoặc >1 đáp án đúng (multi-correct). Kết quả vẫn
 *     chấm đúng nếu selectedIndex ∈ correctIndexes.
 *   - Chỉ số đáp án là chỉ số TRÊN MẢNG options SAU KHI SHUFFLE (ở phía UI).
 * ============================================================================
 */

import type { QARenderItem, QARenderOption } from './schema';

/* =============================================================================
 * SECTION 1. Types
 * ========================================================================== */

export type UserAnswer =
  | { questionId: string; selectedIndex: number | null }
  | [questionId: string, selectedIndex: number | null];

export type PerQuestionResult = {
  questionId: string;
  selectedIndex: number | null; // index trên mảng options đã shuffle
  correctIndexes: number[];     // các index đúng (>=1 nếu là multi-correct bank)
  isCorrect: boolean;
  multiCorrect: boolean;
};

export type GradeSummary = {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  scorePercent: number; // 0..100, làm tròn 0 chữ số
};

export type GradeResult = {
  perQuestion: PerQuestionResult[];
  summary: GradeSummary;
};

/** Quy tắc đỗ mặc định (có thể thay đổi) */
export type PassingRule = {
  /** ngưỡng phần trăm tối thiểu để đỗ (0..100) */
  minPercent?: number;
  /** yêu cầu số câu tối thiểu đúng (ưu tiên tính theo minPercent nếu cả hai có) */
  minCorrect?: number;
};

/* =============================================================================
 * SECTION 2. Core grading for single question
 * ========================================================================== */

/**
 * Chấm single-choice theo chỉ số đã chọn trên mảng options đã shuffle.
 * - Nếu ngân hàng có >1 đáp án đúng ⇒ vẫn chấm đúng nếu chọn vào 1 trong các đáp án đúng.
 */
export function gradeSingleChoiceByIndex(
  selectedIndex: number | null,
  options: QARenderOption[]
): { isCorrect: boolean; correctIndexes: number[]; multiCorrect: boolean } {
  const correctIndexes = options
    .map((o, i) => (o?.isAnswer ? i : -1))
    .filter((i) => i >= 0);

  const multiCorrect = correctIndexes.length > 1;
  const isCorrect =
    selectedIndex != null ? correctIndexes.includes(selectedIndex) : false;

  return { isCorrect, correctIndexes, multiCorrect };
}

/* =============================================================================
 * SECTION 3. Batch grading
 * ========================================================================== */

/** Chuẩn hóa user answers về dạng Map<questionId, selectedIndex|null> */
function toAnswerMap(answers: UserAnswer[] | Record<string, number | null>): Map<string, number | null> {
  if (Array.isArray(answers)) {
    const m = new Map<string, number | null>();
    for (const a of answers) {
      if (Array.isArray(a)) m.set(a[0], a[1]);
      else m.set(a.questionId, a.selectedIndex);
    }
    return m;
  }
  return new Map(Object.entries(answers));
}

/**
 * Chấm một bộ câu hỏi RENDER với câu trả lời người dùng.
 * - `items`: danh sách QARenderItem (đã format từ RAW, đã shuffle options nếu có)
 * - `answers`: mảng hoặc object map { questionId: selectedIndex }
 */
export function grade(
  items: QARenderItem[],
  answers: UserAnswer[] | Record<string, number | null>
): GradeResult {
  const ansMap = toAnswerMap(answers);

  const per: PerQuestionResult[] = items.map((q) => {
    const selectedIndex = ansMap.has(q.id) ? ansMap.get(q.id)! : null;
    const { isCorrect, correctIndexes, multiCorrect } = gradeSingleChoiceByIndex(
      selectedIndex,
      q.options || []
    );
    return {
      questionId: q.id,
      selectedIndex,
      correctIndexes,
      isCorrect,
      multiCorrect,
    };
  });

  const summary = summarize(per);
  return { perQuestion: per, summary };
}

/* =============================================================================
 * SECTION 4. Summaries & passing
 * ========================================================================== */

export function summarize(per: PerQuestionResult[]): GradeSummary {
  const total = per.length;
  const blank = per.filter((p) => p.selectedIndex == null).length;
  const correct = per.filter((p) => p.isCorrect).length;
  const wrong = total - correct - blank;
  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, wrong, blank, scorePercent };
}

/**
 * Kiểm tra đỗ/rớt theo rule (mặc định: minPercent = 60).
 * - Nếu khai báo cả `minPercent` và `minCorrect`, thí sinh phải đạt CẢ HAI.
 */
export function passByRule(
  summary: GradeSummary,
  rule: PassingRule = { minPercent: 60 }
): { passed: boolean; ruleUsed: Required<PassingRule> } {
  const minPercent = typeof rule.minPercent === 'number' ? rule.minPercent : 60;
  const minCorrect = typeof rule.minCorrect === 'number' ? rule.minCorrect : 0;

  const passPercent = summary.scorePercent >= minPercent;
  const passCorrect = summary.correct >= minCorrect;

  return {
    passed: passPercent && passCorrect,
    ruleUsed: { minPercent, minCorrect },
  };
}

/* =============================================================================
 * SECTION 5. Convenience helpers
 * ========================================================================== */

/**
 * Trộn một answer map (chỉ mục trước shuffle) sang chỉ mục sau shuffle.
 * Hữu ích nếu bạn lưu câu trả lời theo chỉ mục TRƯỚC xáo trộn, nhưng muốn chấm
 * theo thứ tự SAU xáo trộn. Trường hợp chuẩn của Seiyo là lưu chỉ mục SAU shuffle,
 * nên bạn có thể không cần hàm này.
 *
 * @param preIndex index người dùng chọn theo thứ tự TRƯỚC shuffle
 * @param order    hoán vị áp dụng lên options (ví dụ [2,0,1,3,4])
 * @returns        chỉ mục SAU shuffle tương ứng, hoặc null nếu input null/out-of-range
 */
export function remapIndexAfterShuffle(
  preIndex: number | null,
  order: number[]
): number | null {
  if (preIndex == null) return null;
  if (preIndex < 0 || preIndex >= order.length) return null;
  // Chúng ta cần “vị trí mới” của phần tử có index cũ = preIndex
  // order[newPos] = oldIndex  ⇒  newPos = order.indexOf(preIndex)
  return order.indexOf(preIndex);
}
