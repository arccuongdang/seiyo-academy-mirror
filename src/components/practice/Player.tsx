// src/components/practice/Player.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { createAttemptSession, updateAttemptSession, finalizeAttemptFromSession, upsertWrong } from '../../lib/analytics/attempts';
import { loadRawQuestionsFor, loadSubjectsJson, findSubjectMeta, getCourseDisplayNameJA, getCourseDisplayNameVI } from '../../lib/qa/excel';
import BilingualText from '../BilingualText';

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
  order: number[];                 // permutation mapping indexShown -> indexOriginal
  selectedIndex: number | null;    // index in shown order
  submitted: boolean;              // for subject-mode
  locked: boolean;                 // for year-mode
  correctShownIndexes: number[];   // correct indexes in shown order
  multiCorrect: boolean;
  expectedMultiCount: number;
  guessed?: boolean;               // "適当に選んだ!"
  confident?: boolean;             // "回答は絶対これだ！"
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
    if (tJA == null && tVI == null && !img) break;
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

function grade(selectedIndex: number | null, shownOptions: Opt[]) {
  const correct = shownOptions.map((o, i) => (o.isAnswer ? i : -1)).filter(i => i >= 0);
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
  years?: string[];
}) {
  const router = useRouter();
  const { courseId, subjectId, mode, initialShuffle, initialTags, years } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  const [list, setList] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);

  const [showVI, setShowVI] = useState<boolean>(false);
  const [showFurigana, setShowFurigana] = useState<boolean>(false);
  const [showExplain, setShowExplain] = useState<boolean>(false);

  // Titles
  const [courseJA, setCourseJA] = useState<string>(courseId);
  const [courseVI, setCourseVI] = useState<string>(courseId);
  const [subjectJA, setSubjectJA] = useState<string>(subjectId);
  const [subjectVI, setSubjectVI] = useState<string>('');

  async function computeAllowedSourceNotes(): Promise<Set<string>> {
    try {
      const auth = getAuth();
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdTokenResult();
          if (token?.claims?.admin) return new Set(['A','B','C']);
        } catch {}
      }
      const email = auth.currentUser?.email || '';
      const uid = auth.currentUser?.uid || '';
      const db = getFirestore();
      const snap = await getDoc(doc(db, 'config/access/sourceNote'));
      const data = (snap.exists() ? (snap.data() as any) : {}) || {};
      const base: Set<string> = new Set([...(data.defaultAllowed || ['A'])]);
      (data.allowByEmail?.[email] || []).forEach((x: string) => base.add(String(x).toUpperCase()));
      (data.allowByUid?.[uid] || []).forEach((x: string) => base.add(String(x).toUpperCase()));
      if (!base.size) base.add('A');
      return base;
    } catch {
      return new Set(['A']);
    }
  }


  useEffect(() => {
    (async () => {
      try {
        const sj = await loadSubjectsJson();
        setCourseJA(getCourseDisplayNameJA(courseId, sj) || courseId);
        setCourseVI(getCourseDisplayNameVI(courseId, sj) || courseId);
        const meta = findSubjectMeta(courseId, subjectId, sj);
        setSubjectJA(meta?.nameJA || subjectId);
        setSubjectVI(meta?.nameVI || '');
      } catch {}
    })();
  }, [courseId, subjectId]);

  async function getAllowedSourceNotes(): Promise<Set<string>> {
    try {
      const auth = getAuth();
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdTokenResult();
          if (token?.claims?.admin) return new Set(['A','B','C']);
        } catch {}
      }
      const email = auth.currentUser?.email || '';
      const uid = auth.currentUser?.uid || '';
      const db = getFirestore();
      const snap = await getDoc(doc(db, 'config/access/sourceNote'));
      const data = (snap.exists() ? (snap.data() as any) : {}) || {};
      const base: Set<string> = new Set([...(data.defaultAllowed || ['A'])]);
      (data.allowByEmail?.[email] || []).forEach((x: string) => base.add(String(x).toUpperCase()));
      (data.allowByUid?.[uid] || []).forEach((x: string) => base.add(String(x).toUpperCase()));
      if (!base.size) base.add('A');
      return base;
    } catch {
      return new Set(['A']);
    }
  }

  useEffect(() => {
    setLoading(true); setErr(null);
    (async () => {
      try {
        const raws: RawSnap[] = await loadRawQuestionsFor(courseId, subjectId);
        const allowed = await computeAllowedSourceNotes();
        const sourceMap = new Map<string, string>(raws.map(r => [String(r.id ?? r.questionId ?? ''), String(r.sourceNote ?? 'A').toUpperCase()]));
        let rows = raws
          .map(toViewFromRaw)
          .filter(r => allowed.has(sourceMap.get(r.id) || 'A'));

        if (initialTags && initialTags.length) {
          rows = rows.filter(r => {
            const raw = raws.find(x => String(x.id ?? x.questionId ?? '') === r.id) || {};
            const tagStr = String(raw.tags ?? '').toLowerCase();
            return initialTags.some(t => tagStr.includes(String(t).toLowerCase()));
          });
        }

        if (years && years.length) {
          const setYear = new Set(years.map(y => Number(y)));
          rows = rows.filter(r => setYear.has(Number(r.examYear)));
        }

        if (!rows.length) { setList([]); setLoading(false); return; }

        const vqs: ViewQuestion[] = rows.map(r => {
          const order = initialShuffle ? shuffledIndices(r.options.length) : Array.from({ length: r.options.length }, (_, i) => i);
          const shown = order.map(k => r.options[k]);
          const g = grade(null, shown);
          return {
            id: r.id, courseId: r.courseId, subjectId: r.subjectId, examYear: r.examYear,
            textJA: r.textJA, textVI: r.textVI, image: r.image,
            options: r.options, order,
            selectedIndex: null,
            submitted: false,
            locked: false,
            correctShownIndexes: g.correctIndexes,
            multiCorrect: g.multiCorrect,
            expectedMultiCount: r.expectedMultiCount,
            guessed: false,
            confident: false,
          };
        });

        setList(vqs);
        setIndex(0);
        setStartedAtMs(Date.now());

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

  const onSelect = (qIdx: number, shownIndex: number) => {
    setList(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      if (mode === 'year' && q.locked) return q;
      if (mode === 'subject' && q.submitted) return q;
      return { ...q, selectedIndex: shownIndex };
    }));
  };

  const submitOneSubject = (qIdx: number, flag: 'confident' | 'guessed') => {
    setList(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      if (q.selectedIndex == null) return q;
      const shown = q.order.map(k => q.options[k]);
      const g = grade(q.selectedIndex, shown);
      if (!g.multiCorrect && g.isCorrect === false) {
        upsertWrong({ questionId: q.id, courseId: q.courseId, subjectId: q.subjectId, examYear: q.examYear }).catch(()=>{});
      }
      return { ...q, submitted: true, correctShownIndexes: g.correctIndexes, multiCorrect: g.multiCorrect, guessed: flag === 'guessed', confident: flag === 'confident' };
    }));
  };

  const lockOneYear = (qIdx: number) => {
    setList(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      if (q.selectedIndex == null) return q;
      return { ...q, locked: true };
    }));
  };

  const submitAll = async () => {
    if (mode === 'year') {
      const unanswered = list.filter(q => q.selectedIndex == null).length;
      if (unanswered > 0) {
        const ok = confirm(`Bạn còn ${unanswered} câu chưa chọn đáp án. Bạn vẫn muốn nộp bài chứ?`);
        if (!ok) return;
      }
    }

    const graded = list.map(q => {
      const shown = q.order.map(k => q.options[k]);
      const g = grade(q.selectedIndex, shown);
      return {
        ...q,
        correctShownIndexes: g.correctIndexes,
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
      correctIndexes: q.correctShownIndexes || [],
      order: q.order,
      isCorrect: !!q._isCorrectCalc,
      guessed: !!q.guessed,
      confident: !!q.confident,
    }));

    const durationSec = startedAtMs ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)) : 0;
    const safeTags = Array.isArray(initialTags) ? initialTags.filter(Boolean) : [];

    try {
      const auth = getAuth();
      if (!auth.currentUser?.uid) { alert('Bạn chưa đăng nhập. Hãy đăng nhập để lưu kết quả.'); return; }
      let sid = sessionId;
      if (!sid) {
        const created = await createAttemptSession({ courseId, subjectId, mode, total });
        sid = created.sessionId; setSessionId(sid);
      }
      await updateAttemptSession(sid!, { correct, blank });
      const { attemptId } = await finalizeAttemptFromSession(sid!, { score: correct, answers, durationSec, tags: safeTags });
      // Summary route (keep as-is)
      // NOTE: adjust the path if your summary page differs
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
  const shownOpts = order.map(k => q.options[k]);
  const correctSet = new Set(q.correctShownIndexes || []);
  const selected = q.selectedIndex;

  const optBg = (i: number) => {
    if (mode === 'year') {
      return (selected === i) ? '#f8fafc' : '#fff';
    }
    if (q.submitted) {
      const isCorrect = q.multiCorrect === true || correctSet.has(i);
      const selectedThis = selected === i;
      return isCorrect ? '#ecfdf3' : (selectedThis ? '#fef2f2' : '#fff');
    }
    return '#fff';
  };

  const titleLine = (
    <div style={{ fontWeight: 800, marginBottom: 10, lineHeight: 1.4 }}>
      {mode === 'subject' && (
        <div style={{ fontSize: 18 }}>
          {courseJA}　{subjectJA} / {courseVI} Môn {subjectVI || subjectId}
        </div>
      )}
      {mode === 'year' && (
        <div style={{ fontSize: 18 }}>
          {courseJA}　{subjectJA} / {courseVI} Môn {subjectVI || subjectId}
          {typeof q.examYear === 'number' && !Number.isNaN(q.examYear) ? `＿　${q.examYear}年 問題` : ''}
        </div>
      )}
    </div>
  );

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 12, opacity: 0.85 }}>
        <span>範囲 / Phạm vi:</span>
        <span style={{ padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 6 }}>A: 過去問 / Đề cũ</span>
        <span style={{ padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 6 }}>B: 練習問題 / Đề luyện tập</span>
        <span style={{ padding: '2px 6px', border: '1px solid #e5e7eb', borderRadius: 6 }}>C: 厳選問題 / Sít Rịt</span>
      </div>
      {titleLine}

      {/* Thanh nhảy câu */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 8px' }}>
        {list.map((qq, i) => {
          const isBlank = qq.selectedIndex == null;
          const isWrong = qq.submitted && !qq.multiCorrect && qq.correctShownIndexes.length && !(qq.correctShownIndexes.includes(qq.selectedIndex ?? -999));
          const isCorrect = qq.submitted && (qq.multiCorrect || qq.correctShownIndexes.includes(qq.selectedIndex ?? -999));
          let bg = '#fff', bd = '#e5e7eb';
          if (mode === 'year') {
            if (qq.locked) { bg = '#f8fafc'; bd = '#64748b'; }
            else if (isBlank) { bg = '#fff'; bd = '#e5e7eb'; }
          } else {
            if (isCorrect) { bg = '#ecfdf3'; bd = '#10b981'; }
            else if (isWrong) { bg = '#fef2f2'; bd = '#ef4444'; }
            else if (isBlank) { bg = '#fff'; bd = '#e5e7eb'; }
          }
          return (
            <button key={qq.id} onClick={() => setIndex(i)}
              style={{ width: 34, height: 30, borderRadius: 6, border: `1px solid ${bd}`, background: bg, fontSize: 12, cursor: 'pointer' }}>
              {i + 1}
            </button>
          );
        })}
        <div style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.8 }}>{index + 1} / {list.length}</div>
      </div>

      {/* Controls: Furigana + song ngữ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showFurigana} onChange={e => setShowFurigana(e.target.checked)} />
            ふりがな
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showVI} onChange={e => setShowVI(e.target.checked)} />
            VI song ngữ
          </label>
        </div>
      </div>

      {/* Thân đề */}
      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          問 {index + 1}:{' '}
          <BilingualText ja={q.textJA || ''} vi={q.textVI || ''} lang="JA" showFurigana={showFurigana} />
          {showVI && <><br /><BilingualText ja={q.textJA || ''} vi={q.textVI || ''} lang="VI" /></>}
        </div>
        {!!q.image && <img src={q.image} alt="" style={{ maxWidth: '100%', marginBottom: 8 }} />}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shownOpts.map((op, i) => {
            const disabled = (mode === 'year') ? q.locked : q.submitted;
            const showThisExplain = showExplain && q.submitted; // chỉ bật khi đã nộp
            const isCorrect = q.multiCorrect || correctSet.has(i);
            return (
              <li key={i} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8, background: optBg(i) }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                  <input type="radio" name={'q-' + q.id} disabled={disabled}
                        checked={q.selectedIndex === i} onChange={() => onSelect(index, i)} style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 22, textAlign: 'right', paddingTop: 2 }}>{q.order[i] + 1}.</div>
                      <div style={{ flex: 1 }}>
                        <BilingualText ja={op.textJA || ''} vi={op.textVI || ''} lang="JA" showFurigana={showFurigana} />
                        {showVI && <div style={{ opacity: 0.9, marginTop: 4 }}><BilingualText ja={op.textJA || ''} vi={op.textVI || ''} lang="VI" /></div>}
                        {!!op.image && <img src={op.image} alt="" style={{ maxWidth: '100%', marginTop: 6 }} />}

                        {/* Inline explanations per option */}
                        {showThisExplain && (op.explainJA || op.explainVI) && (
                          <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {(isCorrect ? '★正答★　' : '')}【解説】
                            </div>
                            <BilingualText ja={op.explainJA || ''} vi={op.explainVI || ''} lang="JA" showFurigana={showFurigana} />
                            {showVI && <div style={{ opacity: 0.9, marginTop: 4 }}><BilingualText ja={op.explainJA || ''} vi={op.explainVI || ''} lang="VI" /></div>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {/* Hàng nút hành động */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {mode === 'year' ? (
            <>
              <button onClick={() => lockOneYear(index)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#fff', color: '#334155', fontWeight: 700 }}>
                回答決定 / Chọn đáp án
              </button>
              <button onClick={submitAll} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}>
                テスト終了 / Nộp Bài
              </button>
            </>
          ) : (
            <>
              <button onClick={() => submitOneSubject(index, 'confident')} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#fff', color: '#334155', fontWeight: 700 }}>
                回答は絶対これだ！/ Chắc chắn đây là đáp án !
              </button>
              <button onClick={() => submitOneSubject(index, 'guessed')} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #c2410c', background: '#fff7ed', color: '#9a3412', fontWeight: 700 }}>
                適当に選んだ! / Khó quá chọn bừa!
              </button>
              <button onClick={submitAll} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}>
                テスト終了 / Nộp bài
              </button>
              {/* Giải thích toggle: chỉ bật được khi đã nộp */}
              <button
                onClick={() => setShowExplain(v => !v)}
                disabled={!list[index]?.submitted}
                style={{ marginLeft: 'auto', padding: '10px 14px', borderRadius: 8, border: '1px solid #64748b', background: '#fff', color: '#334155', fontWeight: 700, opacity: list[index]?.submitted ? 1 : 0.5 }}
              >
                解説 / Giải thích {showExplain ? 'ON' : 'OFF'}
              </button>
            </>
          )}
        </div>

        {/* Footer: vị trí + Next */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Câu hiện tại: {index + 1} / {list.length}</div>
          <button onClick={() => setIndex(i => Math.min(i + 1, list.length - 1))}
                  disabled={index === list.length - 1}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}>
            次へ / Tiếp
          </button>
        </div>
      </div>
    </main>
  );
}
