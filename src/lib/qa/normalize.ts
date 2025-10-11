// src/lib/qa/normalize.ts
import type { QuestionItem, OptionItem } from "./types";
import { validateQuestions } from "./guards";

/** Tạo option.id ổn định khi thiếu, dựa trên questionId + index */
function ensureOptionIdsForQuestion(q: QuestionItem): QuestionItem {
  const withIds: OptionItem[] = q.options.map((o, idx) => {
    if (o.id && o.id.trim().length > 0) return o;
    return {
      ...o,
      id: `${q.questionId}__opt${idx + 1}`, // ví dụ: "000123__opt1"
    };
  });
  return { ...q, options: withIds };
}

/** Có thể thêm các normalize khác tại đây (ví dụ: trim text, merge VI fallback...) */
export function normalizeQuestions(raw: QuestionItem[]) {
  const normalized = raw.map(ensureOptionIdsForQuestion);

  // validate
  const { errors, warns } = validateQuestions(normalized);

  if (warns.length) {
    // chỉ log ra console để người soạn biết câu nào có 2 đáp án đúng
    console.warn("[QA:WARN] MULTI_CORRECT questions:", warns);
  }
  if (errors.length) {
    // gom theo questionId để tiện đọc
    const msg = errors.map(e => `${e.code}@${e.questionId}`).join(", ");
    throw new Error(`[QA:ERROR] Invalid questions: ${msg}`);
  }

  return normalized;
}
