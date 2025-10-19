'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import {
  loadSubjectsJson, listYearsForSubject, listSubjectsForYear,
  findSubjectMeta, getCourseDisplayNameJA, eraJP, loadRawQuestionsFor
} from '../../../../lib/qa/excel'

type ThinSubject = { subjectId: string; nameJA?: string; nameVI?: string }

function collectTagsFromSnapshot(items: any[]): string[] {
  const set = new Set<string>()
  for (const it of items || []) {
    const raw = (it?.tags ?? '').toString().trim()
    if (!raw) continue
    const parts = raw
      .replace(/[、;|]/g, ',')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
    for (const p of parts) set.add(p)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'))
}

export default function FilterPage() {
  const params = useParams<{ course: string }>()
  const search = useSearchParams()
  const courseId = decodeURIComponent(String(params?.course || ''))
  const subjectId = search.get('subject') || undefined
  const yearStr = search.get('year') || undefined
  const mode: 'subject' | 'year' = subjectId ? 'subject' : yearStr ? 'year' : 'subject'
  const lockedYear = yearStr ? Number(yearStr) : undefined

  const [subjectsJson, setSubjectsJson] = useState<any | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [availableSubjects, setAvailableSubjects] = useState<ThinSubject[]>([])
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [subjectTags, setSubjectTags] = useState<string[]>([])
  const [yearMode, setYearMode] = useState<'recent5'|'recent10'|'custom'|null>(null)
  const [customYears, setCustomYears] = useState<number[]>([])
  const [shuffle, setShuffle] = useState<boolean>(mode === 'year') // default ON for year, OFF for subject

  const subjectMeta = useMemo(() => {
    if (!subjectId) return null
    return findSubjectMeta(courseId, subjectId, subjectsJson)
  }, [courseId, subjectId, subjectsJson])

  const courseJA = useMemo(() => getCourseDisplayNameJA(courseId, subjectsJson) || courseId, [courseId, subjectsJson])

  // Load basic lists
  useEffect(() => {
    (async () => {
      const sj = await loadSubjectsJson()
      setSubjectsJson(sj)
      if (mode === 'subject' && subjectId) {
        const years = await listYearsForSubject(courseId, subjectId)
        setAvailableYears(years || [])
      }
      if (mode === 'year' && lockedYear) {
        const subs = await listSubjectsForYear(courseId, lockedYear, sj)
        setAvailableSubjects(subs || [])
      }
    })()
  }, [courseId, mode, subjectId, lockedYear])

  // Build tags dynamically (SUBJECT MODE ONLY)
  useEffect(() => {
    (async () => {
      if (mode !== 'subject' || !subjectId) { setSubjectTags([]); return }
      try {
        const raws = await loadRawQuestionsFor(courseId, subjectId)
        const tags = collectTagsFromSnapshot(raws || [])
        setSubjectTags(tags)
      } catch {
        setSubjectTags([])
      }
    })()
  }, [courseId, subjectId, mode])

  function toggleIn<T extends string|number>(arr: T[], v: T): T[] {
    const s = new Set(arr)
    if (s.has(v)) s.delete(v); else s.add(v)
    return Array.from(s)
  }

  const effectiveYears = useMemo(() => {
    const sorted = [...availableYears].sort((a,b)=>b-a)
    if (yearMode === 'recent5') return sorted.slice(0,5)
    if (yearMode === 'recent10') return sorted.slice(0,10)
    if (yearMode === 'custom') return [...customYears].sort((a,b)=>b-a)
    return sorted
  }, [availableYears, yearMode, customYears])

  function startPractice() {
    const q = new URLSearchParams()
    if (mode === 'subject') {
      q.set('subject', String(subjectId))
      if (effectiveYears.length && effectiveYears.length < availableYears.length) q.set('years', effectiveYears.join(','))
      if (pickedTags.length) q.set('tags', pickedTags.join(','))
      if (shuffle) q.set('shuffle', '1')
      location.assign(`/courses/${encodeURIComponent(courseId)}/practice/start?${q.toString()}`)
      return
    }
    // year mode
    const selected = (document.querySelector('input[name="subpick"]:checked') as HTMLInputElement | null)?.value
    if (!selected) { alert('Hãy chọn một môn để ra đề theo năm này.'); return }
    q.set('subject', selected)
    q.set('year', String(lockedYear))
    if (shuffle) q.set('shuffle', '1') // default ON
    location.assign(`/courses/${encodeURIComponent(courseId)}/practice/year?${q.toString()}`)
  }

  const title = mode === 'year' && lockedYear
    ? `出題_${lockedYear}年（${eraJP(lockedYear)}） / Bộ Lọc Đề_ Năm ${lockedYear} (${eraJP(lockedYear)})`
    : `出題 – ${courseJA} – ${subjectMeta?.nameJA || subjectId || ''} / Bộ lọc – ${courseId} – ${subjectMeta?.nameJA || subjectId || ''}`

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>{title}</h1>

      {mode === 'year' && (
        <section className="border rounded-lg p-4">
          <div className="font-bold mb-2">Chọn môn</div>
          <div style={{ display:'grid', gap:8 }}>
            {availableSubjects.map(s => (
              <label key={s.subjectId} className="flex items-center gap-2">
                <input type="radio" name="subpick" value={s.subjectId} defaultChecked={false} />
                <span>{s.nameJA || s.subjectId}{s.nameVI ? <span style={{color:'#64748b'}}> / {s.nameVI}</span> : null}</span>
              </label>
            ))}
            {!availableSubjects.length && <div className="text-gray-500">Chưa có môn cho năm này.</div>}
          </div>
        </section>
      )}

      {mode === 'subject' && (
        <section className="border rounded-lg p-4">
          <div className="font-bold mb-2">Năm</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: 8 }}>
            <button onClick={()=>setYearMode('recent5')} className="px-2 py-1 border rounded">5 năm gần nhất</button>
            <button onClick={()=>setYearMode('recent10')} className="px-2 py-1 border rounded">10 năm gần nhất</button>
            <button onClick={()=>{ setYearMode('custom'); setCustomYears([]) }} className="px-2 py-1 border rounded">Chọn cụ thể</button>
            <button onClick={()=>{ setYearMode(null); setCustomYears([]) }} className="px-2 py-1 border rounded">Tất cả</button>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[...availableYears].sort((a,b)=>b-a).map(y => {
              const active = yearMode === 'custom' ? customYears.includes(y) : effectiveYears.includes(y)
              return (
                <button key={y}
                    onClick={()=>{ if (yearMode!=='custom') return; setCustomYears(prev=>toggleIn(prev,y)) }}
                    className="px-2 py-1 border rounded"
                    style={{ background: active ? '#111' : '#fff', color: active ? '#fff' : '#111' }}>
                  {y} ({eraJP(y)})
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Shuffle toggle (ALWAYS visible; default ON in year-mode, OFF in subject-mode) */}
      <section className="border rounded-lg p-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={shuffle} onChange={e=>setShuffle(e.target.checked)} />
          <span>Trộn đáp án (Shuffle) — mặc định {mode==='year' ? 'ON' : 'OFF'}</span>
        </label>
      </section>

      {/* Tags box — SUBJECT MODE ONLY */}
      {mode === 'subject' && (
        <section className="border rounded-lg p-4">
          <div className="font-bold mb-2">Tags</div>
          {subjectTags.length ? (
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {subjectTags.map((t) => {
                const checked = pickedTags.includes(t)
                return (
                  <label key={t} className="px-2 py-1 border rounded cursor-pointer" style={{ background: checked ? '#111' : '#fff', color: checked ? '#fff' : '#111' }}>
                    <input type="checkbox" className="mr-2" checked={checked} onChange={() => setPickedTags(prev => toggleIn(prev, t))} />
                    <span>{t}</span>
                  </label>
                )
              })}
            </div>
          ) : (
            <div className="text-gray-500">Môn này chưa có tag nào trong dữ liệu snapshot.</div>
          )}
        </section>
      )}

      <div style={{ display:'flex', gap:12, alignItems:'stretch' }}>
        <section className="border rounded-lg p-4" style={{ borderColor:'#175cd3', background:'#e8f1ff', flex:1 }}>
          <div className="font-bold mb-2" style={{ color:'#175cd3' }}>Tổng hợp lựa chọn</div>
          <ul className="list-disc pl-5">
            {mode==='subject' && subjectId && <li>Môn: {subjectMeta?.nameJA || subjectId}</li>}
            {mode==='subject' && effectiveYears.length>0 && <li>Năm: {effectiveYears.join(', ')}</li>}
            {mode==='year' && lockedYear && <li>Năm: {lockedYear} ({eraJP(lockedYear)})</li>}
            {mode==='year' && (
              <li>
                Môn: {
                  (() => {
                    const selected = (typeof document !== 'undefined' ? (document.querySelector('input[name="subpick"]:checked') as HTMLInputElement | null)?.value : null)
                    if (!selected) return '(hãy chọn 1 môn)'
                    const hit = availableSubjects.find(s => s.subjectId === selected)
                    return hit?.nameJA || selected
                  })()
                }
              </li>
            )}
            <li>Shuffle: {shuffle ? 'ON' : 'OFF'}</li>
            {mode==='subject' && !!pickedTags.length && <li>Tags: {pickedTags.join(', ')}</li>}
          </ul>
        </section>
        <div className="flex items-center">
          <button onClick={startPractice} className="px-4 py-3 border rounded bg-[#175cd3] text-white font-bold">Bắt đầu</button>
        </div>
      </div>
    </main>
  )
}
