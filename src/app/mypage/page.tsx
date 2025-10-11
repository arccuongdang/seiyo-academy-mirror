'use client';

import { useEffect, useMemo, useState } from 'react';
import AuthGate from '../../components/AuthGate';
import { db, requireUser } from '@/lib/firebase/client';
import {
  collection, query, where, orderBy, limit, getDocs, Timestamp, doc, getDoc
} from 'firebase/firestore';
import Link from 'next/link';

type AttemptRow = {
  id: string;
  mode: 'subject' | 'year';
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  total: number;
  correct: number;
  blank: number;
  createdAt?: Timestamp;
};

type WrongRow = {
  id: string; // questionId
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  lastSelectedId?: string | null;
  lastAt?: Timestamp;
  count?: number;
};

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [wrongs, setWrongs] = useState<WrongRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const u = await requireUser();
        // Attempts của user hiện tại
        // Tip: nếu Firestore yêu cầu composite index cho where+orderBy, làm theo link gợi ý, hoặc bỏ orderBy và sort client-side.
        const q1 = query(
          collection(db, 'attempts'),
          where('userId', '==', u.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const snap1 = await getDocs(q1);
        const rows1: AttemptRow[] = [];
        snap1.forEach((d) => {
          const v = d.data() as any;
          rows1.push({
            id: d.id,
            mode: v.mode,
            courseId: v.courseId,
            subjectId: v.subjectId,
            examYear: v.examYear ?? null,
            total: v.total ?? 0,
            correct: v.correct ?? 0,
            blank: v.blank ?? 0,
            createdAt: v.createdAt,
          });
        });

        // Wrongs của user (các câu sai) — lấy 30 gần nhất
        const wrongsCol = collection(db, 'users', u.uid, 'wrongs');
        const q2 = query(wrongsCol, orderBy('lastAt', 'desc'), limit(30));
        const snap2 = await getDocs(q2);
        const rows2: WrongRow[] = [];
        snap2.forEach((d) => {
          const v = d.data() as any;
          rows2.push({
            id: d.id,
            courseId: v.courseId,
            subjectId: v.subjectId,
            examYear: v.examYear ?? null,
            lastSelectedId: v.lastSelectedId ?? null,
            lastAt: v.lastAt,
            count: v.count ?? 1,
          });
        });

        setAttempts(rows1);
        setWrongs(rows2);
      } catch (e: any) {
        setErr(e?.message || 'Load failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AuthGate>
      <main style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>マイページ / My Page</h1>

        {loading && <div>Loading…</div>}
        {err && <div style={{ color: 'crimson' }}>Lỗi: {err}</div>}

        {!loading && !err && (
          <>
            {/* Attempts */}
            <section style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>学習履歴 / Lịch sử làm bài</h2>
                <span style={{ color: '#667085' }}>({attempts.length} gần đây)</span>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {attempts.length === 0 && <div style={{ color: '#667085' }}>Chưa có dữ liệu.</div>}
                {attempts.map((a) => {
                  const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
                  const when = a.createdAt ? a.createdAt.toDate().toLocaleString() : '';
                  return (
                    <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{a.courseId} / {a.subjectId}</strong>
                        {a.mode === 'year' && <span>— {a.examYear} 年度</span>}
                        <span style={{ marginLeft: 'auto', color: '#667085' }}>{when}</span>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        正答 {a.correct}/{a.total}（{pct}%）・未回答 {a.blank}
                      </div>
                      {/* Nếu bạn có trang review riêng theo attemptId, gắn Link ở đây */}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Wrongs */}
            <section style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>苦手問題 / Câu đã sai gần đây</h2>
                <span style={{ color: '#667085' }}>({wrongs.length} gần đây)</span>
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {wrongs.length === 0 && <div style={{ color: '#667085' }}>Không có câu sai gần đây 🎉</div>}
                {wrongs.map((w) => {
                  const when = w.lastAt ? w.lastAt.toDate().toLocaleString() : '';
                  return (
                    <div key={w.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{w.courseId} / {w.subjectId}</strong>
                        {w.examYear && <span>— {w.examYear} 年度</span>}
                        <span style={{ marginLeft: 'auto', color: '#667085' }}>{when}</span>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        Question ID: <code>{w.id}</code> ・ Số lần sai: <strong>{w.count ?? 1}</strong>
                      </div>
                      {/* TODO: thêm nút "Luyện lại" → mở trang luyện lại theo questionId */}
                    </div>
                  );
                })}
              </div>
            </section>

            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/courses/KTS2" style={{ color: '#175cd3', textDecoration: 'underline' }}>
                ← Quay lại khóa học
              </Link>
            </div>
          </>
        )}
      </main>
    </AuthGate>
  );
}
