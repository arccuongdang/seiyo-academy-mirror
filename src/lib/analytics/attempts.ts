// src/lib/analytics/attempts.ts
import { getAuth } from 'firebase/auth'
import {
  getFirestore, collection, doc, setDoc, addDoc, serverTimestamp, updateDoc, getDoc
} from 'firebase/firestore'

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
  score: number;                 // absolute correct count
  tags?: string[];               // optional; if missing → []
  answers: Array<{
    questionId: string;
    pickedIndexes: number[];     // indexes in the SHOWN space
    correctIndexes: number[];    // indexes in the SHOWN space
    isCorrect: boolean;
    guessed?: boolean;
    confident?: boolean;
    order?: number[];            // shownIndex -> originalIndex (optional)
  }>;
  durationSec?: number;          // optional; if missing → 0
};

export async function createAttemptSession(input: CreateSessionInput) {
  const auth = getAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not signed in')
  const db = getFirestore()

  const ref = doc(collection(db, 'users', uid, 'attemptSessions'))
  await setDoc(ref, {
    userId: uid,
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'ongoing',
  })
  return { sessionId: ref.id }
}

export async function updateAttemptSession(sessionId: string, patch: UpdateSessionInput) {
  const auth = getAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not signed in')
  const db = getFirestore()
  await updateDoc(doc(db, 'users', uid, 'attemptSessions', sessionId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function finalizeAttemptFromSession(sessionId: string, input: FinalizeInput) {
  const auth = getAuth()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Not signed in')

  const db = getFirestore()
  const sessionsRef = doc(db, 'users', uid, 'attemptSessions', sessionId)
  const sessionSnap = await getDoc(sessionsRef)
  if (!sessionSnap.exists()) {
    throw new Error('Session not found')
  }
  const s = sessionSnap.data() as any

  // Compute blank if not provided in session
  let blank = typeof s.blank === 'number' ? s.blank : undefined
  if (typeof blank !== 'number') {
    try {
      blank = Array.isArray(input.answers)
        ? input.answers.filter(a => !a.pickedIndexes || a.pickedIndexes.length === 0).length
        : undefined
    } catch {}
  }

  // Build payload without any undefined fields (Firestore rejects undefined)
  const payload: any = {
    userId: uid,
    mode: s.mode,
    courseId: s.courseId,
    subjectId: s.subjectId,
    examYear: typeof s.examYear === 'number' ? s.examYear : null,
    total: s.total ?? (Array.isArray(input.answers) ? input.answers.length : 0),
    correct: input.score,
    score: input.score,
    blank: typeof blank === 'number' ? blank : 0,
    answers: input.answers,
    createdAt: serverTimestamp(),
  }

  // optional fields: only set if valid
  if (typeof input.durationSec === 'number' && input.durationSec >= 0) {
    payload.durationSec = Math.floor(input.durationSec)
  }
  if (Array.isArray(input.tags)) {
    payload.tags = input.tags.filter(Boolean)
  }

  const attemptDoc = await addDoc(collection(db, 'users', uid, 'attempts'), payload)

  await updateDoc(sessionsRef, {
    status: 'finalized',
    finalizedAttemptId: attemptDoc.id,
    updatedAt: serverTimestamp(),
  })

  return { attemptId: attemptDoc.id }
}

/**
 * upsertWrong
 * Mark a question as wrong/flagged under users/{uid}/wrongs/{questionId}
 */
export async function upsertWrong(input: {
  questionId: string;
  courseId: string;
  subjectId: string;
  examYear?: number;
  tags?: string[];
  reason?: 'wrong' | 'skipped' | 'guessed';
}) {
  const auth = getAuth()
  const uid = auth.currentUser?.uid
  if (!uid) return
  const db = getFirestore()

  const { questionId, courseId, subjectId, examYear, tags, reason } = input
  const payload: any = {
    courseId,
    subjectId,
    updatedAt: serverTimestamp(),
  }
  if (typeof examYear === 'number') payload.examYear = examYear
  if (Array.isArray(tags) && tags.length > 0) payload.tags = tags.filter(Boolean)
  if (typeof reason === 'string') payload.reason = reason

  const ref = doc(collection(db, 'users', uid, 'wrongs'), questionId)
  await setDoc(ref, payload, { merge: true })
}
