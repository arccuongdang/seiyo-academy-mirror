'use client';
import { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase/client';
import { onAuthStateChanged, type User } from 'firebase/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setReady(true);
    });
    return () => unsub();
  }, []);
  return { user, ready };
}
