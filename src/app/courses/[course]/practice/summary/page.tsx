'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import { loadSubjectsJson, listSubjectsForCourse, loadRawQuestionsFor } from '../../../../../lib/qa/excel'

type AnswerRow = {
  questionId: string
  pickedIndexes: number[]
  correctIndexes: number[]
  isCorrect: boolean
  guessed?: boolean
}

type QAOption = { text?: string; explanation?: string; isAnswer?: boolean }
type QARender = { text?: string; explanation?: string; options: QAOption[]; image?: string }

function Bilingual({ ja, vi, lang }: { ja?: string; vi?: string; lang: 'JA'|'VI' }) {
  const text = (lang === 'JA' ? ja : vi) || ''
  return <span>{text}</span>
}

export default function SummaryPage() {
  const params = useParams<{ course: string }>()
  const search = useSearchParams()
  const courseId = decodeURIComponent(String(params?.course || ''))
  const attemptId = String(search.get('attempt') || '')

  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [qmap, setQmap] = useState<Map<string, { ja: QARender; vi: QARender }>>(new Map())
  const [score, setScore] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 })
  const [lang, setLang] = useState<'JA' | 'VI'>('JA')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const auth = getAuth()
        const uid = auth.currentUser?.uid
        if (!uid || !attemptId) { setErr('Thiếu thông tin người dùng/attempt.'); return }
        const db = getFirestore()
        const snap = await getDoc(doc(db, 'users', uid, 'attempts', attemptId))
        const data: any = snap.data() || {}
        const arr: AnswerRow[] = Array.isArray(data.answers) ? data.answers : []
        setAnswers(arr)
        setScore({ correct: Number(data.score || 0), total: arr.length })

        // Load all subjects' snapshots to build map
        const sj = await loadSubjectsJson()
        const subs = listSubjectsForCourse(courseId, sj)
        const map = new Map<string, any>()
        for (const s of subs) {
          const raw = await loadRawQuestionsFor(courseId, s.subjectId)
          for (const r of raw) {
            const id = String((r as any).id || (r as any).questionId || '')
            if (!id) continue
            map.set(id, { ja: (r as any).ja, vi: (r as any).vi })
          }
        }
        setQmap(map)
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu'); 
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
        <button className="px-3 py-1 border rounded" onClick={()=>setLang(lang==='JA'?'VI':'JA')}>JA / VI</button>
      </div>
      <div className="font-semibold">Điểm: {score.correct} / {score.total}</div>

      <div className="grid gap-4">
        {answers.map((a, idx) => {
          const q = qmap.get(a.questionId)
          const ja = q?.ja
          const vi = q?.vi
          const opts = Array.isArray(ja?.options) ? ja!.options : []
          const optsVI = Array.isArray(vi?.options) ? vi!.options : []
          const picked = new Set(a.pickedIndexes || [])
          const correct = new Set(a.correctIndexes || [])
          const multi = correct.size > 1
          return (
            <div key={a.questionId} className="border rounded-lg p-3">
              <div className="font-bold mb-1">Câu {idx+1} ・{a.isCorrect ? '✅ 正解' : '❌ 不正解'}{a.guessed ? ' ・(適当に選択)' : ''}</div>
              <div className="mb-2">
                <Bilingual ja={ja?.text || ''} vi={vi?.text || ''} lang={lang} />
              </div>
              {ja?.image && <img src={ja.image} alt="" style={{ maxWidth:'100%', marginBottom:8 }} />}
              <ul className="list-none p-0 m-0">
                {opts.map((op, i) => {
                  const ok = multi || correct.has(i)
                  const isPicked = picked.has(i)
                  return (
                    <li key={i} className="border rounded p-2 mb-2" style={{ background: ok ? '#ecfdf3' : isPicked ? '#fef2f2' : '#fff' }}>
                      <div className="font-medium">{ok ? '✅' : isPicked ? '❌' : '・'}</div>
                      <Bilingual ja={op?.text || ''} vi={optsVI[i]?.text || ''} lang={lang} />
                      {(op?.explanation || ja?.explanation) && (
                        <div className="text-sm opacity-80 mt-1">
                          <Bilingual ja={op?.explanation || ja?.explanation || ''} vi={optsVI[i]?.explanation || ''} lang={lang} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </main>
  )
}
