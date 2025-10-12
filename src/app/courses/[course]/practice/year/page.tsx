'use client';

/**
 * Year Practice Page (clean version)
 * ---------------------------------------------------------
 * Mục tiêu:
 * - Tải bộ đề năm {examYear} cho {course}/{subject}
 * - Cho phép chọn đáp án (single-choice), “Nộp toàn bài”
 * - Lấy rule đỗ theo khóa học (per-course passing rules), hiển thị đồng hồ nếu có
 * - Tính ĐẬU/RỚT, hiển thị bảng tổng hợp + danh sách câu (lọc tất cả / chỉ sai)
 * - Ghi attempts lên Firestore, snapshot rule áp dụng
 *
 * Chú ý:
 * - Đây là Client Component; trang dùng useSearchParams nên được bọc <Suspense />
 * - Không bọc Auth/Profile ở từng page vì đã có /courses/layout.tsx
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// Tải dữ liệu câu hỏi từ snapshot excel
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '../../../../../lib/qa/excel';
// Map data snapshot → QARenderItem; xáo đáp án
import { toQARenderItem, shuffleOptions } from '../../../../../lib/qa/formatters';
// Kiểu dữ liệu câu hỏi
import type { QARenderItem, QAOption } from '../../../../../lib/qa/schema';

// Firestore client & helpers (user, time)
import { db, requireUser, serverTimestamp } from '../../../../../lib/firebase/client';
import { collection, addDoc } from 'firebase/firestore';

// Chuẩn đỗ theo khóa/môn/năm
import { getPassingRule, type PassingRule } from '../../../../../lib/passing/rules';

// ---------------------------------------------
// Các kiểu phục vụ render trong trang
// ---------------------------------------------
type ViewQuestion = {
  id: string;
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  questionTextJA?: string | null;
  questionTextVI?: string | null;
  questionImage?: string | null;
  options: QAOption[];

  // UI state per-question
  selectedId?: number | null; // đổi sang number|null
  submitted?: boolean;        // đã chấm chưa (sau khi nộp toàn bài)
  isCorrect?: boolean;        // kết quả của câu

  // Toggle dịch
  showVIQuestion?: boolean;
  showVIOption?: Record<number, boolean>; // index theo key (number) → true/false
};

type ScoreSummary = { total: number; correct: number; blank: number };

// ---------------------------------------------
// Component lồng để dùng useSearchParams trong <Suspense>
// ---------------------------------------------
function YearPracticeInner({ params }: { params: { course: string } }) {
  const search = useSearchParams();

  // Các tham số URL
  const subject = search.get('subject') || '';      // ví dụ TK/PL/KC/TC
  const yearParam = search.get('year');             // ví dụ '2024'
  const examYear = yearParam ? Number(yearParam) : null;

  // Trạng thái dữ liệu và UI
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState<ScoreSummary>({ total: 0, correct: 0, blank: 0 });
  const [tab, setTab] = useState<'all' | 'wrong'>('all');

  // Chuẩn đỗ & đồng hồ
  const [rule, setRule] = useState<PassingRule | null>(null);
  const [ruleMeta, setRuleMeta] = useState<{ source: string; overrideId: string | null; version: number; publishedAt: any }>({
    source: 'default',
    overrideId: null,
    version: 1,
    publishedAt: null,
  });
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);

  // -------------------------------------------------
  // 1) Tải dữ liệu đề theo course/subject/year
  // -------------------------------------------------
  useEffect(() => {
    if (!subject || !examYear) return;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        // 1) manifest → 2) file snapshot mới nhất theo course/subject → 3) tải snapshot → 4) map về QARenderItem
        const manifest = await loadManifest();
        const filename = pickLatestFile(manifest, params.course, subject);
        if (!filename) {
          setErr(`Không tìm thấy snapshot cho ${params.course}/${subject}. Hãy publish dữ liệu ở /admin/data.`);
          setLoading(false);
          return;
        }

        const snapshot = await loadSubjectSnapshot(params.course, subject, filename);
        const items = snapshot.items
          .map(toQARenderItem)
          .filter((q) => q.examYear === examYear);

        if (items.length === 0) {
          setErr(`Chưa có câu hỏi cho ${params.course}/${subject} năm ${examYear}.`);
          setLoading(false);
          return;
        }

        const pick25 = items.slice(0, 25).map((q) => ({
          ...q,
          options: shuffleOptions(q.options),
        }));

        // Map sang ViewQuestion
        const viewList: ViewQuestion[] = pick25.map((q) => ({
          id: q.id,
          courseId: q.courseId,
          subjectId: q.subjectId,
          examYear: q.examYear ?? null,
          questionTextJA: q.questionTextJA ?? '',
          questionTextVI: q.questionTextVI ?? '',
          questionImage: q.questionImage ?? null,
          options: q.options,              // ❗ không ép key sang string nữa
          selectedId: null,                // number|null
          submitted: false,
          isCorrect: undefined,
          showVIQuestion: false,
          showVIOption: {} as Record<number, boolean>,
        }));

        setQuestions(viewList);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải đề');
        setLoading(false);
      }
    })();
  }, [params.course, subject, examYear]);

  // -------------------------------------------------
  // 2) Lấy Passing Rule cho course/subject/year
  //    - Mục đích: áp dụng chuẩn đỗ & đồng hồ
  // -------------------------------------------------
  useEffect(() => {
    if (!subject || !examYear || questions.length === 0) return;

    (async () => {
      const { rule: resolved, source, overrideId, version, publishedAt } = await getPassingRule(db, params.course, {
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
  }, [params.course, subject, examYear, questions.length]);

  // -------------------------------------------------
  // 3) Đồng hồ đếm ngược (nếu rule có timeLimitSec + showClock)
  //    - Hết giờ: gọi nộp bài tổng hợp (endExamAndGrade)
  // -------------------------------------------------
  useEffect(() => {
    if (finished) return;
    if (timeLeftSec == null) return;

    if (timeLeftSec <= 0) {
      // Hết giờ: nộp toàn bài để chấm & lưu attempt
      endExamAndGrade();
      return;
    }
    const t = setTimeout(() => setTimeLeftSec((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeftSec, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------
  // 4) Chọn đáp án cho 1 câu (single-choice)
  //    - Không chấm ngay; chỉ ghi selectedId
  // -------------------------------------------------
  const onSelect = (qIdx: number, optionKey: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIdx];
      if (!q || q.submitted) return prev;
      next[qIdx] = { ...q, selectedId: optionKey };
      return next;
    });
  };

  // -------------------------------------------------
  // 5) Nộp toàn bài: tính điểm, xác định ĐẬU/RỚT theo rule, lưu attempt
  //    - Ghi chú:
  //      * Tính từ state cục bộ và biến tạm, không đọc score ngay sau setState
  //      * Snapshot rule vào attempt để đảm bảo lịch sử nhất quán
  // -------------------------------------------------
  const endExamAndGrade = async () => {
    if (finished) return;
    try {
      // Tính điểm từ questions hiện tại
      const local = questions.map((q) => {
        const correctIds = q.options.filter((o) => o.isAnswer).map((o) => o.key); // number[]
        const isCorrect = q.selectedId != null ? correctIds.includes(q.selectedId) : false;
        const isBlank = q.selectedId == null;
        return { id: q.id, isCorrect, isBlank };
      });

      const total = questions.length;
      const correct = local.filter((x) => x.isCorrect).length;
      const blank = local.filter((x) => x.isBlank).length;

      // Cập nhật lại trạng thái từng câu = submitted
      setQuestions((prev) =>
        prev.map((q) => {
          const row = local.find((x) => x.id === q.id);
          return {
            ...q,
            submitted: true,
            isCorrect: row ? row.isCorrect : false,
          };
        })
      );

      // Xác định ĐẬU/RỚT theo rule hiện hành
      let passed = false;
      if (rule) {
        if (typeof rule.minCorrect === 'number') {
          passed = correct >= rule.minCorrect;
        } else if (typeof rule.passPercent === 'number') {
          const pct = total ? (correct / total) * 100 : 0;
          passed = pct >= rule.passPercent;
        }
      }

      // Lưu attempt (root collection "attempts")
      const u = await requireUser();
      const now = serverTimestamp();
      await addDoc(collection(db, 'attempts'), {
        userId: u.uid,
        mode: 'year',
        courseId: params.course,
        subjectId: subject,
        examYear,
        total,
        correct,
        blank,
        durationSec: null, // (tuỳ bạn: nếu có startedAt, set duration = now - startedAt)
        passed,
        createdAt: now,
        ruleSnapshot: {
          courseId: params.course,
          source: ruleMeta.source,
          overrideId: ruleMeta.overrideId,
          version: ruleMeta.version,
          publishedAt: ruleMeta.publishedAt || null,
          passPercent: rule?.passPercent ?? null,
          minCorrect: rule?.minCorrect ?? null,
          timeLimitSec: rule?.timeLimitSec ?? null,
          showClock: typeof rule?.showClock === 'boolean' ? rule!.showClock : null,
        },
      });

      setScore({ total, correct, blank });
      setFinished(true);
    } catch (e: any) {
      setErr(e?.message || 'Nộp bài thất bại');
    }
  };

  // -------------------------------------------------
  // 6) Hiển thị giao diện
  //    - Trước khi nộp: danh sách câu, chọn đáp án, đồng hồ, rule
  //    - Sau khi nộp: tổng hợp điểm + danh sách câu (lọc all/wrong)
  // -------------------------------------------------

  // Header rule + đồng hồ (trước khi nộp)
  const HeaderBar = useMemo(() => {
    if (finished || !rule) return null;
    const clock = rule.showClock && typeof rule.timeLimitSec === 'number';
    const timeForUi = clock ? (timeLeftSec ?? rule.timeLimitSec!) : null;
    return (
      <div style={{ marginBottom: 8, color: '#667085' }}>
        Chuẩn đỗ:&nbsp;
        {typeof rule.minCorrect === 'number' ? `≥ ${rule.minCorrect} câu` : ''}
        {typeof rule.passPercent === 'number' ? `${typeof rule.minCorrect === 'number' ? '・' : ''}≥ ${rule.passPercent}%` : ''}
        {clock && (
          <> ・ Thời gian: <b>{Math.floor((timeForUi!)/60)}m{(timeForUi!%60)}s</b></>
        )}
      </div>
    );
  }, [finished, rule, timeLeftSec]);

  // Màn hình khi đã nộp
  if (finished) {
    const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;
    const yearLabel = questions[0]?.examYear ?? '—';

    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
          {params.course} / {subject} — Kết quả bài {yearLabel}年度
        </h1>

        {/* Badge ĐẬU / RỚT */}
        <div style={{ marginBottom: 10 }}>
          {(rule && (typeof rule.minCorrect === 'number' || typeof rule.passPercent === 'number')) ? (
            (score.correct >= (rule.minCorrect ?? -Infinity) ||
             (typeof rule.passPercent === 'number' && (score.correct / (score.total || 1)) * 100 >= rule.passPercent)) ? (
              <span style={{ padding: '4px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>ĐẬU</span>
            ) : (
              <span style={{ padding: '4px 8px', borderRadius: 999, background: '#fee2e2', color: '#991b1b' }}>RỚT</span>
            )
          ) : (
            <span style={{ padding: '4px 8px', borderRadius: 999, background: '#e5e7eb', color: '#111827' }}>Chưa có rule</span>
          )}
        </div>

        {/* Tổng hợp điểm */}
        <section style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Tổng hợp điểm</div>
              <div style={{ marginLeft: 'auto', color: '#667085' }}>
                正答 {score.correct}/{score.total}（{pct}%）・未回答 {score.blank}
              </div>
            </div>
            <div style={{ marginTop: 10, height: 8, background: '#f2f4f7', borderRadius: 999 }}>
              <div
                style={{
                  width: `${pct}%`, height: 8, borderRadius: 999, background: '#16a34a',
                  transition: 'width 300ms ease'
                }}
              />
            </div>

            {/* Filter xem lại */}
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

        {/* Danh sách câu để xem lại */}
        <section style={{ display: 'grid', gap: 12 }}>
          {questions
            .filter((q) => (tab === 'all' ? true : q.isCorrect === false))
            .map((q, idx) => {
              const selected = q.options.find((o) => o.key === q.selectedId);
              const corrects = q.options.filter((o) => o.isAnswer).map((o) => o.key); // number[]

              const isCorrect = q.isCorrect === true;

              return (
                <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    Câu {idx + 1}: {q.questionTextJA || '(No text)'}
                    <button
                      onClick={() => {
                        setQuestions((prev) => {
                          const next = [...prev];
                          const cur = next[idx];
                          next[idx] = { ...cur, showVIQuestion: !cur.showVIQuestion };
                          return next;
                        });
                      }}
                      style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                    >
                      VI
                    </button>
                  </div>

                  {q.showVIQuestion && q.questionTextVI && (
                    <div style={{ color: '#475467', marginBottom: 6 }}>{q.questionTextVI}</div>
                  )}

                  {q.questionImage && (
                    <img
                      src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${q.questionImage}`}
                      alt=""
                      style={{ maxWidth: '100%', marginBottom: 8 }}
                    />
                  )}

                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {q.options.map((opt) => {
                      const isAns = opt.isAnswer;
                      const picked = String(opt.key) === q.selectedId;
                      return (
                        <li key={opt.key} style={{
                          border: '1px solid #f0f0f0',
                          borderRadius: 8, padding: 10, marginBottom: 8,
                          background: isAns ? '#ecfdf5' : (picked && !isAns ? '#fef2f2' : '#fff')
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <strong>{opt.key}.</strong>
                            <span>{opt.textJA || '(No text)'}</span>
                            <button
                              onClick={() => {
                                setQuestions((prev) => {
                                  const next = [...prev];
                                  const cur = next[idx];
                                  const s = { ...(cur.showVIOption || {}) };
                                  const k = opt.key;
                                  s[k] = !s[k];
                                  next[idx] = { ...cur, showVIOption: s };
                                  return next;
                                });
                              }}
                              style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                            >
                              VI
                            </button>
                          </div>
                          {q.showVIOption?.[String(opt.key)] && (opt.textVI || opt.explanationVI) && (
                            <div style={{ color: '#475467', marginTop: 4 }}>
                              {opt.textVI}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {/* Giải thích chung nếu có */}
                  {(q as any).explanationGeneralJA && (
                    <details style={{ marginTop: 8 }}>
                      <summary>解説 / Lời giải</summary>
                      <div style={{ marginTop: 6 }}>{(q as any).explanationGeneralJA}</div>
                      {(q as any).explanationGeneralVI && (
                        <div style={{ color: '#475467', marginTop: 4 }}>{(q as any).explanationGeneralVI}</div>
                      )}
                    </details>
                  )}

                  {/* Dòng trạng thái */}
                  <div style={{ marginTop: 8, color: isCorrect ? '#166534' : '#991b1b' }}>
                    {isCorrect ? 'Đúng' : `Sai — Đáp án đúng: ${corrects.join(', ')}`}
                    {selected && !isCorrect && ` ・Bạn chọn: ${String(selected.key)}`}
                  </div>
                </div>
              );
            })}
        </section>

        <div style={{ marginTop: 16 }}>
          <a href={`/courses/${params.course}`} style={{ color: '#175cd3', textDecoration: 'underline' }}>
            ← Quay lại môn học
          </a>
        </div>
      </main>
    );
  }

  // Chưa nộp: render danh sách câu để làm
  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!subject || !examYear) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code> và/hoặc <code>?year=...</code>
      </main>
    );
  }
  if (questions.length === 0) {
    return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
        {params.course} / {subject} — {examYear}年度（年別演習）
      </h1>

      {/* Rule + Đồng hồ */}
      {HeaderBar}

      {/* Danh sách câu hỏi */}
      <section style={{ display: 'grid', gap: 12 }}>
        {questions.map((q, idx) => (
          <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Câu {idx + 1}: {q.questionTextJA || '(No text)'}
              <button
                onClick={() => {
                  setQuestions((prev) => {
                    const next = [...prev];
                    const cur = next[idx];
                    next[idx] = { ...cur, showVIQuestion: !cur.showVIQuestion };
                    return next;
                  });
                }}
                style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
              >
                VI
              </button>
            </div>

            {q.showVIQuestion && q.questionTextVI && (
              <div style={{ color: '#475467', marginBottom: 6 }}>{q.questionTextVI}</div>
            )}

            {q.questionImage && (
              <img
                src={`/images/${q.courseId}/${q.subjectId}/${q.examYear}/${q.questionImage}`}
                alt=""
                style={{ maxWidth: '100%', marginBottom: 8 }}
              />
            )}

            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {q.options.map((opt) => {
                const picked = opt.key === q.selectedId;
                return (
                  <li key={String(opt.key)} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        checked={picked}
                        onChange={() => onSelect(idx, opt.key)}
                        style={{ marginTop: 2 }}
                      />
                      <strong>{opt.key}.</strong>
                      <span>{opt.textJA || '(No text)'}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setQuestions((prev) => {
                            const next = [...prev];
                            const cur = next[idx];
                            const s = { ...(cur.showVIOption || {}) };
                            const k = opt.key;
                            s[k] = !s[k];
                            next[idx] = { ...cur, showVIOption: s };
                            return next;
                          });
                        }}
                        style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                      >
                        VI
                      </button>
                    </label>
                    {q.showVIOption?.[opt.key] && opt.textVI && (
                      <div style={{ color: '#475467', marginTop: 4 }}>{opt.textVI}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Nút Nộp toàn bài */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          onClick={endExamAndGrade}
          style={{
            padding: '10px 14px', borderRadius: 8,
            border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700
          }}
        >
          Nộp bài / 解答を提出
        </button>
      </div>
    </main>
  );
}

// ---------------------------------------------
// Wrapper với Suspense vì dùng useSearchParams()
// ---------------------------------------------
export default function YearPracticePage(props: { params: { course: string } }) {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <YearPracticeInner {...props} />
    </Suspense>
  );
}
