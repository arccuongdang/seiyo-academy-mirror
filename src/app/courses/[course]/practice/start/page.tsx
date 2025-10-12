'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Data
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '../../../../../lib/qa/excel';
import { toQARenderItem, shuffleOptions } from '../../../../../lib/qa/formatters';
import { gradeSingleChoice } from '../../../../../lib/qa/grade';
import { toFuriganaHtml } from '../../../../../lib/jp/kuroshiro';

// Types
import type { QARenderItem, QAOption, CognitiveLevel } from '../../../../../lib/qa/schema';

// View model cho 1 câu hỏi trên UI
type ViewQuestion = QARenderItem & {
  shuffled: QAOption[];
  selectedId?: string | null;
  submitted?: boolean;
  isCorrect?: boolean;
  correctIds?: string[];
  multiCorrect?: boolean;

  // Toggle JA/VI
  showVIQuestion?: boolean;
  showVIOption?: Record<string, boolean>;
  showJAQuestion?: boolean;
  showJAOption?: Record<string, boolean>;

  // Cache furigana
  furiQuestionHtml?: string;
  furiOptionHtml?: Record<string, string>;
};

// --- Setup form model ---
type YearWindow = 5 | 10 | 15;
type DifficultyValue = string; // repo bạn đang lưu difficulty dạng string/number → để string cho linh hoạt

export default function PracticeStart({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || '';

  const [allItems, setAllItems] = useState<QARenderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ========= SETUP FORM =========
  const [started, setStarted] = useState(false);

  const [numQuestions, setNumQuestions] = useState<5 | 10 | 15 | 20 | 25>(5);
  const [yearWindow, setYearWindow] = useState<YearWindow>(5);
  const [randomizeOptions, setRandomizeOptions] = useState(false); // default: giữ nguyên → false
  const [tagSelections, setTagSelections] = useState<Set<string>>(new Set()); // rỗng = không lọc
  const [difficultySel, setDifficultySel] = useState<DifficultyValue | 'RANDOM'>('RANDOM');

  // ========= QUESTIONS SAU KHI APPLY SETUP =========
  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);

  // ====== Load toàn bộ câu (theo subject) ======
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
        const items = snapshot.items.map(toQARenderItem);
        setAllItems(items);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [course, subject]);

  // ====== Derive meta: years, tags, difficulties ======
  const maxYear = useMemo(() => {
    const ys = allItems.map((q) => q.examYear || 0).filter(Boolean);
    return ys.length ? Math.max(...ys) : null;
  }, [allItems]);

  const tagList = useMemo(() => {
    const set = new Set<string>();
    for (const q of allItems) {
      const raw = (q as any).tags;
      let arr: string[] = [];
      if (Array.isArray(raw)) {
        arr = raw.map(String).filter(Boolean);
      } else if (typeof raw === 'string') {
        // hỗ trợ "a,b,c" hoặc "a b c"
        arr = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      }
      for (const t of arr) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allItems]);



  const difficultyList = useMemo(() => {
    const set = new Set<string>();
    for (const q of allItems) {
      if (q.difficulty != null && String(q.difficulty).trim() !== '') {
        set.add(String(q.difficulty));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allItems]);

  // ====== Áp dụng bộ lọc & chọn N câu khi bấm "Bắt đầu" ======
  const applySetup = () => {
    if (!allItems.length) return;

    let pool = [...allItems];

    // 1) Lọc theo phạm vi năm (tính theo năm lớn nhất trong pool)
    if (maxYear && yearWindow) {
      const minYear = maxYear - (yearWindow - 1);
      pool = pool.filter((q) => (q.examYear || 0) >= minYear);
    }

    // 2) Lọc theo tags (nếu có chọn)
    if (tagSelections.size > 0) {
      pool = pool.filter((q) => {
        const raw = (q as any).tags;
        let arr: string[] = [];
        if (Array.isArray(raw)) {
          arr = raw.map(String).filter(Boolean);
        } else if (typeof raw === 'string') {
          arr = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
        }
        const tags = new Set(arr);
        for (const t of tagSelections) {
          if (tags.has(t)) return true; // chấp nhận nếu có ít nhất 1 tag khớp
        }
        return false;
      });
    }


    // 3) Lọc theo độ khó (nếu khác RANDOM)
    if (difficultySel !== 'RANDOM') {
      pool = pool.filter((q) => String(q.difficulty) === String(difficultySel));
    }

    // 4) Chọn N câu (random để đỡ lặp)
    //    Nếu pool ít hơn N, lấy hết.
    const chosen = sampleN(pool, numQuestions);

    // 5) Chuẩn bị ViewQuestion + shuffle option nếu bật randomizeOptions
    const view: ViewQuestion[] = chosen.map((q) => ({
      ...q,
      shuffled: randomizeOptions ? shuffleOptions(q.options) : [...q.options],
      selectedId: null,
      submitted: false,
      showVIQuestion: false,
      showVIOption: {},
      showJAQuestion: false,
      showJAOption: {},
      furiOptionHtml: {},
    }));

    setQuestions(view);
    setIndex(0);
    setStarted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ========= Handlers trong khi làm =========
  const goto = (i: number) => {
    setIndex((prev) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      return next;
    });
  };

  const onSelect = (qIdx: number, optionId: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, selectedId: optionId } : q)),
    );
  };

  const submitOne = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.submitted) return q;
        const res = gradeSingleChoice(q.selectedId ?? null, q.shuffled);
        return {
          ...q,
          submitted: true,
          isCorrect: res.isCorrect,
          correctIds: res.correctIds,
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
    const need = !cur?.furiQuestionHtml && (cur?.questionTextJA || '').trim().length > 0;
    if (!need) return;

    (async () => {
      const html = await toFuriganaHtml(cur!.questionTextJA || '');
      setQuestions((prev) => {
        const next = [...prev];
        if (!next[qIdx]) return prev;
        next[qIdx] = { ...next[qIdx], furiQuestionHtml: html };
        return next;
      });
    })();
  };

  // Toggle VI/JA Option
  const toggleVIOption = (qIdx: number, optionId: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const m = { ...(q.showVIOption || {}) };
        m[optionId] = !m[optionId];
        return { ...q, showVIOption: m };
      }),
    );
  };
  const toggleJAOption = (qIdx: number, optionId: string, textJA: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const m = { ...(q.showJAOption || {}) };
        m[optionId] = !m[optionId];
        return { ...q, showJAOption: m };
      }),
    );

    const cur = questions[qIdx];
    const has = cur?.furiOptionHtml?.[optionId];
    const need = !has && (textJA || '').trim().length > 0;
    if (!need) return;

    (async () => {
      const html = await toFuriganaHtml(textJA);
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
  if (!allItems.length) return <main style={{ padding: 24 }}>Chưa có câu hỏi cho môn {subject}.</main>;

  // =======================
  // 1) MÀN HÌNH CHỌN THAM SỐ
  // =======================
  if (!started) {
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

          {/* 2) Phạm vi năm gần đây */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              2) Phạm vi năm gần đây {maxYear ? `(tối đa: ${maxYear})` : ''}
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

          {/* 3) Random đáp án */}
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
  const selected = q.selectedId || null;

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
            問 {index + 1}: {q.questionTextJA || q.questionTextVI || '(No content)'}
          </div>

          {/* Badge vị trí chính thức (nếu có) */}
          {typeof q.officialPosition === 'number' && (
            <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
              位置 {q.officialPosition}
            </span>
          )}
          {/* Badge cognitive level (nếu có) */}
          {q.cognitiveLevel && (
            <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
              {q.cognitiveLevel}
            </span>
          )}

          {(q.questionTextVI || '').trim() && (
            <button
              onClick={() => toggleVIQuestion(index)}
              aria-pressed={!!q.showVIQuestion}
              style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
            >
              VI
            </button>
          )}
          {(q.questionTextJA || '').trim() && (
            <button
              onClick={() => toggleJAQuestion(index)}
              aria-pressed={!!q.showJAQuestion}
              style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
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

        {/* Furigana JA + bản dịch VI cho câu */}
        {q.showJAQuestion && q.furiQuestionHtml && (
          <div
            style={{ background: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 8 }}
            dangerouslySetInnerHTML={{ __html: q.furiQuestionHtml }}
          />
        )}
        {q.showVIQuestion && (q.questionTextVI || '').trim() && (
          <div style={{ background: '#fffbeb', padding: 8, borderRadius: 8, marginBottom: 8 }}>
            {q.questionTextVI}
          </div>
        )}

        {/* Danh sách đáp án */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {q.shuffled.map((opt) => {
            const selectedThis = selected === opt.id;
            const hasVI = (opt.textVI || '').trim().length > 0;
            const hasJA = (opt.textJA || '').trim().length > 0;
            const showVI = !!q.showVIOption?.[opt.id];
            const showJA = !!q.showJAOption?.[opt.id];
            const furiHtml = q.furiOptionHtml?.[opt.id];

            const showResult = !!q.submitted;
            const isCorrectChoice = !!q.correctIds && q.correctIds.includes(opt.id);
            const isWrongPicked = showResult && selectedThis && !isCorrectChoice;

            return (
              <li
                key={opt.id}
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
                    onChange={() => onSelect(index, opt.id)}
                    disabled={q.submitted}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div>{opt.textJA || opt.textVI || '(Không có nội dung)'}</div>

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
                        {opt.textVI}
                      </div>
                    )}

                    {/* Nút JA/VI nhỏ cho từng option */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      {hasVI && (
                        <button
                          onClick={() => toggleVIOption(index, opt.id)}
                          aria-pressed={!!q.showVIOption?.[opt.id]}
                          style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          disabled={q.submitted}
                        >
                          VI
                        </button>
                      )}
                      {hasJA && (
                        <button
                          onClick={() => toggleJAOption(index, opt.id, opt.textJA || '')}
                          aria-pressed={!!q.showJAOption?.[opt.id]}
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
              disabled={!q.selectedId}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3',
                background: q.selectedId ? '#175cd3' : '#94a3b8', color: '#fff', fontWeight: 700
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
