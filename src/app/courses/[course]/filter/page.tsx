
'use client';

/**
 * /courses/[course]/filter  — Revised
 * - Title shows: "Bộ lọc – {courseId} – {subjectNameJA}" when subject is locked
 * - Removed "BOX MÔN" (no extra subject box here; use locked subject)
 * - Added "BOX tổng hợp lựa chọn" (live summary) near the Start area
 * - Uses TagsIndex from manifest if available; fallback scans latest snapshot
 * - Default toggles (Furigana/Shuffle) are not set here; Start page handles default OFF
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import FilterForm from '../../../../components/FilterForm';

import {
  loadManifest,
  loadSubjectsJson,
  listYearsForSubject,
  listSubjectsForYear,
  findSubjectMeta,
} from '../../../../lib/qa/excel';

type ManifestIndex = {
  [courseId: string]: {
    [subjectId: string]: {
      versions: { ts: number; path: string }[];
      latest: { ts: number; path: string };
    };
  };
};

type SnapshotAny = {
  items?: any[];
  questions?: any[];
};

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
  const router = useRouter();
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

  // Tags & Diffs
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [availableDiffs, setAvailableDiffs] = useState<string[]>([]);
  const [pickedDiffs, setPickedDiffs] = useState<string[]>([]);

  // Subject meta for JA title
  const subjectMeta = useMemo(() => {
    if (!lockedSubjectId) return null;
    return findSubjectMeta(courseId, lockedSubjectId, subjectsJson) as { nameJA?: string } | null;
  }, [courseId, lockedSubjectId, subjectsJson]);

  useEffect(() => {
    (async () => {
      try {
        const [m, s] = await Promise.all([loadManifest(), loadSubjectsJson()]);
        setManifest(m);
        setSubjectsJson(s);

        if (mode === 'subject' && lockedSubjectId) {
          const years = await listYearsForSubject(courseId, lockedSubjectId);
          setAvailableYears(years || []);

          // TagsIndex ưu tiên
          const idx = m?.tagsIndex?.[courseId]?.[lockedSubjectId];
          if (Array.isArray(idx)) {
            const ids = idx.map((t: any) => String(t.id)).filter(Boolean);
            setAvailableTags(ids);
            setPickedTags((prev) => prev.filter((x) => ids.includes(x)));
          } else {
            // Fallback scan
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

  function toggleIn<T extends string>(arr: T[], v: T): T[] {
    const set = new Set(arr);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    return Array.from(set);
  }

  function handleConfirm(params: {
    mode: 'subject' | 'year';
    subjectId?: string;
    year?: number;
    randomLast?: 5 | 10 | null;
    years?: number[];
    count?: 5 | 10 | 15 | 20 | 25;
    shuffle?: boolean;
  }) {
    if (params.mode === 'subject') {
      const q = new URLSearchParams();
      q.set('subject', String(params.subjectId));
      if (params.randomLast) q.set('randomLast', String(params.randomLast));
      if (!params.randomLast && params.years && params.years.length) q.set('years', params.years.join(','));
      if (params.count) q.set('count', String(params.count));
      if (params.shuffle) q.set('shuffle', '1');
      if (pickedTags.length) q.set('tags', pickedTags.join(','));       // Union (AND)
      if (pickedDiffs.length) q.set('difficulty', pickedDiffs.join(',')); // nhiều chọn
      router.push(`/courses/${encodeURIComponent(courseId)}/practice/start?${q.toString()}`);
      return;
    }
    const q = new URLSearchParams();
    if (params.subjectId) q.set('subject', String(params.subjectId));
    if (params.year) q.set('year', String(params.year));
    if (params.shuffle) q.set('shuffle', '1');
    router.push(`/courses/${encodeURIComponent(courseId)}/practice/year?${q.toString()}`);
  }

  // ===== Summary box content (live) =====
  const summaryLines: string[] = [];
  if (mode === 'subject') {
    if (lockedSubjectId) summaryLines.push(`Môn: ${subjectMeta?.nameJA || lockedSubjectId}`);
    if (availableYears.length) summaryLines.push(`Năm có dữ liệu: ${availableYears.join(', ')}`);
    if (pickedTags.length) summaryLines.push(`Tags: ${pickedTags.join(', ')}`);
    if (pickedDiffs.length) summaryLines.push(`Độ khó: ${pickedDiffs.join(', ')}`);
  } else {
    if (lockedYear) summaryLines.push(`Năm: ${lockedYear}`);
    if (availableSubjects.length) summaryLines.push(`Môn: ${availableSubjects.map(s => s.nameJA || s.subjectId).join(', ')}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto', display: 'grid', gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>
        {/* Title per requirement: "Bộ lọc – KTS2 -構造" when subject mode & locked */}
        Bộ lọc – {courseId}{mode === 'subject' && lockedSubjectId ? ` – ${subjectMeta?.nameJA || lockedSubjectId}` : ''} {mode === 'subject' ? '' : ''}
      </h1>

      {mode === 'subject' && (
        <>
          {/* Tags (Union) */}
          {availableTags.length > 0 && (
            <section style={box}>
              <div style={boxTitle}>Tags (Union)</div>
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
              <div style={hint}>Chọn nhiều tag để lấy giao (AND). Bỏ trống = không lọc theo tag.</div>
            </section>
          )}

          {/* Difficulty (nếu dự án của bạn đang dùng) */}
          {availableDiffs.length > 0 && (
            <section style={box}>
              <div style={boxTitle}>Độ khó</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {availableDiffs.map((d) => {
                  const active = pickedDiffs.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => setPickedDiffs((prev) => toggleIn(prev, d))}
                      style={chip(active)}
                      aria-pressed={active}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div style={hint}>Có thể chọn nhiều độ khó (A/AA/AAA). Bỏ trống = không lọc độ khó.</div>
            </section>
          )}
        </>
      )}

      {/* BOX tổng hợp lựa chọn (đặt ngay trên FilterForm, cạnh nút Bắt đầu về mặt thị giác) */}
      {summaryLines.length > 0 && (
        <section style={{ ...box, borderColor: '#175cd3', background: '#f0f6ff' }}>
          <div style={{ ...boxTitle, color: '#175cd3' }}>Tổng hợp lựa chọn</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {summaryLines.map((t, i) => (<li key={i}>{t}</li>))}
          </ul>
        </section>
      )}

      {/* Form chính (giữ nguyên API) */}
      <FilterForm
        mode={mode}
        courseId={courseId}
        lockedSubjectId={lockedSubjectId}
        lockedYear={lockedYear}
        availableYears={availableYears}
        availableSubjects={availableSubjects}
        defaults={{ count: 10, shuffleOptions: false }}
        storageKey={`seiyo:filter:${courseId}:${mode}`}
        onConfirm={handleConfirm}
      />
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
