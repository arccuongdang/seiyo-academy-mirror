'use client';

/**
 * ============================================================================
 *  Courses › {course} › Filter (dùng FilterForm component)
 *  - Page chịu trách nhiệm: đọc URL, fetch manifest/subjects, tính
 *    availableYears/availableSubjects.
 *  - FilterForm: UI + state cục bộ + localStorage + gọi onConfirm.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

// helpers (Plan B, relative import)
import {
  loadManifest,
  loadSubjectsJson,
  listYearsForSubject,
  listSubjectsForYear,
} from '../../../../lib/qa/excel';

import type { SnapshotManifest, SubjectsJSON } from '../../../../lib/qa/schema';

// component
import FilterForm from '../../../../components/FilterForm';

type Mode = 'subject' | 'year';
type ThinSubject = { subjectId: string; nameJA?: string; nameVI?: string };

function toInt(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function FilterPage({ params }: { params: { course: string } }) {
  const { course } = params;
  const router = useRouter();
  const sp = useSearchParams();

  const qSubject = sp.get('subject');
  const qYear = toInt(sp.get('year'));
  const mode: Mode = qSubject ? 'subject' : qYear ? 'year' : 'subject';

  // nền
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);
  const [subjectsJson, setSubjectsJson] = useState<SubjectsJSON | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // dữ liệu cho form
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<ThinSubject[]>([]);

  // fetch manifest + subjects
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [m, sj] = await Promise.all([loadManifest(), loadSubjectsJson()]);
        if (!mounted) return;
        setManifest(m);
        setSubjectsJson(sj);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Không tải được dữ liệu');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // tính availableYears (mode=subject)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mode !== 'subject' || !qSubject) {
        setAvailableYears([]);
        return;
      }
      try {
        const ys = await listYearsForSubject(course, qSubject, manifest || undefined);
        if (!mounted) return;
        setAvailableYears(ys);
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mode, qSubject, course, manifest]);

  // tính availableSubjects (mode=year)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (mode !== 'year' || !qYear) {
        setAvailableSubjects([]);
        return;
      }
      try {
        const list = await listSubjectsForYear(
          course,
          qYear,
          manifest || undefined,
          subjectsJson || undefined
        );
        if (!mounted) return;
        // map sang “type mỏng” đúng 1 lần
        setAvailableSubjects(
          list.map((s) => ({
            subjectId: s.subjectId,
            nameJA: s.nameJA,
            nameVI: s.nameVI,
          }))
        );
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mode, qYear, course, manifest, subjectsJson]);

  // handler confirm từ Form → build URL & push
  function handleConfirm(params: {
    mode: Mode;
    subjectId?: string;
    year?: number;
    randomLast?: 5 | 10 | null;
    years?: number[];
    count?: 5 | 10 | 15 | 20 | 25;
    shuffle?: boolean;
  }) {
    if (params.mode === 'subject') {
      const usp = new URLSearchParams();
      if (!params.subjectId) return alert('Thiếu subjectId');
      usp.set('subject', params.subjectId);
      if (params.randomLast) usp.set('randomLast', String(params.randomLast));
      if (!params.randomLast && params.years && params.years.length) {
        usp.set('years', params.years.join(','));
      }
      if (params.count) usp.set('count', String(params.count));
      usp.set('shuffle', params.shuffle ? '1' : '0');
      router.push(`/courses/${course}/practice/start?` + usp.toString());
    } else {
      const usp = new URLSearchParams();
      if (!params.subjectId || !params.year) return alert('Thiếu subjectId hoặc year');
      usp.set('subject', params.subjectId);
      usp.set('year', String(params.year));
      usp.set('shuffle', params.shuffle ? '1' : '0');
      router.push(`/courses/${course}/practice/year?` + usp.toString());
    }
  }

  // guards
  if (err) {
    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: 12 }}>
          <Link href={`/courses/${course}`}>&larr; Quay lại khoá {course}</Link>
        </div>
        <div style={{ color: 'crimson' }}>Lỗi: {err}</div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 12 }}>
        <Link href={`/courses/${course}`}>&larr; Quay lại khoá {course}</Link>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        Bộ lọc ({mode === 'subject' ? 'Theo môn' : 'Theo năm'})
      </h1>

      {loading && <div>Đang tải dữ liệu...</div>}

      {/* MODE = SUBJECT */}
      {!loading && mode === 'subject' && (
        <FilterForm
          mode="subject"
          courseId={course}
          lockedSubjectId={qSubject || undefined}
          availableYears={availableYears}
          defaults={{ count: 10, shuffleOptions: false }}
          storageKey={`seiyo:filter:${course}:subject`}
          onConfirm={handleConfirm}
        />
      )}

      {/* MODE = YEAR */}
      {!loading && mode === 'year' && (
        <FilterForm
          mode="year"
          courseId={course}
          lockedYear={qYear ?? undefined}
          availableSubjects={availableSubjects}
          defaults={{ shuffleOptions: false }}
          storageKey={`seiyo:filter:${course}:year`}
          onConfirm={handleConfirm}
        />
      )}
    </main>
  );
}
