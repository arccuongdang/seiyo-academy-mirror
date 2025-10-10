export function formatJpEra(year: number): string {
  if (!Number.isFinite(year)) return String(year);
  if (year >= 2019) {
    const n = year - 2018;
    return `令和${n}年（${year}年）`;
  }
  if (year >= 1989) {
    const n = year - 1988;
    return `平成${n}年（${year}年）`;
  }
  return `${year}年`;
}
