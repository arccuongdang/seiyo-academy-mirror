'use client';

/**
 * Firebase Client – Backward compatible exports
 * ---------------------------------------------------------------------------
 * Mục tiêu:
 *  - Giữ nguyên các export mà code cũ đang dùng: auth, db, requireUser,
 *    serverTimestamp, signInWithGoogle, signInWithEmail, signUpWithEmail,
 *    waitForUser, doSignOut.
 *  - Cung cấp thêm helpers mới: getDb, getFirebaseAuth, recordAttempt, ...
 *  - Không dùng "@/"; chỉ đường dẫn tương đối ở nơi khác import file này.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  serverTimestamp as _serverTimestamp,
  collection,
  collectionGroup,
  doc,
  addDoc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  type Firestore,
} from 'firebase/firestore';

/* ----------------------------------------------------------------------------
 * SECTION A. Init (singleton)
 * -------------------------------------------------------------------------- */

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function ensureApp(): FirebaseApp {
  if (_app) return _app;
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) {
    // Nên cấu hình đủ biến môi trường client trước khi build/chạy
    console.warn('[firebase] Missing NEXT_PUBLIC_FIREBASE_* envs');
  }
  _app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return _app;
}

/** 👉 NEW: getter helpers (an toàn gọi lặp) */
export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(ensureApp());
  return _auth!;
}
export function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(ensureApp());
  return _db!;
}

/** 👉 Back-compat: export biến theo tên cũ (code hiện tại đang import) */
export const auth = getFirebaseAuth();
export const db = getDb();

/** 👉 Back-compat: re-export serverTimestamp theo tên cũ */
export const serverTimestamp = _serverTimestamp;

/* ----------------------------------------------------------------------------
 * SECTION B. Auth helpers (back-compat)
 * -------------------------------------------------------------------------- */

/** Sign in with Google (popup) */
export async function signInWithGoogle(): Promise<User> {
  const a = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(a, provider);
  return res.user;
}

/** Email / password sign in */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const a = getFirebaseAuth();
  const res = await signInWithEmailAndPassword(a, email, password);
  return res.user;
}

/** Email / password sign up */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const a = getFirebaseAuth();
  const res = await createUserWithEmailAndPassword(a, email, password);
  return res.user;
}

/** Wait until first auth state emission (resolve ngay nếu đã có user) */
export function waitForUser(): Promise<User | null> {
  const a = getFirebaseAuth();
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(a, (u) => {
      unsub();
      resolve(u);
    });
  });
}

/** Require user: throw nếu chưa đăng nhập */
export async function requireUser(): Promise<User> {
  const u = await waitForUser();
  if (!u) throw new Error('AUTH_REQUIRED');
  return u;
}

/** Sign out current user */
export async function doSignOut(): Promise<void> {
  const a = getFirebaseAuth();
  await signOut(a);
}

/* ----------------------------------------------------------------------------
 * SECTION C. Analytics (optional helpers – giữ nguyên từ bước 16)
 * -------------------------------------------------------------------------- */

export type AttemptDoc = {
  userId: string;
  courseId: string;
  subjectId: string;
  questionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  examYear?: number;
  difficulty?: string | null;
  tags?: string[] | string | null;
  sourceNote?: string | null;
  sessionId?: string;
  createdAt: any; // serverTimestamp()
};

export type AttemptSession = {
  userId: string;
  courseId: string;
  subjectId: string;
  sessionId: string;
  year?: number;
  total: number;
  correct: number;
  blank: number;
  scorePercent: number;
  createdAt: any; // serverTimestamp()
};

export async function recordAttempt(input: Omit<AttemptDoc, 'createdAt'>) {
  const colRef = collection(getDb(), 'users', input.userId, 'attempts');
  await addDoc(colRef, { ...input, createdAt: _serverTimestamp() });
}

export async function recordAttemptSessionSummary(s: Omit<AttemptSession, 'createdAt'>) {
  const ref = doc(getDb(), 'users', s.userId, 'attemptSessions', s.sessionId);
  await setDoc(ref, { ...s, createdAt: _serverTimestamp() }, { merge: true });
}

export async function fetchRecentAttemptsByUser(userId: string, n = 20): Promise<AttemptDoc[]> {
  const qy = query(
    collectionGroup(getDb(), 'attempts'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(n),
  );
  const snap = await getDocs(qy);
  return snap.docs.map((d) => d.data() as AttemptDoc);
}
