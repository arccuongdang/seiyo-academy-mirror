'use client';

/**
 * =============================================================================
 *  Practice Menu – Khóa học {course}
 *  Data nguồn: snapshots/manifest.json + snapshots/subjects.json
 * -----------------------------------------------------------------------------
 *  Mục tiêu:
 *   - Không load ngân hàng câu hỏi ở đây.
 *   - Hiển thị danh sách môn (分野別) lấy từ subjects.json (tên JA/VI).
 *   - Đếm số file snapshot/subject từ manifest (mảng files[]).
 *   - Cung cấp lối vào theo năm (年度別) → điều hướng tới trang start/year.
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Loaders & utils theo phương án B
import {
  loadManifest,
  loadSubjectsJson,
  listSubjectsForCourse,
} from '../../../../lib/qa/excel';
import type { SnapshotManifest, SubjectsJSON } from '../../../../lib/qa/schema';
import { formatJpEra } from '../../../../lib/qa/jpEra';

/* =============================================================================
 * SECTION A. Small helpers
 * ========================================================================== */

/** Đếm số snapshot theo subject trong 1 course */
function buildSubjectCounts(manifest: SnapshotManifest, courseId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of manifest.files ?? []) {
    if (f.courseId !== courseId) continue;
    counts[f.subjectId] = (counts[f.subjectId] ?? 0) + 1;
  }
  return counts;
}

/** Tạo danh sách năm để filter (tuỳ bạn điều chỉnh) */
function buildYearList(latest: number = new Date().getFullYear(), length = 6): number[] {
  // ví dụ: 2025..2020 (6 năm gần nhất)
  return Array.from({ length }, (_, i) => latest - i);
}

/* =============================================================================
 * SECTION B. Component
 * ========================================================================== */

export default function PracticeMenu({ params }: { params: { course: string } }) {
  const { course } = params;

  const [subjectsJson, setSubjectsJson] = useState<SubjectsJSON | null>(null);
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
  }, []);

  if (err) return <main className="p-8 text-red-600">Lỗi: {err}</main>;
  if (!subjectsJson || !manifest) return <main className="p-8">Đang tải…</main>;

  // Danh sách môn cho khoá hiện tại từ subjects.json
  const subjects = useMemo(() => listSubjectsForCourse(course, subjectsJson), [course, subjectsJson]);
  // Số bản snapshot/subject từ manifest
  const counts = useMemo(() => buildSubjectCounts(manifest, course), [manifest, course]);

  const yearList = buildYearList(); // ví dụ 6 năm gần nhất

  return (
    <main className="p-8 space-y-8">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Khóa {course} — Luyện tập</h1>
        <p className="text-sm text-gray-500">
          Chọn theo <b>môn (分野別)</b> hoặc theo <b>năm (年度別)</b>. Dữ liệu lấy từ <code>snapshots/manifest.json</code> &amp; <code>snapshots/subjects.json</code>.
        </p>
      </header>

      {/* 分野別 (Theo môn) */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">分野別 (Theo môn)</h2>
        {subjects.length === 0 ? (
          <p className="text-sm text-gray-500">
            Chưa có môn nào cho khóa <b>{course}</b> trong <code>subjects.json</code>.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {subjects.map((s) => {
              const count = counts[s.subjectId] ?? 0;
              const subtitle =
                (s.nameVI && s.nameVI.trim() !== '' ? s.nameVI : undefined) ||
                (s.descriptionJA && s.descriptionJA.trim() !== '' ? s.descriptionJA : undefined);

              return (
                <Link
                  key={`${s.courseId}__${s.subjectId}`}
                  href={`/courses/${course}/practice/start?subject=${s.subjectId}`}
                  className="border rounded-lg p-4 bg-white shadow hover:shadow-lg transition"
                >
                  <div className="font-medium text-lg">{s.nameJA} <span className="text-gray-400">({s.subjectId})</span></div>
                  {subtitle && <div className="text-sm text-gray-500 line-clamp-2">{subtitle}</div>}
                  <div className="mt-2 text-xs text-gray-500">
                    {count} phiên bản dữ liệu
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 年度別 (Theo năm) */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">年度別 (Theo năm)</h2>
        <div className="flex flex-wrap gap-2">
          {yearList.map((y) => (
            <Link
              key={y}
              href={`/courses/${course}/practice/start?year=${y}`}
              className="border rounded-lg px-3 py-2 bg-white hover:bg-gray-50"
              title={`Năm ${formatJpEra(y)} (${y})`}
            >
              {formatJpEra(y)}
            </Link>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          *Gợi ý: Trang <code>start</code> nên ưu tiên filter theo <code>?year=YYYY</code> nếu có, hoặc kết hợp cùng <code>subject</code>.
        </p>
      </section>
    </main>
  );
}
