// src/app/admin/data/layout.tsx
/**
 * =============================================================================
 *  Admin Data Layout – Gate bằng NextAuth (App Router)
 * -----------------------------------------------------------------------------
 *  - Yêu cầu đăng nhập
 *  - Yêu cầu role = 'admin' (được set trong JWT ở route auth)
 *  - Nếu không đạt: redirect về trang đăng nhập hoặc trang chủ
 * =============================================================================
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../../api/auth/[...nextauth]/route";

/* =============================================================================
 * SECTION A. Layout gate
 *  - Đây là Server Component async, chạy trước khi render children
 *  - Sử dụng getServerSession(authOptions) để lấy session
 * ========================================================================== */

export default async function AdminDataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1) Lấy session (JWT-based) theo cấu hình ở auth route
  const session = await getServerSession(authOptions);

  // 2) Nếu chưa đăng nhập → chuyển đến NextAuth signin route
  if (!session) {
    // Có thể thêm callbackUrl nếu muốn quay lại trang đang vào
    // redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent('/admin/data')}`);
    redirect("/api/auth/signin");
  }

  // 3) Kiểm tra quyền admin (role được gắn trong callbacks.jwt ở auth route)
  const role = (session.user as any)?.role ?? "user";
  if (role !== "admin") {
    // Không đủ quyền → đưa về trang chủ (hoặc trang 403 của bạn)
    redirect("/");
  }

  // 4) Hợp lệ → render nội dung admin
  return <>{children}</>;
}

/* =============================================================================
 * SECTION B. Ghi chú
 * -----------------------------------------------------------------------------
 * - Role 'admin' được set trong src/app/api/auth/[...nextauth]/route.ts
 *   dựa vào ADMIN_EMAILS (ENV). Bạn có thể thay đổi rule tuỳ ý.
 * - Nếu muốn gate cả /admin/* ở middleware.ts để UX đẹp hơn, vẫn nên
 *   giữ gate ở đây để chắc chắn (defense in depth).
 * =============================================================================
 */
