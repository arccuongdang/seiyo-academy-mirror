
// src/lib/analytics/attempts.ts
// Notes:
// - Keep collection layout under /users/{uid}/(attemptSessions|attempts) to match current app.
// - Extend finalizeAttemptFromSession to accept `answers[]` and `durationSec`.
// - Avoid SSR issues by guarding Firestore via ensureDb().
// - Avoid @ alias; use relative imports consistent with repo style.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp as _serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { db as _db, requireUser } from '../firebase/client';

function ensureDb(): Firestore {
  if (!_db) {
    throw new Error('Firestore is not available on this runtime. Call analytics helpers only from client components.');
  }
  return _db;
}

export const serverTimestamp = _serverTimestamp;

export type AttemptMode = 'subject' | 'year';
export type AttemptSession = {
  userId: string;
  courseId: string;
  subjectId: string;
  examYear?: number | null;
  mode: AttemptMode;
  total: number;
  correct: number;
  blank: number;
  createdAt?: any;
  updatedAt?: any;
};

export type AnswerRow = {
  questionId: string;
  pickedIndexes: number[];   // indexes after shuffle (0-based)
  correctIndexes: number[];  // indexes after shuffle (0-based)
  isCorrect: boolean;
};

export type AttemptFinal = AttemptSession & {
  score?: number | null;     // percent 0..100
  tags?: string[];
  answers?: AnswerRow[];
  durationSec?: number | null;
  finalizedAt?: any;
};

/** Create a new attempt session under /users/{uid}/attemptSessions/{sessionId} */
export async function createAttemptSession(input: {
  courseId: string;
  subjectId: string;
  mode: AttemptMode;
  total: number;
  examYear?: number | null;
}): Promise<{ sessionId: string }> {
  const user = await requireUser();
  const db = ensureDb();
  const sessionRef = doc(collection(db, 'users', user.uid, 'attemptSessions'));
  const sessionId = sessionRef.id;
  const payload: AttemptSession = {
    userId: user.uid,
    courseId: input.courseId,
    subjectId: input.subjectId,
    mode: input.mode,
    total: input.total ?? 0,
    correct: 0,
    blank: 0,
    examYear: input.examYear ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(sessionRef, payload, { merge: true });
  return { sessionId };
}

/** Update partial fields of a running session */
export async function updateAttemptSession(sessionId: string, patch: Partial<AttemptSession>): Promise<void> {
  const user = await requireUser();
  const db = ensureDb();
  const ref = doc(db, 'users', user.uid, 'attemptSessions', sessionId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() } as any);
}

/**
 * Finalize an attempt session:
 * - Reads /users/{uid}/attemptSessions/{sessionId}
 * - Writes a new immutable doc in /users/{uid}/attempts/{attemptId}
 * - Accepts extra { score, tags, answers, durationSec }
 * - Returns { attemptId }
 */
export async function finalizeAttemptFromSession(
  sessionId: string,
  extra?: { score?: number | null; tags?: string[]; answers?: AnswerRow[]; durationSec?: number | null }
): Promise<{ attemptId: string }> {
  const user = await requireUser();
  const db = ensureDb();

  const sessRef = doc(db, 'users', user.uid, 'attemptSessions', sessionId);
  const sessSnap = await getDoc(sessRef);
  if (!sessSnap.exists()) throw new Error('Session not found');
  const s = sessSnap.data() as AttemptSession;

  const attemptsCol = collection(db, 'users', user.uid, 'attempts');
  const attemptRef = doc(attemptsCol); // auto-id
  const attemptId = attemptRef.id;

  const finalPayload: AttemptFinal = {
    ...s,
    score: typeof extra?.score === 'number' ? extra?.score : null,
    tags: extra?.tags ?? undefined,
    answers: extra?.answers ?? undefined,
    durationSec: typeof extra?.durationSec === 'number' ? extra?.durationSec : null,
    finalizedAt: serverTimestamp(),
  };

  await setDoc(attemptRef, finalPayload);
  return { attemptId };
}

// Backward-compatible alias
export const finalizeAttempt = finalizeAttemptFromSession;

/** Track a wrong question for replay under /users/{uid}/wrongs/{questionId} */
export async function upsertWrong(input: { questionId: string; courseId: string; subjectId: string; examYear?: number | null; }): Promise<void> {
  const user = await requireUser();
  const db = ensureDb();
  const ref = doc(db, 'users', user.uid, 'wrongs', input.questionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const prev = typeof (snap.data() as any).count === 'number' ? (snap.data() as any).count : 1;
    await updateDoc(ref, {
      courseId: input.courseId,
      subjectId: input.subjectId,
      examYear: input.examYear ?? null,
      count: prev + 1,
      lastAt: serverTimestamp(),
    } as any);
  } else {
    await setDoc(ref, {
      courseId: input.courseId,
      subjectId: input.subjectId,
      examYear: input.examYear ?? null,
      count: 1,
      lastAt: serverTimestamp(),
    } as any);
  }
}
