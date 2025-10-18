
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';

import { loadRawQuestionsFor, loadSubjectsJson, findSubjectMeta, getCourseDisplayNameJA } from '../../../../../lib/qa/excel';
import { toQARenderItemFromSnapshot } from '../../../../../lib/qa/formatters';
import type { QuestionSnapshotItem, QARenderItem, QARenderOption } from '../../../../../lib/qa/schema';

import { createAttemptSession, updateAttemptSession, finalizeAttemptFromSession, upsertWrong } from '../../../../../lib/analytics/attempts';

type ViewQuestion = {
  id: string;
  courseId: string;
  subjectId: string;
  examYear: number;
  ja: QARenderItem;
  vi: QARenderItem;
  order: number[];
  selectedIndex: number | null;
  submitted: boolean;
  isCorrect?: boolean;
  correctShuffledIndexes?: number[];
  multiCorrect?: boolean;
  expectedMultiCount: number;
  showVIQuestion: boolean;
  showVIOption: Record<number, boolean>;
};

function gradeSingleChoiceByIndex(selectedIndex: number | null, options: QARenderOption[]) {
  const correct = options.map((o, i) => (o.isAnswer ? i : -1)).filter(i => i >= 0);
  const multiCorrect = correct.length > 1;
  const isCorrect = selectedIndex != null ? correct.includes(selectedIndex) : false;
  return { isCorrect, correctIndexes: correct, multiCorrect };
}
function escapeHtml(s: string) {
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function VIChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title="Hiển thị/ẩn bản dịch tiếng Việt"
      style={{ padding: '2px 6px', borderRadius: 6, fontSize: 12, border: '1px solid #ddd',
               background: active ? '#f1f5f9' : '#fff', color: '#111827' }}
    >VI</button>
  );
}
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

export default function YearPracticePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const router = useRouter();

  const subject = (search.get('subject') || '').toUpperCase();
  const tagsParam = search.get('tags');
  const fixedYear = Number(search.get('year') || '');
  const allowed = new Set(['TK','L','KC','TC']);

  const [rawItems, setRawItems] = useState<QuestionSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [showFurigana, setShowFurigana] = useState<boolean>(false); // default OFF

  const [titleJA, setTitleJA] = useState<string>('');

  const tags = useMemo(() => tagsParam ? tagsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined, [tagsParam]);

  useEffect(() => {
    if (!subject || !Number.isFinite(fixedYear)) return;
    setLoading(true); setErr(null);
    (async () => {
      try {
        if (!allowed.has(subject)) { setErr('Tham số không hợp lệ (subject).'); setLoading(false); return; }
        const raws = await loadRawQuestionsFor(course, subject);
        setRawItems(raws);
        // build title JA with subject name + course name
        const sj = await loadSubjectsJson();
        const meta = findSubjectMeta(course, subject, sj);
        const courseJA = getCourseDisplayNameJA(course, sj) || course;
        const subjectJA = meta?.nameJA || subject;
        setTitleJA(`${courseJA}　${subjectJA}　${fixedYear}年問題`);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu'); setLoading(false);
      }
    })();
  }, [course, subject, fixedYear]);

  useEffect(() => {
    if (!rawItems.length) return;
    const rows = rawItems.filter(q => Number(q.examYear) === fixedYear && (!tags || tags.some(tag => String(q.tags||'').includes(tag))));
    if (rows.length === 0) { setErr('Không có câu hỏi phù hợp filter.'); setQuestions([]); return; }

    const view: ViewQuestion[] = rows.map(raw => {
      const ja = toQARenderItemFromSnapshot(raw, 'JA');
      const vi = toQARenderItemFromSnapshot(raw, 'VI');
      const order = Array.from({ length: ja.options.length }, (_, i) => i); // NO SHUFFLE in year mode
      const expectedMultiCount = ja.options.filter(o => o.isAnswer).length;
      return {
        id: ja.id, examYear: ja.examYear, courseId: ja.courseId, subjectId: ja.subjectId,
        ja, vi, order, selectedIndex: null, submitted: false, expectedMultiCount,
        showVIQuestion: false, showVIOption: {},
      };
    });

    setQuestions(view);
    setIndex(0);
    setStartedAtMs(Date.now());

    (async () => {
      try {
        const auth = getAuth();
        if (auth.currentUser?.uid) {
          const { sessionId } = await createAttemptSession({
            courseId: course, subjectId: subject, mode: 'year', examYear: fixedYear, total: view.length
          });
          setSessionId(sessionId);
        }
      } catch (e) { console.warn('[attempts] create session failed:', e); }
    })();
  }, [rawItems, subject, course, tagsParam, fixedYear]);

  const goto = (i: number) => setIndex(prev => Math.min(Math.max(i, 0), questions.length - 1));
  const onSelect = (qIdx: number, shuffledIndex: number) => {
    setQuestions(prev => prev.map((q, i) => (i === qIdx ? { ...q, selectedIndex: shuffledIndex } : q)));
  };

  const submitOne = (qIdx: number) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const optsInOrder = q.order.map(k => q.ja.options[k]);
      const res = gradeSingleChoiceByIndex(q.selectedIndex, optsInOrder);
      const multi = res.multiCorrect || q.expectedMultiCount > 1;
      const isCorrect = multi ? true : res.isCorrect;
      if (!multi && isCorrect === false) {
        upsertWrong({ questionId: q.id, courseId: q.courseId, subjectId: q.subjectId, examYear: q.examYear }).catch(()=>{});
      }
      return { ...q, submitted: true, isCorrect, correctShuffledIndexes: res.correctIndexes, multiCorrect: multi };
    }));
  };

  const submitAll = async () => {
    const graded = questions.map((q) => {
      const optsInOrder = q.order.map(k => q.ja.options[k]);
      const res = gradeSingleChoiceByIndex(q.selectedIndex, optsInOrder);
      const multi = res.multiCorrect || q.expectedMultiCount > 1;
      return { ...q, submitted: true, isCorrect: multi ? true : res.isCorrect, correctShuffledIndexes: res.correctIndexes, multiCorrect: multi };
    });
    graded.forEach((q) => { if (!q.multiCorrect && q.isCorrect === false) upsertWrong({ questionId: q.id, courseId: q.courseId, subjectId: q.subjectId, examYear: q.examYear }).catch(()=>{}); });

    const total = graded.length;
    const correct = graded.filter(x => x.isCorrect).length;
    const blank = graded.filter(x => x.selectedIndex == null).length;

    const answers = graded.map((q) => ({
      questionId: q.id,
      pickedIndexes: (q.selectedIndex == null ? [] : [q.selectedIndex]),
      correctIndexes: q.correctShuffledIndexes || [],
      isCorrect: q.multiCorrect ? true : !!q.isCorrect,
    }));
    const durationSec = startedAtMs ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)) : undefined;
    const tags = tagsParam ? tagsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    try {
      const auth = getAuth();
      if (!auth.currentUser?.uid) { alert('Bạn chưa đăng nhập. Hãy đăng nhập để lưu kết quả.'); return; }
      let sid = sessionId;
      if (!sid) {
        const created = await createAttemptSession({ courseId: course, subjectId: subject, mode: 'subject', total });
        sid = created.sessionId; setSessionId(sid);
      }
      await updateAttemptSession(sid!, { correct, blank });
      // IMPORTANT: score = correct count (not percentage)
      const { attemptId } = await finalizeAttemptFromSession(sid!, { score: correct, tags, answers, durationSec });
      router.push(`/courses/${course}/practice/summary?attempt=${encodeURIComponent(attemptId)}`);
    } catch (e: any) {
      console.error('[attempts] finalize failed:', e);
      alert('Không thể lưu kết quả. Hãy kiểm tra đã đăng nhập và quyền Firestore (/users/*/attempts). Chi tiết: ' + (e?.message || ''));
    }
  };

  if (!subject || !Number.isFinite(fixedYear)) return <main style={{ padding: 24 }}>Thiếu tham số <code>?subject=...</code></main>;
  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!questions.length) return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;

  const q = questions[index];
  const jaOpts = q.order.map(k => q.ja.options[k]);
  const viOpts = q.order.map(k => q.vi.options[k]);
  const selected = q.selectedIndex;
  const correctSet = new Set(q.correctShuffledIndexes || []);

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {titleJA}
      </h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 12px' }}>
        {questions.map((qq, i) => {
          const isBlank = qq.selectedIndex == null;
          const isWrong = qq.submitted && qq.isCorrect === false;
          const isCorrect = qq.submitted && qq.isCorrect === true;
          let bg = '#fff', bd = '#e5e7eb';
          if (isCorrect) { bg = '#ecfdf3'; bd = '#10b981'; }
          else if (isWrong) { bg = '#fef2f2'; bd = '#ef4444'; }
          else if (isBlank) { bg = '#f8fafc'; bd = '#cbd5e1'; }
          return (
            <button key={qq.id} onClick={() => goto(i)}
              style={{ width: 34, height: 30, borderRadius: 6, border: `1px solid ${bd}`, background: bg, fontSize: 12, cursor: 'pointer' }}>
              {i+1}
            </button>
          );
        })}
      </div>

      {(q.expectedMultiCount > 1 && !q.submitted) && (
        <div style={{ border: '1px solid #60a5fa', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: 10, marginBottom: 12 }}>
          Câu này có <b>{q.expectedMultiCount}</b> đáp án đúng
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => goto(index - 1)} disabled={index === 0} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>前へ / Trước</button>
        <div>{index + 1} / {questions.length}</div>
        <button onClick={() => goto(index + 1)} disabled={index === questions.length - 1} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>次へ / Tiếp</button>

        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={showFurigana} onChange={e => setShowFurigana(e.target.checked)} />
          ふりがな
        </label>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>
            問 {index + 1}: <FuriganaText text={q.ja.text || ''} enabled={showFurigana} />
          </div>
          {(q.vi.text || '').trim() && <VIChip active={q.showVIQuestion} onClick={() => setQuestions(prev => prev.map((qq, i) => i===index ? { ...qq, showVIQuestion: !qq.showVIQuestion } : qq))} />}
        </div>
        {q.showVIQuestion && (q.vi.text || '').trim() && (
          <div style={{ margin: '4px 0 8px', color: '#334155' }}>{q.vi.text}</div>
        )}

        {q.ja.image && <img src={q.ja.image} alt="" style={{ maxWidth: '100%', marginBottom: 8 }} />}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {jaOpts.map((opt, i) => {
            const selectedThis = selected === i;
            const isCorrect = q.submitted ? (q.multiCorrect === true || correctSet.has(i)) : false;
            const originalNo = q.order[i] + 1;
            return (
              <li key={i} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8,
                                    background: q.submitted ? (isCorrect ? '#ecfdf3' : (selectedThis ? '#fef2f2' : '#fff')) : '#fff' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="radio" name={'q-' + q.id} checked={selectedThis} onChange={() => onSelect(index, i)} style={{ marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                      <div style={{ width: 22, textAlign: 'right', paddingTop: 2 }}>{originalNo}.</div>
                      <div style={{ flex: 1 }}>
                        <FuriganaText text={opt.text || ''} enabled={showFurigana} />
                        {(viOpts[i]?.text || '').trim() && (
                          <div style={{ display:'inline-block', marginLeft: 8 }}>
                            <VIChip active={!!q.showVIOption[i]} onClick={() => setQuestions(prev => prev.map((qq, idx) => {
                              if (idx !== index) return qq;
                              const next = { ...qq.showVIOption }; next[i] = !next[i];
                              return { ...qq, showVIOption: next };
                            }))} />
                          </div>
                        )}
                        {q.showVIOption[i] && (viOpts[i]?.text || '').trim() && (
                          <div style={{ marginTop: 4, color:'#334155' }}>{viOpts[i]?.text}</div>
                        )}
                        {opt.image && <img src={opt.image} alt="" style={{ maxWidth: '100%', marginTop: 6 }} />
                        }
                      </div>
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap:'wrap' }}>
          <button onClick={() => submitOne(index)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #334155', background: '#fff', color: '#334155', fontWeight: 700 }}>
            この問題を提出 / Nộp câu này
          </button>
          <button onClick={submitAll} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}>
            終了して保存 / Kết thúc & lưu kết quả
          </button>
        </div>
      </div>
    </main>
  );
}
