// src/app/mypage/MyPageClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  type Firestore,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db as _db, requireUser } from '../../lib/firebase/client';

function ensureDb(): Firestore {
  if (!_db) throw new Error('Firestore is not available in this runtime');
  return _db;
}

type AttemptRow = {
  id: string;
  userId?: string;
  mode: 'subject' | 'year';
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  total: number;
  correct: number;    // absolute correct count
  blank?: number;
  createdAt?: Timestamp;
  answers?: Array<{ questionId: string; pickedIndexes?: number[]; isCorrect?: boolean }>;
};

export default function MyPageClient() {
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const u = await requireUser();
        const db = ensureDb();

        try { await getDoc(doc(db, 'users', u.uid)); } catch {}

        const qAttempts = query(
          collection(db, 'users', u.uid, 'attempts'),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        const snapA = await getDocs(qAttempts);
        const rowsA: AttemptRow[] = snapA.docs.map((d) => {
          const v = d.data() as any;
          const answers = Array.isArray(v.answers) ? v.answers : undefined;
          const total = typeof v.total === 'number' ? v.total : (answers ? answers.length : 0);
          const correct = typeof v.correct === 'number' ? v.correct : (typeof v.score === 'number' ? v.score : 0);
          const blank = typeof v.blank === 'number'
            ? v.blank
            : (answers ? answers.filter((a: any) => !a.pickedIndexes || a.pickedIndexes.length === 0).length : undefined);
          return {
            id: d.id,
            userId: v.userId,
            mode: v.mode === 'year' ? 'year' : 'subject',
            courseId: v.courseId,
            subjectId: v.subjectId,
            examYear: v.examYear ?? null,
            total,
            correct,
            blank,
            createdAt: v.createdAt,
            answers,
          };
        });

        if (!mounted) return;
        setAttempts(rowsA);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Lỗi tải dữ liệu My Page');
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const totalSessions = attempts.length;

  const subjectAvg = useMemo(() => {
    const acc = new Map<string, { totalCorrect: number; totalQuestions: number }>();
    for (const a of attempts) {
      const key = a.subjectId || 'UNKNOWN';
      const cur = acc.get(key) || { totalCorrect: 0, totalQuestions: 0 };
      cur.totalCorrect += a.correct || 0;
      cur.totalQuestions += a.total || 0;
      acc.set(key, cur);
    }
    return Array.from(acc.entries())
      .map(([subjectId, v]) => {
        const pct = v.totalQuestions ? Math.round((v.totalCorrect / v.totalQuestions) * 100) : 0;
        return { subjectId, avgPercent: pct, totalQ: v.totalQuestions };
      })
      .sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  }, [attempts]);

  const latest5 = useMemo(() => attempts.slice(0, 5), [attempts]);

  const formatDate = (ts?: Timestamp) => {
    try {
      if (!ts?.toDate) return '—';
      const d = ts.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}/${m}/${day} ${hh}:${mm}`;
    } catch { return '—'; }
  };

  if (loading) return <main style={{ padding: 24 }}>Đang tải dữ liệu…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>マイページ / My Page</h1>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>総演習回数 / Tổng lượt luyện</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{totalSessions}</div>
          <div style={{ color: '#667085', marginTop: 4 }}>
            Bao gồm cả 練習（科目別） và 年別（模試）
          </div>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>科目平均点 / Điểm TB theo môn</div>
          {subjectAvg.length === 0 ? (
            <div style={{ color: '#667085' }}>Chưa có dữ liệu</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {subjectAvg.map((s) => (
                <div
                  key={s.subjectId}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 999,
                    padding: '6px 10px',
                  }}
                >
                  <strong>{s.subjectId}</strong>：{s.avgPercent}%（{s.totalQ}問）
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <RecentAttempts latest5={latest5} formatDate={formatDate} />
    </main>
  );
}

function RecentAttempts({
  latest5,
  formatDate,
}: {
  latest5: AttemptRow[];
  formatDate: (ts?: Timestamp) => string;
}) {
  return (
    <section
      style={{
        border: '1px solid #eee',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        marginTop: 16,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>直近の履歴 / Lịch sử gần đây</div>
      {latest5.length === 0 ? (
        <div style={{ color: '#667085' }}>
          Chưa có attempt nào. Hãy bắt đầu tại trang Courses.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {latest5.map((a) => {
            const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
            const modeTag = a.mode === 'year' ? '年別（模試）' : '科目別（練習）';
            return (
              <div
                key={a.id}
                style={{
                  border: '1px solid #f1f5f9',
                  borderRadius: 10,
                  padding: 12,
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div
                  style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}
                >
                  <span
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: 12,
                    }}
                  >
                    {modeTag}
                  </span>
                  <strong>
                    {a.courseId} / {a.subjectId}
                  </strong>
                  {a.mode === 'year' && <span>・{a.examYear ?? '—'}年</span>}
                  <span style={{ marginLeft: 'auto', color: '#667085' }}>
                    {formatDate(a.createdAt)}
                  </span>
                </div>

                <div style={{ color: '#1f2937' }}>
                  正答 <b>{a.correct}</b>/<b>{a.total}</b>（{pct}%）
                  {typeof a.blank === 'number' && <> ・ 未回答 {a.blank}</>}
                </div>

                <div
                  style={{
                    height: 6,
                    background: '#f2f4f7',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: 6,
                      background: '#16a34a',
                      borderRadius: 999,
                      transition: 'width 300ms',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
