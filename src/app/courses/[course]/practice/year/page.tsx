'use client';

/**
 * Year Practice Page (clean)
 * ---------------------------------------------------------
 * Chức năng:
 * 1) Tải đề theo course/subject/year từ snapshot
 * 2) Cho chọn đáp án (single-choice), nộp toàn bài
 * 3) Lấy “chuẩn đỗ” theo khóa/môn/năm (getPassingRule), hiển thị đồng hồ nếu có
 * 4) Chấm điểm → ĐẬU/RỚT + hiển thị tổng hợp; lưu attempt kèm snapshot rule
 * 5) Nút “VI” hiển thị bản dịch Việt cho câu/đáp án (mặc định giao diện JA)
 *
 * Lưu ý:
 * - Đây là Client Component; vì dùng useSearchParams nên trang cha cần bọc <Suspense />
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// 1) Nguồn dữ liệu câu hỏi (snapshot Excel)
import { loadManifest, pickLatestFile, loadSubjectSnapshot } from '../../../../../lib/qa/excel';
// 2) Chuẩn hóa item → QARenderItem + random đáp án
import { toQARenderItem, shuffleOptions } from '../../../../../lib/qa/formatters';
// 3) Kiểu dữ liệu
import type { QARenderItem, QAOption } from '../../../../../lib/qa/schema';
// 4) Hàm chấm 1-câu single-choice (đã có trong repo)
import { gradeSingleChoice } from '../../../../../lib/qa/grade';

// 5) Firestore client
import { db, requireUser, serverTimestamp } from '../../../../../lib/firebase/client';
import { collection, addDoc } from 'firebase/firestore';

// 6) Passing rule (admin cấu hình)
import { getPassingRule, type PassingRule } from '../../../../../lib/passing/rules';

/** Kiểu dùng cho UI: mỗi câu + state chọn/hiển thị */
type ViewQuestion = {
  id: string;
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  questionTextJA?: string | null;
  questionTextVI?: string | null;
  questionImage?: string | null;
  options: QAOption[];                 // key: number (đúng theo schema)

  // UI state:
  selectedId?: number | null;          // đã chọn (chưa chấm)
  submitted?: boolean;                 // true sau khi nộp toàn bài
  isCorrect?: boolean;                 // kết quả của câu

  // Toggle dịch:
  showVIQuestion?: boolean;
  showVIOption?: Record<number, boolean>;
};

type ScoreSummary = { total: number; correct: number; blank: number };

export default function YearPracticePage({ params }: { params: { course: string } }) {
  const { course } = params;
  const search = useSearchParams();
  const subject = search.get('subject') || '';         // VD: TK/PL/KC/TC
  const yearStr = search.get('year') || '';
  const examYear = yearStr ? Number(yearStr) : null;

  // ---------- State tổng ----------
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ViewQuestion[]>([]);
  const [index, setIndex] = useState(0);               // điều hướng câu trong khi làm
  const [finished, setFinished] = useState(false);     // đã nộp bài?
  const [score, setScore] = useState<ScoreSummary>({ total: 0, correct: 0, blank: 0 });
  const [tab, setTab] = useState<'all' | 'wrong' | 'blank'>('all');

  // ---------- Passing rule + đồng hồ ----------
  const [rule, setRule] = useState<PassingRule | null>(null);
  const [ruleMeta, setRuleMeta] = useState<{ source: string; overrideId: string | null; version: number; publishedAt: any }>({
    source: 'default',
    overrideId: null,
    version: 1,
    publishedAt: null,
  });
  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);

  // =========================================================
  // (A) Tải dữ liệu đề theo course/subject/year
  // =========================================================
  useEffect(() => {
    if (!subject || !examYear) return;
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

        // Map đúng hàm: toQARenderItem (singular)
        const items: QARenderItem[] = snapshot.items.map(toQARenderItem);

        // Lọc theo năm yêu cầu
        const rows = items.filter((q) => q.examYear === examYear);
        if (rows.length === 0) {
          setErr(`Chưa có câu hỏi cho ${subject} năm ${examYear}.`);
          setLoading(false);
          return;
        }

        // Lấy 25 câu đầu (có thể đổi logic random sau)
        const picked = rows.slice(0, 25).map((q) => ({
          ...q,
          options: shuffleOptions(q.options),
        }));

        // Map sang ViewQuestion (giữ key:number)
        const view: ViewQuestion[] = picked.map((q) => ({
          id: q.id,
          courseId: q.courseId,
          subjectId: q.subjectId,
          examYear: q.examYear ?? null,
          questionTextJA: q.questionTextJA ?? '',
          questionTextVI: q.questionTextVI ?? '',
          questionImage: q.questionImage ?? null,
          options: q.options,
          selectedId: null,
          submitted: false,
          isCorrect: undefined,
          showVIQuestion: false,
          showVIOption: {},
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
  }, [course, subject, examYear]);

  // =========================================================
  // (B) Lấy Passing Rule theo course/subject/year + set đồng hồ
  // =========================================================
  useEffect(() => {
    if (!subject || !examYear || questions.length === 0) return;

    (async () => {
      const { rule: resolved, source, overrideId, version, publishedAt } = await getPassingRule(db, course, {
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
  }, [course, subject, examYear, questions.length]);

  // =========================================================
  // (C) Đồng hồ đếm ngược (nếu rule cấu hình thời gian)
  // - Hết giờ ⇒ nộp toàn bài (endExamAndGrade)
  // =========================================================
  useEffect(() => {
    if (finished) return;
    if (timeLeftSec == null) return;

    if (timeLeftSec <= 0) {
      endExamAndGrade();
      return;
    }
    const t = setTimeout(() => setTimeLeftSec((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeftSec, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // =========================================================
  // (D) Handlers khi làm bài
  // =========================================================

  /** Chọn đáp án cho 1 câu (single-choice); chưa chấm ngay */
  const onSelect = (qIdx: number, optionKey: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIdx];
      if (!q || q.submitted) return prev;
      next[qIdx] = { ...q, selectedId: optionKey };
      return next;
    });
  };

  /** Điều hướng câu hiện tại */
  const goto = (i: number) => {
    setIndex((prev) => {
      const next = Math.min(Math.max(i, 0), questions.length - 1);
      return next;
    });
  };

  // =========================================================
  // (E) Nộp toàn bài → chấm điểm, kết luận ĐẬU/RỚT, lưu attempt
  // =========================================================
  const endExamAndGrade = async () => {
    if (finished) return;
    try {
      // 1) Chấm từng câu bằng gradeSingleChoice
      const graded: ViewQuestion[] = questions.map((q) => {
        const res = gradeSingleChoice(q.selectedId != null ? String(q.selectedId) : null, q.options);
        return {
          ...q,
          submitted: true,
          isCorrect: res.isCorrect,
        };
      });


      const total = graded.length;
      const correct = graded.filter((x) => x.isCorrect).length;
      const blank = graded.filter((x) => x.selectedId == null).length;

      setQuestions(graded);
      setScore({ total, correct, blank });

      // 2) Kết luận ĐẬU/RỚT từ rule
      let passed = false;
      if (rule) {
        if (typeof rule.minCorrect === 'number') {
          passed = correct >= rule.minCorrect;
        } else if (typeof rule.passPercent === 'number') {
          const pct = total ? (correct / total) * 100 : 0;
          passed = pct >= rule.passPercent;
        }
      }

      // 3) Lưu attempt (root collection "attempts")
      const u = await requireUser();
      await addDoc(collection(db, 'attempts'), {
        userId: u.uid,
        mode: 'year',
        courseId: course,
        subjectId: subject,
        examYear,
        total,
        correct,
        blank,
        durationSec: null,                 // nếu có startedAt, bạn set sau
        passed,
        createdAt: serverTimestamp(),
        ruleSnapshot: {
          courseId: course,
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

      setFinished(true);
      setTab('all');
    } catch (e: any) {
      setErr(e?.message || 'Nộp bài thất bại');
    }
  };

  // =========================================================
  // (F) UI: Header rule + đồng hồ (khi đang làm)
  // =========================================================
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

  // =========================================================
  // (G) Render
  // =========================================================
  if (!subject || !examYear) {
    return (
      <main style={{ padding: 24 }}>
        Thiếu tham số <code>?subject=...</code> và/hoặc <code>?year=...</code> (VD: <code>?subject=TK&year=2024</code>)
      </main>
    );
  }
  if (loading) return <main style={{ padding: 24 }}>Đang tải đề…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (questions.length === 0) return <main style={{ padding: 24 }}>Chưa có câu hỏi.</main>;

  // Đang làm bài
  if (!finished) {
    const cur = questions[index];
    return (
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
          {course} / {subject} — {examYear} 年度 過去問
        </h1>

        {HeaderBar}

        {/* Thanh điều hướng nhanh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button onClick={() => goto(index - 1)} disabled={index === 0}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>
            前へ / Trước
          </button>
          <div>{index + 1} / {questions.length}</div>
          <button onClick={() => goto(index + 1)} disabled={index === questions.length - 1}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }}>
            次へ / Tiếp
          </button>
        </div>

        {/* Card câu hỏi hiện tại */}
        <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Câu {index + 1}: {cur.questionTextJA || '(No text)'}
            <button
              onClick={() => {
                setQuestions((prev) => {
                  const next = [...prev];
                  next[index] = { ...prev[index], showVIQuestion: !prev[index].showVIQuestion };
                  return next;
                });
              }}
              style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
            >
              VI
            </button>
          </div>

          {cur.showVIQuestion && cur.questionTextVI && (
            <div style={{ color: '#475467', marginBottom: 6 }}>{cur.questionTextVI}</div>
          )}

          {cur.questionImage && (
            <img
              src={`/images/${cur.courseId}/${cur.subjectId}/${cur.examYear}/${cur.questionImage}`}
              alt=""
              style={{ maxWidth: '100%', marginBottom: 8 }}
            />
          )}

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cur.options.map((opt) => {
              const picked = opt.key === cur.selectedId;
              return (
                <li key={opt.key} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={picked}
                      onChange={() => onSelect(index, opt.key)}
                      style={{ marginTop: 2 }}
                    />
                    <strong>{opt.key}.</strong>
                    <span>{opt.textJA || '(No text)'}</span>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setQuestions((prev) => {
                          const next = [...prev];
                          const map = { ...(next[index].showVIOption || {}) };
                          map[opt.key] = !map[opt.key];
                          next[index] = { ...next[index], showVIOption: map };
                          return next;
                        });
                      }}
                      style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                    >
                      VI
                    </button>
                  </label>

                  {cur.showVIOption?.[opt.key] && opt.textVI && (
                    <div style={{ color: '#475467', marginTop: 4 }}>{opt.textVI}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Nút nộp toàn bài */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            onClick={endExamAndGrade}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff', fontWeight: 700 }}
          >
            試験を終了 / Kết thúc bài
          </button>
        </div>
      </main>
    );
  }

  // Đã nộp bài → hiển thị tổng hợp + review
  const pct = score.total ? Math.round((score.correct / score.total) * 100) : 0;
  const yearLabel = questions[0]?.examYear ?? '—';

  const wrongIds = new Set(questions.filter((q) => q.isCorrect === false).map((q) => q.id));
  const blankIds = new Set(questions.filter((q) => q.selectedId == null).map((q) => q.id));
  const list = questions.filter((q) => {
    if (tab === 'wrong') return wrongIds.has(q.id);
    if (tab === 'blank') return blankIds.has(q.id);
    return true;
  });

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
        {course} / {subject} — {yearLabel} 年度 結果 / Kết quả
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

          {/* progress */}
          <div style={{ marginTop: 10, height: 8, background: '#f2f4f7', borderRadius: 999 }}>
            <div
              style={{
                width: `${pct}%`, height: 8, borderRadius: 999, background: '#16a34a',
                transition: 'width 300ms ease'
              }}
            />
          </div>

          {/* bộ lọc review */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setTab('all')}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'all' ? '#eef2ff' : '#fff' }}>
              全問 / Tất cả
            </button>
            <button onClick={() => setTab('wrong')}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'wrong' ? '#fee2e2' : '#fff' }}>
              不正解 / Sai
            </button>
            <button onClick={() => setTab('blank')}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', background: tab === 'blank' ? '#fff3c4' : '#fff' }}>
              未回答 / Chưa làm
            </button>
          </div>
        </div>
      </section>

      {/* Danh sách câu để xem lại (reveal giải) */}
      <section style={{ display: 'grid', gap: 12 }}>
        {list.map((q, idx) => {
          const selected = q.options.find((o) => o.key === q.selectedId);
          const corrects = q.options.filter((o) => o.isAnswer).map((o) => o.key);
          const isCorrect = q.isCorrect === true;

          return (
            <div key={q.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Câu {idx + 1}: {q.questionTextJA || '(No text)'}
                <button
                  onClick={() => {
                    setQuestions((prev) => {
                      const next = [...prev];
                      next[idx] = { ...prev[idx], showVIQuestion: !prev[idx].showVIQuestion };
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
                  const picked = opt.key === q.selectedId;
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
                              const map = { ...(next[idx].showVIOption || {}) };
                              map[opt.key] = !map[opt.key];
                              next[idx] = { ...next[idx], showVIOption: map };
                              return next;
                            });
                          }}
                          style={{ marginLeft: 8, padding: '2px 6px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                        >
                          VI
                        </button>
                      </div>

                      {q.showVIOption?.[opt.key] && (opt.textVI || opt.explanationVI) && (
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
                {selected && !isCorrect && ` ・Bạn chọn: ${selected.key}`}
              </div>
            </div>
          );
        })}
      </section>

      <div style={{ marginTop: 16 }}>
        <a href={`/courses/${course}`} style={{ color: '#175cd3', textDecoration: 'underline' }}>
          ← Quay lại môn học
        </a>
      </div>
    </main>
  );
}
