// src/lib/analytics/queries.ts
import { getFirestore, collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

export type AttemptDoc = {
  id?: string
  userId: string
  courseId: string
  subjectId: string
  total: number
  score?: number
  correct?: number
  durationSec?: number
  tags?: string[]
  createdAt?: any
  answers?: Array<{
    questionId: string
    pickedIndexes: number[]
    correctIndexes: number[]
    isCorrect: boolean
    guessed?: boolean
    confident?: boolean
    order?: number[]
    questionTags?: string[]
  }>
}

export type DateRange = { start?: Date; end?: Date }
const ts = (d?: Date) => (d ? Timestamp.fromDate(d) : undefined)

/** Read attempts of the current user (works with existing rules) */
export async function listAttemptsByUser(uid: string, range: DateRange = {}): Promise<AttemptDoc[]> {
  const db = getFirestore()
  const base = collection(db, 'users', uid, 'attempts')

  const conds: any[] = []
  if (range.start) conds.push(where('createdAt', '>=', ts(range.start)))
  if (range.end) conds.push(where('createdAt', '<=', ts(range.end)))

  const qRef =
    conds.length > 0
      ? query(base, ...conds, orderBy('createdAt', 'desc'))
      : query(base, orderBy('createdAt', 'desc'))

  const snap = await getDocs(qRef as any)
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
}

/** Admin aggregate via Cloud Function (requires custom claim admin=true) */
export async function fetchAllAnalyticsViaCF(range: DateRange = {}) {
  const fns = getFunctions()
  const call = httpsCallable(fns, 'adminGetAnalytics')
  const payload: any = {}
  if (range.start) payload.start = range.start.getTime()
  if (range.end) payload.end = range.end.getTime()
  const res: any = await call(payload)
  return res.data as { daily: any[]; subjects: any[]; tags: any[]; recent: AttemptDoc[] }
}
