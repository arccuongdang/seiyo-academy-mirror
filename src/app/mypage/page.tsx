'use client';

// Không dùng next/dynamic ở Server Component nữa.
// Chỉ cần cho cả trang là Client Component rồi import MyPageClient.

import MyPageClient from './MyPageClient';

export default function Page() {
  return <MyPageClient />;
}

// (tuỳ chọn) Nếu bạn muốn chắc chắn Next không prerender:
// export const dynamic = 'force-dynamic';
