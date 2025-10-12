// src/lib/qa/schema.ts
// ------------------------------------------------------------------
// Định nghĩa kiểu dùng xuyên suốt hệ thống QA.
// - KHÔNG để trùng tên type/interface (đặc biệt QuestionSnapshotItem).
// - Bổ sung 2 field mới phục vụ analytics: officialPosition, cognitiveLevel.
// ------------------------------------------------------------------

// Thang nhận thức (Bloom-lite) phục vụ phân tích
export type CognitiveLevel = 'Remember' | 'Understand' | 'Apply' | 'Analyze';

// Lựa chọn cho 1 câu hỏi sau khi format về dạng render
export interface QAOption {
  /** ID duy nhất cho option (ví dụ: `${questionId}__opt${1..5}`) */
  id: string;
  /** Vị trí 1..5 (dùng cho hiển thị/hàng dọc, vẫn giữ vì code cũ dùng) */
  key: number;
  /** Nội dung JA/VI & ảnh (nếu có) */
  textJA?: string;
  textVI?: string;
  image?: string;
  /** Đánh dấu đáp án đúng */
  isAnswer: boolean;
  /** Lời giải riêng cho option (nếu có) */
  explanationJA?: string;
  explanationVI?: string;
}

// Bản ghi raw (sau khi đọc từ Excel → snapshot JSON)
// Lưu ý: một số cột có thể optional/nullable để không gãy dữ liệu cũ.
export interface QuestionSnapshotItem {
  // định danh & meta
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number;

  difficulty?: string | number | null;
  sourceNote?: string | null;
  /** Có nơi lưu mảng, có nơi lưu chuỗi → chấp nhận cả hai */
  tags?: string[] | string | null;

  // nội dung câu hỏi & ảnh
  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string | null;

  // 5 lựa chọn (theo cột option1..option5 trong Excel/snapshot)
  option1TextJA?: string;
  option1TextVI?: string;
  option1Image?: string;
  option1IsAnswer?: boolean;
  option1ExplanationJA?: string;
  option1ExplanationVI?: string;

  option2TextJA?: string;
  option2TextVI?: string;
  option2Image?: string;
  option2IsAnswer?: boolean;
  option2ExplanationJA?: string;
  option2ExplanationVI?: string;

  option3TextJA?: string;
  option3TextVI?: string;
  option3Image?: string;
  option3IsAnswer?: boolean;
  option3ExplanationJA?: string;
  option3ExplanationVI?: string;

  option4TextJA?: string;
  option4TextVI?: string;
  option4Image?: string;
  option4IsAnswer?: boolean;
  option4ExplanationJA?: string;
  option4ExplanationVI?: string;

  option5TextJA?: string;
  option5TextVI?: string;
  option5Image?: string;
  option5IsAnswer?: boolean;
  option5ExplanationJA?: string;
  option5ExplanationVI?: string;

  // lời giải chung
  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string | null;

  // (mới) vị trí chính thức trong đề & mức nhận thức
  officialPosition?: number | null;
  cognitiveLevel?: CognitiveLevel | null;
}

// Dạng dùng cho UI sau khi format từ snapshot
export interface QARenderItem {
  // định danh & meta
  id: string;
  courseId: string;
  subjectId: string;
  examYear: number;

  difficulty?: string | number | null;
  sourceNote?: string | null;
  /** Sau khi format, nên chuẩn về mảng string; nhưng để rộng để không gãy nơi cũ */
  tags?: string[] | string | null;

  // nội dung câu hỏi & ảnh
  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string | null;

  // 5 lựa chọn sau khi đóng gói
  options: QAOption[];

  // lời giải chung
  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string | null;

  // (mới) pass-through từ snapshot
  officialPosition?: number | null;
  cognitiveLevel?: CognitiveLevel | null;
}


export interface ManifestEntry {
  filename: string;
  publishedAt?: string;
  count?: number;
  note?: string;
}

export interface Manifest {
  [courseId: string]: {
    [subjectId: string]: ManifestEntry[];
  };
}

/**
 * Subject snapshot JSON mà frontend tải về khi chọn course/subject:
 * - items: danh sách câu hỏi ở dạng QuestionSnapshotItem (raw từ Excel sau normalize)
 * - có thể kèm meta như courseId/subjectId/publishedAt/version (tuỳ builder)
 */
export interface SubjectSnapshot {
  courseId?: string;
  subjectId?: string;
  publishedAt?: string;
  version?: number;
  items: QuestionSnapshotItem[];
}