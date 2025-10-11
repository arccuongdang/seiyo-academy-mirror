'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Data loaders
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '@/lib/qa/excel';
// Formatters & utils
import { toQARenderItems, shuffleOptions } from '@/lib/qa/formatters';
import { gradeSingleChoice } from '@/lib/qa/grade';
// Furigana
import { toFuriganaHtml } from '@/lib/jp/kuroshiro';
// Types
import type { QARenderItem, QAOption } from '@/lib/qa/schema';

type ViewQuestion = QARenderItem & {
  shuffled: QAOption[];
  selectedId?: string | null;
  submitted?: boolean;
  isCorrect?: boolean;
  correctIds?: string[];
  multiCorrect?: boolean;
  // JA/VI toggles
  showVIQuestion?: boolean;
  showVIOption?: Record<string, boolean>;
  showVIExplanation?: boolean;

  showJAQuestion?: boolean;
  showJAOption?: Record<string, boolean>;
  showJAExplanation?: boolean;

  // cache furigana HTML
  furiQuestionHtml?: string;                  // for question JA
  furiOptionHtml?: Record<string, string>;    // optionId -> html

  // furigana cho Lời giải
  furiSelExpHtml?: string;                    // for selected option explanation JA
  furiOtherExpHtml?: Record<string, string>;  // optionId -> html (other correct)
  furiGeneralHtml?: string;                   // for general explanation JA
};

export default function PracticeStart({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || '';

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const manifest = await loadManifest();
        const filename = pickLatestFile(manifest, course, subject);
        if (!filename) {
          setErr(`Không tìm thấy snapshot cho ${course}/${subject}. Hãy publish dữ liệu ở /admin/data.`);
          setLoading(false);
          return;
        }

        const snapshot = await loadSubjectSnapshot(course, subject, filename);
        const items = toQARenderItems(snapshot.items);

        const selected: ViewQuestion[] = items.slice(0, 5).map((q) => {
          const shuffled = shuffleOptions(q.options);
          return {
            ...q,
            shuffled,
            selectedId: null,
            submitted: false,
            showVIQuestion: false,
            showVIOption: {},
            showVIExplanation: false,
            showJAQuestion: false,
            showJAOption: {},
            showJAExplanation: false,
            furiOptionHtml: {},
            furiOtherExpHtml: {},
          };
        });

        setQuestions(selected);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải đề');
        setLoading(false);
      }
    })();
  }, [course, subject]);

  // ===== Handlers =====

  const onSelect = (qIdx: number, optionId: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx && !q.submitted ? { ...q, selectedId: optionId } : q)),
    );
  };

  const onSubmitOne = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.submitted) return q;
        const result = gradeSingleChoice(q.selectedId ?? null, q.shuffled);
        return {
          ...q,
          submitted: true,
          isCorrect: result.isCorrect,
          correctIds: result.correctIds,
          multiCorrect: result.multiCorrect,
        };
      }),
    );
  };

  // ==== VI toggles ====
  const toggleVIQuestion = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)),
    );
  };

  const toggleVIOption = (qIdx: number, optionId: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const current = q.showVIOption || {};
        return { ...q, showVIOption: { ...current, [optionId]: !current[optionId] } };
      }),
    );
  };

  const toggleVIExplanation = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showVIExplanation: !q.showVIExplanation } : q)),
    );
  };

  // ==== JA (furigana) toggles — 2-phase (không dùng async updater) ====
  const toggleJAQuestion = (qIdx: number) => {
    // Phase 1: toggle ngay
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showJAQuestion: !q.showJAQuestion } : q)),
    );

    // Phase 2: generate nếu lần đầu
    const current = questions[qIdx];
    const needGenerate = !current?.furiQuestionHtml && (current?.questionTextJA || '').trim().length > 0;
    if (!needGenerate) return;

    (async () => {
      const ja = current!.questionTextJA || '';
      const html = await toFuriganaHtml(ja);
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        next[qIdx] = { ...next[qIdx], furiQuestionHtml: html };
        return next;
      });
    })();
  };

  const toggleJAOption = (qIdx: number, optionId: string, textJA: string) => {
    // Phase 1: toggle ngay
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const showMap = { ...(q.showJAOption || {}) };
        showMap[optionId] = !showMap[optionId];
        return { ...q, showJAOption: showMap };
      }),
    );

    // Phase 2: generate nếu lần đầu
    const current = questions[qIdx];
    const already = current?.furiOptionHtml?.[optionId];
    const needGenerate = !already && (textJA || '').trim().length > 0;
    if (!needGenerate) return;

    (async () => {
      const html = await toFuriganaHtml(textJA || '');
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        const map = { ...(next[qIdx].furiOptionHtml || {}) };
        map[optionId] = html;
        next[qIdx] = { ...next[qIdx], furiOptionHtml: map };
        return next;
      });
    })();
  };

  // === JA furigana cho LỜI GIẢI ===
  const toggleJAExplanation = (qIdx: number) => {
    // Phase 1: toggle ngay
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showJAExplanation: !q.showJAExplanation } : q)),
    );

    // Phase 2: generate cache nếu cần (selected / other-correct / general)
    const current = questions[qIdx];
    if (!current) return;

    const byId = new Map(current.shuffled.map((o) => [o.id, o]));
    const selected = current.selectedId ? byId.get(current.selectedId) : undefined;

    const needSel =
      !current.furiSelExpHtml && !!(selected?.explanationJA || '').trim();
    const needGen =
      !current.furiGeneralHtml && !!(current.explanationGeneralJA || '').trim();

    // determine which "other correct" JA explanations we need
    const otherCorrectIds = (current.correctIds || []).filter((cid) => cid !== current.selectedId);
    const needOthers: string[] = [];
    for (const cid of otherCorrectIds) {
      const o = byId.get(cid);
      const hasJA = !!(o?.explanationJA || '').trim();
      const cached = current.furiOtherExpHtml?.[cid];
      if (hasJA && !cached) needOthers.push(cid);
    }

    // If nothing to generate, stop
    if (!needSel && !needGen && needOthers.length === 0) return;

    (async () => {
      const updates: Partial<ViewQuestion> = {};
      if (needSel && selected) {
        updates.furiSelExpHtml = await toFuriganaHtml(selected.explanationJA || '');
      }
      if (needGen) {
        updates.furiGeneralHtml = await toFuriganaHtml(current.explanationGeneralJA || '');
      }
      if (needOthers.length > 0) {
        const map = { ...(current.furiOtherExpHtml || {}) };
        for (const cid of needOthers) {
          const o = byId.get(cid);
          if (!o) continue;
          map[cid] = await toFuriganaHtml(o.explanationJA || '');
        }
        updates.furiOtherExpHtml = map;
      }

      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        next[qIdx] = { ...next[qIdx], ...updates };
        return next;
      });
    })();
  };

  if (!subject) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code>. Ví dụ: <code>?subject=TK</code>
      </main>
    );
  }

  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (questions.length === 0) return <main style={{ padding: 24 }}>Chưa có câu hỏi cho môn {subject}.</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
        {course} / {subject} — 練習（科目別）
      </h1>

      {questions.map((q, idx) => {
        const titleJA = q.questionTextJA || '';
        const titleVI = q.questionTextVI || '';
        const showVIQ = !!q.showVIQuestion;
        const showJAQ = !!q.showJAQuestion;

        const alreadySubmitted = !!q.submitted;
        const isCorrect = q.isCorrect === true;
        const multi = q.multiCorrect === true;
        const correctSet = new Set(q.correctIds || []);

        return (
          <section key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            {/* Header: JA text + VI & JA buttons */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 600, flex: 1 }}>
                問 {idx + 1}: {titleJA || titleVI || '(No content)'}
                {multi && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: '#f0f7ff',
                      color: '#175cd3',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    複数正解あり
                  </span>
                )}
              </div>

              {/* Nút VI cho Question */}
              {titleVI && (
                <button
                  type="button"
                  onClick={() => toggleVIQuestion(idx)}
                  style={{
                    border: '1px solid #ddd',
                    background: showVIQ ? '#f7f9ff' : '#fff',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  aria-pressed={showVIQ}
                  title="Hiện/ẩn bản dịch tiếng Việt"
                >
                  VI
                </button>
              )}

              {/* Nút JA (furigana) cho Question */}
              {titleJA && (
                <button
                  type="button"
                  onClick={() => toggleJAQuestion(idx)}
                  style={{
                    border: '1px solid #ddd',
                    background: showJAQ ? '#f7f9ff' : '#fff',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  aria-pressed={showJAQ}
                  title="Hiển thị furigana (hiragana) cho câu hỏi"
                >
                  JA
                </button>
              )}
            </div>

            {/* Ảnh câu hỏi */}
            {q.questionImage && (
              <img
                src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${q.questionImage}`}
                alt=""
                style={{ maxWidth: '100%', marginBottom: 8 }}
              />
            )}

            {/* VI line */}
            {showVIQ && titleVI && <div style={{ marginBottom: 6, color: '#475467' }}>{titleVI}</div>}

            {/* JA furigana line */}
            {showJAQ && q.furiQuestionHtml && (
              <div
                style={{ marginBottom: 6, color: '#0f172a' }}
                dangerouslySetInnerHTML={{ __html: q.furiQuestionHtml }}
              />
            )}

            {/* Options */}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {q.shuffled.map((opt) => {
                const isChosen = q.selectedId === opt.id;
                const isCorrectOpt = alreadySubmitted && correctSet.has(opt.id!);
                const showVIOpt = !!q.showVIOption?.[opt.id!];
                const showJAOpt = !!q.showJAOption?.[opt.id!];

                const borderColor = alreadySubmitted
                  ? isCorrectOpt ? '#4caf50' : '#f0f0f0'
                  : isChosen ? '#175cd3' : '#f0f0f0';

                const textJA = opt.textJA || '';
                const textVI = opt.textVI || '';

                return (
                  <li
                    key={opt.id ?? opt.key}
                    style={{
                      border: `1px solid ${borderColor}`,
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      display: 'flex',
                      gap: 8,
                      background: isChosen && !alreadySubmitted ? '#f7f9ff' : '#fff',
                      alignItems: 'flex-start',
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.dataset?.action === 'toggle-vi-opt' || target.dataset?.action === 'toggle-ja-opt') return;
                      if (!alreadySubmitted) onSelect(idx, opt.id!);
                    }}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={isChosen}
                      onChange={() => onSelect(idx, opt.id!)}
                      disabled={alreadySubmitted}
                      style={{ marginTop: 4 }}
                    />

                    <div style={{ flex: 1 }}>
                      {/* JA line (default) */}
                      <div>{textJA || textVI || '(No content)'}</div>

                      {/* VI line */}
                      {showVIOpt && textVI && (
                        <div style={{ marginTop: 4, color: '#475467' }}>{textVI}</div>
                      )}

                      {/* JA furigana line */}
                      {showJAOpt && q.furiOptionHtml?.[opt.id!] && (
                        <div
                          style={{ marginTop: 4, color: '#0f172a' }}
                          dangerouslySetInnerHTML={{ __html: q.furiOptionHtml![opt.id!] }}
                        />
                      )}

                      {/* Ảnh option */}
                      {opt.image && (
                        <img
                          src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${opt.image}`}
                          alt=""
                          style={{ maxWidth: '100%', marginTop: 6 }}
                        />
                      )}
                    </div>

                    {/* Buttons VI & JA for Option */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {textVI && (
                        <button
                          type="button"
                          data-action="toggle-vi-opt"
                          onClick={() => toggleVIOption(idx, opt.id!)}
                          style={{
                            alignSelf: 'flex-end',
                            border: '1px solid #ddd',
                            background: showVIOpt ? '#f7f9ff' : '#fff',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 12,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          aria-pressed={showVIOpt}
                          title="Hiện/ẩn bản dịch tiếng Việt"
                        >
                          VI
                        </button>
                      )}

                      {textJA && (
                        <button
                          type="button"
                          data-action="toggle-ja-opt"
                          onClick={() => toggleJAOption(idx, opt.id!, textJA)}
                          style={{
                            alignSelf: 'flex-end',
                            border: '1px solid #ddd',
                            background: showJAOpt ? '#f7f9ff' : '#fff',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 12,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          aria-pressed={showJAOpt}
                          title="Hiển thị furigana (hiragana)"
                        >
                          JA
                        </button>
                      )}
                    </div>

                    {alreadySubmitted && isCorrectOpt && (
                      <span style={{ marginLeft: 8, color: '#4caf50', fontWeight: 700, alignSelf: 'center' }}>✓</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Submit */}
            {!alreadySubmitted && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onSubmitOne(idx)}
                  disabled={!q.selectedId}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #175cd3',
                    color: '#fff',
                    background: q.selectedId ? '#175cd3' : '#9db7e5',
                    cursor: q.selectedId ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                  }}
                >
                  答えを送信 / Trả lời
                </button>
              </div>
            )}

            {/* Result + Explanations */}
            {alreadySubmitted && (
              <div style={{ marginTop: 12, padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, flex: 1 }}>
                    {isCorrect ? '正解！(Chính xác)' : '不正解… (Chưa đúng)'}
                  </div>

                  {/* VI toggle for Explanations */}
                  <button
                    type="button"
                    onClick={() => toggleVIExplanation(idx)}
                    style={{
                      border: '1px solid #ddd',
                      background: q.showVIExplanation ? '#f7f9ff' : '#fff',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    aria-pressed={!!q.showVIExplanation}
                    title="Hiện/ẩn bản dịch tiếng Việt của lời giải"
                  >
                    VI
                  </button>

                  {/* JA (furigana) toggle for Explanations */}
                  <button
                    type="button"
                    onClick={() => toggleJAExplanation(idx)}
                    style={{
                      border: '1px solid #ddd',
                      background: q.showJAExplanation ? '#f7f9ff' : '#fff',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    aria-pressed={!!q.showJAExplanation}
                    title="Hiển thị furigana (hiragana) cho lời giải"
                  >
                    JA
                  </button>
                </div>

                <ExplanationBlock q={q} />
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

/** Explanations (JA-first) + VI + JA furigana (nếu bật) */
function ExplanationBlock({ q }: { q: ViewQuestion }) {
  const byId = useMemo(() => new Map(q.shuffled.map((o) => [o.id, o])), [q.shuffled]);
  const selected = q.selectedId ? byId.get(q.selectedId) : undefined;

  const selExpJA = selected?.explanationJA || '';
  const selExpVI = selected?.explanationVI || '';

  const otherCorrect = (q.correctIds || [])
    .filter((cid) => cid !== q.selectedId)
    .map((cid) => byId.get(cid))
    .filter(Boolean) as QAOption[];

  const generalJA = q.explanationGeneralJA || '';
  const generalVI = q.explanationGeneralVI || '';

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {(selExpJA || selExpVI) && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>解説（選択肢）</div>
          {/* JA base line */}
          {selExpJA && <div>{selExpJA}</div>}
          {/* VI line */}
          {q.showVIExplanation && selExpVI && <div style={{ color: '#475467', marginTop: 4 }}>{selExpVI}</div>}
          {/* JA furigana line */}
          {q.showJAExplanation && q.furiSelExpHtml && (
            <div
              style={{ marginTop: 4, color: '#0f172a' }}
              dangerouslySetInnerHTML={{ __html: q.furiSelExpHtml }}
            />
          )}
        </div>
      )}

      {q.multiCorrect && otherCorrect.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>他の正解の解説</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {otherCorrect.map((o, i) => {
              const ja = o.explanationJA || '';
              const vi = o.explanationVI || '';
              const cid = o.id!;
              if (!ja && !vi) return null;
              return (
                <li key={i}>
                  {/* JA base line */}
                  {ja && <div>{ja}</div>}
                  {/* VI line */}
                  {q.showVIExplanation && vi && <div style={{ color: '#475467', marginTop: 2 }}>{vi}</div>}
                  {/* JA furigana line */}
                  {q.showJAExplanation && q.furiOtherExpHtml?.[cid] && (
                    <div
                      style={{ marginTop: 2, color: '#0f172a' }}
                      dangerouslySetInnerHTML={{ __html: q.furiOtherExpHtml![cid] }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(generalJA || generalVI) && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>共通解説</div>
          {/* JA base line */}
          {generalJA && <div>{generalJA}</div>}
          {/* VI line */}
          {q.showVIExplanation && generalVI && <div style={{ color: '#475467', marginTop: 4 }}>{generalVI}</div>}
          {/* JA furigana line */}
          {q.showJAExplanation && q.furiGeneralHtml && (
            <div
              style={{ marginTop: 4, color: '#0f172a' }}
              dangerouslySetInnerHTML={{ __html: q.furiGeneralHtml }}
            />
          )}
        </div>
      )}

      {!selExpJA && !selExpVI && !generalJA && !generalVI && (
        <div style={{ color: '#666' }}>（この問題には解説が登録されていません）</div>
      )}
    </div>
  );
}
