
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
  tags?: string[];
  answers: Array<{
    questionId: string;
    pickedIndexes: number[];
    correctIndexes: number[];
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
  const attemptDoc = await addDoc(attemptsCol, {
    ...input,
    createdAt: serverTimestamp(),
  });

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
