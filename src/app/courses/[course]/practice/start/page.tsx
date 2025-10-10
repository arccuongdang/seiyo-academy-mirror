'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// 👉 Import trực tiếp từng file (tránh barrel)
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '@/lib/qa/excel';
import { toQARenderItem, shuffleOptions } from '@/lib/qa/formatters';
import type { QARenderItem } from '@/lib/qa/schema';

export default function PracticeStart({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || ''; // ví dụ: /courses/KTS2/practice/start?subject=TK

  const [questions, setQuestions] = useState<QARenderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        // 1) manifest → 2) lấy file snapshot mới nhất → 3) tải snapshot → 4) map về QARenderItem
        const manifest = await loadManifest();
        const filename = pickLatestFile(manifest, course, subject);
        if (!filename) {
          setErr(`Không tìm thấy snapshot cho ${course}/${subject}. Hãy publish dữ liệu ở /admin/data.`);
          setLoading(false);
          return;
        }

        const snapshot = await loadSubjectSnapshot(course, subject, filename);
        const items = snapshot.items.map(toQARenderItem);

        // Chọn 5 câu đầu (bạn có thể thay thành random slice)
        const selected = items.slice(0, 5).map((q) => ({
          ...q,
          options: shuffleOptions(q.options),
        }));

        setQuestions(selected);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải đề');
        setLoading(false);
      }
    })();
  }, [course, subject]);

  if (!subject) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code>. Ví dụ: <code>?subject=TK</code>
      </main>
    );
  }

  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (questions.length === 0) return <main style={{ padding: 24 }}>Chưa có câu hỏi cho môn {subject}.</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
        {course} / {subject} — Đề luyện tập
      </h1>

      {questions.map((q, idx) => (
        <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Câu {idx + 1}: {q.questionTextVI || q.questionTextJA || '(Không có nội dung)'}
          </div>

          {q.questionImage && (
            <img
              src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${q.questionImage}`}
              alt=""
              style={{ maxWidth: '100%', marginBottom: 8 }}
            />
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {q.options.map((opt) => (
              <li key={opt.key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                {opt.textVI || opt.textJA || '(Không có nội dung)'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
