'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../lib/auth/useAuth';
import { db } from '../lib/firebase/client';

export default function ProfileGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      if (!ready) return; // đợi auth ready
      if (!user) {
        router.replace('/signin');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const ok = snap.exists() && snap.data()?.profileComplete === true;
        if (!ok) {
          router.replace('/onboarding?reason=need_profile');
          return;
        }
      } finally {
        setChecking(false);
      }
    })();
  }, [ready, user, router]);

  if (!ready || checking) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }
  return <>{children}</>;
}
