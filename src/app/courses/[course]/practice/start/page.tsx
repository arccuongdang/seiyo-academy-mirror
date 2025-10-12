'use client';

/**
 * Practice Start (subject-mode)
 * ---------------------------------------------------------
 * Chức năng:
 * - Tải câu hỏi theo course/subject (không theo năm)
 * - Xáo đáp án, chọn 5 câu đầu (demo)
 * - Chọn đáp án (single-choice) và CHẤM NGAY câu đó
 * - JA-first UI, nút "VI" để xem dịch; "JA" để hiện furigana (hiragana)
 *
 * Lưu ý:
 * - Dùng useSearchParams() ⇒ bọc component bởi <Suspense />
 * - Không yêu cầu đăng nhập ở page này (đúng theo chính sách hiện tại)
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Data loaders
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '../../../../../lib/qa/excel';

// Formatters & utils
import { toQARenderItem, shuffleOptions } from '../../../../../lib/qa/formatters';
import { gradeSingleChoice } from '../../../../../lib/qa/grade';

// Furigana
import { toFuriganaHtml } from '../../../../../lib/jp/kuroshiro';

// Types
import type { QARenderItem, QAOption } from '../../../../../lib/qa/schema';

/** Kiểu render + state UI cho từng câu */
type ViewQuestion = {
  // từ QARenderItem
  id: string;
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  questionTextJA?: string | null;
  questionTextVI?: string | null;
  questionImage?: string | null;
  options: QAOption[];

  // Mảng xáo trộn để hiển thị
  shuffled: QAOption[];

  // Trạng thái làm bài cho từng câu
  selectedId?: number | null;         // key:number của đáp án đã chọn
  submitted?: boolean;                // đã chấm câu này chưa
  isCorrect?: boolean;                // kết quả
  correctKeys?: number[];             // danh sách key đúng (đã convert về number)
  multiCorrect?: boolean;             // true nếu có >1 đáp án đúng

  // Toggle dịch & furigana cho câu/đáp án/giải thích
  showVIQuestion?: boolean;
  showVIOption?: Record<number, boolean>;
  showVIExplanation?: boolean;

  showJAQuestion?: boolean;
  showJAOption?: Record<number, boolean>;
  showJAExplanation?: boolean;

  // Cache furigana HTML
  furiQuestionHtml?: string;
  furiOptionHtml?: Record<number, string>;

  // Furigana cho Lời giải
  furiSelExpHtml?: string;
  furiOtherExpHtml?: Record<number, string>;
  furiGeneralHtml?: string;

  // Lời giải chung (từ QARenderItem)
  explanationGeneralJA?: string | null;
  explanationGeneralVI?: string | null;
  explanationImage?: string | null;
};

// -----------------------
// Inner component (dùng Suspense)
// -----------------------
function PracticeStartInner({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || ''; // ví dụ ?subject=TK

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 1) Tải dữ liệu & map sang ViewQuestion
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
        const items: QARenderItem[] = snapshot.items.map(toQARenderItem);

        // chọn 5 câu đầu (demo)
        const selected: ViewQuestion[] = items.slice(0, 5).map((q) => {
          const shuffled = shuffleOptions(q.options);
          return {
            id: q.id,
            courseId: q.courseId,
            subjectId: q.subjectId,
            examYear: q.examYear ?? null,
            questionTextJA: q.questionTextJA ?? '',
            questionTextVI: q.questionTextVI ?? '',
            questionImage: q.questionImage ?? null,
            options: q.options,
            shuffled,

            selectedId: null,
            submitted: false,
            isCorrect: undefined,
            correctKeys: [],
            multiCorrect: false,

            showVIQuestion: false,
            showVIOption: {},
            showVIExplanation: false,

            showJAQuestion: false,
            showJAOption: {},
            showJAExplanation: false,

            furiOptionHtml: {},
            furiOtherExpHtml: {},

            explanationGeneralJA: (q as any).explanationGeneralJA ?? null,
            explanationGeneralVI: (q as any).explanationGeneralVI ?? null,
            explanationImage: (q as any).explanationImage ?? null,
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

  // 2) Chọn đáp án cho 1 câu (chưa chấm)
  const onSelect = (qIdx: number, optionKey: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx && !q.submitted ? { ...q, selectedId: optionKey } : q)),
    );
  };

  // 3) Nộp 1 câu ⇒ chấm ngay câu đó bằng gradeSingleChoice
  const onSubmitOne = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.submitted) return q;

        // gradeSingleChoice hiện nhận (selectedId: string|null, options: QAOption[])
        const result = gradeSingleChoice(q.selectedId != null ? String(q.selectedId) : null, q.shuffled);

        return {
          ...q,
          submitted: true,
          isCorrect: result.isCorrect,
          correctKeys: (result.correctIds || []).map((s: string) => Number(s)).filter((n) => !Number.isNaN(n)),
          multiCorrect: !!result.multiCorrect,
        };
      }),
    );
  };

  // 4) Toggle VI/JA cho CÂU HỎI
  const toggleVIQuestion = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)));
  };

  const toggleJAQuestion = (qIdx: number) => {
    // Phase 1: toggle ngay
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showJAQuestion: !q.showJAQuestion } : q)));

    // Phase 2: generate nếu lần đầu
    const current = questions[qIdx];
    const needGenerate = !current?.furiQuestionHtml && (current?.questionTextJA || '').trim().length > 0;
    if (!needGenerate) return;

    (async () => {
      const html = await toFuriganaHtml(current!.questionTextJA || '');
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        next[qIdx] = { ...next[qIdx], furiQuestionHtml: html };
        return next;
      });
    })();
  };

  // 5) Toggle VI/JA cho MỖI LỰA CHỌN
  const toggleVIOption = (qIdx: number, optionKey: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const map = { ...(q.showVIOption || {}) };
        map[optionKey] = !map[optionKey];
        return { ...q, showVIOption: map };
      }),
    );
  };

  const toggleJAOption = (qIdx: number, optionKey: number, textJA: string) => {
    // Phase 1: toggle
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const map = { ...(q.showJAOption || {}) };
        map[optionKey] = !map[optionKey];
        return { ...q, showJAOption: map };
      }),
    );

    // Phase 2: generate nếu chưa có
    const current = questions[qIdx];
    const already = current?.furiOptionHtml?.[optionKey];
    const needGenerate = !already && (textJA || '').trim().length > 0;
    if (!needGenerate) return;

    (async () => {
      const html = await toFuriganaHtml(textJA || '');
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        const map = { ...(next[qIdx].furiOptionHtml || {}) };
        map[optionKey] = html;
        next[qIdx] = { ...next[qIdx], furiOptionHtml: map };
        return next;
      });
    })();
  };

  // 6) Toggle VI/JA cho LỜI GIẢI (chỉ khi đã submit câu)
  const toggleVIExplanation = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showVIExplanation: !q.showVIExplanation } : q)));
  };

  const toggleJAExplanation = (qIdx: number) => {
    // Phase 1: toggle
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showJAExplanation: !q.showJAExplanation } : q)));

    // Phase 2: generate cache nếu cần
    const current = questions[qIdx];
    if (!current) return;

    const byKey = new Map(current.shuffled.map((o) => [o.key, o]));
    const selected = current.selectedId != null ? byKey.get(current.selectedId) : undefined;

    const needSel = !current.furiSelExpHtml && !!(selected?.explanationJA || '').trim();
    const needGen = !current.furiGeneralHtml && !!(current.explanationGeneralJA || '').trim();

    // các đáp án đúng khác (nếu multi-correct)
    const otherCorrectKeys = (current.correctKeys || []).filter((k) => k !== current.selectedId);
    const needOthers: number[] = [];
    for (const k of otherCorrectKeys) {
      const o = byKey.get(k);
      const hasJA = !!(o?.explanationJA || '').trim();
      const cached = current.furiOtherExpHtml?.[k];
      if (hasJA && !cached) needOthers.push(k);
    }

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
        for (const k of needOthers) {
          const o = byKey.get(k);
          if (!o) continue;
          map[k] = await toFuriganaHtml(o.explanationJA || '');
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

  // -----------------------
  // Render
  // -----------------------
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
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
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
        const correctSet = new Set(q.correctKeys || []);

        return (
          <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            {/* Header JA + VI/JA buttons */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600 }}>
                問 {idx + 1}: {titleJA || titleVI || '(No content)'}
              </div>
              {multi && <span style={{ color: '#b45309', fontSize: 12, border: '1px solid #fde68a', background: '#fef3c7', padding: '0 6px', borderRadius: 6 }}>複数正解あり</span>}
              {titleVI && (
                <button
                  onClick={() => toggleVIQuestion(idx)}
                  style={{ border: '1px solid #ddd', background: showVIQ ? '#f7f9ff' : '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}
                  aria-pressed={showVIQ}
                  title="Hiện/ẩn bản dịch tiếng Việt"
                >
                  VI
                </button>
              )}
              {titleJA && (
                <button
                  onClick={() => toggleJAQuestion(idx)}
                  style={{ border: '1px solid #ddd', background: showJAQ ? '#f7f9ff' : '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}
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
                style={{ maxWidth: '100%', marginTop: 8 }}
              />
            )}

            {/* VI line */}
            {showVIQ && titleVI && <div style={{ marginTop: 6, color: '#475467' }}>{titleVI}</div>}

            {/* JA furigana line */}
            {showJAQ && q.furiQuestionHtml && (
              <div
                style={{ marginTop: 6, color: '#344054' }}
                dangerouslySetInnerHTML={{ __html: q.furiQuestionHtml }}
              />
            )}

            {/* Options */}
            <ul style={{ listStyle: 'none', padding: 0, margin: 12 }}>
              {q.shuffled.map((opt) => {
                const isChosen = q.selectedId === opt.key;
                const isCorrectOpt = alreadySubmitted && correctSet.has(opt.key);
                const showVIOpt = !!q.showVIOption?.[opt.key];
                const showJAOpt = !!q.showJAOption?.[opt.key];

                const textJA = opt.textJA || '';
                const textVI = opt.textVI || '';

                return (
                  <li
                    key={opt.key}
                    style={{
                      border: '1px solid #f0f0f0',
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 8,
                      background: isCorrectOpt ? '#ecfdf5' : isChosen && !alreadySubmitted ? '#eef2ff' : '#fff',
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.dataset?.action === 'toggle-vi-opt' || target.dataset?.action === 'toggle-ja-opt') return;
                      if (!alreadySubmitted) onSelect(idx, opt.key);
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <input
                        type="radio"
                        checked={isChosen}
                        onChange={() => onSelect(idx, opt.key)}
                        disabled={alreadySubmitted}
                        style={{ marginTop: 2 }}
                      />
                      <strong>{opt.key}.</strong>
                      <span>{textJA || textVI || '(No content)'}</span>
                    </div>

                    {/* VI line */}
                    {showVIOpt && textVI && <div style={{ color: '#475467', marginTop: 4 }}>{textVI}</div>}

                    {/* JA furigana line */}
                    {showJAOpt && q.furiOptionHtml?.[opt.key] && (
                      <div
                        style={{ color: '#344054', marginTop: 4 }}
                        dangerouslySetInnerHTML={{ __html: q.furiOptionHtml[opt.key]! }}
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

                    {/* Buttons VI & JA for Option */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {textVI && (
                        <button
                          data-action="toggle-vi-opt"
                          onClick={() => toggleVIOption(idx, opt.key)}
                          style={{
                            border: '1px solid #ddd',
                            background: showVIOpt ? '#f7f9ff' : '#fff',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 12,
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
                          data-action="toggle-ja-opt"
                          onClick={() => toggleJAOption(idx, opt.key, textJA)}
                          style={{
                            border: '1px solid #ddd',
                            background: showJAOpt ? '#f7f9ff' : '#fff',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                          }}
                          aria-pressed={showJAOpt}
                          title="Hiển thị furigana (hiragana)"
                        >
                          JA
                        </button>
                      )}
                      {alreadySubmitted && isCorrectOpt && (
                        <span style={{ color: '#166534', fontWeight: 600, marginLeft: 'auto' }}>✓</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Submit 1 câu */}
            {!alreadySubmitted && (
              <button
                onClick={() => onSubmitOne(idx)}
                disabled={q.selectedId == null}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #175cd3',
                  color: '#fff',
                  background: q.selectedId != null ? '#175cd3' : '#9db7e5',
                  cursor: q.selectedId != null ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                }}
              >
                答えを送信 / Trả lời
              </button>
            )}

            {/* Kết quả + Lời giải (sau khi submit) */}
            {alreadySubmitted && (
              <div style={{ marginTop: 8 }}>
                <div style={{ marginBottom: 6, fontWeight: 600 }}>
                  {isCorrect ? '正解！(Chính xác)' : '不正解… (Chưa đúng)'}
                </div>

                {/* Toggle VI/JA cho giải thích */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <button
                    onClick={() => toggleVIExplanation(idx)}
                    style={{ border: '1px solid #ddd', background: q.showVIExplanation ? '#f7f9ff' : '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}
                    aria-pressed={!!q.showVIExplanation}
                    title="Hiện/ẩn bản dịch tiếng Việt của lời giải"
                  >
                    VI
                  </button>
                  <button
                    onClick={() => toggleJAExplanation(idx)}
                    style={{ border: '1px solid #ddd', background: q.showJAExplanation ? '#f7f9ff' : '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}
                    aria-pressed={!!q.showJAExplanation}
                    title="Hiển thị furigana (hiragana) cho lời giải"
                  >
                    JA
                  </button>
                </div>

                {/* Khối giải thích */}
                <ExplanationBlock q={q} />
              </div>
            )}
          </div>
        );
      })}
    </main>
  );
}

/** Khối LỜI GIẢI cho 1 câu — JA-first, có VI & JA furigana khi bật */
function ExplanationBlock({ q }: { q: ViewQuestion }) {
  const byKey = useMemo(() => new Map(q.shuffled.map((o) => [o.key, o])), [q.shuffled]);
  const selected = q.selectedId != null ? byKey.get(q.selectedId) : undefined;

  const selExpJA = selected?.explanationJA || '';
  const selExpVI = selected?.explanationVI || '';

  const otherCorrect = (q.correctKeys || [])
    .filter((k) => k !== q.selectedId)
    .map((k) => byKey.get(k))
    .filter(Boolean) as QAOption[];

  const generalJA = q.explanationGeneralJA || '';
  const generalVI = q.explanationGeneralVI || '';

  return (
    <div>
      {(selExpJA || selExpVI) && (
        <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>解説（選択肢）</div>

          {/* JA base */}
          {selExpJA && <div style={{ whiteSpace: 'pre-wrap' }}>{selExpJA}</div>}
          {/* VI */}
          {q.showVIExplanation && selExpVI && (
            <div style={{ color: '#475467', marginTop: 4, whiteSpace: 'pre-wrap' }}>{selExpVI}</div>
          )}
          {/* JA furigana */}
          {q.showJAExplanation && q.furiSelExpHtml && (
            <div
              style={{ color: '#344054', marginTop: 4 }}
              dangerouslySetInnerHTML={{ __html: q.furiSelExpHtml }}
            />
          )}
        </div>
      )}

      {q.multiCorrect && otherCorrect.length > 0 && (
        <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>他の正解の解説</div>
          {otherCorrect.map((o) => {
            const ja = o.explanationJA || '';
            const vi = o.explanationVI || '';
            if (!ja && !vi) return null;

            return (
              <div key={o.key} style={{ marginBottom: 8 }}>
                {/* JA base */}
                {ja && <div style={{ whiteSpace: 'pre-wrap' }}>{ja}</div>}
                {/* VI */}
                {q.showVIExplanation && vi && (
                  <div style={{ color: '#475467', marginTop: 4, whiteSpace: 'pre-wrap' }}>{vi}</div>
                )}
                {/* JA furigana */}
                {q.showJAExplanation && q.furiOtherExpHtml?.[o.key] && (
                  <div
                    style={{ color: '#344054', marginTop: 4 }}
                    dangerouslySetInnerHTML={{ __html: q.furiOtherExpHtml[o.key]! }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {(generalJA || generalVI) && (
        <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>解説（総合）</div>

          {/* JA base */}
          {generalJA && <div style={{ whiteSpace: 'pre-wrap' }}>{generalJA}</div>}
          {/* VI */}
          {q.showVIExplanation && generalVI && (
            <div style={{ color: '#475467', marginTop: 4, whiteSpace: 'pre-wrap' }}>{generalVI}</div>
          )}
          {/* JA furigana */}
          {q.showJAExplanation && q.furiGeneralHtml && (
            <div
              style={{ color: '#344054', marginTop: 4 }}
              dangerouslySetInnerHTML={{ __html: q.furiGeneralHtml }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------
// Wrapper với Suspense (vì dùng useSearchParams)
// -----------------------
export default function PracticeStart(props: { params: { course: string } }) {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <PracticeStartInner {...props} />
    </Suspense>
  );
}
