'use client';

/**
 * useAuth (client-only)
 * - Guard `auth` which is typed as `Auth | null` in SSR-safe client setup.
 * - Avoids TS error at onAuthStateChanged(auth, ...) by checking for null.
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User, type Auth } from 'firebase/auth';
import { auth as _auth } from '../firebase/client';

/** Auth can be `null` during SSR/prerender. Guard it for TS & runtime safety. */
function ensureAuth(): Auth | null {
  return _auth ?? null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const a = ensureAuth();
    // If auth is not available (SSR or env missing), mark ready with no user
    if (!a) {
      setUser(null);
      setReady(true);
      return;
    }
    const unsub = onAuthStateChanged(a, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  return { user, ready };
}
