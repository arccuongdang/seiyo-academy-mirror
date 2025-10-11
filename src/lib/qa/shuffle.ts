// src/lib/qa/shuffle.ts
import type { OptionItem } from "./types";

/** Fisher–Yates shuffle, trả bản sao mới */
export function shuffleArray<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Tráo đáp án nhưng bảo toàn mapping đáp án đúng qua `id`.
 * Trả về options đã tráo + danh sách correctIds (để grading dùng)
 */
export function shuffleOptions(
  options: OptionItem[],
  rng?: () => number
): { options: OptionItem[]; correctIds: string[] } {
  const shuffled = shuffleArray(options, rng);
  const correctIds = shuffled.filter(o => o.isAnswer).map(o => o.id);
  return { options: shuffled, correctIds };
}
