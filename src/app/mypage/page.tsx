'use client';

/**
 * My Page – Dashboard cơ bản
 * ------------------------------------------------------------------
 * Mục tiêu:
 * 1) Hiển thị số liệu tổng quan sau khi người dùng đăng nhập:
 *    - Tổng lượt luyện (từ attempts)
 *    - Điểm trung bình theo môn (gộp cả start-mode & year-mode)
 *    - Câu sai gần đây (từ users/{uid}/wrongs)
 * 2) Danh sách 5 attempt gần nhất: mode, môn/năm, đúng/tổng, ngày
 *
 * Kiến trúc:
 * - YÊU CẦU đăng nhập → bọc bằng AuthGate (client component)
 * - Truy vấn Firestore ở client: requireUser() lấy uid, sau đó get attempts & wrongs
 * - Tính toán thống kê ở client (nhẹ, dữ liệu vừa phải)
 *
 * Ghi chú:
 * - Các alias "@/..." đã bỏ → dùng import tương đối chuẩn repo hiện tại.
 * - Nếu cần i18n sau này, chỉ cần thay text tĩnh trong JSX.
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
  // ----------------------------
  // State
  // ----------------------------
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [wrongs, setWrongs] = useState<WrongRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // ----------------------------
  // Effect: Tải dữ liệu My Page
  // ----------------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const u = await requireUser();

        // ❶ Attempts (tối đa 200 bản ghi gần nhất để tính nhanh – có thể tăng/giảm)
        const qAttempts = query(
          collection(db, 'attempts'),
          where('userId', '==', u.uid),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        const snapA = await getDocs(qAttempts);
        const rowsA: AttemptRow[] = snapA.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            userId: v.userId,
            mode: v.mode,
            courseId: v.courseId,
            subjectId: v.subjectId,
            examYear: v.examYear ?? null,
            total: v.total ?? 0,
            correct: v.correct ?? 0,
            blank: v.blank ?? 0,
            createdAt: v.createdAt,
          };
        });

        // ❷ Wrongs (top 20 theo count & lastAt – client lọc tiếp)
        //    Firestore không hỗ trợ sort đa điều kiện dễ dàng khi thiếu index,
        //    nên ta chỉ sort theo lastAt desc trước; phần UI có thể hiển thị count.
        const qWrongs = query(
          collection(db, 'users', u.uid, 'wrongs'),
          orderBy('lastAt', 'desc'),
          limit(20)
        );
        const snapW = await getDocs(qWrongs);
        const rowsW: WrongRow[] = snapW.docs.map((d) => {
          const v = d.data();
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

  // ----------------------------
  // Tính toán số liệu tổng hợp
  // ----------------------------

  // Tổng lượt luyện
  const totalSessions = attempts.length;

  // Điểm TB theo môn (gộp tất cả attempt)
  // subjectAvg[subjectId] = { totalCorrect, totalQuestions, avgPercent }
  const subjectAvg = useMemo(() => {
    const acc = new Map<string, { totalCorrect: number; totalQuestions: number }>();
    for (const a of attempts) {
      const key = a.subjectId || 'UNKNOWN';
      const cur = acc.get(key) || { totalCorrect: 0, totalQuestions: 0 };
      cur.totalCorrect += (a.correct || 0);
      cur.totalQuestions += (a.total || 0);
      acc.set(key, cur);
    }
    // chuyển sang mảng render
    return Array.from(acc.entries()).map(([subjectId, v]) => {
      const pct = v.totalQuestions ? Math.round((v.totalCorrect / v.totalQuestions) * 100) : 0;
      return { subjectId, avgPercent: pct, totalQ: v.totalQuestions };
    }).sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  }, [attempts]);

  // 5 attempt gần nhất
  const latest5 = useMemo(() => attempts.slice(0, 5), [attempts]);

  // ----------------------------
  // Render helpers
  // ----------------------------
  const formatDate = (ts?: Timestamp) => {
    try {
      if (!ts?.toDate) return '—';
      const d = ts.toDate();
      // JA style: YYYY/MM/DD HH:mm
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

  // ----------------------------
  // UI
  // ----------------------------
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
            {/* =========================
                3 thẻ thống kê nhanh
               ========================= */}
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
              {/* Card: Tổng lượt luyện */}
              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>総演習回数 / Tổng lượt luyện</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{totalSessions}</div>
                <div style={{ color: '#667085', marginTop: 4 }}>Bao gồm cả 練習（科目別） và 年別（模試）</div>
              </div>

              {/* Card: Điểm TB theo môn */}
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

              {/* Card: Câu sai gần đây */}
              <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>最近の間違い / Câu sai gần đây</div>
                {wrongs.length === 0 ? (
                  <div style={{ color: '#667085' }}>Không có bản ghi sai gần đây</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {wrongs.slice(0, 5).map((w) => (
                      <li key={w.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0' }}>
                        <span style={{ fontWeight: 600 }}>{w.subjectId}</span>
                        <span style={{ color: '#667085' }}>・{w.examYear ?? '—'}年</span>
                        <span style={{ marginLeft: 'auto', color: '#475467' }}>
                          回数 {w.count ?? 1} ・ {formatDate(w.lastAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* =========================
                Lịch sử gần đây (5 attempt)
               ========================= */}
            <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>直近の履歴 / Lịch sử gần đây</div>
              {latest5.length === 0 ? (
                <div style={{ color: '#667085' }}>Chưa có attempt nào. Hãy bắt đầu tại trang Courses.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {latest5.map((a) => {
                    const pct = a.total ? Math.round((a.correct / a.total) * 100) : 0;
                    const modeTag =
                      a.mode === 'year' ? '年別（模試）' : '科目別（練習）';
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

                        {/* progress mini */}
                        <div style={{ height: 6, background: '#f2f4f7', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: 6, background: '#16a34a', borderRadius: 999, transition: 'width 300ms'
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Hướng dẫn hành động tiếp */}
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
