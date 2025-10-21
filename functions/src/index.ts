// functions/src/index.ts
import * as functions from "firebase-functions"
import * as admin from "firebase-admin"
admin.initializeApp()
type Attempt = { userId: string; courseId: string; subjectId: string; total: number; score?: number; correct?: number; durationSec?: number; tags?: string[]; createdAt?: FirebaseFirestore.Timestamp; answers?: Array<{ isCorrect: boolean; questionTags?: string[] }> }
type DateRange = { start?: number; end?: number }
export const adminGetAnalytics = functions.https.onCall(async (data: DateRange, context) => {
  const auth = context.auth
  if (!auth || !(auth.token as any)?.admin) throw new functions.https.HttpsError("permission-denied", "Admin only")
  const db = admin.firestore()
  let q: FirebaseFirestore.Query = db.collectionGroup("attempts").orderBy("createdAt", "desc").limit(2000)
  if (data?.start) q = q.where("createdAt", ">=", admin.firestore.Timestamp.fromMillis(data.start))
  if (data?.end) q = q.where("createdAt", "<=", admin.firestore.Timestamp.fromMillis(data.end))
  const snap = await q.get()
  const items: Attempt[] = snap.docs.map(d => d.data() as any)
  const daily: Record<string, { n: number; sumScore: number; sumPct: number; sumDur: number }> = {}
  const subj: Record<string, { n: number; sumPct: number }> = {}
  const tagWrong: Record<string, number> = {}
  const recent = items.slice(0, 200).map(a => ({ userId: a.userId, courseId: a.courseId, subjectId: a.subjectId, total: a.total, score: typeof a.score === "number" ? a.score : (typeof a.correct === "number" ? a.correct : 0), durationSec: a.durationSec ?? 0, tags: Array.isArray(a.tags) ? a.tags : [], createdAt: a.createdAt?.toMillis?.() ?? 0 }))
  for (const a of items) {
    const score = typeof a.score === "number" ? a.score : (typeof a.correct === "number" ? a.correct : 0)
    const pct = a.total > 0 ? (score / a.total) : 0
    const dur = typeof a.durationSec === "number" ? a.durationSec : 0
    const d = a.createdAt?.toDate?.() as Date || new Date()
    const keyDay = d.toISOString().slice(0,10)
    if (!daily[keyDay]) daily[keyDay] = { n: 0, sumScore: 0, sumPct: 0, sumDur: 0 }
    daily[keyDay].n += 1; daily[keyDay].sumScore += score; daily[keyDay].sumPct += pct; daily[keyDay].sumDur += dur
    const keySubj = `${a.courseId}/${a.subjectId}`
    if (!subj[keySubj]) subj[keySubj] = { n: 0, sumPct: 0 }
    subj[keySubj].n += 1; subj[keySubj].sumPct += pct
    const answers = Array.isArray(a.answers) ? a.answers : []
    const fallbackTags = Array.isArray(a.tags) ? a.tags : []
    for (const it of answers) {
      if (it.isCorrect) continue
      const qtags = Array.isArray(it.questionTags) ? it.questionTags : fallbackTags
      for (const t of qtags) tagWrong[t] = (tagWrong[t] || 0) + 1
    }
  }
  const dailyArr = Object.entries(daily).sort((a,b)=>a[0].localeCompare(b[0])).map(([date, v]) => ({ date, attempts: v.n, avgScore: v.sumScore / v.n, avgPct: v.sumPct / v.n, avgDuration: v.sumDur / v.n }))
  const subjArr = Object.entries(subj).map(([key, v]) => ({ key, attempts: v.n, avgPct: v.sumPct / v.n })).sort((a,b)=>b.attempts-a.attempts)
  const tagsArr = Object.entries(tagWrong).map(([tag, wrongs]) => ({ tag, wrongs })).sort((a,b)=>b.wrongs-a.wrongs).slice(0, 20)
  return { daily: dailyArr, subjects: subjArr, tags: tagsArr, recent }
})
