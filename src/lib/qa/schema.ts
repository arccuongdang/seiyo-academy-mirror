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

// Thang nhận thức Bloom-lite, dùng cho phân tích
export type CognitiveLevel = 'Remember' | 'Understand' | 'Apply' | 'Analyze';


export type SubjectSnapshot = {
  meta: { courseId: string; subjectId: string; count: number; generatedAt: number };
  items: QuestionSnapshotItem[];
};

export type Manifest = Record<string, Record<string, string[]>>;

export type CognitiveLevel = 'Remember' | 'Understand' | 'Apply' | 'Analyze';

export type QAOption = {
  /** số thứ tự option 1..5 (nếu UI đang dùng) */
  key: number;
  /** id ổn định (vd: "000123__opt1") để mapping đúng/sai sau khi shuffle */
  id: string; // <-- BẮT BUỘC
  textJA?: string;
  textVI?: string;
  image?: string;
  isAnswer: boolean;
  explanationJA?: string;
  explanationVI?: string;
};


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
  options: QAOption[];
  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string;
};

export interface QuestionSnapshotItem {
  // ... các trường hiện có ...
  officialPosition?: number | null;        // 1..25 (tuỳ đề)
  cognitiveLevel?: CognitiveLevel | null;  // Bloom-lite
}

export interface QARenderItem {
  // ... các trường hiện có ...
  officialPosition?: number | null;
  cognitiveLevel?: CognitiveLevel | null;
}