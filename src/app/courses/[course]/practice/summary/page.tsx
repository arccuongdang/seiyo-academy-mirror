'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { loadSubjectsJson, listSubjectsForCourse, loadRawQuestionsFor } from '../../../../../lib/qa/excel'

function renderWithFurigana(text: string, enabled: boolean): string {
  if (!text) return '';
  // If disabled, strip <rt>/<rp> to hide furigana in existing ruby markup.
  if (!enabled) {
    return text.replace(/<rp>.*?<\/rp>/g, '').replace(/<rt>.*?<\/rt>/g, '');
  }
  // Enabled: return as-is (assumes snapshot may already contain ruby markup).
  return text;
}



type AnswerRow = {
  questionId: string
  pickedIndexes: number[]
  correctIndexes: number[]
  order?: number[]
  isCorrect: boolean
  guessed?: boolean
  confident?: boolean
}

type Snap = Record<string, any>

function toRenderableFromRaw(raw: Snap) {
  const ja = {
    text: raw.questionTextJA || raw.ja?.text || '',
    image: raw.questionImage || raw.ja?.image || '',
    explanationGeneral: raw.explanationGeneralJA || raw.ja?.explanation || '',
    options: [] as { text?: string; image?: string; explanation?: string }[],
  }
  const vi = {
    text: raw.questionTextVI || raw.vi?.text || '',
    image: raw.questionImage || raw.vi?.image || '',
    explanationGeneral: raw.explanationGeneralVI || raw.vi?.explanation || '',
    options: [] as { text?: string; image?: string; explanation?: string }[],
  }

  for (let i = 1; i <= 6; i++) {
    const tJA = raw[`option${i}TextJA`] ?? raw.ja?.options?.[i-1]?.text
    const tVI = raw[`option${i}TextVI`] ?? raw.vi?.options?.[i-1]?.text
    const img = raw[`option${i}Image`] ?? raw.ja?.options?.[i-1]?.image ?? raw.vi?.options?.[i-1]?.image
    const eJA = raw[`option${i}ExplanationJA`] ?? raw.ja?.options?.[i-1]?.explanation
    const eVI = raw[`option${i}ExplanationVI`] ?? raw.vi?.options?.[i-1]?.explanation
    if (tJA == null && tVI == null) break
    ja.options.push({ text: tJA || '', image: img || '', explanation: eJA || '' })
    vi.options.push({ text: tVI || '', image: img || '', explanation: eVI || '' })
  }
  return { ja, vi }
}

function Bilingual({ ja, vi, langVI, furigana }: { ja?: string; vi?: string; langVI: boolean; furigana: boolean }) {
  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: renderWithFurigana(ja || '', furigana) }} />
      {langVI && <><br /><span>{vi || ''}</span></>}
    </>
  )
}

export default function SummaryPage() {
  const params = useParams<{ course: string }>()
  const search = useSearchParams()
  const courseId = decodeURIComponent(String(params?.course || ''))
  const attemptId = String(search.get('attempt') || '')

  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [qmap, setQmap] = useState<Map<string, ReturnType<typeof toRenderableFromRaw>>>(new Map())
  const [score, setScore] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 })
  const [showVI, setShowVI] = useState<boolean>(false)
  const [showFurigana, setShowFurigana] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const auth = getAuth()
        const uid = auth.currentUser?.uid
        if (!uid || !attemptId) { setErr('Thiếu thông tin người dùng/attempt.'); setLoading(false); return }
        const db = getFirestore()
        const snap = await getDoc(doc(db, 'users', uid, 'attempts', attemptId))
        const data: any = snap.data() || {}
        const arr: AnswerRow[] = Array.isArray(data.answers) ? data.answers : []
        setAnswers(arr)
        setScore({ correct: Number(data.score || 0), total: arr.length })

        const sj = await loadSubjectsJson()
        const subs = listSubjectsForCourse(courseId, sj)
        const map = new Map<string, ReturnType<typeof toRenderableFromRaw>>()
        for (const s of subs) {
          const rawList = await loadRawQuestionsFor(courseId, s.subjectId)
          for (const r of rawList as Snap[]) {
            const id = String(r.id || r.questionId || '')
            if (!id) continue
            map.set(id, toRenderableFromRaw(r))
          }
        }
        setQmap(map)
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu')
      } finally {
        setLoading(false)
      }
    })()
  }, [courseId, attemptId])

  if (!attemptId) return <main style={{ padding:24 }}>Thiếu tham số attempt.</main>
  if (loading) return <main style={{ padding:24 }}>Đang tải kết quả...</main>
  if (err) return <main style={{ padding:24, color:'crimson' }}>Lỗi: {err}</main>

  return (
    <main style={{ padding:24, maxWidth:980, margin:'0 auto', display:'grid', gap:16 }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tổng kết bài làm</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1"><input type="checkbox" checked={showFurigana} onChange={e=>setShowFurigana(e.target.checked)} />ふりがな</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showVI} onChange={e=>setShowVI(e.target.checked)} />VI song ngữ</label>
        </div>
      </div>
      <div className="font-semibold">Điểm: {score.correct} / {score.total}</div>

      <div className="grid gap-4">
        {answers.map((a, idx) => {
          const q = qmap.get(a.questionId)
          const ja = q?.ja
          const vi = q?.vi

          const order = Array.isArray(a.order) && a.order.length
            ? a.order
            : Array.from({length: (ja?.options || []).length}, (_,i)=>i)

          const shownJA = order.map(k => (ja?.options || [])[k] || {})
          const shownVI = order.map(k => (vi?.options || [])[k] || {} as any)

          const picked = new Set(a.pickedIndexes || [])
          const correct = new Set(a.correctIndexes || [])
          const multi = correct.size > 1

          const hasAnyOptionExplain = shownJA.some((op, i) => (op?.explanation || (shownVI[i] as any)?.explanation))

          return (
            <div key={a.questionId} className="border rounded-lg p-3">
              <div className="font-bold mb-1">
                Câu {idx+1} ・{a.isCorrect ? '✅ 正解' : '❌ 不正解'}{a.guessed ? ' ・(適当に選択)' : ''}{a.confident ? ' ・(自信あり)' : ''}
              </div>
              <div className="mb-2">
                <Bilingual ja={ja?.text || ''} vi={vi?.text || ''} langVI={showVI} furigana={showFurigana} />
              </div>
              {ja?.image && <img src={ja.image} alt="" style={{ maxWidth:'100%', marginBottom:8 }} />}

              <ul className="list-none p-0 m-0">
                {shownJA.map((op, i) => {
                  const ok = multi || correct.has(i)
                  const isPicked = picked.has(i)
                  const explainJA = op?.explanation || ''
                  const explainVI = (shownVI[i] as any)?.explanation || ''
                  return (
                    <li key={i} className="border rounded p-2 mb-2" style={{ background: ok ? '#ecfdf3' : isPicked ? '#fef2f2' : '#fff' }}>
                      <div className="font-medium">Option {order[i] + 1}：{ok ? '✅' : isPicked ? '❌' : '・'}</div>
                      <div>
                        <Bilingual ja={op?.text || ''} vi={(shownVI[i] as any)?.text || ''} langVI={showVI} furigana={showFurigana} />
                      </div>
                      {(explainJA || explainVI) && (
                        <div className="text-sm opacity-80 mt-1">
                          <Bilingual ja={explainJA} vi={explainVI} langVI={showVI} furigana={showFurigana} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {!hasAnyOptionExplain && (ja?.explanationGeneral || vi?.explanationGeneral) && (
                <div className="mt-2 p-2 rounded border bg-[#f8fafc] text-sm">
                  <div className="font-semibold mb-1">解説 / Lời giải</div>
                  <Bilingual ja={ja?.explanationGeneral || ''} vi={vi?.explanationGeneral || ''} langVI={showVI} furigana={showFurigana} />
                </div>
              )}

              {!hasAnyOptionExplain && !(ja?.explanationGeneral || vi?.explanationGeneral) && (
                <div className="mt-2 text-sm text-gray-500">Chưa có lời giải cho câu này trong dữ liệu.</div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}