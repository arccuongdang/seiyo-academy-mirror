// src/app/admin/data/layout.tsx
/**
 * Admin Data Layout — NextAuth gate with email whitelist
 * - Requires sign-in
 * - Requires email ∈ NEXT_PUBLIC_ADMIN_EMAILS (comma-separated)
 * - Non-admin users are redirected to /mypage (not /courses to avoid loops)
 */
import { ReactNode } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../api/auth/[...nextauth]/route'

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 
  'arccuongdang@gmail.com,nguyentrunghieu@seiyobuilding.co.jp,trunghieu16@gmail.com'
)
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

/**
 * Lưu ý:
 * - NEXT_PUBLIC_* sẽ lộ ra client bundle. Nếu không cần client dùng,
 *   hãy dùng ADMIN_EMAILS (không NEXT_PUBLIC) trong server component.
 * - File này là server component (getServerSession), nên có thể đọc env không-public.
 */

export default async function AdminDataLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session || !session.user?.email) {
    // Keep it simple: send to signin. You may add a callbackUrl if desired.
    redirect('/api/auth/signin')
  }

  const email = String(session.user.email).toLowerCase()
  if (!ADMIN_EMAILS.includes(email)) {
    redirect('/mypage')
  }

  return <>{children}</>
}
