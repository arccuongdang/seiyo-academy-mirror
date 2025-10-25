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

/**
 * MyMiniDashboard (nhúng trực tiếp trong My Page)
 * ------------------------------------------------------
 * Hiển thị 2 biểu đồ:
 *  - Line: số lần làm bài theo ngày (7/30/90/ALL)
 *  - Bar: số lần theo từng (courseId/subjectId)
 *
 * Dùng lại helpers từ: src/lib/analytics/queries.ts
 * Không tạo file mới: component này nằm chung trong file My Page.
 */


import { getAuth } from 'firebase/auth'
import {
  listAttemptsByUser,
  aggregateDaily,
  aggregateSubjects,
  type AttemptDoc,
} from '../../lib/analytics/queries'

import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from 'recharts'

type Quick = '7d' | '30d' | '90d' | 'all'
const subDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d }

function MyMiniDashboard() {
  // Preset khoảng thời gian
  const [quick, setQuick] = useState<Quick>('30d')
  const [loading, setLoading] = useState(false)

  // Dữ liệu cho charts
  const [daily, setDaily] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [attempts, setAttempts] = useState<AttemptDoc[]>([])

  // Tính range theo preset
  const range = useMemo(() => {
    if (quick === 'all') return {}
    const map: Record<Exclude<Quick,'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }
    return { start: subDays(map[quick as Exclude<Quick,'all'>]) }
  }, [quick])

  // Tải attempts của user hiện tại và tổng hợp
  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const uid = getAuth().currentUser?.uid || ''
        if (!uid) { setDaily([]); setSubjects([]); setAttempts([]); return }
        const data = await listAttemptsByUser(uid, range)
        setAttempts(data)
        setDaily(aggregateDaily(data))
        setSubjects(aggregateSubjects(data))
      } finally { setLoading(false) }
    })()
  }, [quick])

  return (
    <section className="space-y-4">
      {/* Header + Quick filter */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Tiến độ học của tôi</h2>
        <div className="ml-auto inline-flex border rounded-lg overflow-hidden">
          {(['7d','30d','90d','all'] as Quick[]).map(q => (
            <button key={q}
              className={'px-3 py-1 text-sm ' + (quick === q ? 'bg-black text-white' : 'bg-white')}
              onClick={() => setQuick(q)}
              title="Khoảng thời gian"
            >{q.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {loading && <div>Đang tải dữ liệu…</div>}

      {!loading && (
        <>
          {/* (1) Line: attempts per day */}
          <div className="rounded-lg border p-4">
            <div className="font-medium mb-2">Số lần làm bài theo ngày</div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="attempts" name="Attempts/day" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* (2) Bar: attempts per course/subject */}
          <div className="rounded-lg border p-4">
            <div className="font-medium mb-2">Theo môn / khoá (số lần)</div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={subjects}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="key" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="attempts" name="Attempts" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tóm tắt nhanh */}
          <div className="text-sm text-gray-600">
            Tổng lần làm trong giai đoạn: <b>{attempts.length}</b>
          </div>
        </>
      )}
    </section>
  )
}



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
      <MyMiniDashboard />
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


