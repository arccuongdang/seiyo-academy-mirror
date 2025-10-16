'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  type Firestore,
} from 'firebase/firestore';
import {
  db as _db,
  requireUser,
  serverTimestamp,
} from '../../../../../lib/firebase/client';

// =======================
// Helpers
// =======================

// Ép kiểu an toàn: chỉ dùng ở client (file này đã 'use client')
function ensureDb(): Firestore {
  if (!_db) {
    throw new Error(
      'Firestore is not available in this runtime. Ensure this page runs on client.'
    );
  }
  return _db;
}

// =======================
// Types (giữ linh hoạt, không phá schema hiện tại)
// =======================
type DefaultRule = {
  passPercent?: number | null;
  minCorrect?: number | null;
  timeLimitSec?: number | null;
  showClock?: boolean;
  enabled?: boolean;
  version?: number;
};

type OverrideRule = {
  id?: string;
  scope: 'global' | 'subject' | 'year' | 'subject+year';
  subjectId?: string | null;
  year?: number | null;
  passPercent?: number | null;
  minCorrect?: number | null;
  timeLimitSec?: number | null;
  showClock?: boolean;
  enabled?: boolean;
  note?: string | null;
  version?: number;
  publishedAt?: any;
  effectiveFrom?: any;
  effectiveTo?: any;
};

// =======================
// Page
// =======================
export default function PassingAdminPage({
  params,
}: {
  params: { course: string };
}) {
  const router = useRouter();
  const { course } = params;

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // default rule
  const [defRule, setDefRule] = useState<DefaultRule>({});

  // overrides list
  const [ovList, setOvList] = useState<OverrideRule[]>([]);

  // form tạo override
  const [scope, setScope] = useState<OverrideRule['scope']>('global');
  const [subjectId, setSubjectId] = useState<string>('');
  const [year, setYear] = useState<number | ''>('');
  const [passPercent, setPassPercent] = useState<number | ''>('');
  const [minCorrect, setMinCorrect] = useState<number | ''>('');
  const [timeLimitSec, setTimeLimitSec] = useState<number | ''>('');
  const [showClock, setShowClock] = useState<boolean>(true);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [note, setNote] = useState<string>('');

  // ========= Load quyền + dữ liệu =========
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const u = await requireUser();
        const db = ensureDb();

        // check quyền admin
        const userSnap = await getDoc(doc(db, 'users', u.uid));
        const roles = userSnap.exists() ? (userSnap.data() as any).roles : null;
        const ok = !!roles?.admin;
        if (!mounted) return;
        setIsAdmin(ok);
        if (!ok) {
          setLoading(false);
          return;
        }

        // load default rule
        const passRef = doc(db, 'courses', course, 'settings', 'passing');
        const passSnap = await getDoc(passRef);
        const def: DefaultRule = passSnap.exists()
          ? (passSnap.data() as any).default || {}
          : {};
        if (!mounted) return;
        setDefRule(def);

        // load overrides
        const ovCol = collection(
          db,
          'courses',
          course,
          'settings',
          'passing',
          'overrides'
        );
        const ovSnap = await getDocs(
          query(ovCol, orderBy('publishedAt', 'desc'), limit(100))
        );
        const list: OverrideRule[] = [];
        ovSnap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        if (!mounted) return;
        setOvList(list);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || 'Load failed');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [course]);

  // ========= Save default =========
  async function saveDefault() {
    try {
      setErr(null);
      const db = ensureDb();
      const ref = doc(db, 'courses', course, 'settings', 'passing');
      const nextVersion = (defRule.version ?? 0) + 1;
      await setDoc(
        ref,
        {
          default: {
            passPercent:
              defRule.passPercent === undefined
                ? null
                : Number(defRule.passPercent),
            minCorrect:
              defRule.minCorrect === undefined
                ? null
                : Number(defRule.minCorrect),
            timeLimitSec:
              defRule.timeLimitSec === undefined
                ? null
                : Number(defRule.timeLimitSec),
            showClock:
              typeof defRule.showClock === 'boolean'
                ? defRule.showClock
                : true,
            enabled:
              typeof defRule.enabled === 'boolean' ? defRule.enabled : true,
            version: nextVersion,
            publishedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );
      alert('Đã lưu default rule');
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    }
  }

  // ========= Create override =========
  async function createOverride() {
    try {
      setErr(null);
      const db = ensureDb();
      const ovCol = collection(
        db,
        'courses',
        course,
        'settings',
        'passing',
        'overrides'
      );
      await addDoc(ovCol, {
        scope,
        subjectId:
          scope.includes('subject') && subjectId ? subjectId : (null as any),
        year:
        scope.includes('year') && year !== '' ? Number(year) : (null as any),
        passPercent: passPercent === '' ? null : Number(passPercent),
        minCorrect: minCorrect === '' ? null : Number(minCorrect),
        timeLimitSec: timeLimitSec === '' ? null : Number(timeLimitSec),
        showClock,
        enabled,
        note: note || null,
        version: 1,
        publishedAt: serverTimestamp(),
        effectiveFrom: null,
        effectiveTo: null,
      } as OverrideRule);
      alert('Đã tạo override');
      setPassPercent('');
      setMinCorrect('');
      setTimeLimitSec('');
      setNote('');
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || 'Create failed');
    }
  }

  // ========= Render =========
  if (loading) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }
  if (isAdmin === false) {
    return (
      <main style={{ padding: 24, color: 'crimson' }}>
        Bạn không có quyền truy cập trang này.
      </main>
    );
  }
  if (err) {
    return (
      <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        Passing Rules – {course}
      </h1>

      {/* Default rule */}
      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Default rule (áp dụng chung)
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>
            Pass percent (%)
            <input
              type="number"
              value={defRule.passPercent ?? ''}
              onChange={(e) =>
                setDefRule((p) => ({
                  ...p,
                  passPercent:
                    e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>
          <label>
            Min correct (số câu)
            <input
              type="number"
              value={defRule.minCorrect ?? ''}
              onChange={(e) =>
                setDefRule((p) => ({
                  ...p,
                  minCorrect:
                    e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>
          <label>
            Time limit (sec)
            <input
              type="number"
              value={defRule.timeLimitSec ?? ''}
              onChange={(e) =>
                setDefRule((p) => ({
                  ...p,
                  timeLimitSec:
                    e.target.value === '' ? undefined : Number(e.target.value),
                }))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={defRule.showClock ?? true}
              onChange={(e) =>
                setDefRule((p) => ({ ...p, showClock: e.target.checked }))
              }
            />
            Hiện đồng hồ đếm
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={defRule.enabled ?? true}
              onChange={(e) =>
                setDefRule((p) => ({ ...p, enabled: e.target.checked }))
              }
            />
            Bật quy tắc
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            onClick={saveDefault}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #175cd3',
              background: '#175cd3',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            Lưu default
          </button>
          <span style={{ marginLeft: 10, color: '#667085' }}>
            Version hiện tại: {defRule.version ?? 0}
          </span>
        </div>
      </section>

      {/* Create override */}
      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Tạo override
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label>
            Scope
            <select
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as OverrideRule['scope'])
              }
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd' }}
            >
              <option value="global">global</option>
              <option value="subject">subject</option>
              <option value="year">year</option>
              <option value="subject+year">subject+year</option>
            </select>
          </label>

          {(scope === 'subject' || scope === 'subject+year') && (
            <label>
              subjectId
              <input
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                placeholder="VD: TK, KC, L..."
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
              />
            </label>
          )}

          {(scope === 'year' || scope === 'subject+year') && (
            <label>
              year
              <input
                type="number"
                value={year}
                onChange={(e) =>
                  setYear(e.target.value === '' ? '' : Number(e.target.value))
                }
                placeholder="VD: 2023"
                style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
              />
            </label>
          )}

          <label>
            Pass percent (%)
            <input
              type="number"
              value={passPercent}
              onChange={(e) =>
                setPassPercent(e.target.value === '' ? '' : Number(e.target.value))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>

          <label>
            Min correct
            <input
              type="number"
              value={minCorrect}
              onChange={(e) =>
                setMinCorrect(e.target.value === '' ? '' : Number(e.target.value))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>

          <label>
            Time limit (sec)
            <input
              type="number"
              value={timeLimitSec}
              onChange={(e) =>
                setTimeLimitSec(e.target.value === '' ? '' : Number(e.target.value))
              }
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showClock}
              onChange={(e) => setShowClock(e.target.checked)}
            />
            Hiện đồng hồ
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Bật
          </label>

          <label style={{ gridColumn: '1 / -1' }}>
            Ghi chú
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mô tả ngắn"
              style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
            />
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            onClick={createOverride}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #16a34a',
              background: '#16a34a',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            Tạo override
          </button>
        </div>
      </section>

      {/* Danh sách overrides */}
      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Overrides gần đây
        </div>
        {ovList.length === 0 ? (
          <div style={{ color: '#667085' }}>Chưa có override nào.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {ovList.map((o) => (
              <div
                key={o.id}
                style={{
                  border: '1px solid #f1f5f9',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: 12,
                    }}
                  >
                    {o.scope}
                  </span>
                  {o.subjectId && <b>subject: {o.subjectId}</b>}
                  {typeof o.year === 'number' && <span>・year: {o.year}</span>}
                  <span style={{ marginLeft: 'auto', color: '#667085' }}>
                    v{o.version ?? 1}
                  </span>
                </div>
                <div style={{ marginTop: 6, color: '#1f2937' }}>
                  pass%: <b>{o.passPercent ?? '—'}</b> ・ minCorrect:{' '}
                  <b>{o.minCorrect ?? '—'}</b> ・ timeLimit:{' '}
                  <b>{o.timeLimitSec ?? '—'}</b> ・ clock:{' '}
                  <b>{String(o.showClock ?? true)}</b> ・ enabled:{' '}
                  <b>{String(o.enabled ?? true)}</b>
                  {o.note && <div style={{ color: '#475467' }}>note: {o.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
