// src/lib/analytics/attempts.ts
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, serverTimestamp, updateDoc, getDoc } from 'firebase/firestore';

/** Session creation */
export type CreateSessionInput = {
  courseId: string;
  subjectId: string;
  mode: 'subject' | 'year';
  examYear?: number;
  total: number;
};
export type UpdateSessionInput = {
  correct?: number;
  blank?: number;
};

/** Finalize payload from Player/Practice pages */
export type FinalizeInput = {
  score: number;                 // rule: store absolute correct count
  tags?: string[];               // optional; omit if empty
  answers: Array<{
    questionId: string;
    pickedIndexes: number[];     // indexes in the SHOWN space
    correctIndexes: number[];    // indexes in the SHOWN space
    isCorrect: boolean;
    guessed?: boolean;
    confident?: boolean;
    order?: number[];            // shownIndex -> originalIndex (optional)
  }>;
  durationSec?: number;
};

export async function createAttemptSession(input: CreateSessionInput) {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const db = getFirestore();
  const ref = doc(collection(db, 'users', uid, 'attemptSessions'));
  await setDoc(ref, {
    userId: uid,
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'ongoing',
  });
  return { sessionId: ref.id };
}

export async function updateAttemptSession(sessionId: string, patch: UpdateSessionInput) {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const db = getFirestore();
  await updateDoc(doc(db, 'users', uid, 'attemptSessions', sessionId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function finalizeAttemptFromSession(sessionId: string, input: FinalizeInput) {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in');

  const db = getFirestore();
  const sessionsRef = doc(db, 'users', uid, 'attemptSessions', sessionId);
  const sessionSnap = await getDoc(sessionsRef);
  if (!sessionSnap.exists()) {
    throw new Error('Session not found');
  }
  const s = sessionSnap.data() as any;

  // Compute blank if not provided in session
  let blank = typeof s.blank === 'number' ? s.blank : undefined;
  if (typeof blank !== 'number') {
    try {
      blank = Array.isArray(input.answers) ? input.answers.filter(a => !a.pickedIndexes || a.pickedIndexes.length === 0).length : undefined;
    } catch {}
  }

  // Build attempt payload with full metadata for MyPage
  const payload: any = {
    userId: uid,
    mode: s.mode,
    courseId: s.courseId,
    subjectId: s.subjectId,
    examYear: s.examYear ?? null,
    total: s.total ?? (Array.isArray(input.answers) ? input.answers.length : 0),
    // store both "correct" and "score" for compatibility
    correct: input.score,
    score: input.score,
    blank: typeof blank === 'number' ? blank : 0,
    durationSec: typeof input.durationSec === 'number' ? input.durationSec : undefined,
    answers: input.answers,
    tags: Array.isArray(input.tags) && input.tags.length > 0 ? input.tags : undefined,
    createdAt: serverTimestamp(),
  };

  const attemptDoc = await addDoc(collection(db, 'users', uid, 'attempts'), payload);

  await updateDoc(sessionsRef, {
    status: 'finalized',
    finalizedAttemptId: attemptDoc.id,
    updatedAt: serverTimestamp(),
  });

  return { attemptId: attemptDoc.id };
}

/**
 * Restore: upsertWrong
 * Called by start/year practice pages to mark a question as wrong/flagged.
 * We merge by questionId to maintain one row per question.
 */
export async function upsertWrong(input: {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear?: number;
  tags?: string[];
  reason?: 'wrong' | 'skipped' | 'guessed';
}) {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const db = getFirestore();

  const { questionId, courseId, subjectId, examYear, tags, reason } = input;
  const payload: any = {
    courseId,
    subjectId,
    updatedAt: serverTimestamp(),
  };
  if (typeof examYear === 'number') payload.examYear = examYear;
  if (Array.isArray(tags) && tags.length > 0) payload.tags = tags;
  if (typeof reason === 'string') payload.reason = reason;

  const ref = doc(collection(db, 'users', uid, 'wrongs'), questionId);
  await setDoc(ref, payload, { merge: true });
}
