'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { createAttemptSession, updateAttemptSession, finalizeAttemptFromSession, upsertWrong } from '../../lib/analytics/attempts';
import { loadRawQuestionsFor } from '../../lib/qa/excel';

type Mode = 'subject' | 'year';

type RawSnap = Record<string, any>;

type Opt = {
  textJA?: string;
  textVI?: string;
  image?: string;
  isAnswer?: boolean;
  explainJA?: string;
  explainVI?: string;
};

type ViewQuestion = {
  id: string;
  courseId: string;
  subjectId: string;
  examYear?: number;
  textJA?: string;
  textVI?: string;
  image?: string;
  options: Opt[];
  order: number[];
  selectedIndex: number | null;       // index theo thứ tự đã shuffle
  submitted: boolean;                 // dùng cho subject-mode
  locked: boolean;                    // dùng cho year-mode
  correctShuffledIndexes: number[];   // set các index đúng sau khi shuffle
  multiCorrect: boolean;
  expectedMultiCount: number;
  guessed?: boolean;                  // “適当に選んだ!”
};

function shuffledIndices(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toViewFromRaw(raw: RawSnap) {
  const id = String(raw.id ?? raw.questionId ?? '');
  const courseId = String(raw.courseId ?? '');
  const subjectId = String(raw.subjectId ?? '');
  const textJA = raw.questionTextJA ?? raw.ja?.text ?? '';
  const textVI = raw.questionTextVI ?? raw.vi?.text ?? '';
  const image = raw.questionImage ?? raw.ja?.image ?? raw.vi?.image ?? '';
  const examYear = Number(raw.examYear ?? raw.year ?? NaN);

  const opts: Opt[] = [];
  for (let i = 1; i <= 6; i++) {
    const tJA = raw[`option${i}TextJA`];
    const tVI = raw[`option${i}TextVI`];
    const img = raw[`option${i}Image`];
    const isAns = raw[`option${i}IsAnswer`];
    const eJA = raw[`option${i}ExplanationJA`];
    const eVI = raw[`option${i}ExplanationVI`];
    if (tJA == null && tVI == null) break;
    opts.push({
      textJA: tJA || '',
      textVI: tVI || '',
      image: img || '',
      isAnswer: !!isAns,
      explainJA: eJA || '',
      explainVI: eVI || '',
    });
  }
  const expectedMultiCount = opts.filter(o => o.isAnswer).length;
  return { id, courseId, subjectId, textJA, textVI, image, options: opts, examYear, expectedMultiCount };
}

function grade(selectedIndex: number | null, optionsInOrder: Opt[]) {
  const correct = optionsInOrder.map((o, i) => (o.isAnswer ? i : -1)).filter(i => i >= 0);
  const multiCorrect = correct.length > 1;
  const isCorrect = selectedIndex != null ? correct.includes(selectedIndex) : false;
  return { isCorrect, correctIndexes: correct, multiCorrect };
}

export default function Player(props: {
  courseId: string;
  subjectId: string;
  mode: Mode;
  initialShuffle?: boolean;
  initialTags?: string[];
  years?: string[];     // dùng thêm nếu cần lọc theo năm
}) {
  const router = useRouter();
  const { courseId, subjectId, mode, initialShuffle, initialTags, years } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const [list, setList] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [showVI, setShowVI] = useState(false);

  useEffect(() => {
    setLoading(true); setErr(null);
    (async () => {
      try {
        const raws: RawSnap[] = await loadRawQuestionsFor(courseId, subjectId);
        let rows = raws.map(toViewFromRaw);

        // Lọc theo tags (nếu có)
        if (initialTags && initialTags.length) {
          rows = rows.filter(r => {
            const raw = raws.find(x => String(x.id ?? x.questionId ?? '') === r.id) || {};
            const tagStr = String(raw.tags ?? '').toLowerCase();
            return initialTags.some(t => tagStr.includes(String(t).toLowerCase()));
          });
        }

        // Lọc theo năm (nếu có)
        if (years && years.length) {
          const setYear = new Set(years.map(y => Number(y)));
          rows = rows.filter(r => setYear.has(Number(r.examYear)));
        }

        if (!rows.length) { setList([]); setLoading(false); return; }

        const vqs: ViewQuestion[] = rows.map(r => {
          const order = initialShuffle ? shuffledIndices(r.options.length) : Array.from({ length: r.options.length }, (_, i) => i);
          const optsInOrder = order.map(k => r.options[k]);
          const g = grade(null, optsInOrder);
          return {
            id: r.id, courseId: r.courseId, subjectId: r.subjectId, examYear: r.examYear,
            textJA: r.textJA, textVI: r.textVI, image: r.image,
            options: r.options, order,
            selectedIndex: null,
            submitted: false,
            locked: false,
            correctShuffledIndexes: g.correctIndexes,
            multiCorrect: g.multiCorrect,
            expectedMultiCount: r.expectedMultiCount,
          };
        });

        setList(vqs);
        setIndex(0);
        setStartedAtMs(Date.now());

        // tạo session nếu có user
        const auth = getAuth();
        if (auth.currentUser?.uid) {
          const { sessionId } = await createAttemptSession({
            courseId, subjectId, mode, total: vqs.length
          });
          setSessionId(sessionId);
        }
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, subjectId, initialShuffle, JSON.stringify(initialTags || []), JSON.stringify(years || [])]);

  const goto = (i: number) => setIndex(prev => Math.max(0, Math.min(i, list.length - 1)));

  const onSelect = (qIdx: number, shuffledIndex: number) => {
    setList(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      if (mode === 'year' && q.locked) return q;           // year-mode: đã khóa thì không đổi
      if (mode === 'subject' && q.submitted) return q;     // subject-mode: đã nộp thì không đổi
      return { ...q, selectedIndex: shuffledIndex };
    }));
  };

  const markGuessed = (qIdx: number) => {
    setList(prev => prev.map((q, i) => (i === qIdx ? { ...q, guessed: true } : q)));
  };

  const submitOne = (qIdx: number) => {
    setList(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      if (q.selectedIndex == null) return q;

      if (mode === 'year') {
        // Year-mode: chỉ khóa lựa chọn, không chấm
        return { ...q, locked: true };
      }

      // Subject-mode: chấm ngay
      const optsInOrder = q.order.map(k => q.options[k]);
      const g = grade(q.selectedIndex, optsInOrder);
      if (!g.multiCorrect && g.isCorrect === false) {
        upsertWrong({ questionId: q.id, courseId: q.courseId, subjectId: q.subjectId, examYear: q.examYear }).catch(()=>{});
      }
      return { ...q, submitted: true, correctShuffledIndexes: g.correctIndexes, multiCorrect: g.multiCorrect };
    }));
  };

  const submitAll = async () => {
    // Cảnh báo còn câu trống ở year-mode
    if (mode === 'year') {
      const unanswered = list.filter(q => q.selectedIndex == null).length;
      if (unanswered > 0) {
        const ok = confirm(`Bạn còn ${unanswered} câu chưa chọn đáp án. Bạn vẫn muốn nộp bài chứ?`);
        if (!ok) return;
      }
    }

    // Tính điểm + answers
    const graded = list.map(q => {
      const optsInOrder = q.order.map(k => q.options[k]);
      const g = grade(q.selectedIndex, optsInOrder);
      // không hiển thị đúng/sai trong UI year-mode, nhưng vẫn có thể tính điểm ngầm
      return {
        ...q,
        correctShuffledIndexes: g.correctIndexes,
        multiCorrect: g.multiCorrect,
        submitted: (mode === 'subject') ? true : q.submitted,
        locked: (mode === 'year') ? (q.locked || q.selectedIndex != null) : q.locked,
        _isCorrectCalc: g.multiCorrect ? true : g.isCorrect,
      };
    });

    const total = graded.length;
    const correct = graded.filter(x => x._isCorrectCalc).length;
    const blank = graded.filter(x => x.selectedIndex == null).length;

    const answers = graded.map(q => ({
      questionId: q.id,
      pickedIndexes: (q.selectedIndex == null ? [] : [q.selectedIndex]),
      correctIndexes: q.correctShuffledIndexes || [],
      isCorrect: !!q._isCorrectCalc,
      guessed: !!q.guessed,
    }));

    const durationSec = startedAtMs ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)) : undefined;

    try {
      const auth = getAuth();
      if (!auth.currentUser?.uid) { alert('Bạn chưa đăng nhập. Hãy đăng nhập để lưu kết quả.'); return; }
      let sid = sessionId;
      if (!sid) {
        const created = await createAttemptSession({ courseId, subjectId, mode, total });
        sid = created.sessionId; setSessionId(sid);
      }
      await updateAttemptSession(sid!, { correct, blank });
      const { attemptId } = await finalizeAttemptFromSession(sid!, { score: correct, answers, durationSec });
      router.push(`/courses/${courseId}/practice/summary?attempt=${encodeURIComponent(attemptId)}`);
    } catch (e: any) {
      console.error('[attempts] finalize failed:', e);
      alert('Không thể lưu kết quả. Hãy kiểm tra đã đăng nhập và quyền Firestore (/users/*/attempts). Chi tiết: ' + (e?.message || ''));
    }
  };

  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!list.length) return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;

  const q = list[index];
  const order = q.order;
  const optsJA = order.map(k => q.options[k].textJA || '');
  const optsVI = order.map(k => q.options[k].textVI || '');
  const optImgs = order.map(k => q.options[k].image || '');
  const correctSet = new Set(q.correctShuffledIndexes || []);
  const selected = q.selectedIndex;

  // Màu nền theo chế độ
  const optBg = (i: number) => {
    if (mode === 'year') {
      return (selected === i) ? '#f8fafc' : '#fff';
    }
    // subject-mode: nếu đã nộp thì hiển thị đúng/sai
    if (q.submitted) {
      const isCorrect = q.multiCorrect === true || correctSet.has(i);
      const selectedThis = selected === i;
      return isCorrect ? '#ecfdf3' : (selectedThis ? '#fef2f2' : '#fff');
    }
    return '#fff';
  };

  const labelSubmitOne = (mode === 'year') ? '回答決定 / Chọn đáp án' : 'この問題を提出 / Nộp câu này';
  const labelSubmitAll = (mode === 'year') ? 'テスト終了 / Nộp Bài' : '終了して保存 / Kết thúc & lưu kết quả';

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {courseId} / {subjectId} — {mode === 'year' ? '年度 過去問' : '練習 / Luyện tập'}
      </h1>

      {/* Thanh nhảy câu */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 12px' }}>
        {list.map((qq, i) => {
          const isBlank = qq.selectedIndex == null;
          const isWrong = qq.submitted && !qq.multiCorrect && qq.correctShuffledIndexes.length && !(qq.correctShuffledIndexes.includes(qq.selectedIndex ?? -999));
          const isCorrect = qq.submitted && (qq.multiCorrect || qq.correctShuffledIndexes.includes(qq.selectedIndex ?? -999));
          let bg = '#fff', bd = '#e5e7eb';
          if (mode === 'year') {
            // year-mode: không hiển thị đúng/sai
            if (qq.locked) { bg = '#f8fafc'; bd = '#64748b'; }
            else if (isBlank) { bg = '#fff'; bd = '#e5e7eb'; }
          } else {
            if (isCorrect) { bg = '#ecfdf3'; bd = '#10b981'; }
            else if (isWrong) { bg = '#fef2f2'; bd = '#ef4444'; }
            else if (isBlank) { bg = '#fff'; bd = '#e5e7eb'; }
          }
          return (
            <button key={qq.id} onClick={() => goto(i)}
              style={{ width: 34, height: 30, borderRadius: 6, border: `1px solid ${bd}`, background: bg, fontSize: 12, cursor: 'pointer' }}>
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Bộ điều khiển nhỏ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => goto(index - 1)} disabled={index === 0} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>前へ / Trước</button>
        <div>{index + 1} / {list.length}</div>
        <button onClick={() => goto(index + 1)} disabled={index === list.length - 1} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>次へ / Tiếp</button>

        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={showVI} onChange={e => setShowVI(e.target.checked)} />
          JA / VI
        </label>
      </div>

      {/* Thân đề */}
      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          問 {index + 1}: {showVI ? (q.textVI || '') : (q.textJA || '')}
        </div>
        {!!q.image && <img src={q.image} alt="" style={{ maxWidth: '100%', marginBottom: 8 }} />}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {optsJA.map((txtJA, i) => {
            const txtVI = optsVI[i] || '';
            const img = optImgs[i] || '';
            const disabled = (mode === 'year') ? q.locked : q.submitted;
            return (
              <li key={i} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8, background: optBg(i) }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                  <input type="radio" name={'q-' + q.id} disabled={disabled}
                         checked={q.selectedIndex === i} onChange={() => onSelect(index, i)} style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 22, textAlign: 'right', paddingTop: 2 }}>{q.order[i] + 1}.</div>
                      <div style={{ flex: 1 }}>
                        {showVI ? (txtVI || '') : (txtJA || '')}
                        {!!img && <img src={img} alt="" style={{ maxWidth: '100%', marginTop: 6 }} />}
                      </div>
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => submitOne(index)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#fff', color: '#334155', fontWeight: 700 }}>
            {labelSubmitOne}
          </button>
          <button onClick={() => { markGuessed(index); alert('Đã đánh dấu: 適当に選んだ / Chọn bừa'); }} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #c2410c', background: '#fff7ed', color: '#9a3412', fontWeight: 700 }}>
            適当に選んだ! / Chọn bừa!
          </button>
          <button onClick={submitAll} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}>
            {labelSubmitAll}
          </button>
        </div>
      </div>
    </main>
  );
}
