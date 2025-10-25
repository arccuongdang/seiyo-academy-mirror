// src/app/admin/analytics/page.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { getAuth } from 'firebase/auth'
import {
  listAttemptsByUser, fetchAllAnalyticsViaCF, type AttemptDoc,
  aggregateDaily, aggregateSubjects, aggregateWrongTags, toJSDate
} from '@/lib/analytics/queries'
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from 'recharts'

type Mode = 'me' | 'all'
type Quick = '7d' | '30d' | '90d' | 'all'

function subDays(days: number): Date { const d = new Date(); d.setDate(d.getDate() - days); return d }

export default function AdminAnalyticsPage() {
  const [mode, setMode] = useState<Mode>('me')
  const [quick, setQuick] = useState<Quick>('30d')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState<AttemptDoc[]>([])
  const [daily, setDaily] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])

  const range = useMemo(() => {
    if (quick === 'all') return {}
    const map: Record<Exclude<Quick, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }
    return { start: subDays(map[quick as Exclude<Quick, 'all'>]) }
  }, [quick])

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        if (mode === 'me') {
          const uid = getAuth().currentUser?.uid || ''
          if (!uid) { setAttempts([]); setDaily([]); setSubjects([]); setTags([]); return }
          const data = await listAttemptsByUser(uid, range)
          setAttempts(data)
          setDaily(aggregateDaily(data))
          setSubjects(aggregateSubjects(data))
          setTags(aggregateWrongTags(data, 20))
        } else {
          const res = await fetchAllAnalyticsViaCF(range)
          setDaily(res.daily || [])
          setSubjects(res.subjects || [])
          setTags(res.tags || [])
          setAttempts(res.recent || [])
        }
      } finally { setLoading(false) }
    })()
  }, [mode, quick])

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <div className="ml-auto inline-flex border rounded-lg overflow-hidden">
          <button className={'px-3 py-1 text-sm ' + (mode === 'me' ? 'bg-black text-white' : 'bg-white')}
            onClick={() => setMode('me')}>My data</button>
          <button className={'px-3 py-1 text-sm ' + (mode === 'all' ? 'bg-black text-white' : 'bg-white')}
            onClick={() => setMode('all')}>All users</button>
        </div>
        <div className="inline-flex border rounded-lg overflow-hidden">
          {(['7d','30d','90d','all'] as Quick[]).map(q => (
            <button key={q} className={'px-3 py-1 text-sm ' + (quick === q ? 'bg-black text-white' : 'bg-white')}
              onClick={() => setQuick(q)}>{q.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {loading && <div>Đang tải dữ liệu…</div>}

      {!loading && (
        <>
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

          <section className="rounded-lg border p-4">
            <div className="font-semibold mb-2">Lần làm gần đây</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-3">Date</th>
                    <th className="py-1 pr-3">Course/Subject</th>
                    <th className="py-1 pr-3">Total</th>
                    <th className="py-1 pr-3">% Correct</th>
                    <th className="py-1 pr-3">Duration (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.slice(0, 20).map((a) => {
                    const d = toJSDate(a.createdAt)
                    const pct = a.total > 0 ? Math.round(((a.score ?? a.correct ?? 0) / a.total) * 100) : 0
                    return (
                      <tr key={a.id || d.getTime()} className="border-b">
                        <td className="py-1 pr-3">{d.toISOString().slice(0, 19).replace('T',' ')}</td>
                        <td className="py-1 pr-3">{a.courseId}/{a.subjectId}</td>
                        <td className="py-1 pr-3">{a.total}</td>
                        <td className="py-1 pr-3">{pct}%</td>
                        <td className="py-1 pr-3">{a.durationSec ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
