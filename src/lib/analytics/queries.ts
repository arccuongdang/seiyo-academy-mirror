// src/lib/analytics/queries.ts
/**
 * Analytics Queries (client)
 * Purpose:
 * - Read attempts for current user (rules-compliant)
 * - Fetch all analytics via Cloud Function (admin only)
 * - Provide local aggregations for charts
 */
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

export function toJSDate(v: any): Date {
  if (!v) return new Date(0)
  if (typeof v?.toDate === 'function') return v.toDate() as Date
  if (typeof v === 'number') return new Date(v)
  if (v instanceof Date) return v
  return new Date(0)
}
export function pickScore(a: AttemptDoc): number {
  return typeof a.score === 'number' ? a.score : (typeof a.correct === 'number' ? a.correct : 0)
}
export function pct(a: AttemptDoc): number {
  const s = pickScore(a); return a.total > 0 ? s / a.total : 0
}

export async function listAttemptsByUser(uid: string, range: DateRange = {}): Promise<AttemptDoc[]> {
  const db = getFirestore()
  const base = collection(db, 'users', uid, 'attempts')
  const conds: any[] = []
  if (range.start) conds.push(where('createdAt', '>=', ts(range.start)))
  if (range.end) conds.push(where('createdAt', '<=', ts(range.end)))
  const qRef = conds.length > 0 ? query(base, ...conds, orderBy('createdAt', 'desc')) : query(base, orderBy('createdAt', 'desc'))
  const snap = await getDocs(qRef as any)
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
}

export async function fetchAllAnalyticsViaCF(range: DateRange = {}) {
  const fns = getFunctions()
  const call = httpsCallable(fns, 'adminGetAnalytics')
  const payload: any = {}
  if (range.start) payload.start = range.start.getTime()
  if (range.end) payload.end = range.end.getTime()
  const res: any = await call(payload)
  return res.data as { daily: any[]; subjects: any[]; tags: any[]; recent: AttemptDoc[] }
}

export function aggregateDaily(attempts: AttemptDoc[]) {
  const by: Record<string, AttemptDoc[]> = {}
  for (const a of attempts) {
    const k = toJSDate(a.createdAt).toISOString().slice(0, 10)
    ;(by[k] = by[k] || []).push(a)
  }
  return Object.entries(by)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, arr]) => {
      const pcts = arr.map(pct)
      const durs = arr.map(x => x.durationSec ?? 0)
      const scores = arr.map(pickScore)
      const avg = (xs: number[]) => (xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0)
      return { date, attempts: arr.length, avgPct: avg(pcts), avgScore: avg(scores), avgDuration: avg(durs) }
    })
}

export function aggregateSubjects(attempts: AttemptDoc[]) {
  const sub: Record<string, { n: number; sumPct: number }> = {}
  for (const a of attempts) {
    const key = `${a.courseId}/${a.subjectId}`
    const bucket = (sub[key] = sub[key] || { n: 0, sumPct: 0 })
    bucket.n += 1
    bucket.sumPct += pct(a)
  }
  return Object.entries(sub)
    .map(([key, v]) => ({ key, attempts: v.n, avgPct: v.sumPct / v.n }))
    .sort((a, b) => b.attempts - a.attempts)
}

export function aggregateWrongTags(attempts: AttemptDoc[], topN = 20) {
  const counter: Record<string, number> = {}
  for (const a of attempts) {
    const ans = Array.isArray(a.answers) ? a.answers : []
    const atags = Array.isArray(a.tags) ? a.tags : []
    for (const it of ans) {
      if (it.isCorrect) continue
      const qtags = Array.isArray(it.questionTags) ? it.questionTags : atags
      for (const t of qtags) counter[t] = (counter[t] || 0) + 1
    }
  }
  return Object.entries(counter)
    .map(([tag, wrongs]) => ({ tag, wrongs }))
    .sort((a, b) => b.wrongs - a.wrongs)
    .slice(0, topN)
}
