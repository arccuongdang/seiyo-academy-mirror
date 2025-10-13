'use client';

/**
 * =============================================================================
 *  Practice Start — Luyện theo môn (mode=subject)
 * -----------------------------------------------------------------------------
 *  Nhận tham số từ Filter:
 *   - subject=SID              (bắt buộc)
 *   - count=5|10|15|20|25      (số câu muốn lấy)
 *   - shuffle=0|1              (trộn đáp án; không trộn câu)
 *   - EITHER:
 *       randomLast=5|10        (N năm gần nhất trong dữ liệu hiện có)
 *     OR
 *       years=YYYY,YYYY        (danh sách năm cụ thể)
 *
 *  Hành vi:
 *   - Load RAW theo (course, subject)
 *   - Lọc theo "randomLast" hoặc "years"
 *   - Lấy đến "count" câu ngẫu nhiên; nếu không đủ → dùng số câu thực có và
 *     hiển thị cảnh báo
 *   - Trộn ĐÁP ÁN theo cùng hoán vị cho JA/VI (KHÔNG trộn câu)
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Loaders & formatters (Plan B)
import { loadRawQuestionsFor } from '../../../../../lib/qa/excel';
import { toQARenderItemFromSnapshot } from '../../../../../lib/qa/formatters';

// Types
import type {
  QuestionSnapshotItem,
  QARenderItem,
  QARenderOption,
} from '../../../../../lib/qa/schema';

/* =============================================================================
 * SECTION 1. Utilities
 * ========================================================================== */

/** Parse CSV years to numbers */
function parseYearsCSV(v: string | null): number[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/** Build a permutation 0..n-1 */
function makePermutation(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/** Shuffle an array (Fisher–Yates), return new array */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick up to N items randomly (no replacement) */
function sampleN<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr];
  return shuffled(arr).slice(0, n);
}

/** Grade single-choice based on selected shuffled index */
function gradeByIndex(selectedIndex: number | null, options: QARenderOption[]) {
  const correct = options
    .map((o, i) => (o.isAnswer ? i : -1))
    .filter((i) => i >= 0);
  return {
    correctShuffledIndexes: correct,
    multiCorrect: correct.length > 1,
    isCorrect: selectedIndex != null ? correct.includes(selectedIndex) : false,
  };
}

/* =============================================================================
 * SECTION 2. View types
 * ========================================================================== */

type ViewQuestion = {
  id: string;
  examYear: number;
  courseId: string;
  subjectId: string;

  ja: QARenderItem;
  vi: QARenderItem;

  order: number[];             // permutation over options indexes (apply to JA/VI)
  selectedIndex: number | null;
  submitted: boolean;
  isCorrect?: boolean;
  correctShuffledIndexes?: number[];
  multiCorrect?: boolean;
};

/* =============================================================================
 * SECTION 3. Component
 * ========================================================================== */

export default function PracticeStart({ params }: { params: { course: string } }) {
  const { course } = params;
  const sp = useSearchParams();

  // ---- Required params ------------------------------------------------------
  const subject = sp.get('subject') || '';

  // ---- Optional params from Filter -----------------------------------------
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

  // ---- Data states ----------------------------------------------------------
  const [rawItems, setRawItems] = useState<QuestionSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- Working states -------------------------------------------------------
  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [shortage, setShortage] = useState<{ requested: number; got: number } | null>(null);

  // ---- Load RAW -------------------------------------------------------------
  useEffect(() => {
    if (!subject) return;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const raws = await loadRawQuestionsFor(course, subject); // pick latest snapshot for subject
        setRawItems(raws);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu');
        setLoading(false);
      }
    })();
  }, [course, subject]);

  // ---- Derive years present in data ----------------------------------------
  const yearsDesc = useMemo(() => {
    const set = new Set<number>();
    for (const q of rawItems) {
      const y = Number(q.examYear);
      if (Number.isFinite(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [rawItems]);

  // ---- Apply filter params to build session --------------------------------
  function startSession() {
    if (!rawItems.length) return;

    // 1) Select year set
    let targetYears: number[] = [];
    if (explicitYears) {
      // keep only years that actually exist in data
      const has = new Set(yearsDesc);
      targetYears = explicitYears.filter((y) => has.has(y));
    } else if (randomLast) {
      targetYears = yearsDesc.slice(0, randomLast); // if fewer years, this returns all available (OK)
    } else {
      // fallback: if nothing specified, use all available years
      targetYears = yearsDesc;
    }

    // 2) Filter pool by years
    let pool = rawItems;
    if (targetYears.length) {
      const allowed = new Set(targetYears);
      pool = rawItems.filter((q) => allowed.has(Number(q.examYear)));
    }

    // 3) Sample N
    let chosen = sampleN(pool, count);
    // if not enough, keep all and raise warning
    if (pool.length < count) {
      chosen = [...pool];
      setShortage({ requested: count, got: pool.length });
    } else {
      setShortage(null);
    }

    // 4) Build ViewQuestion with option order
    const view: ViewQuestion[] = chosen.map((raw) => {
      const ja = toQARenderItemFromSnapshot(raw, 'JA');
      const vi = toQARenderItemFromSnapshot(raw, 'VI');
      const order = shuffle ? shuffled(makePermutation(ja.options.length)) : makePermutation(ja.options.length);
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
      };
    });

    setQuestions(view);
    setIndex(0);
    setStarted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---- Interactions ---------------------------------------------------------
  function goto(i: number) {
    setIndex((prev) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      return next;
    });
  }

  function selectOption(qIdx: number, shuffledIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, selectedIndex: shuffledIndex } : q)),
    );
  }

  function submitOne(qIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx || q.submitted) return q;
        const optsInOrder = q.order.map((k) => q.ja.options[k]); // grade by JA order
        const res = gradeByIndex(q.selectedIndex, optsInOrder);
        return {
          ...q,
          submitted: true,
          isCorrect: res.isCorrect,
          correctShuffledIndexes: res.correctShuffledIndexes,
          multiCorrect: res.multiCorrect,
        };
      }),
    );
  }

  // ---- Guards ---------------------------------------------------------------
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
  // 1) MÀN HÌNH TÓM TẮT FILTER
  // =======================
  if (!started) {
    const yearsText =
      explicitYears?.length
        ? explicitYears.join(', ')
        : randomLast
        ? `${randomLast} năm gần nhất`
        : 'Tất cả năm có dữ liệu';

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
          {course} / {subject} — Thiết lập đã chọn
        </h1>

        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
          <div>
            <div style={{ color: '#667085', fontSize: 12 }}>Số câu</div>
            <div style={{ fontWeight: 700 }}>{count}</div>
          </div>

          <div>
            <div style={{ color: '#667085', fontSize: 12 }}>Năm</div>
            <div style={{ fontWeight: 700 }}>{yearsText}</div>
          </div>

          <div>
            <div style={{ color: '#667085', fontSize: 12 }}>Trộn đáp án</div>
            <div style={{ fontWeight: 700 }}>{shuffle ? 'Có' : 'Không'}</div>
          </div>

          <div>
            <button
              onClick={startSession}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #175cd3',
                background: '#175cd3',
                color: '#fff',
                fontWeight: 700,
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
  const viOpts = q.order.map((k) => q.vi.options[k]);
  const selected = q.selectedIndex;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
        {course} / {subject} — Luyện theo môn
      </h1>

      {shortage && (
        <div
          style={{
            border: '1px solid #f59e0b',
            background: '#fffbeb',
            color: '#92400e',
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
          }}
        >
          Không đủ số câu bạn yêu cầu: đã chọn {shortage.requested}, nhưng chỉ có {shortage.got} câu phù hợp. Hệ thống sẽ dùng {shortage.got} câu hiện có.
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

      {/* Card câu hỏi */}
      <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>
            問 {index + 1}: {q.ja.text || q.vi.text || '(No content)'}
          </div>
        </div>

        {q.ja.image && (
          <img src={q.ja.image} alt="" style={{ maxWidth: '100%', marginBottom: 8 }} />
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {jaOpts.map((opt, i) => {
            const selectedThis = selected === i;
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

        {!q.submitted && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => submitOne(index)}
              disabled={q.selectedIndex == null}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #175cd3',
                background: q.selectedIndex != null ? '#175cd3' : '#94a3b8',
                color: '#fff',
                fontWeight: 700,
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
