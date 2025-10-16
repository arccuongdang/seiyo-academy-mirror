// src/lib/analytics/attempts.ts
// Fixes:
// - Correct import path to Firebase client (../firebase/client)
// - Provide alias export `finalizeAttempt` (-> finalizeAttemptFromSession)
// - Guard Firestore (db can be null in SSR) via ensureDb()
// - Keep existing business logic unchanged

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

/** ============================
 *  Firestore guard
 *  ============================
 *  In our SSR-safe client, `db` is typed as `Firestore | null`.
 *  Use this helper to obtain a non-null Firestore only on client.
 */
function ensureDb(): Firestore {
  if (!_db) {
    throw new Error('Firestore is not available on this runtime. Call analytics helpers only from client components.');
  }
  return _db;
}

// Re-export timestamp helper locally (avoid extra imports)
export const serverTimestamp = _serverTimestamp;

/** Shape hints (kept flexible) */
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

export type AttemptFinal = AttemptSession & {
  score?: number | null;
  tags?: string[];
};

/** ===============================================
 *  createAttemptSession
 *  -----------------------------------------------
 *  Creates a new /users/{uid}/attemptSessions/{sessionId} with a random id.
 *  Returns the generated sessionId.
 *  ===============================================
 */
export async function createAttemptSession(input: {
  courseId: string;
  subjectId: string;
  mode: AttemptMode;
  total: number;
  examYear?: number | null;
}): Promise<{ sessionId: string }> {
  const user = await requireUser();
  const db = ensureDb();

  // Create a new doc ref with auto ID in attemptSessions
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

/** ===============================================
 *  updateAttemptSession
 *  -----------------------------------------------
 *  Partially update fields during a running session.
 *  ===============================================
 */
export async function updateAttemptSession(sessionId: string, patch: Partial<AttemptSession>): Promise<void> {
  const user = await requireUser();
  const db = ensureDb();
  const ref = doc(db, 'users', user.uid, 'attemptSessions', sessionId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() } as any);
}

/** ===============================================
 *  finalizeAttemptFromSession
 *  -----------------------------------------------
 *  Copies a session as an immutable attempt and (optionally) leaves the session as-is.
 *  Firestore rules on your side should block update/delete on attempts.
 *  ===============================================
 */
export async function finalizeAttemptFromSession(sessionId: string, extra?: { score?: number | null; tags?: string[] }): Promise<{ attemptId: string }> {
  const user = await requireUser();
  const db = ensureDb();

  const sessRef = doc(db, 'users', user.uid, 'attemptSessions', sessionId);
  const sessSnap = await getDoc(sessRef);
  if (!sessSnap.exists()) {
    throw new Error('Session not found');
  }
  const s = sessSnap.data() as AttemptSession;

  const attemptsCol = collection(db, 'users', user.uid, 'attempts');
  const attemptRef = doc(attemptsCol); // auto id
  const attemptId = attemptRef.id;

  const finalPayload: AttemptFinal = {
    ...s,
    score: extra?.score ?? null,
    tags: extra?.tags ?? undefined,
    createdAt: serverTimestamp(),
  };

  await setDoc(attemptRef, finalPayload);
  return { attemptId };
}

/** Alias to keep old imports working */
export const finalizeAttempt = finalizeAttemptFromSession;

/** ===============================================
 *  upsertWrong (optional helper)
 *  -----------------------------------------------
 *  Track a wrong question for replay (/users/{uid}/wrongs/{questionId}).
 *  ===============================================
 */
export async function upsertWrong(input: {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear?: number | null;
}): Promise<void> {
  const user = await requireUser();
  const db = ensureDb();

  const ref = doc(db, 'users', user.uid, 'wrongs', input.questionId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data: any = snap.data() || {};
    const prev = typeof data.count === 'number' ? data.count : 1;
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
