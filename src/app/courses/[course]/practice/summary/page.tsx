'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function SummaryPage() {
  const params = useParams<{ course: string }>()
  const courseId = decodeURIComponent(String(params?.course || ''))

  return (
    <main style={{ padding:24, maxWidth:980, margin:'0 auto', display:'grid', gap:16 }}>
      <h1 className="text-2xl font-bold">Tổng kết bài làm</h1>
      <p>
        Hiển thị toàn bộ lời giải chi tiết cho các câu chưa nộp hoặc trả lời sai. Điểm chỉ tính các câu đúng.
      </p>
      <Link href={`/courses/${encodeURIComponent(courseId)}`} className="px-3 py-2 border rounded w-max">Về trang khóa</Link>
    </main>
  )
}
