// src/app/admin/analytics/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { listAttemptsByUser, fetchAllAnalyticsViaCF, type AttemptDoc } from '@/lib/analytics/queries'

// Import trực tiếp Recharts để TS khớp props, tránh lỗi TS2769
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts'

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

export default function AdminAnalyticsPage() {
  const [mode, setMode] = useState<'me' | 'all'>('me')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState<AttemptDoc[]>([])
  const [daily, setDaily] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const uid = getAuth().currentUser?.uid || ''
        if (mode === 'me' && uid) {
          const data = await listAttemptsByUser(uid)
          setAttempts(data)

          // --- Daily aggregates ---
          const by: Record<string, AttemptDoc[]> = {}
          for (const a of data) {
            const d = (a.createdAt?.toDate?.() as Date) || new Date()
            const k = d.toISOString().slice(0, 10)
            ;(by[k] = by[k] || []).push(a)
          }
          const dailyRows = Object.entries(by)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, arr]) => {
              const scores = arr.map(x => (typeof x.score === 'number' ? x.score : (x.correct ?? 0)))
              const pcts = arr.map((x, i) => (x.total > 0 ? scores[i] / x.total : 0))
              const durs = arr.map(x => x.durationSec ?? 0)
              return { date, attempts: arr.length, avgScore: avg(scores), avgPct: avg(pcts), avgDuration: avg(durs) }
            })
          setDaily(dailyRows)

          // --- Subject breakdown ---
          const sub: Record<string, { n: number; sumPct: number }> = {}
          for (const a of data) {
            const key = `${a.courseId}/${a.subjectId}`
            const score = typeof a.score === 'number' ? a.score : (a.correct ?? 0)
            const pct = a.total > 0 ? score / a.total : 0
            const bucket = (sub[key] = sub[key] || { n: 0, sumPct: 0 })
            bucket.n += 1
            bucket.sumPct += pct
          }
          setSubjects(
            Object.entries(sub)
              .map(([key, v]) => ({ key, attempts: v.n, avgPct: v.sumPct / v.n }))
              .sort((a, b) => b.attempts - a.attempts)
          )

          // --- Top wrong tags ---
          const counter: Record<string, number> = {}
          for (const a of data) {
            const ans = Array.isArray(a.answers) ? a.answers : []
            const atags = Array.isArray(a.tags) ? a.tags : []
            for (const it of ans) {
              if (it.isCorrect) continue
              const qtags = Array.isArray(it.questionTags) ? it.questionTags : atags
              for (const t of qtags) counter[t] = (counter[t] || 0) + 1
            }
          }
          setTags(
            Object.entries(counter)
              .map(([tag, wrongs]) => ({ tag, wrongs }))
              .sort((a, b) => b.wrongs - a.wrongs)
              .slice(0, 20)
          )
        } else {
          // All users via Cloud Function (requires admin claim)
          const res = await fetchAllAnalyticsViaCF({})
          setDaily(res.daily)
          setSubjects(res.subjects)
          setTags(res.tags)
          setAttempts(res.recent || [])
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [mode])

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="ml-auto inline-flex border rounded-lg overflow-hidden">
          <button
            className={`px-3 py-1 text-sm ${mode === 'me' ? 'bg-black text-white' : 'bg-white'}`}
            onClick={() => setMode('me')}
            title="Chỉ dữ liệu của tôi (được phép theo rules hiện tại)"
          >
            My data
          </button>
          <button
            className={`px-3 py-1 text-sm ${mode === 'all' ? 'bg-black text-white' : 'bg-white'}`}
            onClick={() => setMode('all')}
            title="Toàn hệ thống (cần admin claim + Cloud Function)"
          >
            All users
          </button>
        </div>
      </div>

      {loading && <div>Đang tải dữ liệu…</div>}

      {!loading && (
        <>
          {/* Daily progress */}
          <section className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Tiến độ theo ngày</div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="attempts" name="Attempts/day" dot={false} />
                  <Line type="monotone" dataKey="avgPct" name="Avg % correct" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Subject breakdown */}
          <section className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Phân rã theo môn / khoá</div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={subjects}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="key" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="attempts" name="Attempts" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Top wrong tags */}
          <section className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Tag sai nhiều nhất</div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={tags}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tag" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="wrongs" name="Wrongs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
