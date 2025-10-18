'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { loadSubjectsJson, listAvailableYearsForCourse, eraJP, getCourseDisplayNameJA } from '../../../lib/qa/excel'
import { useParams } from 'next/navigation'

export default function CourseHubPage() {
  const params = useParams<{ course: string }>()
  const courseId = decodeURIComponent(String(params?.course || ''))
  const [years, setYears] = useState<number[]>([])
  const [courseJA, setCourseJA] = useState<string>(courseId)

  useEffect(() => {
    (async () => {
      const sj = await loadSubjectsJson()
      const ys = await listAvailableYearsForCourse(courseId, sj)
      setYears(ys)
      setCourseJA(getCourseDisplayNameJA(courseId, sj) || courseId)
    })()
  }, [courseId])

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Khóa {courseJA} / {courseId}</h1>

      <section className="border rounded-lg p-4">
        <div className="font-bold mb-2">Luyện theo năm</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {years.map(y => (
            <Link key={y} href={`/courses/${encodeURIComponent(courseId)}/filter?year=${y}`} className="px-3 py-2 border rounded hover:bg-gray-50">
              {y} ({eraJP(y)})
            </Link>
          ))}
        </div>
      </section>

      <section className="border rounded-lg p-4">
        <div className="font-bold mb-2">Luyện theo môn</div>
        <Link href={`/courses/${encodeURIComponent(courseId)}/filter`} className="px-3 py-2 border rounded bg-black text-white w-max">
          Chọn môn &amp; bộ lọc
        </Link>
      </section>
    </main>
  )
}
