import './globals.css';
import type { Metadata } from 'next';

// Hai thanh điều hướng là Client Components (theo dõi trạng thái đăng nhập Firebase)
// => Có thể import bình thường trong Server Component layout.
import TopNav from '../components/TopNav';
import BottomNav from '../components/BottomNav';

/**
 * metadata:
 * - Khai báo SEO cơ bản cho toàn site.
 * - Next.js sẽ dùng ở <head>.
 */
export const metadata: Metadata = {
  title: 'Seiyo Academy',
  description: 'Seiyo Academy Data System',
};

/**
 * RootLayout (Server Component)
 * ------------------------------------------------------------
 * Vai trò:
 * 1) Bao bọc mọi trang với khung HTML chung, nạp CSS toàn cục.
 * 2) Hiển thị TopNav (cố định trên) + BottomNav (cố định dưới) ở mọi trang.
 * 3) Chừa khoảng trống (padding) trên/dưới để nội dung không bị che.
 *
 * Lưu ý:
 * - TopNav/BottomNav là Client Components vì cần theo dõi trạng thái đăng nhập.
 * - 48px là chiều cao TopNav; 56px là dự phòng cho BottomNav (khoảng 52px + 4px).
 * - Nếu có trang cần "toàn màn hình" (ví dụ xem PDF, in ấn), về sau có thể bổ sung
 *   flag query (?fullscreen=1) để ẩn hai thanh — sẽ xử lý trong TopNav/BottomNav.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      {/*
        body:
        - margin: 0 để loại bỏ khoảng trống mặc định.
        - paddingTop/paddingBottom để tránh nội dung bị đè bởi nav cố định.
        - background giữ trắng; có thể chuyển sang className nếu bạn dùng Tailwind/utility.
      */}
      <body style={{ margin: 0, paddingTop: 48, paddingBottom: 56, background: '#ffffff' }}>
        {/* Thanh điều hướng trên cùng (cố định) */}
        <TopNav />

        {/* Nội dung động của từng route */}
        {children}

        {/* Thanh điều hướng dưới cùng (cố định) */}
        <BottomNav />
      </body>
    </html>
  );
}
