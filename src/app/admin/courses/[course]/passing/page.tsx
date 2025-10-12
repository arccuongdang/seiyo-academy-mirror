'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGate from '../../../../../components/AuthGate';
import { db, requireUser, serverTimestamp } from '../../../../../lib/firebase/client';
import { doc, getDoc, setDoc, collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

type DefaultRule = {
  passPercent?: number;
  minCorrect?: number;
  timeLimitSec?: number;
  showClock?: boolean;
  enabled?: boolean;
  version?: number;
  publishedAt?: any;
};

type OverrideRule = DefaultRule & {
  id?: string;
  scope: 'year' | 'subject' | 'year+subject';
  subjectId?: string | null;
  year?: number | null;
  note?: string | null;
  effectiveFrom?: any;
  effectiveTo?: any;
};

export default function PassingAdminPage({ params }: { params: { course: string } }) {
  const router = useRouter();
  const { course } = params;

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [defRule, setDefRule] = useState<DefaultRule>({});
  const [ovList, setOvList] = useState<OverrideRule[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // form override
  const [scope, setScope] = useState<'year'|'subject'|'year+subject'>('year');
  const [subjectId, setSubjectId] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [passPercent, setPassPercent] = useState<number | ''>('');
  const [minCorrect, setMinCorrect] = useState<number | ''>('');
  const [timeLimitSec, setTimeLimitSec] = useState<number | ''>('');
  const [showClock, setShowClock] = useState<boolean>(true);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const u = await requireUser();
        // check quyền admin
        const userSnap = await getDoc(doc(db, 'users', u.uid));
        const roles = userSnap.exists() ? (userSnap.data() as any).roles : null;
        setIsAdmin(!!roles?.admin);

        // load default
        const passRef = doc(db, 'courses', course, 'settings', 'passing');
        const passSnap = await getDoc(passRef);
        const def = passSnap.exists() ? (passSnap.data().default || {}) : {};
        setDefRule(def);

        // load overrides
        const ovCol = collection(db, 'courses', course, 'settings', 'passing', 'overrides');
        const ovSnap = await getDocs(query(ovCol, orderBy('publishedAt', 'desc'), limit(50)));
        const list: OverrideRule[] = [];
        ovSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setOvList(list);
      } catch (e: any) {
        setErr(e?.message || 'Load failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [course]);

  const saveDefault = async () => {
    try {
      setErr(null);
      const ref = doc(db, 'courses', course, 'settings', 'passing');
      const nextVersion = (defRule.version ?? 0) + 1;
      await setDoc(ref, {
        default: {
          passPercent: defRule.passPercent ?? null,
          minCorrect: defRule.minCorrect ?? null,
          timeLimitSec: defRule.timeLimitSec ?? null,
          showClock: typeof defRule.showClock === 'boolean' ? defRule.showClock : true,
          enabled: typeof defRule.enabled === 'boolean' ? defRule.enabled : true,
          version: nextVersion,
          publishedAt: serverTimestamp(),
        }
      }, { merge: true });
      alert('Đã lưu default rule');
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    }
  };

  const createOverride = async () => {
    try {
      setErr(null);
      const ovCol = collection(db, 'courses', course, 'settings', 'passing', 'overrides');
      await addDoc(ovCol, {
        scope,
        subjectId: scope.includes('subject') ? (subjectId || null) : null,
        year: scope.includes('year') ? (year || null) : null,
        passPercent: passPercent || null,
        minCorrect: minCorrect || null,
        timeLimitSec: timeLimitSec || null,
        showClock,
        enabled,
        note: note || null,
        version: 1,
        publishedAt: serverTimestamp(),
        effectiveFrom: null,
        effectiveTo: null,
      });
      alert('Đã tạo override');
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || 'Create failed');
    }
  };

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  if (isAdmin === false) return <main style={{ padding: 24, color: 'crimson' }}>Không có quyền admin.</main>;

  return (
    <AuthGate>
      <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
          Admin · Chuẩn đỗ khóa {course}
        </h1>

        {err && <div style={{ color: 'crimson', marginBottom: 12 }}>Lỗi: {err}</div>}

        {/* Default rule */}
        <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 10 }}>Mặc định toàn khóa</h2>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <label>% đạt
              <input type="number" value={defRule.passPercent ?? ''} onChange={e=>setDefRule({ ...defRule, passPercent: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Tối thiểu đúng
              <input type="number" value={defRule.minCorrect ?? ''} onChange={e=>setDefRule({ ...defRule, minCorrect: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Giới hạn (giây)
              <input type="number" value={defRule.timeLimitSec ?? ''} onChange={e=>setDefRule({ ...defRule, timeLimitSec: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Hiện đồng hồ
              <select value={String(defRule.showClock ?? true)} onChange={e=>setDefRule({ ...defRule, showClock: e.target.value === 'true' })} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}>
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={saveDefault} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff' }}>
              Lưu & Publish
            </button>
          </div>
        </section>

        {/* Create override */}
        <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 10 }}>Tạo Override</h2>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
            <label>Scope
              <select value={scope} onChange={e=>setScope(e.target.value as any)} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}>
                <option value="year">Year</option>
                <option value="subject">Subject</option>
                <option value="year+subject">Year + Subject</option>
              </select>
            </label>
            <label>Subject
              <input value={subjectId} onChange={e=>setSubjectId(e.target.value)} disabled={!scope.includes('subject')}
                placeholder="TK/PL/KC/TC" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Year
              <input type="number" value={year} onChange={e=>setYear(e.target.value === '' ? '' : Number(e.target.value))} disabled={!scope.includes('year')}
                placeholder="2024" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Enabled
              <select value={String(enabled)} onChange={e=>setEnabled(e.target.value === 'true')}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}>
                <option value="true">Bật</option>
                <option value="false">Tắt</option>
              </select>
            </label>

            <label>% đạt
              <input type="number" value={passPercent} onChange={e=>setPassPercent(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Tối thiểu đúng
              <input type="number" value={minCorrect} onChange={e=>setMinCorrect(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Giới hạn (giây)
              <input type="number" value={timeLimitSec} onChange={e=>setTimeLimitSec(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
            <label>Hiện đồng hồ
              <select value={String(showClock)} onChange={e=>setShowClock(e.target.value === 'true')}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}>
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            </label>

            <label style={{ gridColumn: '1 / -1' }}>Ghi chú
              <input value={note} onChange={e=>setNote(e.target.value)}
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={createOverride} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #175cd3', background: '#175cd3', color: '#fff' }}>
              Tạo & Publish
            </button>
          </div>
        </section>

        {/* List overrides */}
        <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 10 }}>Overrides gần đây</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {ovList.length === 0 && <div style={{ color: '#667085' }}>Chưa có override.</div>}
            {ovList.map((r) => (
              <div key={r.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{r.scope}</strong>
                  {r.year && <span>Year: {r.year}</span>}
                  {r.subjectId && <span>Subject: {r.subjectId}</span>}
                  <span>Enabled: {String(r.enabled)}</span>
                </div>
                <div style={{ marginTop: 6, color: '#667085' }}>
                  %: {r.passPercent ?? '—'} ・ MinCorrect: {r.minCorrect ?? '—'} ・ Time: {r.timeLimitSec ?? '—'} ・ Clock: {String(r.showClock)}
                </div>
                {r.note && <div style={{ marginTop: 6 }}>{r.note}</div>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </AuthGate>
  );
}
