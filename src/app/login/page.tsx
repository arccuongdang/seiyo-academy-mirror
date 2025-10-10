'use client';
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Đăng nhập</h1>
      <button
        onClick={() => signIn("google", { callbackUrl: "/courses" })}
        className="px-4 py-2 rounded bg-black text-white"
      >
        Đăng nhập với Google
      </button>
    </main>
  );
}
