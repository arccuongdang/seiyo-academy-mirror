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

export type SubjectSnapshot = {
  meta: { courseId: string; subjectId: string; count: number; generatedAt: number };
  items: QuestionSnapshotItem[];
};

export type Manifest = Record<string, Record<string, string[]>>;

export type QAOption = {
  key: number;
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
