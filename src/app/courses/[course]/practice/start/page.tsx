'use client';

/**
 * =============================================================================
 *  Practice Start – Khóa {course}, theo môn (?subject=SUBJECT)
 *  Data flow (Option B):
 *   RAW (QuestionSnapshotItem[]) → format JA/VI (QARenderItem) → shuffle (cùng hoán vị)
 * -----------------------------------------------------------------------------
 *  Tính năng:
 *   - Chọn số câu, phạm vi năm gần đây, trộn đáp án, lọc theo tag/độ khó (nhẹ)
 *   - Hiển thị JA là chính; có nút bật/ẩn VI, đồng thời có furigana cho JA
 *   - Chấm điểm single-choice theo chỉ số phương án đã shuffle
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Loaders & formatters (Option B)
import { loadRawQuestionsFor } from '../../../../../lib/qa/excel';
import {
  toQARenderItemFromSnapshot,
} from '../../../../../lib/qa/formatters';
import { toFuriganaHtml } from '../../../../../lib/jp/kuroshiro';

// Types
import type {
  QuestionSnapshotItem,
  QARenderItem,
  QARenderOption,
} from '../../../../../lib/qa/schema';

/* =============================================================================
 * SECTION A. Utilities (shuffle + grading + small helpers)
 * ========================================================================== */

/** Sinh hoán vị ngẫu nhiên 0..n-1 */
function shuffledIndices(n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** Lấy ngẫu nhiên tối đa N phần tử từ mảng (không lặp) */
function sampleN<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr];
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Chấm single-choice theo chỉ số đã chọn (sau shuffle) */
function gradeSingleChoiceByIndex(selectedIndex: number | null, options: QARenderOption[]) {
  const correctIndexes = options
    .map((o, i) => (o.isAnswer ? i : -1))
    .filter((i) => i >= 0);
  const multiCorrect = correctIndexes.length > 1;
  const isCorrect = selectedIndex != null ? correctIndexes.includes(selectedIndex) : false;
  return { isCorrect, correctIndexes, multiCorrect };
}

/** Normalize tags (string | string[]) → string[] */
function tagsToArray(tags: string | string[] | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  return String(tags)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* =============================================================================
 * SECTION B. View model types
 *  - Ta giữ cùng lúc cả JA và VI đã format để phục vụ toggle JA/VI
 *  - Shuffle dựa trên hoán vị index áp dụng đồng thời cho JA & VI
 * ========================================================================== */

type ViewQuestion = {
  id: string;
  examYear: number;
  courseId: string;
  subjectId: string;

  // Rendered content for JA/VI
  ja: QARenderItem;
  vi: QARenderItem;

  // Shuffled order for options
  order: number[]; // permutation over options indexes

  // Interaction state
  selectedIndex: number | null; // index in the shuffled order
  submitted: boolean;
  isCorrect?: boolean;
  correctShuffledIndexes?: number[];
  multiCorrect?: boolean;

  // Toggles
  showVIQuestion: boolean;
  showVIOption: Record<number, boolean>;
  showJAQuestion: boolean;
  showJAOption: Record<number, boolean>;

  // Furigana cache (JA only)
  furiQuestionHtml?: string;
  furiOptionHtml?: Record<number, string>;
};

/* =============================================================================
 * SECTION C. Component
 * ========================================================================== */

type YearWindow = 5 | 10 | 15;
type DifficultyValue = string;

export default function PracticeStart({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || '';
  const yearParam = search.get('year');

  // ---- Data state -----------------------------------------------------------
  const [rawItems, setRawItems] = useState<QuestionSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- Setup form state -----------------------------------------------------
  const [started, setStarted] = useState(false);
  const [numQuestions, setNumQuestions] = useState<5 | 10 | 15 | 20 | 25>(5);
  const [yearWindow, setYearWindow] = useState<YearWindow>(5);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [tagSelections, setTagSelections] = useState<Set<string>>(new Set());
  const [difficultySel, setDifficultySel] = useState<DifficultyValue | 'RANDOM'>('RANDOM');

  // ---- Working set ----------------------------------------------------------
  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);

  // ====== Load RAW theo subject ======
  useEffect(() => {
    if (!subject) return;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const raws = await loadRawQuestionsFor(course, subject); // tự pick latest
        setRawItems(raws);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [course, subject]);

  // ====== Derive meta từ RAW ======
  const maxYear = useMemo(() => {
    const ys = rawItems.map((q) => Number(q.examYear) || 0).filter(Boolean);
    return ys.length ? Math.max(...ys) : null;
  }, [rawItems]);

  const tagList = useMemo(() => {
    const set = new Set<string>();
    for (const q of rawItems) {
      for (const t of tagsToArray(q.tags as any)) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawItems]);

  const difficultyList = useMemo(() => {
    const set = new Set<string>();
    for (const q of rawItems) {
      if (q.difficulty != null && String(q.difficulty).trim() !== '') {
        set.add(String(q.difficulty));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rawItems]);

  // ====== Apply setup & build view ======
  const applySetup = () => {
    if (!rawItems.length) return;

    let pool = [...rawItems];

    // 1) Năm (nếu có ?year=YYYY trong URL → ưu tiên)
    if (yearParam) {
      const y = parseInt(yearParam, 10);
      if (!Number.isNaN(y)) pool = pool.filter((q) => Number(q.examYear) === y);
    } else if (maxYear && yearWindow) {
      // Nếu không có year param → dùng cửa sổ năm gần đây
      const minYear = maxYear - (yearWindow - 1);
      pool = pool.filter((q) => Number(q.examYear) >= minYear);
    }

    // 2) Tag filter
    if (tagSelections.size > 0) {
      pool = pool.filter((q) => {
        const tags = new Set(tagsToArray(q.tags as any));
        for (const t of tagSelections) {
          if (tags.has(t)) return true;
        }
        return false;
      });
    }

    // 3) Độ khó
    if (difficultySel !== 'RANDOM') {
      pool = pool.filter((q) => String(q.difficulty) === String(difficultySel));
    }

    // 4) Chọn N câu
    const chosenRaw = sampleN(pool, numQuestions);

    // 5) Format JA/VI & build ViewQuestion
    const view: ViewQuestion[] = chosenRaw.map((raw) => {
      const ja = toQARenderItemFromSnapshot(raw, 'JA');
      const vi = toQARenderItemFromSnapshot(raw, 'VI');

      // Hoán vị (áp dụng đồng thời cho JA/VI)
      const order = randomizeOptions ? shuffledIndices(ja.options.length) : Array.from({ length: ja.options.length }, (_, i) => i);

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
    setStarted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ====== Handlers ======
  const goto = (i: number) => {
    setIndex((prev) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      return next;
    });
  };

  const onSelect = (qIdx: number, shuffledIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, selectedIndex: shuffledIndex } : q)),
    );
  };

  const submitOne = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.submitted) return q;

        // Chấm theo JA (JA/VI đồng bộ đúng/sai)
        const optsInOrder = q.order.map((k) => q.ja.options[k]);
        const res = gradeSingleChoiceByIndex(q.selectedIndex, optsInOrder);

        return {
          ...q,
          submitted: true,
          isCorrect: res.isCorrect,
          correctShuffledIndexes: res.correctIndexes,
          multiCorrect: res.multiCorrect,
        };
      }),
    );
  };

  // Toggle VI/JA Question
  const toggleVIQuestion = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)),
    );
  };
  const toggleJAQuestion = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showJAQuestion: !q.showJAQuestion } : q)),
    );

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

  // Toggle VI/JA Option (theo chỉ số sau shuffle)
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
  if (!subject) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code>. Ví dụ: <code>?subject=TK</code>
      </main>
    );
  }
  if (loading) return <main style={{ padding: 24 }}>Đang tải dữ liệu…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!rawItems.length) return <main style={{ padding: 24 }}>Chưa có câu hỏi cho môn {subject}.</main>;

  // =======================
  // 1) MÀN HÌNH THIẾT LẬP
  // =======================
  if (!started) {
    const latestYearText = maxYear ? `(tối đa: ${maxYear})` : '';
    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          {course} / {subject} — Thiết lập bộ câu hỏi
        </h1>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, display: 'grid', gap: 16 }}>
          {/* 1) Số câu */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>1) Số câu</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[5, 10, 15, 20, 25].map((n) => (
                <label key={n} style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px' }}>
                  <input type="radio" name="numQ" checked={numQuestions === n} onChange={() => setNumQuestions(n as any)} />
                  {n}
                </label>
              ))}
            </div>
          </div>

          {/* 2) Phạm vi năm gần đây (bỏ qua nếu có ?year=YYYY) */}
          {!yearParam && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                2) Phạm vi năm gần đây {latestYearText}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[5, 10, 15].map((y) => (
                  <label key={y} style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px' }}>
                    <input type="radio" name="yw" checked={yearWindow === y} onChange={() => setYearWindow(y as YearWindow)} />
                    {y} năm
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 3) Trộn đáp án */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>3) Trộn thứ tự đáp án</div>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={randomizeOptions}
                onChange={(e) => setRandomizeOptions(e.target.checked)}
              />
              Bật trộn đáp án (mặc định tắt)
            </label>
          </div>

          {/* 4) Tag filter */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>4) Chọn theo tag (tuỳ chọn)</div>
            {tagList.length === 0 ? (
              <div style={{ color: '#667085' }}>Không có tag trong dữ liệu</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tagList.map((t) => {
                  const checked = tagSelections.has(t);
                  return (
                    <label key={t} style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setTagSelections((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(t);
                            else next.delete(t);
                            return next;
                          });
                        }}
                      />
                      {t}
                    </label>
                  );
                })}
              </div>
            )}
            {tagSelections.size > 0 && (
              <button
                onClick={() => setTagSelections(new Set())}
                style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
              >
                Bỏ chọn tất cả tag
              </button>
            )}
          </div>

          {/* 5) Độ khó */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>5) Chọn độ khó (tuỳ chọn)</div>
            {difficultyList.length === 0 ? (
              <div style={{ color: '#667085' }}>Không có trường độ khó trong dữ liệu</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px' }}>
                  <input type="radio" name="diff" checked={difficultySel === 'RANDOM'} onChange={() => setDifficultySel('RANDOM')} />
                  Ngẫu nhiên
                </label>
                {difficultyList.map((d) => (
                  <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px' }}>
                    <input type="radio" name="diff" checked={difficultySel === d} onChange={() => setDifficultySel(d)} />
                    {d}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Start */}
          <div>
            <button
              onClick={applySetup}
              style={{
                padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3',
                background: '#175cd3', color: '#fff', fontWeight: 700
              }}
            >
              Bắt đầu
            </button>
          </div>
        </div>
      </main>
    );
  }

  // =======================
  // 2) MÀN HÌNH LÀM BÀI
  // =======================
  const q = questions[index];
  const jaOpts = q.order.map((k) => q.ja.options[k]);
  const viOpts = q.order.map((k) => q.vi.options[k]); // đảm bảo cùng thứ tự với JA
  const selected = q.selectedIndex;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {subject} — Luyện theo môn
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
        {/* Header + badge */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>
            問 {index + 1}: {q.ja.text || q.vi.text || '(No content)'}
          </div>

        {/* Toggle JA/VI cho câu */}
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

        {/* Furigana JA + bản dịch VI cho câu */}
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

        {/* Danh sách đáp án (theo JA, đồng bộ VI qua index) */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {jaOpts.map((opt, i) => {
            const selectedThis = selected === i;

            const hasVI = !!(viOpts[i]?.text && viOpts[i].text!.trim().length > 0);
            const hasJA = !!(opt?.text && opt.text!.trim().length > 0);

            const showVI = !!q.showVIOption?.[i];
            const showJA = !!q.showJAOption?.[i];
            const furiHtml = q.furiOptionHtml?.[i];

            const showResult = !!q.submitted;
            const isCorrectChoice = !!q.correctShuffledIndexes && q.correctShuffledIndexes.includes(i);
            const isWrongPicked = showResult && selectedThis && !isCorrectChoice;

            return (
              <li
                key={i}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  background: isCorrectChoice && showResult ? '#ecfdf3' : isWrongPicked ? '#fef2f2' : '#fff',
                }}
              >
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={selectedThis}
                    onChange={() => onSelect(index, i)}
                    disabled={q.submitted}
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

                    {/* Nút JA/VI nhỏ cho từng option */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {hasVI && (
                        <button
                          onClick={() => toggleVIOption(index, i)}
                          aria-pressed={!!q.showVIOption?.[i]}
                          style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          disabled={q.submitted}
                        >
                          VI
                        </button>
                      )}
                      {hasJA && (
                        <button
                          onClick={() => toggleJAOption(index, i, opt.text || '')}
                          aria-pressed={!!q.showJAOption?.[i]}
                          style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          disabled={q.submitted}
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

        {/* Nút chấm câu hiện tại */}
        {!q.submitted && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => submitOne(index)}
              disabled={q.selectedIndex == null}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3',
                background: q.selectedIndex != null ? '#175cd3' : '#94a3b8', color: '#fff', fontWeight: 700
              }}
            >
              解答を提出 / Nộp câu
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
