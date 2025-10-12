'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '../../../../../lib/qa/excel';
import { toQARenderItems, shuffleOptions } from '../../../../../lib//qa/formatters';
import { gradeSingleChoice } from '../../../../../lib/qa/grade';
import { toFuriganaHtml } from '../../../../../lib/jp/kuroshiro';
import type { QARenderItem, QAOption } from '../../../../../lib/qa/schema';
// Firestore client
import { db } from '../../../../../lib/firebase/client';
// Helper resolve rule
import { getPassingRule, type PassingRule } from '../../../../../lib/passing/rules';


type ViewQuestion = QARenderItem & {
  shuffled: QAOption[];
  selectedId?: string | null;          // chọn nhưng CHƯA chấm từng câu
  isCorrect?: boolean;                 // set sau khi kết thúc bài
  correctIds?: string[];               // set sau khi kết thúc bài
  multiCorrect?: boolean;

  // Toggles JA/VI cho Q&A
  showVIQuestion?: boolean;
  showVIOption?: Record<string, boolean>;
  showJAQuestion?: boolean;
  showJAOption?: Record<string, boolean>;

  // Cache furigana
  furiQuestionHtml?: string;
  furiOptionHtml?: Record<string, string>;
};

type FilterTab = 'all' | 'wrong' | 'blank';

const [finished, setFinished] = useState(false);

// Chuẩn đỗ hiện hành (đã resolve theo course/subject/year)
const [rule, setRule] = useState<PassingRule | null>(null);
// Metadata rule (để snapshot vào attempt)
const [ruleMeta, setRuleMeta] = useState<{source: string; overrideId: string|null; version: number; publishedAt: any}>({
  source: 'default',
  overrideId: null,
  version: 1,
  publishedAt: null
});

// Đồng hồ (nếu rule chỉ định timeLimitSec & showClock)
const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);


const [tab, setTab] = useState<'all'|'wrong'>('all');
const [score, setScore] = useState<{ total: number; correct: number; blank: number }>({ total: 0, correct: 0, blank: 0 });
// questions đang có sẵn từ trước (mảng QARenderItem đã chấm điểm)

const [durationSec, setDurationSec] = useState<number | null>(null);


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
  const [score, setScore] = useState({ total: 0, correct: 0, blank: 0 });

  // Review filter
  const [tab, setTab] = useState<FilterTab>('all');
  
  useEffect(() => {
    // Cần có subject & đã có ít nhất 1 câu để lấy examYear (nếu bạn dùng year từ câu hỏi)
    if (!subject || !questions || questions.length === 0) return;

    (async () => {
      // Lấy examYear từ câu đầu (mọi câu cùng năm)
      const year = questions[0]?.examYear ?? null;

      // courseId đến từ params
      const courseId = params.course;

      const { rule: resolved, source, overrideId, version, publishedAt } =
        await getPassingRule(db, courseId, { mode: 'year', subjectId: subject, year });

      setRule(resolved);
      setRuleMeta({ source, overrideId, version, publishedAt });

      // Nếu rule có giới hạn thời gian & bật đồng hồ → set timeLeft
      if (resolved?.showClock && typeof resolved.timeLimitSec === 'number' && resolved.timeLimitSec > 0) {
        setTimeLeftSec(resolved.timeLimitSec);
      } else {
        setTimeLeftSec(null);
      }
    })();
  }, [params.course, subject, questions]);

  // Đồng hồ đếm ngược
  useEffect(() => {
    if (finished) return;                 // đã nộp bài thì dừng
    if (timeLeftSec == null) return;      // không có giới hạn
    if (timeLeftSec <= 0) {
      // Hết giờ: đánh dấu đã hết giờ (dừng đồng hồ); 
      // Nếu bạn đã có handler nộp toàn bài, gọi nó tại đây thay cho setFinished.
      setFinished(true);
      return;
    }
    const t = setTimeout(() => setTimeLeftSec((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeftSec, finished]);


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
        // normalize + validate + id ổn định
        const items = toQARenderItems(snapshot.items);

        // lọc theo năm
        const rows = items.filter((q) => q.examYear === year);
        if (rows.length === 0) {
          setErr(`Chưa có câu hỏi cho ${subject} năm ${year}.`);
          setLoading(false);
          return;
        }

        // shuffle từng câu
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

  // ====== subject-level handlers (year-mode) ======

  const cur = questions[index];

  const goto = (i: number) => {
    setIndex((prev) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      return next;
    });
  };

  const onSelect = (qIdx: number, optionId: string) => {
    if (finished) {
      const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;

      return (
        <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
            {params.course} / {subject} — Kết quả bài {(questions[0]?.examYear ?? '—')}年度
          </h1>

          <section style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Tổng hợp điểm</div>
                <div style={{ marginLeft: 'auto', color: '#667085' }}>
                  正答 {score.correct}/{score.total}（{pct}%）・未回答 {score.blank}
                </div>
              </div>

              {/* thanh tiến độ */}
              <div style={{ marginTop: 10, height: 8, background: '#f2f4f7', borderRadius: 999 }}>
                <div
                  style={{
                    width: `${pct}%`, height: 8, borderRadius: 999, background: '#16a34a',
                    transition: 'width 300ms ease'
                  }}
                />
              </div>

              {/* thời lượng (nếu bạn có durationSec trong state) */}
              {typeof durationSec === 'number' && (
                <div style={{ marginTop: 8, color: '#667085' }}>
                  Thời gian làm: <b>{Math.floor(durationSec / 60)}m{durationSec % 60}s</b>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setTab('all')}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'all' ? '#eef2ff' : '#fff' }}
                >
                  Xem lại tất cả
                </button>
                <button
                  onClick={() => setTab('wrong')}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'wrong' ? '#fee2e2' : '#fff' }}
                >
                  Chỉ câu sai
                </button>
              </div>
            </div>
          </section>

          {/* vùng review (giữ logic render câu hiện có, chỉ lọc theo tab) */}
          <section style={{ display: 'grid', gap: 12 }}>
            {questions
              .filter(q => tab === 'all' ? true : !q.isCorrect)
              .map((q, idx) => (
                <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Câu {idx + 1}: {q.questionTextJA || '(No text)'}
                  </div>

                  {/* ... phần hiển thị đáp án của bạn (giữ nguyên), kèm giải thích, nút VI/JA ... */}
                </div>
              ))}
          </section>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <a href={`/courses/${params.course}`} style={{ color: '#175cd3', textDecoration: 'underline' }}>
              ← Quay lại môn học
            </a>
          </div>
        </main>
      ); 
    }
  };

  const endExamAndGrade = () => {
    // Chấm toàn bài
    const graded = questions.map((q) => {
      const res = gradeSingleChoice(q.selectedId ?? null, q.shuffled);
      return { ...q, isCorrect: res.isCorrect, correctIds: res.correctIds, multiCorrect: res.multiCorrect };
    });

    const total = graded.length;
    const correct = graded.filter((x) => x.isCorrect).length;
    const blank = graded.filter((x) => !x.selectedId).length;

    setQuestions(graded);
    setScore({ total, correct, blank });

    // ❶ Kết luận đậu/rớt
    let passed = false;
    if (rule) {
      if (typeof rule.minCorrect === 'number') {
        passed = score.correct >= rule.minCorrect;
      } else if (typeof rule.passPercent === 'number') {
        const pct = score.total ? (score.correct / score.total) * 100 : 0;
        passed = pct >= rule.passPercent;
      } else {
        // Không có rule → coi như chỉ hiển thị điểm, không xét đậu/rớt
        passed = false;
      }
    }

    // ❷ Ghi attempt: thêm snapshot rule
    await setDoc(doc(db, 'attempts', attemptId), {
      // ... các field bạn đã có như userId, courseId, subjectId, mode: 'year', examYear, total, correct, blank,
      passed,
      ruleSnapshot: {
        courseId: params.course,
        source: ruleMeta.source,         // 'default' | 'year' | 'subject' | 'year+subject'
        overrideId: ruleMeta.overrideId, // null nếu dùng default
        version: ruleMeta.version,
        publishedAt: ruleMeta.publishedAt || null,
        passPercent: rule?.passPercent ?? null,
        minCorrect: rule?.minCorrect ?? null,
        timeLimitSec: rule?.timeLimitSec ?? null,
        showClock: typeof rule?.showClock === 'boolean' ? rule!.showClock : null,
      }
    }, { merge: true });

    // ❸ Đánh dấu completed
    setFinished(true);
    setTab('all');
    // ở year-mode, sau khi kết thúc mới reveal lời giải, nên không cần nút submit từng câu
  };

  // ====== JA/VI toggles (giống subject-mode) ======

  const toggleVIQuestion = (qIdx: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIdx ? { ...q, showVIQuestion: !q.showVIQuestion } : q)));
  };

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

  const toggleJAQuestion = (qIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, showJAQuestion: !q.showJAQuestion } : q)),
    );

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

  // ====== UI ======

  if (!subject || !year) {
  return (
    <main style={{ padding: 24 }}>
      Thiếu tham số <code>?subject=...</code> và/hoặc <code>?year=...</code> (VD: <code>?subject=TK&year=2022</code>)
    </main>
  );
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>Đang tải đề…</main>
      );
  }

  if (err) {
    return (
      <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>
    );
  }

  if (questions.length === 0) {
    return (
      <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>
    );
  }


  if (!finished) {
    // === Doing exam (no per-question explanations) ===
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {course} / {subject} — {year} 年度 過去問
        </h1>

        {/* Progress + Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => goto(index - 1)}
            disabled={index === 0}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}
          >
            前へ / Trước
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
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

        {/* Question card */}
        <QuestionCard
          q={cur}
          idx={index}
          readOnly={false} // chưa kết thúc -> cho chọn/đổi đáp án
          onSelect={onSelect}
          toggleVIQuestion={toggleVIQuestion}
          toggleVIOption={toggleVIOption}
          toggleJAQuestion={toggleJAQuestion}
          toggleJAOption={toggleJAOption}
        />

        {/* End Exam */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            onClick={endExamAndGrade}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #175cd3',
              color: '#fff',
              background: '#175cd3',
              fontWeight: 700,
            }}
          >
            試験を終了 / Kết thúc bài
          </button>
        </div>
      </main>
    );
  }

  // === Finished: Summary + Review ===
  const wrongIds = new Set(questions.filter((q) => q.isCorrect === false).map((q) => q.id));
  const blankIds = new Set(questions.filter((q) => !q.selectedId).map((q) => q.id));
  const list = questions.filter((q) => {
    if (tab === 'wrong') return wrongIds.has(q.id);
    if (tab === 'blank') return blankIds.has(q.id);
    return true;
    });

  const percent = Math.round((score.correct / score.total) * 100);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        {course} / {subject} — {year} 年度 結果 / Kết quả
      </h1>

      {/* Score box */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: '#475467' }}>正答数 / Số câu đúng</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{score.correct} / {score.total}（{percent}%）</div>
        </div>
        <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: '#475467' }}>未回答 / Chưa làm</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{score.blank}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setTab('all')}
          style={tabBtnStyle(tab === 'all')}
        >全問 / Tất cả</button>
        <button
          onClick={() => setTab('wrong')}
          style={tabBtnStyle(tab === 'wrong')}
        >不正解 / Sai</button>
        <button
          onClick={() => setTab('blank')}
          style={tabBtnStyle(tab === 'blank')}
        >未回答 / Chưa làm</button>
      </div>

      {/* Review list (reveal explanations now) */}
      {list.map((q, idx) => (
        <ReviewCard
          key={q.id}
          q={q}
          indexLabel={`問 ${questions.findIndex(x => x.id === q.id) + 1}`}
        />
      ))}
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



/** Card hiển thị khi đang làm bài (không reveal giải) */
//đồng hồ trong UI
{rule && (
  <div style={{ marginBottom: 8, color: '#667085' }}>
    Chuẩn đỗ: {typeof rule.minCorrect === 'number' ? `≥ ${rule.minCorrect} câu` : ''}
    {typeof rule.passPercent === 'number' ? `${typeof rule.minCorrect === 'number' ? '・' : ''}≥ ${rule.passPercent}%` : ''}
    {rule.showClock && typeof rule.timeLimitSec === 'number' && (
      <> ・ Thời gian: {Math.floor((timeLeftSec ?? rule.timeLimitSec)/60)}m{((timeLeftSec ?? rule.timeLimitSec)%60)}s</>
    )}
  </div>
)}

function QuestionCard(props: {
  q: ViewQuestion;
  idx: number;
  readOnly: boolean;
  onSelect: (qIdx: number, optionId: string) => void;
  toggleVIQuestion: (qIdx: number) => void;
  toggleVIOption: (qIdx: number, optionId: string) => void;
  toggleJAQuestion: (qIdx: number) => void;
  toggleJAOption: (qIdx: number, optionId: string, textJA: string) => void;
}) {
  const { q, idx, readOnly } = props;
  const titleJA = q.questionTextJA || '';
  const titleVI = q.questionTextVI || '';
  const showVIQ = !!q.showVIQuestion;
  const showJAQ = !!q.showJAQuestion;

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, flex: 1 }}>
          問 {idx + 1}: {titleJA || titleVI || '(No content)'}
        </div>

        {/* VI & JA for question */}
        {titleVI && (
          <button
            type="button"
            onClick={() => props.toggleVIQuestion(idx)}
            style={toggleBtnStyle(showVIQ)}
            aria-pressed={showVIQ}
            title="Việt ngữ"
          >VI</button>
        )}
        {titleJA && (
          <button
            type="button"
            onClick={() => props.toggleJAQuestion(idx)}
            style={toggleBtnStyle(showJAQ)}
            aria-pressed={showJAQ}
            title="ふりがな"
          >JA</button>
        )}
      </div>

      {q.questionImage && (
        <img
          src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${q.questionImage}`}
          alt=""
          style={{ maxWidth: '100%', marginBottom: 8 }}
        />
      )}

      {showVIQ && titleVI && <div style={{ marginBottom: 6, color: '#475467' }}>{titleVI}</div>}
      {showJAQ && q.furiQuestionHtml && (
        <div
          style={{ marginBottom: 6, color: '#0f172a' }}
          dangerouslySetInnerHTML={{ __html: q.furiQuestionHtml }}
        />
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {q.shuffled.map((opt) => {
          const isChosen = q.selectedId === opt.id;
          const borderColor = isChosen ? '#175cd3' : '#f0f0f0';
          const showVIOpt = !!q.showVIOption?.[opt.id!];
          const showJAOpt = !!q.showJAOption?.[opt.id!];
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
                background: isChosen ? '#f7f9ff' : '#fff',
                alignItems: 'flex-start',
              }}
              onClick={(e) => {
                const t = e.target as HTMLElement;
                if (t.dataset?.action === 'toggle-vi-opt' || t.dataset?.action === 'toggle-ja-opt') return;
                if (!readOnly) props.onSelect(idx, opt.id!);
              }}
            >
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={isChosen}
                onChange={() => props.onSelect(idx, opt.id!)}
                disabled={readOnly}
                style={{ marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <div>{textJA || textVI || '(No content)'}</div>
                {showVIOpt && textVI && <div style={{ marginTop: 4, color: '#475467' }}>{textVI}</div>}
                {showJAOpt && q.furiOptionHtml?.[opt.id!] && (
                  <div
                    style={{ marginTop: 4, color: '#0f172a' }}
                    dangerouslySetInnerHTML={{ __html: q.furiOptionHtml![opt.id!] }}
                  />
                )}
                {opt.image && (
                  <img
                    src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${opt.image}`}
                    alt=""
                    style={{ maxWidth: '100%', marginTop: 6 }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {textVI && (
                  <button
                    type="button"
                    data-action="toggle-vi-opt"
                    onClick={() => props.toggleVIOption(idx, opt.id!)}
                    style={toggleBtnStyle(showVIOpt)}
                    aria-pressed={showVIOpt}
                    title="Việt ngữ"
                  >VI</button>
                )}
                {textJA && (
                  <button
                    type="button"
                    data-action="toggle-ja-opt"
                    onClick={() => props.toggleJAOption(idx, opt.id!, textJA)}
                    style={toggleBtnStyle(showJAOpt)}
                    aria-pressed={showJAOpt}
                    title="ふりがな"
                  >JA</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    border: '1px solid #ddd',
    background: active ? '#f7f9ff' : '#fff',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

/** Review card (sau khi kết thúc bài) — ĐẬU/RỚT + REVEAL lời giải + multi-correct */
{finished && (
  <div style={{ marginBottom: 10 }}>
    {passed ? (
      <span style={{ padding: '4px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>ĐẬU</span>
    ) : (
      <span style={{ padding: '4px 8px', borderRadius: 999, background: '#fee2e2', color: '#991b1b' }}>RỚT</span>
    )}
  </div>
)}

function ReviewCard({ q, indexLabel }: { q: ViewQuestion; indexLabel: string }) {
  const byId = useMemo(() => new Map(q.shuffled.map((o) => [o.id, o])), [q.shuffled]);
  const selected = q.selectedId ? byId.get(q.selectedId) : undefined;
  const correctSet = new Set(q.correctIds || []);
  const isCorrect = q.isCorrect === true;
  const multi = q.multiCorrect === true;

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, flex: 1 }}>
          {indexLabel}: {q.questionTextJA || q.questionTextVI || '(No content)'}
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
          <span style={{ marginLeft: 8, fontSize: 12, color: isCorrect ? '#2e7d32' : '#d32f2f' }}>
            {isCorrect ? '正解' : selected ? '不正解' : '未回答'}
          </span>
        </div>
      </div>

      {q.questionImage && (
        <img
          src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${q.questionImage}`}
          alt=""
          style={{ maxWidth: '100%', marginBottom: 8 }}
        />
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {q.shuffled.map((opt) => {
          const chosen = q.selectedId === opt.id;
          const isCorrectOpt = correctSet.has(opt.id!);
          const borderColor = isCorrectOpt ? '#4caf50' : chosen ? '#f59e0b' : '#f0f0f0';

          return (
            <li
              key={opt.id ?? opt.key}
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                padding: 10,
                marginBottom: 8,
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: chosen ? 700 : 500 }}>
                  {opt.textJA || opt.textVI || '(No content)'}
                  {isCorrectOpt && <span style={{ marginLeft: 6, color: '#4caf50', fontWeight: 700 }}>✓</span>}
                  {chosen && !isCorrectOpt && <span style={{ marginLeft: 6, color: '#f59e0b', fontWeight: 700 }}>選択</span>}
                </div>
              </div>
              {opt.image && (
                <img
                  src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${opt.image}`}
                  alt=""
                  style={{ maxWidth: '100%', marginTop: 6 }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* LỜI GIẢI: hiển thị ngay ở Review (JA-first). */}
      <ExplanationJA_VI q={q} byId={byId} />
    </section>
  );
}

/** Lời giải (JA-first) có nút VI và có thể mở rộng JA furigana giống subject-mode nếu cần */
function ExplanationJA_VI({ q, byId }: { q: ViewQuestion; byId: Map<string | undefined, QAOption> }) {
  const [showVI, setShowVI] = useState(false);
  const [showJA, setShowJA] = useState(false);

  // cache furigana local component
  const [selFuri, setSelFuri] = useState<string | null>(null);
  const [genFuri, setGenFuri] = useState<string | null>(null);
  const [otherFuri, setOtherFuri] = useState<Record<string, string>>({});

  const selected = q.selectedId ? byId.get(q.selectedId) : undefined;
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);
    // (không cần handleSubmitAll)
  const selJA = selected?.explanationJA || '';
  const selVI = selected?.explanationVI || '';
  const genJA = q.explanationGeneralJA || '';
  const genVI = q.explanationGeneralVI || '';
  const others = (q.correctIds || [])
    .filter((cid) => cid !== q.selectedId)
    .map((cid) => ({ cid, opt: byId.get(cid)! }))
    .filter(({ opt }) => !!opt);

  // generate furigana on-demand
  const genFuriIfNeeded = async () => {
    const tasks: Promise<void>[] = [];

    if (selJA && !selFuri) tasks.push((async () => setSelFuri(await toFuriganaHtml(selJA)))());
    if (genJA && !genFuri) tasks.push((async () => setGenFuri(await toFuriganaHtml(genJA)))());

    const missing = others
      .filter(({ cid, opt }) => (opt.explanationJA || '').trim().length > 0 && !otherFuri[cid!])
      .map(({ cid, opt }) => ({ cid: cid!, ja: opt.explanationJA! }));

    if (missing.length) {
      tasks.push((async () => {
        const map = { ...otherFuri };
        for (const { cid, ja } of missing) {
          map[cid] = await toFuriganaHtml(ja);
        }
        setOtherFuri(map);
      })());
    }

    if (tasks.length) await Promise.all(tasks);
  };

  return (
    <div style={{ marginTop: 12, padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, flex: 1 }}>解説 / Lời giải</div>
        <button
          type="button"
          onClick={() => setShowVI((v) => !v)}
          style={toggleBtnStyle(showVI)}
          aria-pressed={showVI}
          title="Việt ngữ"
        >VI</button>
        <button
          type="button"
          onClick={async () => {
            const next = !showJA;
            setShowJA(next);
            if (next) await genFuriIfNeeded();
          }}
          style={toggleBtnStyle(showJA)}
          aria-pressed={showJA}
          title="ふりがな"
        >JA</button>
      </div>

      {(selJA || selVI) && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>解説（選択肢）</div>
          {selJA && <div>{selJA}</div>}
          {showVI && selVI && <div style={{ color: '#475467', marginTop: 4 }}>{selVI}</div>}
          {showJA && selFuri && (
            <div style={{ marginTop: 4, color: '#0f172a' }} dangerouslySetInnerHTML={{ __html: selFuri }} />
          )}
        </div>
      )}

      {q.multiCorrect && others.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>他の正解の解説</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {others.map(({ cid, opt }, i) => {
              const ja = opt.explanationJA || '';
              const vi = opt.explanationVI || '';
              return (
                <li key={i}>
                  {ja && <div>{ja}</div>}
                  {showVI && vi && <div style={{ color: '#475467', marginTop: 2 }}>{vi}</div>}
                  {showJA && otherFuri[cid!] && (
                    <div
                      style={{ marginTop: 2, color: '#0f172a' }}
                      dangerouslySetInnerHTML={{ __html: otherFuri[cid!] }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(genJA || genVI) && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>共通解説</div>
          {genJA && <div>{genJA}</div>}
          {showVI && genVI && <div style={{ color: '#475467', marginTop: 4 }}>{genVI}</div>}
          {showJA && genFuri && (
            <div style={{ marginTop: 4, color: '#0f172a' }} dangerouslySetInnerHTML={{ __html: genFuri }} />
          )}
        </div>
      )}

      {!selJA && !selVI && !genJA && !genVI && (
        <div style={{ color: '#666' }}>（この問題には解説が登録されていません）</div>
      )}
    </div>
  );
}