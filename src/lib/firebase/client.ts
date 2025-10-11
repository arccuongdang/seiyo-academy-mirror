// src/lib/firebase/client.ts
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, serverTimestamp, collection, doc, writeBatch, setDoc, addDoc, getDoc
} from 'firebase/firestore';
import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, type User,
  setPersistence, browserLocalPersistence
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Bật local persistence để “ghi nhớ đăng nhập”
setPersistence(auth, browserLocalPersistence).catch(() => { /* ignore */ });

// ===== Auth helpers =====
let _userPromise: Promise<User | null> | null = null;
export function waitForUser(): Promise<User | null> {
  if (_userPromise) return _userPromise;
  _userPromise = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u ?? null);
    });
  });
  return _userPromise;
}
export async function requireUser(): Promise<User> {
  const u = await waitForUser();
  if (!u) throw new Error('AUTH_REQUIRED');
  return u;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}
export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}
export async function doSignOut() {
  return signOut(auth);
}

export { serverTimestamp, collection, doc, writeBatch, setDoc, addDoc, getDoc };
