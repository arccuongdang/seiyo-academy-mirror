'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { loadSubjectsJson, listActiveCourses } from '../../lib/qa/excel'

type Course = { courseId: string; courseNameJA?: string; courseNameVI?: string }

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    (async () => {
      try {
        const sj = await loadSubjectsJson()
        const actives = listActiveCourses(sj)
        setCourses(actives.map(c => ({ courseId: c.courseId, courseNameJA: c.courseNameJA, courseNameVI: c.courseNameVI })))
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  return (
    <main style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Khoá học</h1>
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
