'use client';

/**
 * Trang chọn đề cho 1 khóa học (course).
 * - Đọc manifest đa định dạng (phẳng theo course / lồng theo subject / string[]).
 * - Hiển thị danh sách môn: tên JA (nếu có), kèm số phiên bản đề.
 * - Nút theo năm: nếu chỉ có 1 môn thì tự gắn subject=..., còn nhiều môn thì chuyển sang luồng chọn môn trước.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Data loaders
import { loadManifest, loadSubjectsMeta } from '../../../lib/qa/excel';
import type { Manifest } from '../../../lib/qa/schema';

// Gates
import AuthGate from '../../../components/AuthGate';
import ProfileGate from '../../../components/ProfileGate';

// ----------------- helpers -----------------

// Gom từ manifest => { [subjectId]: { count, filenames[] } } .
// Hỗ trợ 3 format manifest: phẳng theo course / lồng theo subject / string[] filenames.
function collectSubjectsFromManifest(
  manifest: Manifest | null,
  courseId: string
): Record<string, { count: number; filenames: string[] }> {
  const out: Record<string, { count: number; filenames: string[] }> = {};
  if (!manifest) return out;

  const block: any = (manifest as any)[courseId];
  if (!block) return out;

  // A) Phẳng theo course: mảng entries { subjectId, filename, ... }
  if (Array.isArray(block)) {
    for (const e of block) {
      const sid = e?.subjectId;
      const fn = e?.filename;
      if (!sid || !fn) continue;
      if (!out[sid]) out[sid] = { count: 0, filenames: [] };
      out[sid].count += 1;
      out[sid].filenames.push(String(fn));
    }
    return out;
  }

  // B/C) Lồng: { [subjectId]: ManifestEntry[] | string[] }
  if (typeof block === 'object') {
    for (const sid of Object.keys(block)) {
      const list = (block as any)[sid];
      if (!Array.isArray(list) || list.length === 0) continue;

      // dạng string[] (filename thuần)
      if (typeof list[0] === 'string') {
        out[sid] = { count: list.length, filenames: list.map(String) };
        continue;
      }

      // dạng ManifestEntry[]
      const files: string[] = [];
      for (const it of list) {
        if (it?.filename) files.push(String(it.filename));
      }
      if (files.length > 0) out[sid] = { count: files.length, filenames: files };
    }
    return out;
  }

  return out;
}

// --------------helper:-------------------
// chuyển Gregorian → nhãn era Nhật + năm dương lịch ---
function toEraLabel(y: number): string {
  // Reiwa bắt đầu 2019
  if (y >= 2019) {
    const era = y - 2018; // 2019 → 1
    return `令和${era}年（${y}年）`;
  }
  // Heisei 1989–2018
  if (y >= 1989) {
    const era = y - 1988; // 1989 → 1
    return `平成${era}年（${y}年）`;
  }
  // Nếu lùi sâu hơn thì chỉ hiện Gregorian
  return `${y}年`;
}

// --- helper: tạo danh sách năm giảm dần, ví dụ từ 2015 → năm hiện tại ---
function makeYearChoices(minYear = 2015, maxYear = new Date().getFullYear()) {
  const out: { label: string; year: number }[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    out.push({ year: y, label: toEraLabel(y) });
  }
  return out;
}

// Dùng useMemo để không tính lại mỗi render
const YEAR_CHOICES = useMemo(() => makeYearChoices(2015), []);


// ----------------- page -----------------

export default function CoursePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const router = useRouter();

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [meta, setMeta] = useState<Record<string, { nameJA?: string; nameVI?: string }>>({});
  const [err, setErr] = useState<string | null>(null);

  // Tải manifest + meta môn
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [m, mmeta] = await Promise.all([
          loadManifest(),
          loadSubjectsMeta(course),
        ]);
        if (!mounted) return;
        setManifest(() => m); // dùng functional updater để khớp SetStateAction
        setMeta(mmeta || {}); // lưu meta (có thể rỗng)
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Không tải được manifest');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [course]);

  const subjectsInfo = useMemo(
    () => collectSubjectsFromManifest(manifest, course),
    [manifest, course]
  );

  const subjectIds = useMemo(() => Object.keys(subjectsInfo).sort(), [subjectsInfo]);

  // ------------- render -------------

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

          {!manifest && !err && <div>Đang tải dữ liệu...</div>}

          {/* --- Theo môn --- */}
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>
            分野別（Theo môn）
          </h2>

          {subjectIds.length === 0 ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, color: '#475467' }}>
              Chưa có dữ liệu môn cho khóa {course}.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {subjectIds.map((sid) => {
                const info = subjectsInfo[sid];
                const displayName = meta?.[sid]?.nameJA || sid; // tên JA nếu có, fallback ID
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
                      <div style={{ color: '#6b7280', fontSize: 12 }}>{info.count} phiên bản đề</div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                );
              })}
            </div>
          )}

          {/* --- Theo năm --- */}
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '24px 0 8px' }}>
            年度別（Theo năm）
          </h2>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {YEAR_CHOICES.map((y) => (
              <button
                key={y.year}
                onClick={() => {
                  if (subjectIds.length === 1) {
                    // nếu chỉ có 1 môn, auto gắn subject
                    const sid = subjectIds[0];
                    router.push(`/courses/${course}/practice/year?subject=${encodeURIComponent(sid)}&year=${y.year}`);
                  } else if (subjectIds.length > 1) {
                    // nếu có nhiều môn, yêu cầu chọn môn trước
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
