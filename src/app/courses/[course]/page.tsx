'use client';

/**
 * Trang chọn môn cho một khóa học (course).
 * - Đọc manifest để biết môn nào có dữ liệu (ẩn môn rỗng).
 * - Hỗ trợ mọi format manifest (phẳng theo course / lồng theo subject / mảng filename string[]).
 * - Bọc AuthGate + ProfileGate theo chính sách điều hướng bạn đã đặt.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Data loaders
import { loadManifest } from '../../../lib/qa/excel';
import type { Manifest } from '../../../lib/qa/schema';

// Gates
import AuthGate from '../../../components/AuthGate';
import ProfileGate from '../../../components/ProfileGate';

// ----------------- helpers -----------------

/**
 * Lấy danh sách subject khả dụng từ manifest cho 1 course.
 * Hỗ trợ 3 cấu trúc:
 *  A) Phẳng: manifest[courseId] = [{ subjectId, filename, publishedAt }, ...]
 *  B) Lồng:  manifest[courseId][subjectId] = ManifestEntry[]
 *  C) Lồng-cũ: manifest[courseId][subjectId] = string[] (chỉ filename)
 */
function getAvailableSubjects(manifest: Manifest | null, courseId: string): string[] {
  if (!manifest) return [];
  const courseBlock: any = (manifest as any)[courseId];
  if (!courseBlock) return [];

  // A) Phẳng theo course: mảng entries
  if (Array.isArray(courseBlock)) {
    const set = new Set<string>();
    for (const e of courseBlock) {
      if (e?.subjectId && e?.filename) set.add(String(e.subjectId));
    }
    return Array.from(set).sort();
  }

  // B/C) Lồng theo subjectId
  if (typeof courseBlock === 'object') {
    return Object.keys(courseBlock)
      .filter((sid) => {
        const list = (courseBlock as any)[sid];
        return Array.isArray(list) && list.length > 0; // chỉ lấy các subject có dữ liệu
      })
      .sort();
  }

  return [];
}

// ----------------- page -----------------

export default function CoursePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Tải manifest khi vào trang
  useEffect(() => {
    loadManifest()
      .then((m) => setManifest(() => m)) // dùng functional updater để khớp SetStateAction<Manifest|null>
      .catch((e) => setErr(e?.message || 'Không tải được manifest'));
  }, []);

  const subjects = useMemo(() => getAvailableSubjects(manifest, course), [manifest, course]);

  // ------------- render -------------

  return (
    <AuthGate>
      <ProfileGate>
        <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            {course} — Môn học
          </h1>

          {err && (
            <div style={{ color: 'crimson', marginBottom: 12 }}>
              Lỗi: {err}
            </div>
          )}

          {!manifest && !err && <div>Đang tải dữ liệu…</div>}

          {manifest && subjects.length === 0 && (
            <div style={{ color: '#475467' }}>
              Hiện chưa có dữ liệu môn học cho khóa {course}. Vui lòng quay lại sau.
            </div>
          )}

          {subjects.length > 0 && (
            <section style={{ display: 'grid', gap: 12 }}>
              {subjects.map((sid) => (
                <div
                  key={sid}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    {sid}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* Luyện theo môn (bộ lọc tuỳ biến) */}
                    <Link
                      href={`/courses/${course}/practice/start?subject=${encodeURIComponent(sid)}`}
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

                    {/* Thi theo năm (dẫn tới trang chọn năm hoặc mặc định năm mới nhất) */}
                    <Link
                      href={`/courses/${course}/practice/year?subject=${encodeURIComponent(sid)}`}
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
              ))}
            </section>
          )}
        </main>
      </ProfileGate>
    </AuthGate>
  );
}
