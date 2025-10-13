'use client';

/**
 * ============================================================================
 *  Courses › {course} — Trang chọn đề
 * ----------------------------------------------------------------------------
 *  Data nguồn (Plan B):
 *    - snapshots/manifest.json  (mảng files[])
 *    - snapshots/subjects.json  (danh mục môn JA/VI, đa khóa)
 *
 *  Hiển thị:
 *    - Danh sách môn (分野別): tên JA (fallback subjectId) + số phiên bản snapshot
 *    - Danh sách năm (年度別): nếu chỉ có 1 môn → điều hướng thẳng kèm ?subject
 *
 *  Chú ý:
 *    - Không dùng "@/"; chỉ đường dẫn tương đối.
 *    - Manifest cũ (lồng) không còn hỗ trợ; ta đọc theo files[] (Plan B).
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Loaders (Plan B)
import {
  loadManifest,
  loadSubjectsJson,
  listSubjectsForCourse,
} from '../../../lib/qa/excel';

// Types
import type { SnapshotManifest, SubjectsJSON } from '../../../lib/qa/schema';

// Gates
import AuthGate from '../../../components/AuthGate';
import ProfileGate from '../../../components/ProfileGate';

/* =============================================================================
 * SECTION A. Helpers
 * ========================================================================== */

/** Gom số snapshot theo subjectId trong 1 course từ manifest.files */
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

/** Gregorian → nhãn era Nhật + dương lịch */
function toEraLabel(y: number): string {
  if (y >= 2019) return `令和${y - 2018}年（${y}年）`;
  if (y >= 1989) return `平成${y - 1988}年（${y}年）`;
  return `${y}年`;
}

/** Tạo danh sách năm giảm dần */
function makeYearChoices(minYear = 2015, maxYear = new Date().getFullYear()) {
  const out: { label: string; year: number }[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    out.push({ year: y, label: toEraLabel(y) });
  }
  return out;
}

/* =============================================================================
 * SECTION B. Component
 * ========================================================================== */

export default function CoursePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const router = useRouter();

  // Data state
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);
  const [subjectsJson, setSubjectsJson] = useState<SubjectsJSON | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load manifest + subjects.json (song song)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [m, s] = await Promise.all([loadManifest(), loadSubjectsJson()]);
        if (!mounted) return;
        setManifest(m);
        setSubjectsJson(s);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Không tải được dữ liệu');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [course]);

  // Danh sách môn của khóa từ subjects.json
  const subjects = useMemo(
    () => (subjectsJson ? listSubjectsForCourse(course, subjectsJson) : []),
    [course, subjectsJson]
  );

  // Map subjectId -> tên JA/VI để hiển thị
  const subjectNameMap = useMemo(() => {
    const m: Record<string, { nameJA?: string; nameVI?: string }> = {};
    for (const s of subjects) {
      m[s.subjectId] = { nameJA: s.nameJA, nameVI: s.nameVI };
    }
    return m;
  }, [subjects]);

  // Số phiên bản snapshot/subject (đếm từ manifest.files)
  const counts = useMemo(
    () => collectSubjectCounts(manifest, course),
    [manifest, course]
  );

  // SubjectIDs hiển thị: giao giữa “có trong subjects.json” và “có dữ liệu trong manifest”
  const subjectIds = useMemo(() => {
    const idsFromSubjects = new Set(subjects.map((s) => s.subjectId));
    const idsFromCounts = new Set(Object.keys(counts));
    // nếu muốn “hiện cả môn chưa có dữ liệu”, thay logic gộp bằng idsFromSubjects.
    const ids = Array.from(idsFromCounts).filter((id) => idsFromSubjects.has(id));
    return ids.sort();
  }, [subjects, counts]);

  // Danh sách năm (render trong component; không dùng hook ngoài scope)
  const YEAR_CHOICES = useMemo(() => makeYearChoices(2015), []);

  /* =======================
   * RENDER
   * ===================== */
  return (
    <AuthGate>
      <ProfileGate>
        <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            Khóa {course} — Chọn đề
          </h1>

          {err && (
            <div style={{ color: 'crimson', marginBottom: 16 }}>
              Lỗi: {err}
            </div>
          )}

          {!manifest && !subjectsJson && !err && <div>Đang tải dữ liệu...</div>}

          {/* 分野別 (Theo môn) */}
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>
            分野別（Theo môn）
          </h2>

          {subjectIds.length === 0 ? (
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
                const count = counts[sid] ?? 0;
                const displayName =
                  subjectNameMap[sid]?.nameJA?.trim() || sid;

                return (
                  <div
                    key={sid}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800 }}>{displayName}</div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        {count} phiên bản dữ liệu
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        href={`/courses/${course}/practice/start?subject=${encodeURIComponent(
                          sid
                        )}`}
                        style={{
                          padding: '8px 12px',
                          border: '1px solid #175cd3',
                          borderRadius: 8,
                          background: '#175cd3',
                          color: '#fff',
                          fontWeight: 700,
                        }}
                      >
                        Luyện theo môn
                      </Link>

                      <Link
                        href={`/courses/${course}/practice/year?subject=${encodeURIComponent(
                          sid
                        )}`}
                        style={{
                          padding: '8px 12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          background: '#fff',
                          color: '#111',
                          fontWeight: 700,
                        }}
                      >
                        Thi theo năm
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 年度別 (Theo năm) */}
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>
            年度別（Theo năm）
          </h2>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {YEAR_CHOICES.map((y) => (
              <button
                key={y.year}
                onClick={() => {
                  if (subjectIds.length === 1) {
                    // Nếu chỉ có 1 môn, auto gắn subject vào URL
                    const sid = subjectIds[0];
                    router.push(
                      `/courses/${course}/practice/year?subject=${encodeURIComponent(
                        sid
                      )}&year=${y.year}`
                    );
                  } else if (subjectIds.length > 1) {
                    alert('Vui lòng chọn môn trước khi thi theo năm.');
                  } else {
                    alert('Chưa có dữ liệu môn cho khóa này.');
                  }
                }}
                style={{
                  padding: '10px 16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  background: '#fff',
                }}
              >
                {y.label}
              </button>
            ))}
          </div>
        </main>
      </ProfileGate>
    </AuthGate>
  );
}
