
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

/** Session creation */
type CreateSessionInput = {
  courseId: string;
  subjectId: string;
  mode: 'subject' | 'year';
  examYear?: number;
  total: number;
};
type UpdateSessionInput = {
  correct?: number;
  blank?: number;
};

/** Finalize payload from Player/Practice pages */
type FinalizeInput = {
  score: number;                 // rule: store absolute correct count
  tags?: string[];               // optional; omit if empty
  answers: Array<{
    questionId: string;
    pickedIndexes: number[];     // indexes in the SHUFFLED space
    correctIndexes: number[];    // indexes in the SHUFFLED space
    isCorrect: boolean;
    guessed?: boolean;
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
  const attemptsCol = collection(db, 'users', uid, 'attempts');

  // Sanitize payload (esp. tags)
  const payload: any = {
    score: input.score,
    answers: input.answers,
    createdAt: serverTimestamp(),
  };
  if (Array.isArray(input.tags) && input.tags.length > 0) payload.tags = input.tags;
  if (typeof input.durationSec === 'number') payload.durationSec = input.durationSec;

  const attemptDoc = await addDoc(attemptsCol, payload);

  await updateDoc(doc(db, 'users', uid, 'attemptSessions', sessionId), {
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
