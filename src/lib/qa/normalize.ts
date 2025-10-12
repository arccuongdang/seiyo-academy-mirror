// src/lib/qa/normalize.ts
// -------------------------------------------------------------
// Nhiệm vụ:
// 1) Ổn định option.id nếu thiếu (giữ hành vi cũ)
// 2) Chuẩn hoá 2 trường mới từ Excel/snapshot:
//    - officialPosition: number | null  (VD: 1..25)
//    - cognitiveLevel : 'Remember' | 'Understand' | 'Apply' | 'Analyze' | null
//
// Ghi chú:
// - Chấp nhận cả key theo kiểu khác nhau trong nguồn dữ liệu (OfficialPosition, CognitiveLevel)
// - Không làm gãy dữ liệu cũ: nếu không có cột mới → vẫn trả về bình thường.
// -------------------------------------------------------------

import type { QuestionItem, OptionItem } from "./types";
import { validateQuestions } from "./guards";

// Nếu project của bạn đã định nghĩa sẵn kiểu này trong ./types thì có thể import.
// Ở đây đặt local type để normalize an toàn (không làm gãy build nếu chưa thêm vào ./types).
type CognitiveLevel = "Remember" | "Understand" | "Apply" | "Analyze";

/** Tạo option.id ổn định khi thiếu, dựa trên questionId + index */
function ensureOptionIdsForQuestion(q: QuestionItem): QuestionItem {
  const withIds: OptionItem[] = q.options.map((o, idx) => {
    if ((o as any).id && String((o as any).id).trim().length > 0) return o;
    return {
      ...o,
      id: `${q.questionId}__opt${idx + 1}`, // ví dụ: "000123__opt1"
    } as any;
  });
  return { ...q, options: withIds };
}

/** Ép về số nguyên trong khoảng cho officialPosition; trả null nếu không hợp lệ */
function toIntInRange(v: any, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min || i > max) return null;
  return i;
}

/** Chuẩn hoá cognitiveLevel; trả null nếu ngoài tập cho phép */
function toCognitiveLevel(v: any): CognitiveLevel | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const ok: CognitiveLevel[] = ["Remember", "Understand", "Apply", "Analyze"];
  return (ok as string[]).includes(s) ? (s as CognitiveLevel) : null;
}

/**
 * Gắn thêm 2 trường mới nếu có trong nguồn dữ liệu.
 * - Ưu tiên key lowercase; fallback key PascalCase để tương thích Excel.
 */
function ensureOfficialFields(q: QuestionItem): QuestionItem {
  // chấp nhận cả "officialPosition" và "OfficialPosition"
  const posRaw = (q as any).officialPosition ?? (q as any).OfficialPosition;
  // nếu đề luôn 25 câu, đổi max thành 25 cho chặt chẽ
  const officialPosition = toIntInRange(posRaw, 1, 100);

  // chấp nhận cả "cognitiveLevel" và "CognitiveLevel"
  const cogRaw = (q as any).cognitiveLevel ?? (q as any).CognitiveLevel;
  const cognitiveLevel = toCognitiveLevel(cogRaw);

  return {
    ...q,
    ...(officialPosition != null ? { officialPosition } : {}),
    ...(cognitiveLevel != null ? { cognitiveLevel } : {}),
  } as any;
}

/** Có thể thêm các normalize khác tại đây (ví dụ: trim text, merge VI fallback...) */
export function normalizeQuestions(raw: QuestionItem[]) {
  // 1) Ổn định option.id
  const step1 = raw.map(ensureOptionIdsForQuestion);

  // 2) Chuẩn hoá 2 trường mới (nếu có trong dữ liệu)
  const step2 = step1.map(ensureOfficialFields);

  // 3) Validate như cũ
  const { errors, warns } = validateQuestions(step2);

  if (warns.length) {
    // chỉ log ra console để người soạn biết câu nào có 2 đáp án đúng
    console.warn("[QA:WARN] MULTI_CORRECT questions:", warns);
  }
  if (errors.length) {
    // gom theo questionId để tiện đọc
    const msg = errors.map((e) => `${e.code}@${e.questionId}`).join(", ");
    throw new Error(`[QA:ERROR] Invalid questions: ${msg}`);
  }

  return step2;
}
