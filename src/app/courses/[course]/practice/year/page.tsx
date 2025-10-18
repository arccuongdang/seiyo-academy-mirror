'use client';

/**
 * Year Practice — Luyện theo năm (mode=year)
 * Giữ nguyên logic; xóa JSX <Player/> thừa; thêm JA furigana; guard fixedYear.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { loadRawQuestionsFor } from '../../../../../lib/qa/excel';
import { toQARenderItemFromSnapshot } from '../../../../../lib/qa/formatters';

import { createAttemptSession, updateAttemptSession, finalizeAttemptFromSession } from '../../../../../lib/analytics/attempts';
import { getAuth } from 'firebase/auth';
import { bumpWrong } from '../../../../../lib/analytics/wrongs';

import type { QuestionSnapshotItem, QARenderItem, QARenderOption } from '../../../../../lib/qa/schema';

/* -------------------- Helpers -------------------- */
function shuffledIndices(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}
function gradeSingleChoiceByIndex(selectedIndex: number | null, options: QARenderOption[]) {
  const correct = options.map((o, i) => (o.isAnswer ? i : -1)).filter(i => i >= 0);
  const multiCorrect = correct.length > 1;
  const isCorrect = selectedIndex != null ? correct.includes(selectedIndex) : false;
  return { isCorrect, correctIndexes: correct, multiCorrect };
}

/* -------------------- Furigana (JA) -------------------- */
function FuriganaText({ text, enabled }: { text?: string; enabled?: boolean }) {
  const [html, setHtml] = useState<string>('');
  useEffect(() => {
    let on = true;
    (async () => {
      const t = (text || '').trim();
      if (!t) { setHtml(''); return; }
      if (!enabled) { setHtml(escapeHtml(t)); return; }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import('../../../../../lib/jp/kuroshiro');
        const out = typeof mod?.toFuriganaHtml === 'function' ? await mod.toFuriganaHtml(t) : null;
        if (on) setHtml(out || escapeHtml(t));
      } catch {
        if (on) setHtml(escapeHtml(t));
      }
    })();
    return () => { on = false; };
  }, [text, enabled]);
  if (!html) return null;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
function escapeHtml(s: string) {
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

/* -------------------- View types -------------------- */
type ViewQuestion = {
  id: string;
  examYear: number;
  courseId: string;
  subjectId: string;

  ja: QARenderItem;
  vi: QARenderItem;

  order: number[];
  selectedIndex: number | null;
  submitted: boolean;

  isCorrect?: boolean;
  correctShuffledIndexes?: number[];
  multiCorrect?: boolean;

  showVIQuestion: boolean;
  showVIOption: Record<number, boolean>;

  expectedMultiCount: number;
};

type FilterTab = 'all' | 'wrong' | 'blank';

export default function YearPracticePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();

  const subject = (search.get('subject') || '').toUpperCase();
  const yearStr = search.get('year') || '';
  const fixedYear = Number(yearStr);
  const shuffleParam = search.get('shuffle') === '1';

  const allowed = new Set(['TK','L','KC','TC']);

  const [rawItems, setRawItems] = useState<QuestionSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [randomizeOptions, setRandomizeOptions] = useState<boolean>(shuffleParam);

  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState<{ total: number; correct: number; blank: number }>({ total: 0, correct: 0, blank: 0 });
  const [tab, setTab] = useState<FilterTab>('all');

  // Attempts session info
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  // JA/VI & Furigana controls
  const [showFurigana, setShowFurigana] = useState<boolean>(true);

  /* -------- Load RAW -------- */
  useEffect(() => {
    if (!subject || !Number.isFinite(fixedYear)) return;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        if (!allowed.has(subject)) {
          setErr('Tham số không hợp lệ. Hãy chọn môn và năm hợp lệ từ trang Hub.');
          setLoading(false);
          return;
        }
        const raws = await loadRawQuestionsFor(course, subject);
        setRawItems(raws);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [course, subject, fixedYear]);

  /* -------- Lọc đúng năm + format + tạo session -------- */
  useEffect(() => {
    if (!rawItems.length || !Number.isFinite(fixedYear)) return;

    const rows = rawItems.filter(q => Number(q.examYear) === fixedYear);
    if (rows.length === 0) {
      setErr(`Chưa có câu hỏi cho ${subject} năm ${fixedYear}.`);
      setQuestions([]);
      return;
    }

    const view: ViewQuestion[] = rows.map(raw => {
      const ja = toQARenderItemFromSnapshot(raw, 'JA');
      const vi = toQARenderItemFromSnapshot(raw, 'VI');
      const order = randomizeOptions ? shuffledIndices(ja.options.length) : Array.from({ length: ja.options.length }, (_, i) => i);
      const expectedMultiCount = ja.options.filter(o => o.isAnswer).length;
      return {
        id: ja.id,
        examYear: ja.examYear,
        courseId: ja.courseId,
        subjectId: ja.subjectId,
        ja, vi,
        order,
        selectedIndex: null,
        submitted: false,
        showVIQuestion: false,
        showVIOption: {},
        expectedMultiCount,
      };
    });

    setQuestions(view);
    setIndex(0);
    setFinished(false);
    setTab('all');
    setStartedAtMs(Date.now());

    (async () => {
      try {
        const auth = getAuth();
        if (auth.currentUser?.uid) {
          const { sessionId } = await createAttemptSession({
            courseId: course,
            subjectId: subject,
            mode: 'year',
            examYear: fixedYear,
            total: view.length,
          });
          setSessionId(sessionId);
        }
      } catch (e) {
        console.warn('[attempts] create session failed:', e);
      }
    })();
  }, [rawItems, fixedYear, randomizeOptions, subject, course]);

  const goto = (i: number) => setIndex(prev => Math.min(Math.max(i, 0), questions.length - 1));
  const onSelect = (qIdx: number, shuffledIndex: number) => {
    setQuestions(prev => prev.map((q, i) => (i === qIdx ? { ...q, selectedIndex: shuffledIndex } : q)));
  };

  /* -------- Nộp toàn bài -------- */
  const submitAll = async () => {
    // 1) Chấm toàn bộ
    const graded = questions.map((q) => {
      const optsInOrder = q.order.map(k => q.ja.options[k]);
      const res = gradeSingleChoiceByIndex(q.selectedIndex, optsInOrder);
      const multi = res.multiCorrect || q.expectedMultiCount > 1;
      return {
        ...q,
        submitted: true,
        isCorrect: multi ? true : res.isCorrect,
        correctShuffledIndexes: res.correctIndexes,
        multiCorrect: multi,
      };
    });

    // 2) Ghi “câu sai”
    graded.forEach((q) => {
      if (!q.multiCorrect && q.isCorrect === false) {
        bumpWrong({
          questionId: q.id,
          courseId: q.courseId,
          subjectId: q.subjectId,
          examYear: q.examYear,
        }).catch(console.warn);
      }
    });

    // 3) Tính điểm + cập nhật UI
    const total = graded.length;
    const correct = graded.filter(x => x.isCorrect).length;
    const blank = graded.filter(x => x.selectedIndex == null).length;

    setQuestions(graded);
    setScore({ total, correct, blank });
    setFinished(true);
    setTab('all');

    // 4) Cập nhật progress + finalize attempt
    const scoreNum = total ? Math.round((correct / total) * 100) : 0;
    const tagsParam = search.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    try {
      const auth = getAuth();
      if (auth.currentUser?.uid && sessionId) {
        await updateAttemptSession(sessionId, { correct, blank });
        await finalizeAttemptFromSession(sessionId, { score: scoreNum, tags });
      }
    } catch (e) {
      console.error('[attempts] finalize failed:', e);
    }
  };

  const toggleVIQuestion = (qIdx: number) => {
    setQuestions(prev => prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)));
  };
  const toggleVIOption = (qIdx: number, shuffledIndex: number) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const m = { ...(q.showVIOption || {}) };
      m[shuffledIndex] = !m[shuffledIndex];
      return { ...q, showVIOption: m };
    }));
  };

  /* -------- UI trạng thái -------- */
  if (!subject || !Number.isFinite(fixedYear)) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code> và/hoặc <code>?year=...</code>
      </main>
    );
  }
  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;

  /* -------- Chưa nộp: làm bài -------- */
  if (!finished) {
    if (!questions.length) return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;

    const q = questions[index];
    const jaOpts = q.order.map(k => q.ja.options[k]);
    const viOpts = q.order.map(k => q.vi.options[k]);
    const selected = q.selectedIndex;

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          {course} / {subject} — {fixedYear} 年度 過去問
        </h1>

        {(q.expectedMultiCount > 1 && !q.submitted) && (
          <div style={{ border: '1px solid #60a5fa', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: 10, marginBottom: 12 }}>
            Câu này có <b>{q.expectedMultiCount}</b> đáp án đúng
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>前へ / Trước</button>
          <div>{index + 1} / {questions.length}</div>
          <button onClick={() => setIndex(i => Math.min(questions.length - 1, i + 1))} disabled={index === questions.length - 1} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>次へ / Tiếp</button>

          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={showFurigana} onChange={e => setShowFurigana(e.target.checked)} />
            ふりがな
          </label>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>
              問 {index + 1}: <FuriganaText text={q.ja.text || q.vi.text || ''} enabled={showFurigana} />
            </div>
            {(q.vi.text || '').trim() && (
              <button
                onClick={() => toggleVIQuestion(index)}
                aria-pressed={!!q.showVIQuestion}
                style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              >
                VI
              </button>
            )}
          </div>

          {q.ja.image && <img src={q.ja.image} alt="" style={{ maxWidth: '100%', marginBottom: 8 }} />}

          {q.showVIQuestion && (q.vi.text || '').trim() && (
            <div style={{ background: '#fffbeb', padding: 8, borderRadius: 8, marginBottom: 8 }}>
              {q.vi.text}
            </div>
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {jaOpts.map((opt, i) => {
              const selectedThis = selected === i;
              const hasVI = !!(viOpts[i]?.text && viOpts[i].text!.trim().length > 0);
              const showVI = !!q.showVIOption?.[i];
              return (
                <li key={i} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fff' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={'q-' + q.id}
                      checked={selectedThis}
                      onChange={() => onSelect(index, i)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div><FuriganaText text={opt.text || viOpts[i]?.text || ''} enabled={showFurigana} /></div>

                      {showVI && hasVI && (
                        <div style={{ background: '#fffbeb', padding: 6, borderRadius: 6, marginTop: 6 }}>
                          {viOpts[i]?.text}
                        </div>
                      )}

                      {hasVI && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            onClick={() => toggleVIOption(index, i)}
                            aria-pressed={!!q.showVIOption?.[i]}
                            style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          >
                            VI
                          </button>
                        </div>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={submitAll}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}
            >
              全問を提出 / Nộp toàn bài
            </button>

            <a href={`/courses/${course}/practice/year?subject=${subject}&year=${fixedYear}&shuffle=${randomizeOptions ? '1' : '0'}`}>
              <button style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#334155', fontWeight: 700 }}>
                やり直す / Làm lại
              </button>
            </a>

            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={randomizeOptions} onChange={(e) => setRandomizeOptions(e.target.checked)} />
              Trộn đáp án
            </label>
          </div>
        </div>
      </main>
    );
  }

  /* -------- Đã nộp: review -------- */
  const wrongIds = new Set(questions.filter(q => q.isCorrect === false).map(q => q.id));
  const blankIds = new Set(questions.filter(q => q.selectedIndex == null).map(q => q.id));
  const [list, setList] = useState<ViewQuestion[]>(questions);

  useEffect(() => {
    setList(questions.filter(q => {
      if (tab === 'wrong') return wrongIds.size ? wrongIds.has(q.id) : false;
      if (tab === 'blank') return blankIds.size ? blankIds.has(q.id) : false;
      return true;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, tab]);

  const percent = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {subject} — {fixedYear} 年度 結果 / Kết quả
      </h1>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><div style={{ color: '#475467' }}>正答数 / Số câu đúng</div><div style={{ fontWeight: 800, fontSize: 18 }}>{score.correct} / {score.total}（{percent}%）</div></div>
          <div><div style={{ color: '#475467' }}>未回答 / Chưa làm</div><div style={{ fontWeight: 800, fontSize: 18 }}>{score.blank}</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('all')} style={tabBtnStyle(true)}>全問 / Tất cả</button>
        <button onClick={() => setTab('wrong')} style={tabBtnStyle(false)}>不正解 / Sai</button>
        <button onClick={() => setTab('blank')} style={tabBtnStyle(false)}>未回答 / Chưa làm</button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {list.map((q, idx) => {
          const jaOpts = q.order.map(k => q.ja.options[k]);
          const viOpts = q.order.map(k => q.vi.options[k]);
          const correct = new Set(q.correctShuffledIndexes || []);
          return (
            <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Câu {idx + 1}: <FuriganaText text={q.ja.text || q.vi.text || ''} enabled={true} />
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {jaOpts.map((opt, i) => {
                  const isCorrect = (q.multiCorrect === true) || correct.has(i);
                  const picked = q.selectedIndex === i;
                  return (
                    <li key={i}
                        style={{
                          border: '1px solid #f0f0f0',
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          background: isCorrect ? '#ecfdf3' : picked ? '#fef2f2' : '#fff',
                        }}>
                      <div style={{ fontWeight: 600 }}>{isCorrect ? '✅ 正解' : picked ? '❌ 不正解' : '・'}</div>
                      <div><FuriganaText text={opt.text || viOpts[i]?.text || ''} enabled={true} /></div>
                      {(opt.explanation || q.ja.explanation) && (
                        <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>
                          {opt.explanation || q.ja.explanation}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: active ? '1px solid #175cd3' : '1px solid #ddd',
    background: active ? '#eef4ff' : '#fff',
    color: active ? '#175cd3' : '#111',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  };
}
