
'use client'

import { useEffect, useMemo, useState } from 'react'
import BilingualText from '../BilingualText'
import { createAttemptSession, updateAttemptSession, finalizeAttemptFromSession } from '../../lib/analytics/attempts'
import { getAuth } from 'firebase/auth'
import type { QARenderItem } from '../../lib/qa/schema'

type ViewQuestion = {
  id: string
  examYear: number
  courseId: string
  subjectId: string
  ja: QARenderItem
  vi: QARenderItem
  order: number[]
  expectedMultiCount: number
}

type PlayerProps = {
  course: string
  mode: 'year' | 'subject'
  questions: ViewQuestion[]
  examYear?: number
}

type LocalQuestion = ViewQuestion & {
  selectedIndex: number | null
  submitted: boolean
  isCorrect?: boolean
  correctShuffledIndexes?: number[]
  multiCorrect?: boolean
  showVIQuestion?: boolean
  showVIOption?: Record<number, boolean>
}

export default function Player({ course, mode, questions, examYear }: PlayerProps) {
  const [items, setItems] = useState<LocalQuestion[]>(() =>
    questions.map(q => ({ ...q, selectedIndex: null, submitted: false, showVIQuestion: false, showVIOption: {} }))
  )
  const [idx, setIdx] = useState(0)
  const [finished, setFinished] = useState(false)
  const [score, setScore] = useState({ total: 0, correct: 0, blank: 0 })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lang, setLang] = useState<'JA' | 'VI'>('JA')
  // Default OFF as requested
  const [showFurigana, setShowFurigana] = useState<boolean>(false)
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)

  useEffect(() => { setStartedAtMs(Date.now()) }, [])

  useMemo(() => {
    ;(async () => {
      try {
        const first = questions[0]
        const auth = getAuth()
        if (auth.currentUser?.uid && first) {
          const { sessionId } = await createAttemptSession({
            courseId: first.courseId || course,
            subjectId: first.subjectId,
            mode,
            examYear: mode === 'year' ? (examYear ?? first.examYear) : undefined,
            total: questions.length,
          })
          setSessionId(sessionId)
        }
      } catch (e) {
        console.warn('[attempts] create session failed:', e)
      }
    })()
  }, [])

  const q = items[idx]
  const jaOpts = q ? q.order.map(k => q.ja.options[k]) : []
  const viOpts = q ? q.order.map(k => q.vi.options[k]) : []

  const onSelect = (i: number) => {
    setItems(prev => prev.map((x, j) => (j === idx ? { ...x, selectedIndex: i } : x)))
  }

  function gradeSingleChoiceByIndex(selectedIndex: number | null, options: { isAnswer?: boolean }[]) {
    const correct = options.map((o, i) => (o?.isAnswer ? i : -1)).filter(i => i >= 0)
    const multiCorrect = correct.length > 1
    const isCorrect = selectedIndex != null ? correct.includes(selectedIndex) : false
    return { isCorrect, correctIndexes: correct, multiCorrect }
  }

  const submitAll = async () => {
    const graded = items.map((q) => {
      const optsInOrder = q.order.map(k => q.ja.options[k])
      const res = gradeSingleChoiceByIndex(q.selectedIndex, optsInOrder)
      const multi = res.multiCorrect || q.expectedMultiCount > 1
      return { ...q, submitted: true, isCorrect: multi ? true : res.isCorrect, correctShuffledIndexes: res.correctIndexes, multiCorrect: multi }
    })

    const total = graded.length
    const correct = graded.filter(x => x.isCorrect).length
    const blank = graded.filter(x => x.selectedIndex == null).length
    setItems(graded)
    setScore({ total, correct, blank })
    setFinished(true)

    // Build answers[] in SHUFFLED index space + duration
    const answers = graded.map(it => ({
      questionId: it.id,
      pickedIndexes: (it.selectedIndex == null ? [] : [it.selectedIndex]),
      correctIndexes: it.correctShuffledIndexes || [],
      isCorrect: it.multiCorrect ? true : !!it.isCorrect,
    }))
    const durationSec = startedAtMs ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)) : undefined

    try {
      const auth = getAuth()
      if (auth.currentUser?.uid && sessionId) {
        await updateAttemptSession(sessionId, { correct, blank })
        await finalizeAttemptFromSession(sessionId, {
          score: total ? Math.round((correct / total) * 100) : 0,
          answers,
          durationSec,
        })
      }
    } catch (e) {
      console.warn('[attempts] finalize failed:', e)
    }
  }

  if (!q) return <div>Không có câu hỏi.</div>

  if (finished) {
    const percent = score.total ? Math.round((score.correct / score.total) * 100) : 0
    return (
      <div className="space-y-4">
        <div className="text-lg font-semibold">Kết quả: {score.correct}/{score.total}（{percent}%）・Chưa làm: {score.blank}</div>
        <div className="grid gap-3">
          {items.map((it, idx2) => {
            const correct = new Set(it.correctShuffledIndexes || [])
            const ja = it.order.map(k => it.ja.options[k])
            const vi = it.order.map(k => it.vi.options[k])
            return (
              <div key={it.id} className="border rounded-lg p-3">
                <div className="font-medium mb-1">Câu {idx2 + 1}</div>
                <div className="mb-2">
                  <BilingualText ja={it.ja.text} vi={it.vi.text} lang={lang} showFurigana={showFurigana} />
                </div>
                <ul className="list-none p-0 m-0">
                  {ja.map((op, i) => {
                    const isCorrect = (it.multiCorrect === true) || correct.has(i)
                    const picked = it.selectedIndex === i
                    return (
                      <li key={i} className="border rounded p-2 mb-2" style={{ background: isCorrect ? '#ecfdf3' : picked ? '#fef2f2' : '#fff' }}>
                        <div className="font-medium">{isCorrect ? '✅ 正解' : picked ? '❌ 不正解' : '・'}</div>
                        <BilingualText ja={op.text || ''} vi={vi[i]?.text || ''} lang={lang} showFurigana={showFurigana} />
                        {(op.explanation || it.ja.explanation) && (
                          <div className="text-sm opacity-80 mt-1">{op.explanation || it.ja.explanation}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 border rounded" onClick={() => setLang(lang === 'JA' ? 'VI' : 'JA')}>
            切替 / Đổi ngôn ngữ: {lang === 'JA' ? 'JA→VI' : 'VI→JA'}
          </button>
          <label className="inline-flex items-center gap-2 px-3 py-2 border rounded">
            <input type="checkbox" checked={showFurigana} onChange={(e) => setShowFurigana(e.target.checked)} />
            ふりがな
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="px-2 py-1 border rounded" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>前へ</button>
        <div>{idx + 1} / {items.length}</div>
        <button className="px-2 py-1 border rounded" onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))} disabled={idx === items.length - 1}>次へ</button>
        <div className="ml-auto flex gap-2">
          <button className="px-3 py-1 border rounded" onClick={() => setLang(lang === 'JA' ? 'VI' : 'JA')}>
            JA / VI
          </button>
          <label className="inline-flex items-center gap-2 px-3 py-1 border rounded">
            <input type="checkbox" checked={showFurigana} onChange={(e) => setShowFurigana(e.target.checked)} />
            ふりがな
          </label>
        </div>
      </div>

      <div className="border rounded-lg p-3">
        <div className="font-medium mb-2">
          <BilingualText ja={q.ja.text} vi={q.vi.text} lang={lang} showFurigana={showFurigana} />
        </div>

        {q.ja.image && <img src={q.ja.image} alt="" className="max-w-full mb-2" />}

        <ul className="list-none p-0 m-0">
          {jaOpts.map((op, i) => (
            <li key={i} className="border rounded p-2 mb-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name={'q-' + q.id} checked={q.selectedIndex === i} onChange={() => onSelect(i)} className="mt-1" />
                <div className="flex-1">
                  <BilingualText ja={op.text || ''} vi={viOpts[i]?.text || ''} lang={lang} showFurigana={showFurigana} />
                </div>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <button className="px-3 py-2 border rounded bg-black text-white" onClick={submitAll}>
            全問を提出 / Nộp toàn bài
          </button>
        </div>
      </div>
    </div>
  )
}
