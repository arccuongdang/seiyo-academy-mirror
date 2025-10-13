// src/lib/analytics/attempts.ts
/**
 * ============================================================================
 *  Analytics – Batch attempts writer
 *  - Sửa import: lấy db/requireUser/serverTimestamp từ ../firebase/client
 *    và lấy Firestore helpers trực tiếp từ 'firebase/firestore'
 *  - Ghi batch từng câu hỏi vào /users/{uid}/attempts/{autoId}
 *  - (Tuỳ chọn) ghi summary phiên làm bài /users/{uid}/attemptSessions/{sessionId}
 * ============================================================================
 */

import { db, requireUser, serverTimestamp } from '../firebase/client';
import {
  collection,
  doc,
  writeBatch,
  setDoc,
  increment,
  type WriteBatch,
} from 'firebase/firestore';

export type AttemptMode = 'subject' | 'year';

export type AttemptItem = {
  courseId: string;
  subjectId: string;
  questionId: string;
  selectedIndex: number | null; // index trên mảng options sau shuffle
  isCorrect: boolean;
  examYear?: number;
  difficulty?: string | null;
  tags?: string[] | string | null;
  sourceNote?: string | null;
};

export type AttemptSessionSummary = {
  total: number;
  correct: number;
  blank: number;
  scorePercent: number; // 0..100
};

/* =============================================================================
 * Save a batch of attempts (+ optional session summary)
 * ========================================================================== */

/**
 * Lưu nhiều attempt cùng lúc.
 * - Mỗi attempt → /users/{uid}/attempts/{autoId}
 * - Nếu truyền `sessionId` + `summary` → ghi /users/{uid}/attemptSessions/{sessionId}
 */
export async function saveAttemptsBatch(
  mode: AttemptMode,
  items: AttemptItem[],
  opts?: {
    sessionId?: string;
    summary?: AttemptSessionSummary;
  }
): Promise<void> {
  const user = await requireUser();
  if (!items?.length) return;

  const batch: WriteBatch = writeBatch(db);

  // 1) Ghi từng attempt
  const attemptsCol = collection(db, 'users', user.uid, 'attempts');
  for (const it of items) {
    // tạo doc ref auto-id cho batch.set
    const attemptRef = doc(attemptsCol);
    batch.set(attemptRef, {
      userId: user.uid,
      courseId: it.courseId,
      subjectId: it.subjectId,
      questionId: it.questionId,
      selectedIndex: it.selectedIndex,
      isCorrect: it.isCorrect,
      examYear: it.examYear ?? null,
      difficulty: it.difficulty ?? null,
      tags: it.tags ?? null,
      sourceNote: it.sourceNote ?? null,
      mode,
      createdAt: serverTimestamp(),
    });
  }

  // 2) (Optional) Ghi summary theo phiên
  if (opts?.sessionId && opts?.summary) {
    const sessRef = doc(db, 'users', user.uid, 'attemptSessions', opts.sessionId);
    batch.set(sessRef, {
      userId: user.uid,
      courseId: items[0].courseId,
      subjectId: items[0].subjectId,
      sessionId: opts.sessionId,
      year: inferYearFromItems(items),
      total: opts.summary.total,
      correct: opts.summary.correct,
      blank: opts.summary.blank,
      scorePercent: opts.summary.scorePercent,
      createdAt: serverTimestamp(),
      mode,
    }, { merge: true });
  }

  // 3) (Optional) Ví dụ tăng counters tổng hợp (tuỳ bạn xài hay bỏ)
  //    /users/{uid}/stats/{courseId_subjectId}
  try {
    const cid = items[0].courseId;
    const sid = items[0].subjectId;
    const statRef = doc(db, 'users', user.uid, 'stats', `${cid}_${sid}`);
    batch.set(statRef, {
      userId: user.uid,
      courseId: cid,
      subjectId: sid,
      attempts: increment(items.length),
      correct: increment(items.filter((x) => x.isCorrect).length),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch {
    // không bắt buộc; có thể bỏ block này nếu không cần thống kê
  }

  await batch.commit();
}

/* =============================================================================
 * Helpers
 * ========================================================================== */

function inferYearFromItems(items: AttemptItem[]): number | null {
  for (const it of items) {
    if (typeof it.examYear === 'number') return it.examYear;
  }
  return null;
}
