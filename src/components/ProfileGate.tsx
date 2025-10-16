'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { useAuth } from '../lib/auth/useAuth';
import { db as _db } from '../lib/firebase/client';

/** Firestore in client lib can be `Firestore | null` during SSR/prerender.
 *  Guard it so TypeScript is happy and runtime is safe.
 */
function ensureDb(): Firestore {
  if (!_db) {
    throw new Error('Firestore is not available on this runtime. Ensure this component runs on client and env vars are set.');
  }
  return _db;
}

export default function ProfileGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return; // đợi auth ready
      if (!user) {
        router.replace('/signin');
        return;
      }
      try {
        const db = ensureDb();
        const snap = await getDoc(doc(db, 'users', user.uid));
        const ok = snap.exists() && (snap.data() as any)?.profileComplete === true;
        if (!ok) {
          router.replace('/onboarding?reason=need_profile');
          return;
        }
      } catch (e: any) {
        if (mounted) setErr(e?.message || 'Profile check failed');
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [ready, user, router]);

  if (!ready || checking) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }
  if (err) {
    return <main style={{ padding: 24, color: 'crimson' }}>Lỗi: {err}</main>;
  }
  return <>{children}</>;
}
