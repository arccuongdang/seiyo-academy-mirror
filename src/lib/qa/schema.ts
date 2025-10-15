/**
 * ============================================================================
 *  Seiyo Academy – Data Schema (RAW snapshots & Render types)
 *  Strategy: Option B (RAW JA/VI with fixed 5 options)
 * ============================================================================
 */

/* ========== Common ========== */
export type Difficulty = 'A' | 'AA' | 'AAA';
export type SourceCode = 'A' | 'B' | 'C';
export type OptionIndex = 1 | 2 | 3 | 4 | 5;
export type UnixMillis = number;
export type QuestionId = string;
export type CourseId = string;
export type SubjectId = string;

/* ========== Tags (NEW) ========== */
export type TagDef = { id: string; nameJA: string; nameVI?: string };
export type TagsIndex = Record<CourseId, Record<SubjectId, TagDef[]>>;

/* ========== RAW Snapshot ========== */
export interface QuestionSnapshotItem {
  questionId: QuestionId;

  courseId: CourseId;
  subjectId: SubjectId;

  /** Năm đề (4 chữ số). Nếu không xác định, để 0 */
  examYear: number;

  /* Question */
  questionTextJA?: string;
  questionTextVI?: string;
  questionImage?: string | null;

  /* Explanation (general) */
  explanationGeneralJA?: string;
  explanationGeneralVI?: string;
  explanationImage?: string | null;

  /* Meta */
  difficulty?: Difficulty | null;
  sourceNote?: SourceCode | string | null;

  /** tags chuẩn (id, ví dụ ["TK-1","TK-5"]) hoặc giữ kiểu cũ */
  tags?: string[] | string | null;
  /** dữ liệu thô từ Excel (ví dụ "1,5,7" hoặc "TK-1,TK-5") */
  tagsText?: string | string[] | null;

  officialPosition?: string | null;
  cognitiveLevel?: string | null;

  /* Options 1..5 (fixed) */
  option1TextJA?: string;
  option1TextVI?: string;
  option1Image?: string | null;
  option1IsAnswer: boolean;
  option1ExplanationJA?: string;
  option1ExplanationVI?: string;

  option2TextJA?: string;
  option2TextVI?: string;
  option2Image?: string | null;
  option2IsAnswer: boolean;
  option2ExplanationJA?: string;
  option2ExplanationVI?: string;

  option3TextJA?: string;
  option3TextVI?: string;
  option3Image?: string | null;
  option3IsAnswer: boolean;
  option3ExplanationJA?: string;
  option3ExplanationVI?: string;

  option4TextJA?: string;
  option4TextVI?: string;
  option4Image?: string | null;
  option4IsAnswer: boolean;
  option4ExplanationJA?: string;
  option4ExplanationVI?: string;

  option5TextJA?: string;
  option5TextVI?: string;
  option5Image?: string | null;
  option5IsAnswer: boolean;
  option5ExplanationJA?: string;
  option5ExplanationVI?: string;

  // (NEW) hỗ trợ TF từ Excel/snapshot
  /** 'MCQ' | 'MSQ' | 'TF' (tuỳ chọn) */
  questionType?: 'MCQ' | 'MSQ' | 'TF' | string;

  /** đáp án True/False cho TF (tuỳ chọn); cũng chấp nhận key Excel 'AnswerIsOption' */
  answerIsOption?: boolean;
}

export interface SnapshotManifestEntry {
  path: string;
  courseId: CourseId;
  subjectId: SubjectId;
  version: UnixMillis;
}

export interface SnapshotManifest {
  version: UnixMillis;
  generatedAt?: string;
  files: SnapshotManifestEntry[];
  /** Optional: nhúng danh mục tag sau khi publish */
  // eslint-disable-next-line @typescript-eslint/ban-types
  tagsIndex?: Record<string, any>;
}

export interface SubjectMeta {
  courseId: CourseId;
  subjectId: SubjectId;
  nameJA: string;
  nameVI?: string;
  order?: number;
  descriptionJA?: string;
  descriptionVI?: string;
}

export interface SubjectsJSON {
  version: UnixMillis;
  items: SubjectMeta[];
}

/* ========== Validate ========== */
export interface QuestionForValidate {
  courseId: CourseId;
  subjectId: SubjectId;
  examYear: number | string;
  options: Array<{ isAnswer: boolean }>;
  id?: string;
  questionId?: string;
}

/* ========== Render ========== */
export interface QARenderOption {
  isAnswer: boolean;
  text?: string;
  image?: string | null;
  explanation?: string;
}

export interface QARenderItem {
  id: QuestionId;
  courseId: CourseId;
  subjectId: SubjectId;
  examYear: number;
  text?: string;
  image?: string | null;
  explanation?: string;
  options: QARenderOption[];
  difficulty?: Difficulty | null;
  sourceNote?: SourceCode | string | null;
  tags?: string[] | string | null;
}
