'use client';

/**
 * Firebase client (SSR-safe)
 * ------------------------------------------------------------------
 * - Exposes `auth: Auth | null` and `db: Firestore | null` to avoid
 *   accidental SSR initialization (which caused build errors &
 *   auth/invalid-api-key previously).
 * - Avoids "Duplicate identifier 'Firestore'" by NOT importing the
 *   Firestore type name directly; instead we alias via `import(...)`.
 * - Provides small helpers used across the app:
 *     waitForUser(), requireUser(), signInWithGoogle(), signInWithEmail(),
 *     signUpWithEmail(), doSignOut(), serverTimestamp()
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as _signOut,
  onAuthStateChanged,
  type User,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  serverTimestamp as _serverTimestamp,
} from 'firebase/firestore';

// ---- Type alias without importing the name `Firestore` (prevents duplicate identifier) ----
type Firestore = import('firebase/firestore').Firestore;

const isBrowser = typeof window !== 'undefined';

// Env vars (must be defined on client at runtime)
const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isBrowser) {
  // Only initialize on client to avoid SSR build errors
  if (!getApps().length) {
    // Guard against missing envs — don't attempt init with undefined
    const hasAll =
      !!cfg.apiKey &&
      !!cfg.authDomain &&
      !!cfg.projectId &&
      !!cfg.appId;

    if (hasAll) {
      app = initializeApp(cfg as any);
      auth = getAuth(app);
      db = getFirestore(app);
    } else {
      // Leave app/auth/db as null; callers must guard.
      console.warn('[firebase] Missing env config; client not initialized');
    }
  } else {
    app = getApps()[0] || null;
    if (app) {
      auth = getAuth(app);
      db = getFirestore(app);
    }
  }
}

// ---- Helpers ----------------------------------------------------------------

export { app, auth, db };

export const serverTimestamp = _serverTimestamp;

/** Wait for current user once (resolves fast if already available). */
export function waitForUser(): Promise<User | null> {
  return new Promise((resolve) => {
    if (!auth) return resolve(null);
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u ?? null);
    });
  });
}

/** Ensure a signed-in user; throw with clear message if not. */
export async function requireUser(): Promise<User> {
  const u = await waitForUser();
  if (!u) {
    const err: any = new Error('AUTH_REQUIRED');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  return u;
}

// ---- Auth flows -------------------------------------------------------------

export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error('Firebase Auth is not initialized on this runtime');
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!auth) throw new Error('Firebase Auth is not initialized on this runtime');
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  if (!auth) throw new Error('Firebase Auth is not initialized on this runtime');
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function doSignOut(): Promise<void> {
  if (!auth) return;
  await _signOut(auth);
}
