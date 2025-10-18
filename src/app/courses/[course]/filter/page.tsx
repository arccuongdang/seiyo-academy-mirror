'use client';

/**
 * /courses/[course]/filter — Confirmed (Round 2)
 * - Title -> "出題 – {courseJA} – {subjectJA} / Bộ lọc – {courseId} – {subjectJA}"
 * - Remove subject-fixed info box
 * - Bottom summary box beside Start button, highlighted
 * - Year behaviors: default all active; 5/10 recent; "custom" where all off and user toggles
 * - Year chip label: "2024 (R6)"
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';

import {
  loadManifest,
  loadSubjectsJson,
  listYearsForSubject,
  listSubjectsForYear,
  findSubjectMeta,
  getCourseDisplayNameJA,
} from '../../../../lib/qa/excel';

type ManifestIndex = any;
type SnapshotAny = { items?: any[]; questions?: any[] };

function eraJP(year: number): string {
  if (year >= 2019) return `R${year - 2018}`;      // Reiwa
  if (year >= 1989) return `H${year - 1988}`;      // Heisei
  if (year >= 1926) return `S${year - 1925}`;      // Showa
  return `${year}`; // fallback
}

async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json() as Promise<T>;
}

function resolveLatestSnapshotPath(manifest: any, courseId: string, subjectId: string): string | null {
  const idx: ManifestIndex | undefined = manifest?.index;
  if (idx && idx[courseId] && idx[courseId][subjectId]?.latest?.path) {
    return String(idx[courseId][subjectId].latest.path);
  }
  const files: any[] = Array.isArray(manifest?.files) ? manifest.files : [];
  const candidates = files
    .filter((f) => typeof f?.path === 'string' && f.path.includes(`/${subjectId}-questions.v`))
    .map((f) => String(f.path));
  if (!candidates.length) return null;
  const pick = candidates
    .map((p) => ({ p, ts: Number((p.match(/\.v(\d+)\.json$/) || [])[1] || '0') }))
    .sort((a, b) => b.ts - a.ts)[0];
  return pick?.p || candidates[0];
}

function collectTags(snapshot: SnapshotAny) {
  const rows: any[] = Array.isArray(snapshot?.questions)
    ? snapshot.questions
    : Array.isArray(snapshot?.items)
    ? snapshot.items
    : [];
  const set = new Set<string>();
  for (const r of rows) {
    const tags: any = (r as any).tags;
    if (Array.isArray(tags)) tags.forEach((t) => set.add(String(t)));
    else if (typeof tags === 'string' && tags.trim()) set.add(tags.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function FilterPage() {
  const params = useParams<{ course: string }>();
  const search = useSearchParams();

  const courseId = decodeURIComponent(String(params?.course || ''));
  const lockedSubjectId = search.get('subject') || undefined;
  const lockedYearStr = search.get('year') || undefined;
  const mode: 'subject' | 'year' = lockedSubjectId ? 'subject' : lockedYearStr ? 'year' : 'subject';
  const lockedYear = lockedYearStr ? Number(lockedYearStr) : undefined;

  const [manifest, setManifest] = useState<any | null>(null);
  const [subjectsJson, setSubjectsJson] = useState<any | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<{ subjectId: string; nameJA?: string; nameVI?: string }[]>([]);

  // Tags
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [pickedTags, setPickedTags] = useState<string[]>([]);

  // Year UI state
  type YearMode = 'recent5' | 'recent10' | 'custom' | null;
  const [yearMode, setYearMode] = useState<YearMode>(null);
  const [customYears, setCustomYears] = useState<number[]>([]);

  const subjectMeta = useMemo(() => {
    if (!lockedSubjectId) return null;
    return findSubjectMeta(courseId, lockedSubjectId, subjectsJson) as { nameJA?: string; nameVI?: string } | null;
  }, [courseId, lockedSubjectId, subjectsJson]);

  const courseJA = useMemo(() => getCourseDisplayNameJA(courseId, subjectsJson) || courseId, [courseId, subjectsJson]);

  useEffect(() => {
    (async () => {
      try {
        const [m, s] = await Promise.all([loadManifest(), loadSubjectsJson()]);
        setManifest(m);
        setSubjectsJson(s);

        if (mode === 'subject' && lockedSubjectId) {
          const years = await listYearsForSubject(courseId, lockedSubjectId);
          setAvailableYears(years || []);

          const idx = m?.tagsIndex?.[courseId]?.[lockedSubjectId];
          if (Array.isArray(idx)) {
            const ids = idx.map((t: any) => String(t.id)).filter(Boolean);
            setAvailableTags(ids);
            setPickedTags((prev) => prev.filter((x) => ids.includes(x)));
          } else {
            const latestPath = resolveLatestSnapshotPath(m, courseId, lockedSubjectId);
            if (latestPath) {
              const snap = await fetchJson<SnapshotAny>(`/snapshots/${latestPath}`);
              const tags = collectTags(snap);
              setAvailableTags(tags);
              setPickedTags((p) => p.filter((x) => tags.includes(x)));
            } else {
              setAvailableTags([]);
              setPickedTags([]);
            }
          }
        }

        if (mode === 'year' && lockedYear) {
          const subs = await listSubjectsForYear(courseId, lockedYear, s);
          setAvailableSubjects(subs || []);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [courseId, mode, lockedSubjectId, lockedYear]);

  function toggleIn<T extends string | number>(arr: T[], v: T): T[] {
    const set = new Set(arr);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    return Array.from(set);
  }

  // Compute effective years based on UI
  const effectiveYears = useMemo(() => {
    const sorted = [...availableYears].sort((a, b) => b - a);
    if (yearMode === 'recent5') return sorted.slice(0, 5);
    if (yearMode === 'recent10') return sorted.slice(0, 10);
    if (yearMode === 'custom') return [...customYears].sort((a, b) => b - a);
    // default: all active
    return sorted;
  }, [availableYears, yearMode, customYears]);

  // SUMMARY (bottom)
  const summaryLines: string[] = [];
  if (mode === 'subject') {
    if (lockedSubjectId) summaryLines.push(`Môn: ${subjectMeta?.nameJA || lockedSubjectId}`);
    if (effectiveYears.length) summaryLines.push(`Năm: ${effectiveYears.join(', ')}`);
    if (pickedTags.length) summaryLines.push(`Tags: ${pickedTags.join(', ')}`);
  } else {
    if (lockedYear) summaryLines.push(`Năm: ${lockedYear}`);
    if (availableSubjects.length) summaryLines.push(`Môn: ${availableSubjects.map(s => s.nameJA || s.subjectId).join(', ')}`);
  }

  function startPractice() {
    if (mode === 'subject') {
      const q = new URLSearchParams();
      q.set('subject', String(lockedSubjectId));
      if (effectiveYears.length && effectiveYears.length < availableYears.length) {
        q.set('years', effectiveYears.join(','));
      }
      if (pickedTags.length) q.set('tags', pickedTags.join(','));
      // shuffle default OFF
      location.assign(`/courses/${encodeURIComponent(courseId)}/practice/start?${q.toString()}`);
      return;
    }
    const q = new URLSearchParams();
    if (lockedSubjectId) q.set('subject', String(lockedSubjectId));
    if (lockedYear) q.set('year', String(lockedYear));
    location.assign(`/courses/${encodeURIComponent(courseId)}/practice/year?${q.toString()}`);
  }

  // UI
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: '0 auto', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>
        出題 – {courseJA} – {subjectMeta?.nameJA || lockedSubjectId} <span style={{ color:'#64748b', fontWeight: 600, marginLeft: 8 }}>/ Bộ lọc – {courseId} – {subjectMeta?.nameJA || lockedSubjectId}</span>
      </h1>

      {/* Tags */}
      {mode === 'subject' && availableTags.length > 0 && (
        <section style={box}>
          <div style={boxTitle}>Tags</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {availableTags.map((t) => {
              const active = pickedTags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => setPickedTags((prev) => toggleIn(prev, t))}
                  style={chip(active)}
                  aria-pressed={active}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div style={hint}>Chọn nhiều tag (Union). Bỏ trống = không lọc theo tag.</div>
        </section>
      )}

      {/* Years box (subject mode) */}
      {mode === 'subject' && availableYears.length > 0 && (
        <section style={box}>
          <div style={boxTitle}>Năm</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={() => setYearMode('recent5')}  style={chip(yearMode === 'recent5')}>5 năm gần nhất</button>
            <button onClick={() => setYearMode('recent10')} style={chip(yearMode === 'recent10')}>10 năm gần nhất</button>
            <button onClick={() => { setYearMode('custom'); setCustomYears([]); }} style={chip(yearMode === 'custom')}>Chọn cụ thể</button>
            <button onClick={() => { setYearMode(null); setCustomYears([]); }} style={chip(yearMode === null)}>Tất cả</button>
          </div>

          {/* Year chips: default dark (active) unless custom mode */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[...availableYears].sort((a, b) => b - a).map(y => {
              const active = yearMode === 'custom' ? customYears.includes(y) : effectiveYears.includes(y);
              const label = `${y} (${eraJP(y)})`;
              return (
                <button
                  key={y}
                  onClick={() => {
                    if (yearMode !== 'custom') return; // only toggle in custom mode
                    setCustomYears(prev => toggleIn(prev, y));
                  }}
                  style={yearChip(active, yearMode === 'custom')}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={hint}>
            Mặc định tất cả năm đang bật. Chọn "5 năm gần nhất" / "10 năm gần nhất" để lọc nhanh. Chọn "Chọn cụ thể" để tự bật từng năm.
          </div>
        </section>
      )}

      {/* Bottom action row with highlighted summary box and Start button */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <section style={{ ...box, borderColor: '#175cd3', background: '#e8f1ff', flex: 1 }}>
          <div style={{ ...boxTitle, color: '#175cd3' }}>Tổng hợp lựa chọn</div>
          {summaryLines.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {summaryLines.map((t, i) => (<li key={i}>{t}</li>))}
            </ul>
          ) : (
            <div style={{ color: '#475569' }}>Chưa có lựa chọn đặc biệt.</div>
          )}
        </section>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={startPractice} style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 800, fontSize: 16 }}>
            Bắt đầu
          </button>
        </div>
      </div>
    </main>
  );
}

const box: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
};
const boxTitle: React.CSSProperties = { fontWeight: 800, marginBottom: 8 };
const hint: React.CSSProperties = { color: '#6b7280', fontSize: 12, marginTop: 6 };
function chip(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: active ? '2px solid #175cd3' : '1px solid #e5e7eb',
    background: active ? '#eff6ff' : '#fff',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  };
}
function yearChip(active: boolean, customMode: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: active ? '2px solid #111827' : '1px solid #e5e7eb',
    background: active ? '#111827' : '#fff',
    color: active ? '#fff' : '#111827',
    opacity: customMode ? 1 : 0.9,
    cursor: customMode ? 'pointer' : 'default',
  };
}
