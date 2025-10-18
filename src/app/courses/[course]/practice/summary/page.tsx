
'use client';

/**
 * Summary page (route riêng): /courses/[course]/practice/summary?attempt={attemptId}
 * - Đọc attempt từ /users/{uid}/attempts/{attemptId}
 * - Hiển thị score, tổng số câu, thời gian, và danh sách câu (picked vs correct)
 * - Không phụ thuộc snapshots; tối giản để tránh lỗi SSR
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

type AnswerRow = {
  questionId: string;
  pickedIndexes: number[];
  correctIndexes: number[];
  isCorrect: boolean;
};

type AttemptDoc = {
  userId: string;
  courseId: string;
  subjectId: string;
  examYear?: number;
  mode: 'subject' | 'year';
  total: number;
  score?: number | null;
  durationSec?: number | null;
  answers?: AnswerRow[];
  finalizedAt?: { seconds: number };
  tags?: string[];
};

export default function SummaryPage() {
  const { course } = useParams<{ course: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const attemptId = search.get('attempt') || '';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AttemptDoc | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!attemptId) { setErr('Thiếu tham số attempt'); setLoading(false); return; }
        const auth = getAuth();
        if (!auth.currentUser?.uid) { setErr('Bạn cần đăng nhập'); setLoading(false); return; }

        const db = getFirestore();
        const ref = doc(db, 'users', auth.currentUser.uid, 'attempts', attemptId);
        const snap = await getDoc(ref);
        if (!snap.exists()) { setErr('Không tìm thấy attempt'); setLoading(false); return; }
        const d = snap.data() as AttemptDoc;
        setData(d);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [attemptId]);

  if (loading) return <main style={{ padding: 24 }}>Đang tải kết quả…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!data) return <main style={{ padding: 24 }}>Không có dữ liệu.</main>;

  const score = typeof data.score === 'number' ? data.score : 0;
  const wrong = (data.answers || []).filter(a => !a.isCorrect);
  const blank = (data.answers || []).filter(a => a.pickedIndexes.length === 0);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {data.subjectId} — 結果 / Kết quả
      </h1>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12, display:'grid', gap:12, gridTemplateColumns:'1fr 1fr' }}>
        <div><div style={{ color:'#475467' }}>Score</div><div style={{ fontWeight: 800, fontSize: 18 }}>{score} %</div></div>
        <div><div style={{ color:'#475467' }}>Số câu</div><div style={{ fontWeight: 800, fontSize: 18 }}>{data.total}</div></div>
        <div><div style={{ color:'#475467' }}>Sai</div><div style={{ fontWeight: 800, fontSize: 18 }}>{wrong.length}</div></div>
        <div><div style={{ color:'#475467' }}>Chưa trả lời</div><div style={{ fontWeight: 800, fontSize: 18 }}>{blank.length}</div></div>
        {!!data.durationSec && <div style={{ gridColumn:'1 / -1', color:'#475467' }}>Thời gian làm: <b>{data.durationSec}s</b></div>}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={() => router.push('/mypage')} style={btn()}>My Page</button>
        <button onClick={() => router.back()} style={btn({secondary:true})}>Trở lại</button>
      </div>

      <h2 style={{ fontSize:16, fontWeight:700, margin:'16px 0 8px' }}>Chi tiết</h2>
      <div style={{ display:'grid', gap:8 }}>
        {(data.answers || []).map((a, i) => {
          const picked = new Set(a.pickedIndexes);
          const correct = new Set(a.correctIndexes);
          return (
            <div key={a.questionId} style={{ border:'1px solid #eee', borderRadius:8, padding:12, background: a.isCorrect ? '#ecfdf3' : '#fff' }}>
              <div style={{ fontWeight:700, marginBottom:6 }}>
                Câu {i+1}: {a.isCorrect ? '✅ 正解' : picked.size === 0 ? '⚠️ 未回答' : '❌ 不正解'}
              </div>
              <div style={{ color:'#475467', fontSize:13 }}>
                picked = [{[...picked].join(', ')}], correct = [{[...correct].join(', ')}]
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function btn(opts?: {secondary?: boolean}): React.CSSProperties {
  return {
    padding:'10px 14px',
    borderRadius:8,
    border: opts?.secondary ? '1px solid #e5e7eb' : '1px solid #175cd3',
    background: opts?.secondary ? '#fff' : '#175cd3',
    color: opts?.secondary ? '#334155' : '#fff',
    fontWeight:700,
    cursor:'pointer'
  };
}
