'use client';

/**
 * PATCH NOTES (Bước 13 – Replay wrongs from MyPage)
 * - (NEW) Nhóm 'wrongs' theo (courseId, subjectId).
 * - (NEW) Checkbox chọn câu sai theo từng nhóm và nút "Luyện lại các câu đã chọn".
 * - (SAFE) Không đổi schema đọc; vẫn /users/{uid}/wrongs orderBy lastAt desc.
 */


/**
 * My Page – Dashboard cơ bản
 * ------------------------------------------------------------------
 * Giữ nguyên UI/logic hiển thị.
 * CHỈ SỬA đường dẫn Firestore:
 *   - attempts: /users/{uid}/attempts  (khớp Bước 1 - firestore.rules)
 *   - wrongs  : /users/{uid}/wrongs    (đã đúng, giữ nguyên)
 */

import { useEffect, useMemo, useState } from 'react';
import AuthGate from '../../components/AuthGate';
import { db, requireUser } from '../../lib/firebase/client';
import {
  collection, query, where, orderBy, limit, getDocs, Timestamp
} from 'firebase/firestore';

type AttemptRow = {
  id: string;
  userId: string;
  mode: 'subject' | 'year';
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  total: number;
  correct: number;
  blank?: number;
  createdAt?: Timestamp;
};

type WrongRow = {
  id: string;               // questionId
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  count?: number;
  lastAt?: Timestamp;
};

export default function MyPage() {
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [wrongs, setWrongs] = useState<WrongRow[]>([]);

/** (NEW) selection state: Record<groupKey, Record<questionId, boolean>> */
const [selected, setSelected] = useState<Record<string, Record<string, boolean>>>({});

/** (NEW) build groups by courseId:subjectId */
const groups = useMemo(() => {
  const m = new Map<string, WrongRow[]>();
  for (const w of wrongs) {
    const key = `${w.courseId}::${w.subjectId}`;
    const arr = m.get(key) || [];
    arr.push(w);
    m.set(key, arr);
  }
  return Array.from(m.entries()).map(([key, items]) => {
    const [courseId, subjectId] = key.split('::');
    return { key, courseId, subjectId, items };
  });
}, [wrongs]);

function toggleOne(groupKey: string, qid: string) {
  setSelected(prev => {
    const g = { ...(prev[groupKey] || {}) };
    g[qid] = !g[qid];
    return { ...prev, [groupKey]: g };
  });
}

function toggleAll(groupKey: string, on: boolean) {
  const group = groups.find(g => g.key === groupKey);
  if (!group) return;
  setSelected(prev => {
    const g: Record<string, boolean> = {};
    for (const w of group.items) g[w.id] = on;
    return { ...prev, [groupKey]: g };
  });
}

function selectedIdsOf(groupKey: string): string[] {
  const g = selected[groupKey] || {};
  return Object.entries(g).filter(([, v]) => v).map(([id]) => id);
}

  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const u = await requireUser();

        // ❶ Attempts — ĐỔI PATH: /users/{uid}/attempts
        const qAttempts = query(
          collection(db, 'users', u.uid, 'attempts'),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        const snapA = await getDocs(qAttempts);
        const rowsA: AttemptRow[] = snapA.docs.map((d) => {
          const v = d.data() as any;
          return {
            id: d.id,
            userId: v.userId,
            mode: (v.mode === 'year' ? 'year' : 'subject'),
            courseId: v.courseId,
            subjectId: v.subjectId,
            examYear: v.examYear ?? null,
            total: v.total ?? 0,
            correct: v.correct ?? 0,
            blank: v.blank ?? 0,
            createdAt: v.createdAt,
          };
        });

        // ❷ Wrongs — GIỮ NGUYÊN: /users/{uid}/wrongs
        const qWrongs = query(
          collection(db, 'users', u.uid, 'wrongs'),
          orderBy('lastAt', 'desc'),
          limit(20)
        );
        const snapW = await getDocs(qWrongs);
        const rowsW: WrongRow[] = snapW.docs.map((d) => {
          const v = d.data() as any;
          return {
            id: d.id,
            courseId: v.courseId,
            subjectId: v.subjectId,
            examYear: v.examYear ?? null,
            count: v.count ?? 1,
            lastAt: v.lastAt,
          };
        });

        if (!mounted) return;
        setAttempts(rowsA);
        setWrongs(rowsW);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Lỗi tải dữ liệu My Page');
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Tổng lượt luyện
  const totalSessions = attempts.length;

  // Điểm TB theo môn
  const subjectAvg = useMemo(() => {
    const acc = new Map<string, { totalCorrect: number; totalQuestions: number }>();
    for (const a of attempts) {
      const key = a.subjectId || 'UNKNOWN';
      const cur = acc.get(key) || { totalCorrect: 0, totalQuestions: 0 };
      cur.totalCorrect += (a.correct || 0);
      cur.totalQuestions += (a.total || 0);
      acc.set(key, cur);
    }
    return Array.from(acc.entries()).map(([subjectId, v]) => {
      const pct = v.totalQuestions ? Math.round((v.totalCorrect / v.totalQuestions) * 100) : 0;
      return { subjectId, avgPercent: pct, totalQ: v.totalQuestions };
    }).sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  }, [attempts]);

  // 5 attempt gần nhất
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
    } catch {
      return '—';
    }
  };

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
          マイページ / My Page
        </h1>

        {loading && <div>Đang tải dữ liệu…</div>}
        {err && <div style={{ color: 'crimson' }}>Lỗi: {err}</div>}

        {!loading && !err && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>総演習回数 / Tổng lượt luyện</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{totalSessions}</div>
                <div style={{ color: '#667085', marginTop: 4 }}>Bao gồm cả 練習（科目別） và 年別（模試）</div>
              </div>

              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>科目平均点 / Điểm TB theo môn</div>
                {subjectAvg.length === 0 ? (
                  <div style={{ color: '#667085' }}>Chưa có dữ liệu</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {subjectAvg.map((s) => (
                      <div key={s.subjectId} style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '6px 10px' }}>
                        <strong>{s.subjectId}</strong>：{s.avgPercent}%（{s.totalQ}問）
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>最近の間違い / Câu sai gần đây</div>
{wrongs.length === 0 ? (
  <div style={{ color: '#667085' }}>Không có bản ghi sai gần đây</div>
) : (
  <div style={{ display: 'grid', gap: 12 }} id="wrongs">
    {groups.map(g => {
      const sel = selected[g.key] || {};
      const allChecked = g.items.length > 0 && g.items.every(w => sel[w.id]);
      const anyChecked = Object.values(sel).some(Boolean);
      const url = anyChecked
        ? `/courses/${g.courseId}/practice/start?subject=${g.subjectId}&questionIds=${selectedIdsOf(g.key).join(',')}`
        : undefined;
      return (
        <div key={g.key} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <strong>{g.courseId} / {g.subjectId}</strong>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475467' }}>
                <input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(g.key, e.target.checked)} />
                Chọn tất cả
              </label>
              <a href={url || '#'} aria-disabled={!url} style={{ textDecoration: 'none' }}>
                <button disabled={!url}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #175cd3',
                                 background: url ? '#175cd3' : '#93c5fd', color: '#fff', fontWeight: 700 }}>
                  Luyện lại các câu đã chọn
                </button>
              </a>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {g.items.map((w) => (
              <li key={w.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!(selected[g.key]?.[w.id])} onChange={() => toggleOne(g.key, w.id)} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{w.id}</span>
                  <span style={{ color: '#667085' }}>・{w.examYear ?? '—'}年</span>
                </div>
                <div style={{ marginLeft: 'auto', color: '#475467' }}>
                  回数 {w.count ?? 1} ・ {formatDate(w.lastAt)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    })}
  </div>
)}
</div></section>

            <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>直近の履歴 / Lịch sử gần đây</div>
              {latest5.length === 0 ? (
                <div style={{ color: '#667085' }}>Chưa có attempt nào. Hãy bắt đầu tại trang Courses.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {latest5.map((a) => {
                    const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
                    const modeTag = a.mode === 'year' ? '年別（模試）' : '科目別（練習）';
                    return (
                      <div key={a.id}
                           style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 12, display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 10px', fontSize: 12 }}>
                            {modeTag}
                          </span>
                          <strong>{a.courseId} / {a.subjectId}</strong>
                          {a.mode === 'year' && <span>・{a.examYear ?? '—'}年</span>}
                          <span style={{ marginLeft: 'auto', color: '#667085' }}>{formatDate(a.createdAt)}</span>
                        </div>

                        <div style={{ color: '#1f2937' }}>
                          正答 <b>{a.correct}/{a.total}</b>（{pct}%）
                          {typeof a.blank === 'number' && <> ・ 未回答 {a.blank}</>}
                        </div>

                        <div style={{ height: 6, background: '#f2f4f7', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: 6, background: '#16a34a', borderRadius: 999, transition: 'width 300ms' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="/courses" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3',
                  background: '#175cd3', color: '#fff', fontWeight: 700
                }}>
                  コースへ進む / Tới Courses
                </button>
              </a>
              <a href="/courses/KTS2/practice/start?subject=TK" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '10px 14px', borderRadius: 8, border: '1px solid #0ea5e9',
                  background: '#fff', color: '#0ea5e9', fontWeight: 700
                }}>
                  科目別 練習を始める / Bắt đầu luyện theo môn
                </button>
              </a>
            </section>
          </>
        )}
      </main>
    </AuthGate>
  );
}
