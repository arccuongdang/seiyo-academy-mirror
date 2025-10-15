// src/lib/analytics/attempts.ts
/**
 * ============================================================================
 * Attempts analytics helpers (clean, build-safe)
 * ---------------------------------------------------------------------------
 * Exports (used by practice pages):
 * - createAttemptSession({ courseId, subjectId, total })
 * - updateAttemptSession(sessionId, { correct, blank })
 * - finalizeAttempt({ courseId, subjectId, examYear, total, correct, blank, score, durationSec?, tags?, sessionId? })
 *
 * Design:
 * - attemptSessions: mutable progress of a practice run
 * - attempts: immutable summary record per submission
 * - All writes are scoped to /users/{uid}/...
 * - Keep names and shapes minimal to avoid breaking other files.
 * ============================================================================
 */

import { db, requireUser, serverTimestamp } from '../firebase/client';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

/** Minimal types that callers expect */
export type AttemptSessionSummary = {
  total: number;
  correct: number;
  blank: number;
};

export type FinalizeAttemptInput = {
  courseId: string;
  subjectId: string;
  examYear: number; // 0 for TF/no-year
  total: number;
  correct: number;
  blank: number;
  score: number; // 0..100
  durationSec?: number;
  tags?: string[];
  sessionId?: string | null;
};

/**
 * Create a new attempt session document.
 * @returns {Promise<{sessionId: string}>}
 */
export async function createAttemptSession(params: {
  courseId: string;
  subjectId: string;
  total: number;
}): Promise<{ sessionId: string }> {
  const user = await requireUser();

  const sessionRef = doc(collection(db, 'users', user.uid, 'attemptSessions'));
  const sessionId = sessionRef.id;

  await setDoc(sessionRef, {
    userId: user.uid,
    courseId: params.courseId,
    subjectId: params.subjectId,
    sessionId,
    total: Math.trunc(params.total || 0),
    correct: 0,
    blank: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { sessionId };
}

/**
 * Update counters for an existing attempt session.
 */
export async function updateAttemptSession(
  sessionId: string,
  summary: Partial<AttemptSessionSummary>
): Promise<void> {
  if (!sessionId) return;
  const user = await requireUser();

  const ref = doc(db, 'users', user.uid, 'attemptSessions', sessionId);
  await updateDoc(ref, {
    ...(typeof summary.total === 'number' ? { total: Math.trunc(summary.total) } : {}),
    ...(typeof summary.correct === 'number' ? { correct: Math.trunc(summary.correct) } : {}),
    ...(typeof summary.blank === 'number' ? { blank: Math.trunc(summary.blank) } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Finalize a practice attempt (immutable).
 * Creates a new /users/{uid}/attempts/{autoId} record.
 */
export async function finalizeAttempt(input: FinalizeAttemptInput): Promise<void> {
  const user = await requireUser();

  const attemptsCol = collection(db, 'users', user.uid, 'attempts');
  const ref = doc(attemptsCol); // auto-id

  await setDoc(ref, {
    userId: user.uid,
    courseId: input.courseId,
    subjectId: input.subjectId,
    examYear: Math.trunc(input.examYear || 0),
    total: Math.trunc(input.total || 0),
    correct: Math.trunc(input.correct || 0),
    blank: Math.trunc(input.blank || 0),
    score: Math.trunc(input.score || 0),
    durationSec: typeof input.durationSec === 'number' ? Math.max(0, Math.trunc(input.durationSec)) : null,
    tags: Array.isArray(input.tags) ? input.tags : null,
    sessionId: input.sessionId ?? null,
    createdAt: serverTimestamp(),
  });
}
