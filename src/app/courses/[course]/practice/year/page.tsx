'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Data loading
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '../../../../../lib/qa/excel';
// Formatter + shuffle
import { toQARenderItem, shuffleOptions} from '../../../../../lib/qa/formatters';
// Grader
import { gradeSingleChoice } from '../../../../../lib/qa/grade';
// Furigana
import { toFuriganaHtml } from '../../../../../lib/jp/kuroshiro';

// Types
import type { QARenderItem, QAOption, CognitiveLevel} from '../../../../../lib/qa/schema';

// Firestore (dùng cho passing rule)
import { db } from '../../../../../lib/firebase/client';
import { getPassingRule, type PassingRule } from '../../../../../lib/passing/rules';

type ViewQuestion = QARenderItem & {
  shuffled: QAOption[];
  selectedId?: string | null;

  // kết quả sau khi nộp
  isCorrect?: boolean;
  correctIds?: string[];
  multiCorrect?: boolean;
  

  // JA/VI toggles
  showVIQuestion?: boolean;
  showVIOption?: Record<string, boolean>;
  showJAQuestion?: boolean;
  showJAOption?: Record<string, boolean>;

  // Cache furigana
  furiQuestionHtml?: string;
  furiOptionHtml?: Record<string, string>;

  // thêm hai field officialPosition, cognitiveLevel
  officialPosition?: number | null;
  cognitiveLevel?: CognitiveLevel | null;
};

type FilterTab = 'all' | 'wrong' | 'blank';

export default function YearPracticePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || '';
  const yearStr = search.get('year') || '';
  const year = Number(yearStr);

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // điều hướng câu
  const [index, setIndex] = useState(0);

  // trạng thái bài thi
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState<{ total: number; correct: number; blank: number }>({
    total: 0,
    correct: 0,
    blank: 0,
  });

  // Passing rule
  const [rule, setRule] = useState<PassingRule | null>(null);
  const [ruleMeta, setRuleMeta] = useState<{ source: string; overrideId: string | null; version: number; publishedAt: any }>({
    source: 'default',
    overrideId: null,
    version: 1,
    publishedAt: null,
  });

  // Đồng hồ (nếu rule bật)
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);

  // Review filter
  const [tab, setTab] = useState<FilterTab>('all');

  // ====== Load câu hỏi theo course/subject/year ======
  useEffect(() => {
    if (!subject || !year) return;
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
        // ép kiểu rõ ràng để tránh any từ snapshot.items
        const items: QARenderItem[] = (snapshot.items as any[]).map(
          toQARenderItem as (x: any) => QARenderItem
        );

        // annotate tham số q để không còn implicit any
        const rows = items.filter((q: QARenderItem) => q.examYear === year);


        if (rows.length === 0) {
          setErr(`Chưa có câu hỏi cho ${subject} năm ${year}.`);
          setLoading(false);
          return;
        }

        const view: ViewQuestion[] = rows.map((q) => ({
          ...q,
          shuffled: shuffleOptions(q.options),
          selectedId: null,
          showVIQuestion: false,
          showVIOption: {},
          showJAQuestion: false,
          showJAOption: {},
          furiOptionHtml: {},
        }));

        setQuestions(view);
        setIndex(0);
        setFinished(false);
        setTab('all');
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải đề');
        setLoading(false);
      }
    })();
  }, [course, subject, year]);

  // ====== Resolve passing rule sau khi đã có câu hỏi ======
  useEffect(() => {
    if (!subject || questions.length === 0) return;
    (async () => {
      const examYear = questions[0]?.examYear ?? null; // các câu cùng năm
      const courseId = course;
      const { rule: resolved, source, overrideId, version, publishedAt } = await getPassingRule(db, courseId, {
        mode: 'year',
        subjectId: subject,
        year: examYear,
      });
      setRule(resolved);
      setRuleMeta({ source, overrideId, version, publishedAt });

      if (resolved?.showClock && typeof resolved.timeLimitSec === 'number' && resolved.timeLimitSec > 0) {
        setTimeLeftSec(resolved.timeLimitSec);
      } else {
        setTimeLeftSec(null);
      }
    })();
  }, [course, subject, questions]);

  // ====== Đồng hồ đếm ngược ======
  useEffect(() => {
    if (finished) return;
    if (timeLeftSec == null) return;
    if (timeLeftSec <= 0) {
      // hết giờ → nộp toàn bài
      handleSubmitAll();
      return;
    }
    const t = setTimeout(() => setTimeLeftSec((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeftSec, finished]);

  // ====== Handlers ======
  const goto = (i: number) => {
    setIndex((prev) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      return next;
    });
  };

  const onSelect = (qIdx: number, optionId: string) => {
    if (finished) return; // sau khi nộp thì không đổi đáp án
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, selectedId: optionId } : q)),
    );
  };

  const handleSubmitAll = () => {
    // Chấm toàn bài
    const graded: ViewQuestion[] = questions.map((q) => {
      const res = gradeSingleChoice(q.selectedId ?? null, q.shuffled);
      return {
        ...q,
        isCorrect: res.isCorrect,
        correctIds: res.correctIds,
        multiCorrect: res.multiCorrect,
      };
    });

    const total = graded.length;
    const correct = graded.filter((x) => x.isCorrect).length;
    const blank = graded.filter((x) => !x.selectedId).length;

    setQuestions(graded);
    setScore({ total, correct, blank });
    setFinished(true);
    setTab('all');
  };

  // Toggle hiển thị bản dịch VI cho câu hỏi
  const toggleVIQuestion = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)));
  };

  // Toggle hiển thị bản dịch VI cho từng option
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

  // Toggle furigana cho câu hỏi (JA)
  const toggleJAQuestion = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showJAQuestion: !q.showJAQuestion } : q)));

    const current = questions[qIdx];
    const need = !current?.furiQuestionHtml && (current?.questionTextJA || '').trim().length > 0;
    if (!need) return;

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

  // Toggle furigana cho option (JA)
  const toggleJAOption = (qIdx: number, optionId: string, textJA: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const m = { ...(q.showJAOption || {}) };
        m[optionId] = !m[optionId];
        return { ...q, showJAOption: m };
      }),
    );

    const current = questions[qIdx];
    const has = current?.furiOptionHtml?.[optionId];
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
  if (!subject || !year) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code> và/hoặc <code>?year=...</code> (VD: <code>?subject=TK&amp;year=2024</code>)
      </main>
    );
  }
  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (questions.length === 0) return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;

  // ====== Doing exam (chưa nộp) ======
  if (!finished) {
    const cur = questions[index];
    const selected = cur.selectedId || null;

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          {course} / {subject} — {year} 年度 過去問
        </h1>

        {/* Rule & đồng hồ */}
        {rule && (
          <div style={{ marginBottom: 12, color: '#334155' }}>
            <span style={{ marginRight: 8 }}>
              Chuẩn đỗ:
              {typeof rule.minCorrect === 'number' ? ` ≥ ${rule.minCorrect} câu` : ''}
              {typeof rule.passPercent === 'number'
                ? `${typeof rule.minCorrect === 'number' ? '・' : ''} ≥ ${rule.passPercent}%`
                : ''}
            </span>
            {rule.showClock && typeof (timeLeftSec ?? rule.timeLimitSec) === 'number' && (
              <span>
                ・ Thời gian: {Math.floor((timeLeftSec ?? rule.timeLimitSec!) / 60)}m{((timeLeftSec ?? rule.timeLimitSec!) % 60)}s
              </span>
            )}
          </div>
        )}

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

        {/* Card câu hỏi hiện tại */}
        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          {/* Header + badge */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>
              Câu {index + 1}: {cur.questionTextJA || '(No text)'}
            </div>

            {typeof cur.officialPosition === 'number' && (
              <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                位置 {cur.officialPosition}
              </span>
            )}
            {cur.cognitiveLevel && (
              <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                {cur.cognitiveLevel}
              </span>
            )}

            {(cur.questionTextVI || '').trim() && (
              <button
                onClick={() => toggleVIQuestion(index)}
                aria-pressed={!!cur.showVIQuestion}
                style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              >
                VI
              </button>
            )}
            {(cur.questionTextJA || '').trim() && (
              <button
                onClick={() => toggleJAQuestion(index)}
                aria-pressed={!!cur.showJAQuestion}
                style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              >
                JA
              </button>
            )}
          </div>

          {/* Hình minh hoạ câu hỏi */}
          {cur.questionImage && (
            <img
              src={`/images/${cur.courseId}/${cur.subjectId}/${cur.examYear}/${cur.questionImage}`}
              alt=""
              style={{ maxWidth: '100%', marginBottom: 8 }}
            />
          )}

          {/* Nội dung JA + VI + Furigana */}
          {cur.showJAQuestion && cur.furiQuestionHtml && (
            <div
              style={{ background: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 8 }}
              dangerouslySetInnerHTML={{ __html: cur.furiQuestionHtml }}
            />
          )}
          {cur.showVIQuestion && (cur.questionTextVI || '').trim() && (
            <div style={{ background: '#fffbeb', padding: 8, borderRadius: 8, marginBottom: 8 }}>
              {cur.questionTextVI}
            </div>
          )}

          {/* Lựa chọn */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cur.shuffled.map((opt) => {
              const selectedThis = selected === opt.id;
              const hasVI = (opt.textVI || '').trim().length > 0;
              const hasJA = (opt.textJA || '').trim().length > 0;
              const showVI = !!cur.showVIOption?.[opt.id];
              const showJA = !!cur.showJAOption?.[opt.id];
              const furiHtml = cur.furiOptionHtml?.[opt.id];

              return (
                <li key={opt.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={`q-${cur.id}`}
                      checked={selectedThis}
                      onChange={() => onSelect(index, opt.id)}
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
                            aria-pressed={!!cur.showVIOption?.[opt.id]}
                            style={{ padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                          >
                            VI
                          </button>
                        )}
                        {hasJA && (
                          <button
                            onClick={() => toggleJAOption(index, opt.id, opt.textJA || '')}
                            aria-pressed={!!cur.showJAOption?.[opt.id]}
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
              onClick={handleSubmitAll}
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
            <a href={`/courses/${course}/practice/year?subject=${subject}&year=${year}`}>
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
          </div>
        </div>
      </main>
    );
  }

  // ====== Finished: Summary + Review ======
  const wrongIds = new Set(questions.filter((q) => q.isCorrect === false).map((q) => q.id));
  const blankIds = new Set(questions.filter((q) => !q.selectedId).map((q) => q.id));
  const list = questions.filter((q) => {
    if (tab === 'wrong') return wrongIds.has(q.id);
    if (tab === 'blank') return blankIds.has(q.id);
    return true;
  });

  const percent = score.total ? Math.round((score.correct / score.total) * 100) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {subject} — {year} 年度 結果 / Kết quả
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

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('all')} style={tabBtnStyle(tab === 'all')}>全問 / Tất cả</button>
        <button onClick={() => setTab('wrong')} style={tabBtnStyle(tab === 'wrong')}>不正解 / Sai</button>
        <button onClick={() => setTab('blank')} style={tabBtnStyle(tab === 'blank')}>未回答 / Chưa làm</button>
      </div>

      {/* Review list: reveal giải thích tại đây nếu bạn có */}
      <div style={{ display: 'grid', gap: 12 }}>
        {list.map((q, idx) => (
          <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>
                Câu {idx + 1}: {q.questionTextJA || '(No text)'}
              </div>
              {typeof q.officialPosition === 'number' && (
                <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                  位置 {q.officialPosition}
                </span>
              )}
              {q.cognitiveLevel && (
                <span style={{ border: '1px solid #e5e7eb', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                  {q.cognitiveLevel}
                </span>
              )}
            </div>

            {/* Ở phần này bạn có thể render options kèm đánh dấu đúng/sai + lời giải của bạn */}
            {/* ... (giữ nguyên phần review option/giải thích của repo bạn nếu đã có) ... */}
          </div>
        ))}
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
