'use client';

/**
 * ============================================================================
 *  Courses – Danh sách khóa học (từ subjects.json – Plan B)
 * ----------------------------------------------------------------------------
 *  Nguồn dữ liệu:
 *    - public/snapshots/subjects.json  → loadSubjectsJson()
 *  Hiển thị:
 *    - Mỗi khóa (courseId) + số môn (subjects) thuộc khóa đó
 *  Ghi chú:
 *    - Không dùng "@/"; chỉ import tương đối.
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Loader Plan B
import { loadSubjectsJson } from '../../lib/qa/excel';

// Gates
import AuthGate from '../../components/AuthGate';
import ProfileGate from '../../components/ProfileGate';

type CourseMeta = {
  courseId: string;
  subjectsCount: number;
};

export default function CoursesPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseMeta[]>([]);

  // Load subjects.json rồi nhóm theo courseId
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const subjects = await loadSubjectsJson(); // { version, items: [...] }
        if (!mounted) return;

        const countByCourse: Record<string, number> = {};
        for (const it of subjects.items || []) {
          const cid = String(it.courseId || '').trim();
          if (!cid) continue;
          countByCourse[cid] = (countByCourse[cid] ?? 0) + 1;
        }

        const list: CourseMeta[] = Object.keys(countByCourse)
          .sort()
          .map((courseId) => ({ courseId, subjectsCount: countByCourse[courseId] }));

        setCourses(list);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Không tải được danh sách khóa học');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AuthGate>
      <ProfileGate>
        <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            Khóa học
          </h1>

          {loading && <div>Đang tải…</div>}
          {err && <div style={{ color: 'crimson' }}>Lỗi: {err}</div>}

          {!loading && !err && courses.length === 0 && (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 16,
                color: '#475467',
              }}
            >
              Chưa có dữ liệu khóa học trong <code>subjects.json</code>.
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {courses.map((c) => (
              <Link
                key={c.courseId}
                href={`/courses/${encodeURIComponent(c.courseId)}`}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontWeight: 800 }}>{c.courseId}</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {c.subjectsCount} môn
                </div>
              </Link>
            ))}
          </div>
        </main>
      </ProfileGate>
    </AuthGate>
  );
}
