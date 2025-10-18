
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { loadSubjectsJson, listActiveCourses } from '../../lib/qa/excel'

type Course = { courseId: string; courseNameJA?: string; courseNameVI?: string }

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [error, setError] = useState<string| null>(null)

  useEffect(() => {
    (async () => {
      try {
        const sj = await loadSubjectsJson()
        const actives = listActiveCourses(sj)
        if (!actives.length) {
          console.warn('[courses] No active courses from /snapshots/subjects.json')
          setError('Không tìm thấy khoá học từ /snapshots/subjects.json. Kiểm tra file này có tồn tại và có mảng "courses" hay không.')
        }
        setCourses(actives.map(c => ({ courseId: c.courseId, courseNameJA: c.courseNameJA, courseNameVI: c.courseNameVI })))
      } catch (e: any) {
        console.error('[courses] load failed:', e)
        setError('Không tải được /snapshots/subjects.json (Network/404).')
      }
    })()
  }, [])

  return (
    <main style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Khoá học</h1>

      {error && (
        <div className="border rounded-lg p-3 bg-yellow-50 border-yellow-300 text-yellow-900 mb-4">
          {error} ・ Thử mở trực tiếp: <a href="/snapshots/subjects.json" className="underline text-blue-700">/snapshots/subjects.json</a>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {courses.map(c => (
          <Link key={c.courseId} href={`/courses/${encodeURIComponent(c.courseId)}`} className="block border rounded-lg p-4 hover:bg-gray-50">
            <div style={{ fontSize: 18, fontWeight: 800 }}>{c.courseNameJA || c.courseId}</div>
            <div style={{ color: '#64748b' }}>{c.courseNameVI}</div>
          </Link>
        ))}
      </div>
    </main>
  )
}
