import { getAuth } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

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
type FinalizeInput = {
  score: number;
  tags?: string[]; // optional; omit if undefined/empty
  answers: Array<{
    questionId: string;
    pickedIndexes: number[];   // indexes in the SHUFFLED space
    correctIndexes: number[];  // indexes in the SHUFFLED space
    isCorrect: boolean;
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

  // Sanitize: remove undefined/empty fields (esp. tags)
  const payload: any = {
    score: input.score,
    answers: input.answers,
    createdAt: serverTimestamp(),
  };
  if (Array.isArray(input.tags) && input.tags.length > 0) {
    payload.tags = input.tags;
  }
  if (typeof input.durationSec === 'number') {
    payload.durationSec = input.durationSec;
  }

  const attemptDoc = await addDoc(attemptsCol, payload);

  await updateDoc(doc(db, 'users', uid, 'attemptSessions', sessionId), {
    status: 'finalized',
    finalizedAttemptId: attemptDoc.id,
    updatedAt: serverTimestamp(),
  });

  return { attemptId: attemptDoc.id };
}

export async function upsertWrong(input: { questionId: string; courseId: string; subjectId: string; examYear: number }) {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const db = getFirestore();
  const ref = doc(collection(db, 'users', uid, 'wrongs'), input.questionId);
  await setDoc(ref, {
    ...input,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
