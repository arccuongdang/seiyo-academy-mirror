'use client';

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="px-4 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300"
    >
      Đăng xuất
    </button>
  );
}
