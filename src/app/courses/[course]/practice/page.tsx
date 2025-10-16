
'use client'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatJpEra } from '../../../../lib/qa/jpEra'
type SnapshotManifest = { files?: Array<{ courseId: string; subjectId: string; path: string; version?: number }> }
type SubjectMeta = { courseId: string; subjectId: string; nameJA: string; nameVI?: string; descriptionJA?: string; descriptionVI?: string }
type SubjectsJSON = { version: number; items?: SubjectMeta[]; subjects?: SubjectMeta[] }
async function safeFetchJson<T>(path: string): Promise<T | null> {
  try { const res = await fetch(path, { cache: 'no-store' }); if (!res.ok) return null; return await res.json() as T; } catch { return null }
}
function buildSubjectCounts(m: SnapshotManifest, courseId: string): Record<string, number> {
  const counts: Record<string, number> = {}; for (const f of m.files ?? []) { if ((f as any).courseId !== courseId) continue; const sid = (f as any).subjectId as string; counts[sid] = (counts[sid] ?? 0) + 1 } return counts
}
function listSubjectsForCourseLocal(courseId: string, subjectsJson: SubjectsJSON): SubjectMeta[] {
  const list = (subjectsJson?.items ?? (subjectsJson as any)?.subjects ?? []) as SubjectMeta[]; return list.filter((s) => s.courseId === courseId)
}
function hasCourseInSubjects(courseId: string, subjectsJson: SubjectsJSON | null): boolean {
  if (!subjectsJson) return false; const list = (subjectsJson.items ?? (subjectsJson as any)?.subjects ?? []) as SubjectMeta[]; return list.some((s) => s.courseId === courseId)
}
function buildYearList(latest: number = new Date().getFullYear(), length = 6): number[] { return Array.from({ length }, (_, i) => latest - i) }
export default function PracticeMenu({ params }: { params: { course: string } }) {
  const { course } = params; const router = useRouter()
  useEffect(() => { if (course === 'practice') { router.replace('/courses') } }, [course, router])
  const [subjectsJson, setSubjectsJson] = useState<SubjectsJSON | null>(null); const [manifest, setManifest] = useState<SnapshotManifest | null>(null); const [err, setErr] = useState<string | null>(null)
  useEffect(() => { let mounted = true; (async () => {
      const [m, s] = await Promise.all([ safeFetchJson<SnapshotManifest>('/snapshots/manifest.json'), safeFetchJson<SubjectsJSON>('/snapshots/subjects.json') ])
      if (!mounted) return; if (!m || !s) { setErr('Không tải được dữ liệu từ snapshots.'); return } setManifest(m); setSubjectsJson(s) })().catch((e) => { if (!mounted) return; setErr(e?.message || 'Không tải được dữ liệu') }); return () => { mounted = false } }, [])
  if (course === 'practice') { return (<main className="p-8"><div className="mb-3 text-sm">Đang chuyển về danh sách khóa học…</div><Link href="/courses" className="px-3 py-2 border rounded">Đến /courses</Link></main>) }
  if (err) return <main className="p-8 text-red-600">Lỗi: {err}</main>
  if (!subjectsJson || !manifest) return <main className="p-8">Đang tải…</main>
  const subjects = useMemo(() => listSubjectsForCourseLocal(course, subjectsJson), [course, subjectsJson])
  if (subjects.length === 0) { return (<main className="p-8 space-y-4"><div className="text-sm">Không tìm thấy dữ liệu cho khóa <b>{course}</b>. Vui lòng chọn lại khóa học.</div><Link href="/courses" className="inline-block px-3 py-2 border rounded bg-white hover:bg-gray-50">← Quay về danh sách khóa học</Link></main>) }
  const counts = useMemo(() => buildSubjectCounts(manifest!, course), [manifest, course]); const yearList = buildYearList()
  return (<main className="p-8 space-y-8">
    <header className="space-y-1"><h1 className="text-2xl font-bold">Khóa {course} — Luyện tập</h1><p className="text-sm text-gray-500">Chọn theo <b>môn (分野別)</b> hoặc theo <b>năm (年度別)</b>.</p></header>
    <section className="space-y-3"><h2 className="text-xl font-semibold">分野別 (Theo môn)</h2>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">{subjects.map((s) => { const count = counts[s.subjectId] ?? 0; const subtitle = (s.nameVI && s.nameVI.trim() !== '' ? s.nameVI : undefined) || (s.descriptionJA && s.descriptionJA.trim() !== '' ? s.descriptionJA : undefined); return (
        <Link key={`${s.courseId}__${s.subjectId}`} href={`/courses/${course}/practice/start?subject=${s.subjectId}`} className="border rounded-lg p-4 bg-white shadow hover:shadow-lg transition">
          <div className="font-medium text-lg">{s.nameJA} <span className="text-gray-400">({s.subjectId})</span></div>
          {subtitle && <div className="text-sm text-gray-500 line-clamp-2">{subtitle}</div>}
          <div className="mt-2 text-xs text-gray-500">{count} phiên bản dữ liệu</div>
        </Link>)})}</div>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">年度別 (Theo năm)</h2>
      <div className="flex flex-wrap gap-2">{buildYearList().map((y) => (<Link key={y} href={`/courses/${course}/practice/start?year=${y}`} className="border rounded-lg px-3 py-2 bg-white hover:bg-gray-50" title={`Năm ${formatJpEra(y)} (${y})`}>{formatJpEra(y)}</Link>))}</div>
    </section>
  </main>)
}
