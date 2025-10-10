// “Câu hỏi” như đã snapshot ra JSON (sau Bước 2)
export type QuestionSnapshotItem = {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear: number;
  difficulty: "A" | "AA" | "AAA";
  sourceNote?: string;
  tags?: string;

  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string;

  option1TextJA?: string; option1TextVI?: string; option1Image?: string; option1IsAnswer?: boolean; option1ExplanationJA?: string; option1ExplanationVI?: string;
  option2TextJA?: string; option2TextVI?: string; option2Image?: string; option2IsAnswer?: boolean; option2ExplanationJA?: string; option2ExplanationVI?: string;
  option3TextJA?: string; option3TextVI?: string; option3Image?: string; option3IsAnswer?: boolean; option3ExplanationJA?: string; option3ExplanationVI?: string;
  option4TextJA?: string; option4TextVI?: string; option4Image?: string; option4IsAnswer?: boolean; option4ExplanationJA?: string; option4ExplanationVI?: string;
  option5TextJA?: string; option5TextVI?: string; option5Image?: string; option5IsAnswer?: boolean; option5ExplanationJA?: string; option5ExplanationVI?: string;

  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string;

  status?: string;
  version?: number;
};

// Gói snapshot 1 môn
export type SubjectSnapshot = {
  meta: { courseId: string; subjectId: string; count: number; generatedAt: number };
  items: QuestionSnapshotItem[];
};

// manifest: { [courseId]: { [subjectId]: string[] /* filenames newest-first */ } }
export type Manifest = Record<string, Record<string, string[]>>;

// Kiểu Option sau khi chuẩn hóa cho UI
export type QAOption = {
  key: number; // 1..5
  textJA?: string;
  textVI?: string;
  image?: string;
  isAnswer: boolean;
  explanationJA?: string;
  explanationVI?: string;
};

// Bản câu hỏi sẵn sàng cho UI (đã gom options)
export type QARenderItem = {
  id: string;
  courseId: string;
  subjectId: string;
  examYear: number;
  difficulty: "A" | "AA" | "AAA";
  sourceNote?: string;
  tags?: string;
  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string;
  options: QAOption[]; // 1..5 (chỉ những option có nội dung)
  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string;
};
