'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import BilingualText from '../../../../../components/BilingualText';
import { loadSubjectsJson, findSubjectMeta, getCourseDisplayNameJA, getCourseDisplayNameVI, loadRawQuestionsFor } from '../../../../../lib/qa/excel';

type AnswerRow = {
  questionId: string;
  pickedIndexes: number[];   // in SHOWN order
  correctIndexes: number[];  // in SHOWN order
  order?: number[];          // mapping shownIndex -> originalIndex
  isCorrect?: boolean;
  guessed?: boolean;
  confident?: boolean;
};

type AttemptDoc = {
  courseId: string;
  subjectId: string;
  mode: 'subject' | 'year';
  total: number;
  score: number;            // số câu đúng (đã chuẩn hoá theo yêu cầu 7.1)
  durationSec?: number;
  createdAt?: any;
  answers?: AnswerRow[];
};

type RawQ = Record<string, any>;

export default function SummaryPage() {
  const params = useParams<{ course: string }>();
  const search = useSearchParams();
  const attemptId = search.get('attempt') || '';
  const courseIdFromUrl = params?.course as string;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<AttemptDoc | null>(null);
  const [courseJA, setCourseJA] = useState<string>('');
  const [courseVI, setCourseVI] = useState<string>('');
  const [subjectJA, setSubjectJA] = useState<string>('');
  const [subjectVI, setSubjectVI] = useState<string>('');

  const [rawMap, setRawMap] = useState<Record<string, RawQ>>({});

  // Per-question toggles
  const [furiganaOn, setFuriganaOn] = useState<Record<string, boolean>>({});
  const [viOn, setViOn] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);

        const auth = getAuth();
        const uid = auth.currentUser?.uid;
        if (!uid) { setErr('Bạn chưa đăng nhập.'); setLoading(false); return; }

        // Read attempt doc
        const db = getFirestore();
        const ref = doc(db, 'users', uid, 'attempts', attemptId);
        const snap = await getDoc(ref);
        if (!snap.exists()) { setErr('Không tìm thấy kết quả.'); setLoading(false); return; }

        const at = snap.data() as AttemptDoc;
        setAttempt(at);

        // Titles (from subjects.json)
        const subJson = await loadSubjectsJson();
        setCourseJA(getCourseDisplayNameJA(at.courseId, subJson) || at.courseId);
        setCourseVI(getCourseDisplayNameVI(at.courseId, subJson) || at.courseId);
        const meta = findSubjectMeta(at.courseId, at.subjectId, subJson);
        setSubjectJA(meta?.nameJA || at.subjectId);
        setSubjectVI(meta?.nameVI || '');

        // Load raw questions for this subject to get texts & explanations
        const raws = await loadRawQuestionsFor(at.courseId, at.subjectId);
        const map: Record<string, RawQ> = {};
        for (const r of raws) {
          const qid = String((r as any).questionId ?? (r as any).id ?? '');
          map[qid] = r;
        }
        setRawMap(map);

        // Initialize toggles per question (default OFF)
        const tgF: Record<string, boolean> = {};
        const tgV: Record<string, boolean> = {};
        for (const a of (at.answers || [])) {
          tgF[a.questionId] = false;
          tgV[a.questionId] = false;
        }
        setFuriganaOn(tgF);
        setViOn(tgV);
      } catch (e: any) {
        setErr(e?.message || 'Lỗi tải dữ liệu.');
      } finally {
        setLoading(false);
      }
    })();
  }, [attemptId]);

  const total = attempt?.total ?? 0;
  const score = attempt?.score ?? 0;

  const toggleFuri = (qid: string) => setFuriganaOn(prev => ({ ...prev, [qid]: !prev[qid] }));
  const toggleVI = (qid: string) => setViOn(prev => ({ ...prev, [qid]: !prev[qid] }));

  if (loading) return <main style={{ padding: 24 }}>Đang tải kết quả…</main>;
  if (err) return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  if (!attempt) return <main style={{ padding: 24 }}>Không có dữ liệu.</main>;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1.4 }}>
        {/* ２級建築士　計画 / Kiến trúc sư cấp 2 Môn Thiết kế */}
        {courseJA}　{subjectJA} / {courseVI} Môn {subjectVI || attempt.subjectId}
      </h1>

      <div style={{ marginTop: 10, fontSize: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
        <div><b>Điểm:</b> {score} / {total}</div>
        {typeof attempt.durationSec === 'number' && <div><b>Thời gian:</b> ~{Math.round((attempt.durationSec || 0) / 60)} phút</div>}
        <div style={{ marginLeft: 'auto', opacity: 0.8 }}>{attempt.mode === 'year' ? 'Tổng kết đề theo năm' : 'Tổng kết luyện theo môn'}</div>
      </div>

      <hr style={{ margin: '14px 0 18px', border: 0, borderTop: '1px solid #eee' }} />

      {/* Danh sách câu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(attempt.answers || []).map((a, idx) => {
          const raw = rawMap[a.questionId] || {};
          const qJA = raw.questionTextJA ?? raw.ja?.text ?? '';
          const qVI = raw.questionTextVI ?? raw.vi?.text ?? '';
          const qImg = raw.questionImage ?? raw.ja?.image ?? '';

          // Build shown options by order (if provided); if not, assume identity
          const options: { textJA?: string; textVI?: string; image?: string; isAnswer?: boolean; explainJA?: string; explainVI?: string; }[] = [];
          for (let i = 1; i <= 6; i++) {
            const tJA = raw[`option${i}TextJA`];
            const tVI = raw[`option${i}TextVI`];
            if (tJA == null && tVI == null) break;
            options.push({
              textJA: tJA || '',
              textVI: tVI || '',
              image: raw[`option${i}Image`] || '',
              isAnswer: !!raw[`option${i}IsAnswer`],
              explainJA: raw[`option${i}ExplanationJA`] || '',
              explainVI: raw[`option${i}ExplanationVI`] || '',
            });
          }
          const order = (a.order && a.order.length === options.length) ? a.order : Array.from({ length: options.length }, (_, i) => i);
          const shown = order.map(k => options[k]);

          let pickedIdxs = Array.isArray(a.pickedIndexes) ? a.pickedIndexes.slice() : [];
          let correctIdxs = Array.isArray(a.correctIndexes) ? a.correctIndexes.slice() : [];
          
          // 1) Nếu thiếu correctIndexes → suy ra từ snapshot (isAnswer) theo thứ tự "shown"
          if (!correctIdxs.length) {
            correctIdxs = shown
              .map((op, i) => (op.isAnswer ? i : -1))
              .filter(i => i >= 0);
          }

          // 2) Nếu pickedIndexes có vẻ là "original index" (vượt quá biên shown) → map sang "shown index"
          if (pickedIdxs.some(i => i >= shown.length) && Array.isArray(a.order) && a.order.length === shown.length) {
            // a.order: shownIndex -> originalIndex
            // cần map ngược originalIndex -> shownIndex
            const originalToShown = new Map<number, number>(a.order.map((origIdx, shownIdx) => [origIdx, shownIdx]));
            pickedIdxs = pickedIdxs
              .map(orig => originalToShown.get(orig))
              .filter((x): x is number => typeof x === 'number');
          }

          const pickedSet = new Set(pickedIdxs);
          const correctSet = new Set(correctIdxs);

          const anyOptHasExplanation = shown.some(op => (op.explainJA && op.explainJA.trim()) || (op.explainVI && op.explainVI.trim()));
          const generalJA = raw.explanationGeneralJA || '';
          const generalVI = raw.explanationGeneralVI || '';

          const furi = !!furiganaOn[a.questionId];
          const vi = !!viOn[a.questionId];

          return (
            <section key={a.questionId} style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700, paddingTop: 1 }}>問 {idx + 1}：</div>
                <div style={{ flex: 1 }}>
                  <BilingualText ja={qJA} vi={qVI} lang="JA" showFurigana={furi} />
                  {vi && <><br /><BilingualText ja={qJA} vi={qVI} lang="VI" /></>}
                  {!!qImg && <img src={qImg} alt="" style={{ maxWidth: '100%', marginTop: 8 }} />}
                </div>
                {/* Toggles per question */}
                <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10 }}>
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={furi} onChange={() => toggleFuri(a.questionId)} />
                    ふりがな
                  </label>
                  <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={vi} onChange={() => toggleVI(a.questionId)} />
                    VI
                  </label>
                </div>
              </div>

              <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
                {shown.map((op, i) => {
                  const isPicked = pickedSet.has(i);
                  const isCorrect = correctSet.has(i);
                  const bg = isCorrect ? '#ecfdf3' : (isPicked ? '#fef2f2' : '#fff');
                  return (
                    <li key={i} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, marginBottom: 8, background: bg }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ width: 22, textAlign: 'right', paddingTop: 2 }}>{order[i] + 1}.</div>
                        <div style={{ flex: 1 }}>
                          <BilingualText ja={op.textJA || ''} vi={op.textVI || ''} lang="JA" showFurigana={furi} />
                          {vi && <div style={{ opacity: 0.9, marginTop: 4 }}><BilingualText ja={op.textJA || ''} vi={op.textVI || ''} lang="VI" /></div>}
                          {!!op.image && <img src={op.image} alt="" style={{ maxWidth: '100%', marginTop: 6 }} />}

                          {/* Explanations inline, with ★正答★ prefix for correct */}
                          {(op.explainJA || op.explainVI) && (
                            <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                {(isCorrect ? '★正答★　' : '')}【解説】
                              </div>
                              <BilingualText ja={op.explainJA || ''} vi={op.explainVI || ''} lang="JA" showFurigana={furi} />
                              {vi && (op.explainVI || '') && <div style={{ opacity: 0.9, marginTop: 4 }}><BilingualText ja={op.explainJA || ''} vi={op.explainVI || ''} lang="VI" /></div>}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* General explanation fallback if no per-option explanation exists */}
              {!anyOptHasExplanation && (generalJA || generalVI) && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>【解説】</div>
                  <BilingualText ja={generalJA || ''} vi={generalVI || ''} lang="JA" showFurigana={furi} />
                  {vi && (generalVI || '') && <div style={{ opacity: 0.9, marginTop: 4 }}><BilingualText ja={generalJA || ''} vi={generalVI || ''} lang="VI" /></div>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
