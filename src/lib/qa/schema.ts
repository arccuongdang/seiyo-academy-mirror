/**
 * ============================================================================
 *  Seiyo Academy – Data Schema (RAW snapshots & Render types)
 *  Strategy: Option B (RAW JA/VI with fixed 5 options)
 * ----------------------------------------------------------------------------
 *  Mục tiêu:
 *   - Là "nguồn sự thật" (single source of truth) cho Excel → Snapshot → Loader → Render.
 *   - Snapshot lưu đúng cấu trúc JA/VI (questionTextJA/VI, option1..5*...).
 *   - Render types chỉ dùng cho UI sau khi đã format từ RAW.
 *   - Cố định 5 phương án (option1..5), đồng nhất với Excel và Publisher.
 * ============================================================================
 */

/* =============================================================================
 * SECTION 1. Literal & Common Types
 * ========================================================================== */

/** Độ khó: A/AA/AAA (khó/trung bình/dễ) */
export type Difficulty = 'A' | 'AA' | 'AAA';

/** Source: A/B/C (chính thức/chế/luyện) – cho phép string để giữ tương thích bom dữ liệu cũ */
export type SourceCode = 'A' | 'B' | 'C';

/** Chỉ số phương án: cố định 5 lựa chọn */
export type OptionIndex = 1 | 2 | 3 | 4 | 5;

/** Kiểu thời điểm/timestamp (ms since epoch) dùng trong manifest, versioning, v.v. */
export type UnixMillis = number;

/** ID chuẩn cho câu hỏi trong toàn hệ thống */
export type QuestionId = string;

/** Mã khoá học và môn học */
export type CourseId = string;
export type SubjectId = string;

/* =============================================================================
 * SECTION 2. RAW Snapshot Types (được ghi ra JSON trong public/snapshots/**)
 * ----------------------------------------------------------------------------
 *  - Lưu cấu trúc 2 ngôn ngữ (JA/VI) và đủ metadata để UI có thể render toàn bộ.
 *  - KHÔNG có mảng options[], mà là option1..5* (để khớp Excel và dễ kiểm).
 * ========================================================================== */

/**
 * Một câu hỏi snapshot (RAW) – dạng được export vào file:
 * public/snapshots/{courseId}/{subjectId}-questions.v{timestamp}.json
 *
 * Lưu ý:
 * - Chính xác 5 phương án (option1..5).
 * - Text/Explanation song ngữ JA/VI, image là đường dẫn hoặc null nếu không có.
 */
export interface QuestionSnapshotItem {
  /** ID duy nhất của câu hỏi trong snapshot (thường là Excel questionId hoặc sinh tự động khi publish) */
  questionId: QuestionId;

  /** Khóa học & môn học mà câu hỏi thuộc về */
  courseId: CourseId;
  subjectId: SubjectId;

  /** Năm đề (4 chữ số). Nếu không xác định, để 0. */
  examYear: number;

  /* --------------------------- Câu hỏi (thân đề) --------------------------- */
  questionTextJA?: string;           // nội dung tiếng Nhật
  questionTextVI?: string;           // nội dung tiếng Việt (có thể rỗng nếu chưa dịch)
  questionImage?: string | null;     // ảnh đề (nếu có)

  /* --------------------- Giải thích chung (fallback) ---------------------- */
  explanationGeneralJA?: string;     // giải thích chung JA
  explanationGeneralVI?: string;     // giải thích chung VI
  explanationImage?: string | null;  // ảnh kèm giải thích (nếu có)

  /* ------------------------------- Meta ----------------------------------- */
  difficulty?: Difficulty | null;    // A/AA/AAA (tuỳ chọn)
  sourceNote?: SourceCode | string | null; // A/B/C hoặc ghi chú tự do
  tags?: string[] | string | null;   // mảng tag hoặc chuỗi CSV
  officialPosition?: string | null;  // vị trí chính thức trong đề (nếu có)
  cognitiveLevel?: string | null;    // mức nhận thức (nếu có)

  /* -------------------------- OPTIONS (1..5) ------------------------------ */
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
}

/**
 * Manifest liệt kê các file snapshot đang active.
 * - `path` là đường dẫn tương đối từ thư mục `public/snapshots/`
 *   ví dụ: "KTS2/TK-questions.v1739460000000.json"
 */
export interface SnapshotManifestEntry {
  path: string;           // KHÔNG có prefix "public/"
  courseId: CourseId;
  subjectId: SubjectId;
  version: UnixMillis;    // timestamp khi publish file
}

export interface SnapshotManifest {
  version: UnixMillis;                 // timestamp của lần publish manifest
  generatedAt?: string;                // ISO string (tuỳ chọn)
  files: SnapshotManifestEntry[];      // danh sách file hiện hành
}

/**
 * Cấu trúc dữ liệu Subjects (được build từ sheet "Subjects" trong Excel)
 * - Tối thiểu cần: courseId, subjectId, tên JA/VI
 */
export interface SubjectMeta {
  courseId: CourseId;
  subjectId: SubjectId;
  nameJA: string;
  nameVI?: string;
  order?: number;          // dùng để sắp xếp
  descriptionJA?: string;
  descriptionVI?: string;
}

export interface SubjectsJSON {
  version: UnixMillis;
  items: SubjectMeta[];
}

/* =============================================================================
 * SECTION 3. Validation Input Type (cho lib/qa/guards.ts)
 * ----------------------------------------------------------------------------
 *  - Tối thiểu chỉ cần options[].isAnswer và nhận diện câu hỏi (id/questionId)
 *  - Được sử dụng ở Admin Publisher để kiểm tra data-level rules.
 * ========================================================================== */

/**
 * Dùng cho bước validate (Admin Publisher).
 *  - Không chứa text/ảnh; chỉ cần nhận diện câu hỏi và mảng đáp án đúng/sai.
 */
export interface QuestionForValidate {
  courseId: CourseId;
  subjectId: SubjectId;
  examYear: number | string;

  // Mảng tối thiểu để validator kiểm định số lượng đáp án
  options: Array<{ isAnswer: boolean }>;

  // Thông tin nhận diện để trả lỗi gắn đúng câu
  id?: string;
  questionId?: string;
}

/* =============================================================================
 * SECTION 4. Render Types (dùng trong UI sau khi format từ RAW)
 * ----------------------------------------------------------------------------
 *  - Các trang luyện tập không đọc RAW trực tiếp; luôn qua formatters.
 * ========================================================================== */

/** Lựa chọn sau khi đã format cho UI (ngôn ngữ đã resolve & fallback) */
export interface QARenderOption {
  isAnswer: boolean;
  text?: string;                 // text theo ngôn ngữ đã chọn
  image?: string | null;
  explanation?: string;          // giải thích theo ngôn ngữ đã chọn (hoặc fallback)
}

/** Item cho UI luyện tập sau khi format từ RAW */
export interface QARenderItem {
  id: QuestionId;
  courseId: CourseId;
  subjectId: SubjectId;
  examYear: number;

  text?: string;                 // thân đề theo ngôn ngữ đã chọn
  image?: string | null;

  /** giải thích chung (fallback) theo ngôn ngữ đã chọn */
  explanation?: string;

  options: QARenderOption[];     // đúng 5 phần tử sau khi format (có thể filter nếu option rỗng)
  difficulty?: Difficulty | null;
  sourceNote?: SourceCode | string | null;
  tags?: string[] | string | null;
}

/* =============================================================================
 * SECTION 5. Notes & Backward-compat
 * ----------------------------------------------------------------------------
 * - Nếu cần hỗ trợ dữ liệu cũ, hãy thêm mapper ở formatters.ts thay vì sửa schema.
 * - Bất kỳ thay đổi field mới → thêm vào cuối interface để tránh phá vỡ.
 * ========================================================================== */
