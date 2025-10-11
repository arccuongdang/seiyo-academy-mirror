import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import Link from "next/link";
import SignOutButton from "../components/SignOutButton";


export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <main className="p-8 space-y-6 text-center">
        <h1 className="text-3xl font-bold mb-4">Seiyo Academy</h1>
        <p className="text-gray-600 mb-6">Hệ thống học trực tuyến 二級建築士</p>
        <Link
          href="/login"
          className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800"
        >
          Đăng nhập với Google
        </Link>
      </main>
    );
  }

  return (
    <main className="p-8 space-y-6 text-center">
      <h1 className="text-3xl font-bold mb-4">
        Xin chào, {session.user?.name || "bạn"} 👋
      </h1>
      <p className="text-gray-600 mb-6">
        Hãy chọn khóa học để bắt đầu.
      </p>
      <Link
        href="/courses"
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
      >
        Vào danh sách khóa học
      </Link>
      {/* ✅ Thêm nút Đăng xuất ngay bên dưới */}
      <div className="mt-4">
        <SignOutButton />
      </div>
    </main>
  );
}
