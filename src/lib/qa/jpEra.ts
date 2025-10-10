// src/lib/qa/jpEra.ts

// Trả về "令和6年（2024年）" kiểu đơn giản (chỉ Heisei/Reiwa cho đề gần đây)
export function formatJpEra(year: number): string {
  if (!Number.isFinite(year)) return String(year);
  if (year >= 2019) {
    const n = year - 2018; // 2019 = 令和元(1)
    return `令和${n}年（${year}年）`;
  }
  if (year >= 1989) {
    const n = year - 1988; // 1989 = 平成元(1)
    return `平成${n}年（${year}年）`;
  }
  // fallback
  return `${year}年`;
}
