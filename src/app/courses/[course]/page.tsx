'use client';

/**
 * ============================================================================
 *  Courses › {course} — Chọn môn / Chọn năm → sang Filter
 *  - Năm hiển thị: đọc thật từ snapshots bằng listAvailableYearsForCourse()
 *  - Không dùng "@/"; chỉ import tương đối
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Loaders (Plan B)
import {
  loadManifest,
  loadSubjectsJson,
  listSubjectsForCourse,
  listAvailableYearsForCourse,
} from '../../../lib/qa/excel';

// Types
import type { SnapshotManifest, SubjectsJSON } from '../../../lib/qa/schema';

// Gates
import AuthGate from '../../../components/AuthGate';
import ProfileGate from '../../../components/ProfileGate';

/* =============================================================================
 * Helpers
 * ========================================================================== */

function collectSubjectCounts(
  manifest: SnapshotManifest | null,
  courseId: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!manifest?.files?.length) return counts;
  for (const f of manifest.files) {
    if (f.courseId !== courseId) continue;
    counts[f.subjectId] = (counts[f.subjectId] ?? 0) + 1;
  }
  return counts;
}

// Era label (chỉ để hiển thị)
function toEraLabel(y: number): string {
  if (y >= 2019) return `令和${y - 2018}年（${y}年）`;
  if (y >= 1989) return `平成${y - 1988}年（${y}年）`;
  return `${y}年`;
}

/* =============================================================================
 * Component
 * ========================================================================== */

export default function CoursePage({ params }: { params: { course: string } }) {
  const { course } = params;

  // Data state
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);
  const [subjectsJson, setSubjectsJson] = useState<SubjectsJSON | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load dữ liệu: manifest + subjects.json + years thật
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [m, s] = await Promise.all([loadManifest(), loadSubjectsJson()]);
        const ys = await listAvailableYearsForCourse(course, m, s);
        if (!mounted) return;
        setManifest(m);
        setSubjectsJson(s);
        setYears(ys);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Không tải được dữ liệu');
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [course]);

  // Môn học của khóa (từ subjects.json)
  const subjects = useMemo(
    () => (subjectsJson ? listSubjectsForCourse(course, subjectsJson) : []),
    [course, subjectsJson]
  );

  // Tên hiển thị + số snapshot (tham khảo)
  const subjectNameMap = useMemo(() => {
    const m: Record<string, { nameJA?: string; nameVI?: string }> = {};
    for (const s of subjects) m[s.subjectId] = { nameJA: s.nameJA, nameVI: s.nameVI };
    return m;
  }, [subjects]);

  const counts = useMemo(
    () => collectSubjectCounts(manifest, course),
    [manifest, course]
  );

  const subjectIds = useMemo(() => subjects.map((s) => s.subjectId), [subjects]);

  /* =======================
   * RENDER
   * ===================== */
  return (
    <AuthGate>
      <ProfileGate>
        <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            Khóa {course} — Chọn cách luyện
          </h1>

          {err && <div style={{ color: 'crimson', marginBottom: 16 }}>Lỗi: {err}</div>}
          {loading && <div>Đang tải dữ liệu...</div>}

          {/* 分野別（Theo môn） */}
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>
            分野別（Theo môn）
          </h2>

          {!loading && subjectIds.length === 0 ? (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 16,
                color: '#475467',
              }}
            >
              Chưa có dữ liệu môn cho khóa {course}.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {subjectIds.map((sid) => {
                const displayName = subjectNameMap[sid]?.nameJA?.trim() || sid;
                const count = counts[sid] ?? 0;

                return (
                  <Link
                    key={sid}
                    href={`/courses/${course}/filter?subject=${encodeURIComponent(sid)}`}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{displayName}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      {count} phiên bản dữ liệu
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* 年度別（Theo năm） */}
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>
            年度別（Theo năm）
          </h2>

          {!loading && years.length === 0 ? (
            <div style={{ color: '#6b7280' }}>Chưa có dữ liệu theo năm cho khóa này.</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {years.map((y) => (
                <Link
                  key={y}
                  href={`/courses/${course}/filter?year=${y}`}
                  style={{
                    padding: '10px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    background: '#fff',
                  }}
                >
                  {toEraLabel(y)}
                </Link>
              ))}
            </div>
          )}
        </main>
      </ProfileGate>
    </AuthGate>
  );
}
