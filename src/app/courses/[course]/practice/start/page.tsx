'use client';

/**
 * PATCH NOTES (Bước 13 – Replay wrongs)
 * - (NEW) Hỗ trợ ?questionIds=ID1,ID2,... để 'luyện lại câu sai' từ MyPage.
 * - Nếu có questionIds: bỏ qua 'years' & 'randomLast', chỉ nạp đúng các ID tìm thấy.
 * - Hiển thị shortage nếu một số ID không tồn tại trong snapshot.
 */


/**
 * ============================================================================
 * Practice Start — Luyện theo môn (mode=subject)
 * ----------------------------------------------------------------------------
 * TÍNH NĂNG CHÍNH
 * - Đọc RAW snapshot theo course/subject, hỗ trợ các tham số query:
 *   + count: 5|10|15|20|25 (mặc định 10)
 *   + shuffle: 1|0 (trộn đáp án)
 *   + years: CSV năm (ưu tiên) hoặc randomLast=5|10 (chọn N năm gần nhất)
 * - Multi-correct (MCQ có nhiều đáp án đúng):
 *   + Trước khi nộp: hiển thị banner “Câu này có {X} đáp án đúng”
 *   + Khi chấm: nếu X>1, MỌI lựa chọn đều được tính ĐÚNG
 * - Ghi tiến độ & kết quả (Bước 10):
 *   + createAttemptSession khi bắt đầu nếu user đã đăng nhập
 *   + updateAttemptSession mỗi lần nộp câu (correct/blank)
 *   + finalizeAttempt khi bấm “Kết thúc & lưu kết quả”
 * - Không thay đổi tên biến/hàm hiện có ở các lib loader/formatter.
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Loaders & formatters (GIỮ nguyên đường dẫn lib của dự án)
import { loadRawQuestionsFor } from '../../../../../lib/qa/excel';
import { toQARenderItemFromSnapshot } from '../../../../../lib/qa/formatters';

// Attempts (Bước 10)
import { createAttemptSession, updateAttemptSession, finalizeAttempt } from '../../../../../lib/analytics/attempts';
import { getAuth } from 'firebase/auth';

// Nhap Cau sai (Bước 11)
import { bumpWrong } from '../../../../../lib/analytics/wrongs';

// Types
import type {
  QuestionSnapshotItem,
  QARenderItem,
  QARenderOption,
} from '../../../../../lib/qa/schema';

/* -------------------- Utils chung -------------------- */
function parseYearsCSV(v: string | null): number[] {
  if (!v) return [];
  return v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
}
function makePermutation(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleN<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr];
  return shuffled(arr).slice(0, n);
}

/* -------------------- Grade helper -------------------- */
function gradeByIndex(selectedIndex: number | null, options: QARenderOption[]) {
  const correct = options.map((o, i) => (o.isAnswer ? i : -1)).filter(i => i >= 0);
  return {
    correctShuffledIndexes: correct,
    multiCorrect: correct.length > 1,
    isCorrect: selectedIndex != null ? correct.includes(selectedIndex) : false,
  };
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

  // Số đáp án đúng thực tế (để banner + chế độ chấm)
  expectedMultiCount: number;
};

export default function PracticeStart({ params }: { params: { course: string } }) {
  const { course } = params;
  const sp = useSearchParams();

  const subject = sp.get('subject') || '';

  const countParam = parseInt(sp.get('count') || '', 10);
  const count: 5 | 10 | 15 | 20 | 25 =
    (Number.isFinite(countParam) && [5, 10, 15, 20, 25].includes(countParam as any)
      ? (countParam as any)
      : 10);

  const shuffle = sp.get('shuffle') === '1';

  const randomLastParam = sp.get('randomLast');
  const randomLast = randomLastParam === '5' || randomLastParam === '10'
    ? (parseInt(randomLastParam, 10) as 5 | 10)
    : null;

  const yearsFromCSV = parseYearsCSV(sp.get('years'));
  const explicitYears = yearsFromCSV.length ? yearsFromCSV : null;

/* (NEW) Re-learn wrongs: accept ?questionIds=ID1,ID2,... */
const qidsParam = sp.get('questionIds');
const questionIds = qidsParam ? qidsParam.split(',').map(s => s.trim()).filter(Boolean) : [];

  const [rawItems, setRawItems] = useState<QuestionSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [shortage, setShortage] = useState<{ requested: number; got: number } | null>(null);

  // Attempts session info
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  /* ----------- Load RAW theo subject ----------- */
  useEffect(() => {
    if (!subject) return;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const raws = await loadRawQuestionsFor(course, subject);
        setRawItems(raws);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [course, subject]);

  /* ----------- Danh sách năm có dữ liệu ----------- */
  const yearsDesc = useMemo(() => {
    const set = new Set<number>();
    for (const q of rawItems) {
      const y = Number(q.examYear);
      if (Number.isFinite(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [rawItems]);

  /* ----------- Bắt đầu phiên luyện ----------- */
  async function startSession() {
    if (!rawItems.length) return;

    // 1) Select years ưu tiên theo query
    let targetYears: number[] = [];
    if (explicitYears) {
      const has = new Set(yearsDesc);
      targetYears = explicitYears.filter(y => has.has(y));
    } else if (randomLast) {
      targetYears = yearsDesc.slice(0, randomLast);
    } else {
      targetYears = yearsDesc;
    }

    // 2) Filter pool theo năm
    let pool = rawItems;

// (NEW) If questionIds specified, restrict pool strictly to those IDs
if (questionIds.length > 0) {
  const want = new Set(questionIds);
  const found = rawItems.filter(r => want.has((r as any).questionId || (r as any).id));
  pool = found;

  // Compute shortage for missing IDs
  const foundIds = new Set(found.map(r => (r as any).questionId || (r as any).id));
  const missing = questionIds.filter(id => !foundIds.has(id));
  if (missing.length > 0) {
    setShortage({ requested: questionIds.length, got: found.length });
  } else {
    setShortage(null);
  }
}
    if (targetYears.length) {
      const allowed = new Set(targetYears);
      pool = rawItems.filter(q => allowed.has(Number(q.examYear)));
    }

    // 3) Sample câu
    let chosen: typeof pool;
    if (questionIds.length > 0) {
      chosen = [...pool];
    } else {
      chosen = sampleN(pool, count);
      if (pool.length < count) {
        chosen = [...pool];
        setShortage({ requested: count, got: pool.length });
      } else {
        setShortage(null);
      }
    }

    // 4) Build view & expectedMultiCount (đếm số đáp án đúng)
    const view: ViewQuestion[] = chosen.map((raw) => {
      const ja = toQARenderItemFromSnapshot(raw, 'JA');
      const vi = toQARenderItemFromSnapshot(raw, 'VI');
      const order = shuffle ? shuffled(makePermutation(ja.options.length)) : makePermutation(ja.options.length);

      const expectedMultiCount = ja.options.filter(o => o.isAnswer).length;

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
        expectedMultiCount,
      };
    });

    setQuestions(view);
    setIndex(0);
    setStarted(true);
    setStartedAtMs(Date.now());

    // 5) Attempts: tạo session nếu đã đăng nhập
    try {
      const auth = getAuth();
      if (auth.currentUser?.uid) {
        const { sessionId } = await createAttemptSession({
          courseId: course,
          subjectId: subject,
          total: view.length,
        });
        setSessionId(sessionId);
      }
    } catch (e) {
      console.warn('[attempts] create session failed:', e);
    }

    // Cuộn lên đầu
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ----------- Helpers UI ----------- */
  function goto(i: number) {
    setIndex(prev => Math.min(Math.max(i, 0), questions.length - 1));
  }
  function selectOption(qIdx: number, shuffledIndex: number) {
    setQuestions(prev => prev.map((q, i) => (i === qIdx ? { ...q, selectedIndex: shuffledIndex } : q)));
  }

  /* ----------- Nộp 1 câu ----------- */
  function submitOne(qIdx: number) {
    setQuestions(prev =>
      prev.map((q, i) => {
        if (i !== qIdx || q.submitted) return q;
        const optsInOrder = q.order.map(k => q.ja.options[k]);
        const res = gradeByIndex(q.selectedIndex, optsInOrder);
        const multi = res.multiCorrect || q.expectedMultiCount > 1;

        const next = {
          ...q,
          submitted: true,
          multiCorrect: multi,
          correctShuffledIndexes: res.correctShuffledIndexes,
          // Multi-correct → mọi lựa chọn đều đúng
          isCorrect: multi ? true : res.isCorrect,
        };

        // ✅ Chỉ ghi wrong khi KHÔNG multi-correct và trả SAI
        if (!multi && next.isCorrect === false) {
          bumpWrong({
            questionId: q.id,
            courseId: q.courseId,
            subjectId: q.subjectId,
            examYear: q.examYear,
          }).catch(console.warn);
        }

        return next;
      }),
    );

    // Sau khi state cập nhật, tính correct/blank và lưu progress
    setTimeout(() => {
      const snapshot = (prevQuestions => prevQuestions)(questions); // closure capture
      const now = snapshot.map((q, i) => i === qIdx ? { ...q, submitted: true } : q);
      const correctCount = now.filter(x => x.submitted && (x.isCorrect === true)).length;
      const blankCount = now.filter(x => x.selectedIndex == null).length;
      if (sessionId) {
        updateAttemptSession(sessionId, { correct: correctCount, blank: blankCount })
          .catch(err => console.warn('[attempts] update session failed:', err));
      }
    }, 0);
  }

  /* ----------- UI trạng thái ----------- */
  if (!subject) {
    return <main style={{ padding: 24 }}>Thiếu tham số <code>?subject=...</code>. Ví dụ: <code>?subject=TK</code></main>;
  }
  if (loading) return <main style={{ padding: 24 }}>Đang tải dữ liệu…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!rawItems.length) return <main style={{ padding: 24 }}>Chưa có câu hỏi cho môn {subject}.</main>;

  /* ----------- Màn hình “Bắt đầu” ----------- */
  if (!started) {
    const yearsText =
      explicitYears?.length ? explicitYears.join(', ')
      : randomLast ? `${randomLast} năm gần nhất`
      : 'Tất cả năm có dữ liệu';

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          {course} / {subject} — Thiết lập đã chọn
        </h1>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
          <div><div style={{ color: '#667085', fontSize: 12 }}>Số câu</div><div style={{ fontWeight: 700 }}>{count}</div></div>
          <div><div style={{ color: '#667085', fontSize: 12 }}>Năm</div><div style={{ fontWeight: 700 }}>{yearsText}</div></div>
          <div><div style={{ color: '#667085', fontSize: 12 }}>Trộn đáp án</div><div style={{ fontWeight: 700 }}>{shuffle ? 'Có' : 'Không'}</div></div>

          <div>
            <button
              onClick={startSession}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}
            >
              Bắt đầu
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* ----------- Màn hình làm bài ----------- */
  const q = questions[index];
  const jaOpts = q.order.map(k => q.ja.options[k]);
  const viOpts = q.order.map(k => q.vi.options[k]);
  const selected = q.selectedIndex;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {subject} — Luyện theo môn
      </h1>

      {/* Thiếu câu */}
      {shortage && (
        <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', borderRadius: 8, padding: 10, marginBottom: 12 }}>
          Không đủ số câu bạn yêu cầu: đã chọn {shortage.requested}, nhưng chỉ có {shortage.got} câu phù hợp. Hệ thống sẽ dùng {shortage.got} câu hiện có.
        </div>
      )}

      {/* Banner multi-correct */}
      {q.expectedMultiCount > 1 && !q.submitted && (
        <div style={{ border: '1px solid #60a5fa', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: 10, marginBottom: 12 }}>
          Câu này có <b>{q.expectedMultiCount}</b> đáp án đúng
        </div>
      )}

      {/* Điều hướng */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={() => goto(index - 1)} disabled={index === 0} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>前へ / Trước</button>
        <div>{index + 1} / {questions.length}</div>
        <button onClick={() => goto(index + 1)} disabled={index === questions.length - 1} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>次へ / Tiếp</button>
      </div>

      {/* Thân câu hỏi */}
      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          問 {index + 1}: {q.ja.text || q.vi.text || '(No content)'}
        </div>

        {q.ja.image && <img src={q.ja.image} alt="" style={{ maxWidth: '100%', marginBottom: 8 }} />}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {jaOpts.map((opt, i) => {
            const selectedThis = selected === i;
            const showResult = !!q.submitted;
            const isCorrectChoice = !!q.correctShuffledIndexes && q.correctShuffledIndexes.includes(i);
            const isWrongPicked = showResult && selectedThis && !isCorrectChoice && !(q.multiCorrect);

            return (
              <li key={i}
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 8,
                    background: q.submitted
                      ? ( (q.multiCorrect || isCorrectChoice) ? '#ecfdf3' : (isWrongPicked ? '#fef2f2' : '#fff') )
                      : '#fff',
                  }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={selectedThis}
                    onChange={() => selectOption(index, i)}
                    disabled={q.submitted}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div>{opt.text || viOpts[i]?.text || '(Không có nội dung)'}</div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {/* Nộp 1 câu */}
        {!q.submitted && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => submitOne(index)}
              disabled={q.selectedIndex == null}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3', background: q.selectedIndex != null ? '#175cd3' : '#94a3b8', color: '#fff', fontWeight: 700 }}
            >
              解答を提出 / Nộp câu
            </button>

            {/* Nộp toàn bài & lưu attempts */}
            <button
              onClick={async () => {
                // chấm mọi câu chưa nộp theo quy tắc multi-correct
                const graded = questions.map(q => {
                  if (q.submitted) return q;
                  const optsInOrder = q.order.map(k => q.ja.options[k]);
                  const res = gradeByIndex(q.selectedIndex, optsInOrder);
                  const multi = res.multiCorrect || q.expectedMultiCount > 1;
                  return {
                    ...q,
                    submitted: true,
                    multiCorrect: multi,
                    correctShuffledIndexes: res.correctShuffledIndexes,
                    isCorrect: multi ? true : res.isCorrect,
                  };
                });
                setQuestions(graded);

                // tính điểm
                const total = graded.length;
                const correct = graded.filter(x => x.isCorrect).length;
                const blank = graded.filter(x => x.selectedIndex == null).length;
                const durationSec = startedAtMs ? Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)) : undefined;
                const score = total ? Math.round((correct / total) * 100) : 0;

                // tags từ URL nếu có
                const tagsParam = sp.get('tags');
                const tags = tagsParam ? tagsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;

                try {
                  const auth = getAuth();
                  if (auth.currentUser?.uid) {
                    if (sessionId) {
                      await updateAttemptSession(sessionId, { correct, blank });
                    }
                    await finalizeAttempt({
                      courseId: course,
                      subjectId: subject,
                      examYear: 0,
                      total, correct, blank, score,
                      durationSec, tags,
                      sessionId: sessionId ?? null,
                    });
                    alert('Đã lưu kết quả.');
                  } else {
                    alert('Chưa đăng nhập: kết quả chỉ xem tại chỗ, không lưu lên tài khoản.');
                  }
                } catch (e) {
                  console.error('[attempts] finalize failed:', e);
                  alert('Không thể lưu kết quả, thử lại sau.');
                }
              }}
              className=""
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #111', background: '#111', color: '#fff', fontWeight: 700 }}
            >
              Kết thúc & lưu kết quả
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
