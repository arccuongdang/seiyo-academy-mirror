// src/lib/analytics/attempts.ts
import { db, requireUser, serverTimestamp, collection, doc, writeBatch, setDoc } from '../firebase/client';
import { increment } from 'firebase/firestore';

export type AttemptMode = 'subject' | 'year';
export type AttemptItemInput = {
  questionId: string;
  selectedId: string | null;
  correctIds: string[];
  isCorrect: boolean;
  multiCorrect?: boolean;
  timeTakenMs?: number;
};
export type AttemptMetaInput = {
  mode: AttemptMode;
  courseId: string;
  subjectId: string;
  examYear?: number;
  total: number;
  correct: number;
  blank: number;
  durationSec?: number;
  device?: 'mobile' | 'desktop' | 'tablet';
  seed?: number;
};

export async function createAttempt(meta: AttemptMetaInput, items: AttemptItemInput[]) {
  const user = await requireUser();
  const uid = user.uid;

  const batch = writeBatch(db);

  const attemptsCol = collection(db, 'attempts');
  const attemptRef = doc(attemptsCol);
  const attemptId = attemptRef.id;

  batch.set(attemptRef, {
    userId: uid, ...meta,
    createdAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  });

  const itemsCol = collection(attemptRef, 'items');
  for (const it of items) {
    batch.set(doc(itemsCol, it.questionId), { ...it, createdAt: serverTimestamp() });
    if (!it.isCorrect) {
      const wrongRef = doc(db, 'users', uid, 'wrongs', it.questionId);
      batch.set(wrongRef, {
        courseId: meta.courseId,
        subjectId: meta.subjectId,
        examYear: meta.examYear ?? null,
        lastSelectedId: it.selectedId,
        lastAt: serverTimestamp(),
        count: increment(1),
      }, { merge: true });
    }
  }

  await batch.commit();
  return { attemptId };
}

export async function appendSingleItemSubject(
  attemptId: string,
  meta: Omit<AttemptMetaInput, 'total' | 'correct' | 'blank'>,
  entry: AttemptItemInput
) {
  const user = await requireUser();
  const uid = user.uid;
  const attemptRef = doc(db, 'attempts', attemptId);
  const itemsCol = collection(attemptRef, 'items');

  await setDoc(
    attemptRef,
    { userId: uid, ...meta, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true }
  );

  await setDoc(doc(itemsCol, entry.questionId), { ...entry, createdAt: serverTimestamp() }, { merge: true });

  if (!entry.isCorrect) {
    const wrongRef = doc(db, 'users', uid, 'wrongs', entry.questionId);
    await setDoc(wrongRef, {
      courseId: meta.courseId,
      subjectId: meta.subjectId,
      examYear: meta.examYear ?? null,
      lastSelectedId: entry.selectedId,
      lastAt: serverTimestamp(),
      count: increment(1),
    }, { merge: true });
  }
}
