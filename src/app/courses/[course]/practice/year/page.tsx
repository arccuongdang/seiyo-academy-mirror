'use client';

/**
 * =============================================================================
 *  Year Practice – Khóa {course}, môn (?subject=SUBJECT), năm cố định (?year=YYYY)
 *  Strategy (Plan B):
 *    RAW (QuestionSnapshotItem[]) → format JA/VI (QARenderItem) → shuffle cùng hoán vị
 * -----------------------------------------------------------------------------
 *  Tính năng:
 *    - Lọc đúng 1 năm theo query (?year=YYYY) và đúng 1 môn (?subject=...)
 *    - Chấm điểm single-choice sau khi "Nộp toàn bài"
 *    - Toggle JA/VI cho câu hỏi & từng đáp án, có furigana JA on-demand
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Loaders & formatters (Plan B)
import { loadRawQuestionsFor } from '../../../../../lib/qa/excel';
import { toQARenderItemFromSnapshot } from '../../../../../lib/qa/formatters';
import { toFuriganaHtml } from '../../../../../lib/jp/kuroshiro';

// Types
import type {
  QuestionSnapshotItem,
  QARenderItem,
  QARenderOption,
} from '../../../../../lib/qa/schema';

/* =============================================================================
 * SECTION A. Helpers: shuffle & grading & misc
 * ========================================================================== */

/** Sinh hoán vị 0..n-1 (Fisher–Yates) */
function shuffledIndices(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** Chấm single-choice theo chỉ số đã chọn (sau shuffle) */
function gradeSingleChoiceByIndex(selectedIndex: number | null, options: QARenderOption[]) {
  const correct = options
    .map((o, i) => (o.isAnswer ? i : -1))
    .filter((i) => i >= 0);
  const multiCorrect = correct.length > 1;
  const isCorrect = selectedIndex != null ? correct.includes(selectedIndex) : false;
  return { isCorrect, correctIndexes: correct, multiCorrect };
}

/* =============================================================================
 * SECTION B. View types
 *  - Giữ JA/VI đã format + hoán vị chung cho options
 * ========================================================================== */

type ViewQuestion = {
  id: string;
  examYear: number;
  courseId: string;
  subjectId: string;

  ja: QARenderItem;
  vi: QARenderItem;

  order: number[];              // permutation áp dụng cho JA & VI
  selectedIndex: number | null; // index trong mảng đã hoán vị
  submitted: boolean;

  // Kết quả sau khi nộp
  isCorrect?: boolean;
  correctShuffledIndexes?: number[];
  multiCorrect?: boolean;

  // Toggles
  showVIQuestion: boolean;
  showVIOption: Record<number, boolean>;
  showJAQuestion: boolean;
  showJAOption: Record<number, boolean>;

  // Furigana cache (JA)
  furiQuestionHtml?: string;
  furiOptionHtml?: Record<number, string>;
};

type FilterTab = 'all' | 'wrong' | 'blank';

/* =============================================================================
 * SECTION C. Component
 * ========================================================================== */

export default function YearPracticePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || '';
  const yearStr = search.get('year') || '';
  const fixedYear = Number(yearStr);

  // Data state
  const [rawItems, setRawItems] = useState<QuestionSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Working set
  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);

  // Options
  const [randomizeOptions, setRandomizeOptions] = useState<boolean>(true);

  // Exam state
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState<{ total: number; correct: number; blank: number }>({
    total: 0, correct: 0, blank: 0,
  });
  const [tab, setTab] = useState<FilterTab>('all');

  // ====== Load RAW theo subject ======
  useEffect(() => {
    if (!subject || !fixedYear) return;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const raws = await loadRawQuestionsFor(course, subject); // tự chọn file mới nhất
        setRawItems(raws);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [course, subject, fixedYear]);

  // ====== Lọc theo năm cố định + Build view ======
  useEffect(() => {
    if (!rawItems.length || !fixedYear) return;

    // 1) Lọc đúng năm
    const rows = rawItems.filter((q) => Number(q.examYear) === fixedYear);

    if (rows.length === 0) {
      setErr(`Chưa có câu hỏi cho ${subject} năm ${fixedYear}.`);
      setQuestions([]);
      return;
    }

    // 2) Format JA/VI + hoán vị options
    const view: ViewQuestion[] = rows.map((raw) => {
      const ja = toQARenderItemFromSnapshot(raw, 'JA');
      const vi = toQARenderItemFromSnapshot(raw, 'VI');
      const order = randomizeOptions
        ? shuffledIndices(ja.options.length)
        : Array.from({ length: ja.options.length }, (_, i) => i);

      return {
        id: ja.id,
        examYear: ja.examYear,
        courseId: ja.courseId,
        subjectId: ja.subjectId,

        ja,
        vi,

        order,
        selectedIndex: null,
        submitted: false,

        showVIQuestion: false,
        showVIOption: {},
        showJAQuestion: false,
        showJAOption: {},

        furiOptionHtml: {},
      };
    });

    setQuestions(view);
    setIndex(0);
    setFinished(false);
    setTab('all');
  }, [rawItems, fixedYear, randomizeOptions, subject]);

  // ====== Handlers ======
  const goto = (i: number) => {
    setIndex((prev) => Math.min(Math.max(i, 0), questions.length - 1));
  };

  const onSelect = (qIdx: number, shuffledIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, selectedIndex: shuffledIndex } : q)),
    );
  };

  const submitAll = () => {
    // Chấm toàn bài
    const graded = questions.map((q) => {
      const optsInOrder = q.order.map((k) => q.ja.options[k]);
      const res = gradeSingleChoiceByIndex(q.selectedIndex, optsInOrder);
      return {
        ...q,
        submitted: true,
        isCorrect: res.isCorrect,
        correctShuffledIndexes: res.correctIndexes,
        multiCorrect: res.multiCorrect,
      };
    });

    const total = graded.length;
    const correct = graded.filter((x) => x.isCorrect).length;
    const blank = graded.filter((x) => x.selectedIndex == null).length;

    setQuestions(graded);
    setScore({ total, correct, blank });
    setFinished(true);
    setTab('all');
  };

  // Toggle VI/JA Question
  const toggleVIQuestion = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)));
  };
  const toggleJAQuestion = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showJAQuestion: !q.showJAQuestion } : q)));

    // Furigana on-demand
    const cur = questions[qIdx];
    const need = !cur?.furiQuestionHtml && (cur?.ja.text || '').trim().length > 0;
    if (!need) return;

    (async () => {
      const html = await toFuriganaHtml(cur!.ja.text || '');
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        next[qIdx] = { ...next[qIdx], furiQuestionHtml: html };
        return next;
      });
    })();
  };

  // Toggle VI/JA option theo chỉ số sau shuffle
  const toggleVIOption = (qIdx: number, shuffledIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const m = { ...(q.showVIOption || {}) };
        m[shuffledIndex] = !m[shuffledIndex];
        return { ...q, showVIOption: m };
      }),
    );
  };
  const toggleJAOption = (qIdx: number, shuffledIndex: number, textJA: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const m = { ...(q.showJAOption || {}) };
        m[shuffledIndex] = !m[shuffledIndex];
        return { ...q, showJAOption: m };
      }),
    );

    const cur = questions[qIdx];
    const has = cur?.furiOptionHtml?.[shuffledIndex];
    const need = !has && (textJA || '').trim().length > 0;
    if (!need) return;

    (async () => {
      const html = await toFuriganaHtml(textJA);
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        const map = { ...(next[qIdx].furiOptionHtml || {}) };
        map[shuffledIndex] = html;
        next[qIdx] = { ...next[qIdx], furiOptionHtml: map };
        return next;
      });
    })();
  };

  // ====== Guards ======
  if (!subject || !fixedYear) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code> và/hoặc <code>?year=...</code> (VD: <code>?subject=TK&amp;year=2024</code>)
      </main>
    );
  }
  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;

  // ======================================================================
  // (1) Màn hình làm bài (chưa nộp)
  // ======================================================================
  if (!finished) {
    if (questions.length === 0) return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;

    const q = questions[index];
    const jaOpts = q.order.map((k) => q.ja.options[k]);
    const viOpts = q.order.map((k) => q.vi.options[k]);
    const selected = q.selectedIndex;

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          {course} / {subject} — {fixedYear} 年度 過去問
        </h1>

        {/* Điều hướng câu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => goto(index - 1)}
            disabled={index === 0}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
          >
            前へ / Trước
          </button>
          <div>
            {index + 1} / {questions.length}
          </div>
          <button
            onClick={() => goto(index + 1)}
            disabled={index === questions.length - 1}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
          >
            次へ / Tiếp
          </button>
        </div>

        {/* Card câu hỏi */}
        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          {/* Header + toggles */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>
              問 {index + 1}: {q.ja.text || q.vi.text || '(No content)'}
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
            {(q.ja.text || '').trim() && (
              <button
                onClick={() => toggleJAQuestion(index)}
                aria-pressed={!!q.showJAQuestion}
                style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              >
                JA
              </button>
            )}
          </div>

          {/* Ảnh câu hỏi (nếu có) */}
          {q.ja.image && (
            <img
              src={q.ja.image}
              alt=""
              style={{ maxWidth: '100%', marginBottom: 8 }}
            />
          )}

          {/* Furigana + VI cho câu */}
          {q.showJAQuestion && q.furiQuestionHtml && (
            <div
              style={{ background: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 8 }}
              dangerouslySetInnerHTML={{ __html: q.furiQuestionHtml }}
            />
          )}
          {q.showVIQuestion && (q.vi.text || '').trim() && (
            <div style={{ background: '#fffbeb', padding: 8, borderRadius: 8, marginBottom: 8 }}>
              {q.vi.text}
            </div>
          )}

          {/* Danh sách đáp án */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {jaOpts.map((opt, i) => {
              const selectedThis = selected === i;

              const hasVI = !!(viOpts[i]?.text && viOpts[i].text!.trim().length > 0);
              const hasJA = !!(opt?.text && opt.text!.trim().length > 0);
              const showVI = !!q.showVIOption?.[i];
              const showJA = !!q.showJAOption?.[i];
              const furiHtml = q.furiOptionHtml?.[i];

              return (
                <li
                  key={i}
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8,
                    background: '#fff',
                  }}
                >
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={selectedThis}
                      onChange={() => onSelect(index, i)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div>{opt.text || viOpts[i]?.text || '(Không có nội dung)'}</div>

                      {/* Furigana JA cho option */}
                      {showJA && furiHtml && (
                        <div
                          style={{ background: '#f8fafc', padding: 6, borderRadius: 6, marginTop: 6 }}
                          dangerouslySetInnerHTML={{ __html: furiHtml }}
                        />
                      )}

                      {/* Bản dịch VI cho option */}
                      {showVI && hasVI && (
                        <div style={{ background: '#fffbeb', padding: 6, borderRadius: 6, marginTop: 6 }}>
                          {viOpts[i]?.text}
                        </div>
                      )}

                      {/* Nút JA/VI nhỏ cho option */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        {hasVI && (
                          <button
                            onClick={() => toggleVIOption(index, i)}
                            aria-pressed={!!q.showVIOption?.[i]}
                            style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          >
                            VI
                          </button>
                        )}
                        {hasJA && (
                          <button
                            onClick={() => {
                              toggleJAOption(index, i, opt.text || '');
                            }}
                            aria-pressed={!!q.showJAOption?.[i]}
                            style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          >
                            JA
                          </button>
                        )}
                      </div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          {/* Nút nộp toàn bài */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={submitAll}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #175cd3',
                background: '#175cd3',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              全問を提出 / Nộp toàn bài
            </button>
            <a href={`/courses/${course}/practice/year?subject=${subject}&year=${fixedYear}`}>
              <button
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#334155',
                  fontWeight: 700,
                }}
              >
                やり直す / Làm lại
              </button>
            </a>
            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={randomizeOptions}
                onChange={(e) => setRandomizeOptions(e.target.checked)}
              />
              Trộn đáp án
            </label>
          </div>
        </div>
      </main>
    );
  }

  // ======================================================================
  // (2) Màn hình Kết quả + Review
  // ======================================================================
  const wrongIds = new Set(questions.filter((q) => q.isCorrect === false).map((q) => q.id));
  const blankIds = new Set(questions.filter((q) => q.selectedIndex == null).map((q) => q.id));
  const list = questions.filter((q) => {
    if (tab === 'wrong') return wrongIds.has(q.id);
    if (tab === 'blank') return blankIds.has(q.id);
    return true;
  });

  const percent = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {subject} — {fixedYear} 年度 結果 / Kết quả
      </h1>

      {/* Score box */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ color: '#475467' }}>正答数 / Số câu đúng</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {score.correct} / {score.total}（{percent}%）
            </div>
          </div>
          <div>
            <div style={{ color: '#475467' }}>未回答 / Chưa làm</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{score.blank}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('all')} style={tabBtnStyle(tab === 'all')}>全問 / Tất cả</button>
        <button onClick={() => setTab('wrong')} style={tabBtnStyle(tab === 'wrong')}>不正解 / Sai</button>
        <button onClick={() => setTab('blank')} style={tabBtnStyle(tab === 'blank')}>未回答 / Chưa làm</button>
      </div>

      {/* Review list: bạn có thể bổ sung hiển thị giải thích ở đây */}
      <div style={{ display: 'grid', gap: 12 }}>
        {list.map((q, idx) => {
          const jaOpts = q.order.map((k) => q.ja.options[k]);
          const viOpts = q.order.map((k) => q.vi.options[k]);
          const correct = new Set(q.correctShuffledIndexes || []);

          return (
            <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  Câu {idx + 1}: {q.ja.text || q.vi.text || '(No content)'}
                </div>
              </div>

              {/* Options + đánh dấu đúng/sai */}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {jaOpts.map((opt, i) => {
                  const isCorrect = correct.has(i);
                  const picked = q.selectedIndex === i;

                  return (
                    <li
                      key={i}
                      style={{
                        border: '1px solid #f0f0f0',
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 8,
                        background: isCorrect ? '#ecfdf3' : picked ? '#fef2f2' : '#fff',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{isCorrect ? '✅ 正解' : picked ? '❌ 不正解' : '・'}</div>
                      <div>{opt.text || viOpts[i]?.text || '(No content)'}</div>

                      {/* Giải thích (nếu bạn đã điền) */}
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

/** Nút tab style helper */
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
