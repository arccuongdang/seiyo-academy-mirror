// src/lib/qa/types.ts
export type Language = "JA" | "VI";


export type CognitiveLevel = "Remember" | "Understand" | "Apply" | "Analyze";

export type OptionItem = {
  /** ổn định qua shuffle */
  id: string;
  /** nội dung văn bản (JA/VI) - ưu tiên JA cho giao diện, VI để hỗ trợ */
  textJA?: string;
  textVI?: string;
  /** ảnh (nếu có) */
  image?: string;
  /** có phải đáp án đúng không (có thể có 1 hoặc 2 đáp án true trong ~<1% trường hợp) */
  isAnswer: boolean;
  /** giải thích (ưu tiên per-option) */
  explanationJA?: string;
  explanationVI?: string;
  officialPosition?: number | null;
  cognitiveLevel?: CognitiveLevel | null;
};

export type QuestionItem = {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number;
  difficulty?: "A" | "AA" | "AAA";
  sourceNote?: string;
  tags?: string[];
  /** văn bản/ảnh câu hỏi */
  textJA?: string;
  textVI?: string;
  image?: string;

  /** danh sách lựa chọn */
  options: OptionItem[];

  /** giải thích chung (fallback nếu option không có explanation) */
  generalExplanationJA?: string;
  generalExplanationVI?: string;
  
  officialPosition?: number | null;
  cognitiveLevel?: CognitiveLevel | null;
};

export type GradeResult = {
  isCorrect: boolean;
  /** id đáp án chọn */
  selectedId: string | null;
  /** tất cả id đáp án đúng (1 hoặc 2 phần tử) */
  correctIds: string[];
  /** id đáp án đúng chính (nếu hệ thống muốn đánh dấu “correctIndex” cũ) */
  primaryCorrectId?: string;
  /** có nhiều đáp án đúng? */
  multiCorrect: boolean;
};
