// src/lib/qa/formatters.ts
// Formatter with TRUE/FALSE auto-options + flexible examYear parsing (Policy A: use 9999 in Excel for unknown)
//
// Exports
//  - readTFAnswer(raw): boolean|undefined
//  - normalizeQuestionType(raw): 'TF' | 'MCQ' | ''
//  - buildOptionsFromRow(raw, lang): Option[]
//  - toSnapshotQuestion(raw, lang): QuestionSnapshotItem-like
//
// Notes:
//  - For TF rows where Excel leaves Option1..5 empty, we auto-generate 2 options (TRUE/FALSE).
//  - Correct answer is read from CorrectAnswer/correctAnswer (TRUE/FALSE) OR fallback answerIsOption/AnswerIsOption.
//  - examYear: For your policy A, put 9999 in Excel when unknown; this formatter will simply Number(...) it.
//  - Language handling: 'ja' | 'vi' (default 'ja').

export type Lang = 'ja' | 'vi'

export type Option = {
  text?: string | null
  image?: string | null
  explanation?: string | null
  isAnswer?: boolean
}

export type SnapshotQuestion = {
  id: string
  courseId: string
  subjectId: string
  examYear?: number
  textJA?: string
  textVI?: string
  image?: string | null
  options: Option[]
  // pass-throughs if your pipeline needs them
  tags?: string[]
  questionType?: string
}

function pick(a?: string, b?: string) {
  const sa = (a ?? '').trim()
  const sb = (b ?? '').trim()
  if (sa) return sa
  if (sb) return sb
  return ''
}

function getNum(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function getJA(raw: any) {
  return raw?.questionTextJA ?? raw?.ja?.text ?? raw?.QuestionTextJA ?? ''
}

function getVI(raw: any) {
  return raw?.questionTextVI ?? raw?.vi?.text ?? raw?.QuestionTextVI ?? ''
}

function getQImage(raw: any) {
  return raw?.questionImage ?? raw?.ja?.image ?? raw?.vi?.image ?? null
}

export function normalizeQuestionType(raw: any): 'TF' | 'MCQ' | '' {
  const qtRaw =
    raw?.questionType ?? raw?.QuestionType ??
    raw?.type ?? raw?.Type ?? ''
  const norm = String(qtRaw).toUpperCase().replace(/\s|_/g, '')
  if (norm === 'TF' || norm === 'TRUEFALSE' || norm === 'TRUE/FALSE' || norm === 'T/F') return 'TF'
  if (norm) return 'MCQ'
  return ''
}

/** Accept TF answer flag from multiple columns: correctAnswer/CorrectAnswer or answerIsOption/AnswerIsOption */
export function readTFAnswer(raw: any): boolean | undefined {
  let v = raw?.correctAnswer ?? raw?.CorrectAnswer ?? raw?.answerIsOption ?? raw?.AnswerIsOption
  if (typeof v === 'boolean') return v

  const s = String(v ?? '').trim().toLowerCase()
  if (['true','t','1','đúng','dung','yes','y'].includes(s)) return true
  if (['false','f','0','sai','no','n'].includes(s)) return false
  return undefined
}

function readOptionsFromExcel(raw: any): Option[] {
  const out: Option[] = []
  for (let i = 1; i <= 6; i++) {
    const textJA = raw?.[`option${i}TextJA`] ?? raw?.[`Option${i}TextJA`]
    const textVI = raw?.[`option${i}TextVI`] ?? raw?.[`Option${i}TextVI`]
    const image  = raw?.[`option${i}Image`]  ?? raw?.[`Option${i}Image`]
    const isAns  = raw?.[`option${i}IsAnswer`] ?? raw?.[`Option${i}IsAnswer`]

    const text = pick(textJA, textVI)
    const clean = (s: any) => {
      const t = String(s ?? '').trim()
      return t.length ? t : null
    }
    const hasContent = (text && text.trim().length) || clean(image)

    if (!hasContent) continue
    out.push({
      text: text || null,
      image: clean(image),
      explanation: null,
      isAnswer: !!isAns
    })
  }
  return out
}

/** Build options with TF fallback if Excel options are empty */
export function buildOptionsFromRow(raw: any, lang: Lang = 'ja'): Option[] {
  const opts = readOptionsFromExcel(raw)
  const qt = normalizeQuestionType(raw)

  if (opts.length === 0 && qt === 'TF') {
    const ans = readTFAnswer(raw) // TRUE/FALSE per CorrectAnswer/answerIsOption
    const tTrueJA = '正しい'; const tFalseJA = '誤り'
    const tTrueVI = 'Đúng';   const tFalseVI = 'Sai'
    const trueText  = lang === 'vi' ? tTrueVI  : tTrueJA
    const falseText = lang === 'vi' ? tFalseVI : tFalseJA
    return [
      { text: trueText,  image: null, explanation: null, isAnswer: ans === true  },
      { text: falseText, image: null, explanation: null, isAnswer: ans === false },
    ]
  }
  return opts
}

/** Turn a raw Excel row to a snapshot-like object used by your publish pipeline */
export function toSnapshotQuestion(raw: any, lang: Lang = 'ja'): SnapshotQuestion {
  const id = String(raw?.id ?? raw?.questionId ?? raw?.QuestionID ?? '').trim()
  const courseId = String(raw?.courseId ?? raw?.CourseId ?? raw?.CourseID ?? '').trim()
  const subjectId = String(raw?.subjectId ?? raw?.SubjectId ?? raw?.SubjectID ?? '').trim()

  // Policy A: 9999 is used for unknown in Excel.
  const examYear = getNum(raw?.examYear ?? raw?.ExamYear ?? raw?.year ?? raw?.Year)

  const textJA = String(getJA(raw) ?? '')
  const textVI = String(getVI(raw) ?? '')
  const image = getQImage(raw)
  const tags: string[] = Array.isArray(raw?.tags) ? raw.tags : (
    typeof raw?.tags === 'string' ? raw.tags.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean) : []
  )

  const options = buildOptionsFromRow(raw, lang)

  return {
    id,
    courseId,
    subjectId,
    examYear,
    textJA,
    textVI,
    image,
    options,
    tags,
    questionType: normalizeQuestionType(raw),
  }
}
