'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { loadSubjectsJson, listAvailableYearsForCourse, eraJP, getCourseDisplayNameJA, getCourseDisplayNameVI, listSubjectsForCourse } from '../../../lib/qa/excel'

type ThinSubject = { subjectId: string; nameJA?: string; nameVI?: string }

export default function CourseHubPage() {
  const params = useParams<{ course: string }>()
  const courseId = decodeURIComponent(String(params?.course || ''))
  const [years, setYears] = useState<number[]>([])
  const [courseJA, setCourseJA] = useState<string>(courseId)
  const [courseVI, setCourseVI] = useState<string>('')
  const [subjects, setSubjects] = useState<ThinSubject[]>([])

  useEffect(() => {
    (async () => {
      const sj = await loadSubjectsJson()
      setCourseJA(getCourseDisplayNameJA(courseId, sj) || courseId)
      setCourseVI(getCourseDisplayNameVI(courseId, sj) || '')
      const ys = await listAvailableYearsForCourse(courseId, sj)
      setYears(ys)
      setSubjects(listSubjectsForCourse(courseId, sj))
    })()
  }, [courseId])

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>{courseJA}{courseVI ? ' / ' + courseVI : ''}</h1>

      <section className="border rounded-lg p-4">
        <div className="font-bold mb-2">Luyện theo năm <span style={{color:'#64748b'}}>(Chọn năm để bắt đầu ra đề)</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {years.map(y => (
            <Link key={y} href={`/courses/${encodeURIComponent(courseId)}/filter?year=${y}`} className="px-3 py-2 border rounded hover:bg-gray-50">
              {y} ({eraJP(y)})
            </Link>
          ))}
          {!years.length && <div className="text-gray-500">Chưa có dữ liệu năm.</div>}
        </div>
      </section>

      <section className="border rounded-lg p-4">
        <div className="font-bold mb-2">Luyện theo môn <span style={{color:'#64748b'}}>(Chọn môn để bắt đầu ra đề)</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {subjects.map(s => (
            <Link key={s.subjectId} href={`/courses/${encodeURIComponent(courseId)}/filter?subject=${encodeURIComponent(s.subjectId)}`} className="px-3 py-2 border rounded hover:bg-gray-50">
              {s.nameJA || s.subjectId} {s.nameVI ? <span style={{color:'#64748b'}}> / {s.nameVI}</span> : null}
            </Link>
          ))}
          {!subjects.length && <div className="text-gray-500">Chưa có danh sách môn.</div>}
        </div>
      </section>
    </main>
  )
}
