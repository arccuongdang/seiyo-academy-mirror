// src/app/fonts.ts
import { Noto_Sans_JP, Noto_Sans } from 'next/font/google'

// Font cho tiếng Nhật (không có subset 'japanese' → dùng 'latin' hoặc bỏ hẳn subsets)
export const notoJP = Noto_Sans_JP({
  // subsets: ['latin'], // có thể ghi rõ hoặc bỏ dòng này
  weight: ['400', '500', '700'],
  variable: '--font-noto-jp',
  display: 'swap',
})

// Font cho tiếng Việt (có subset 'vietnamese')
export const notoVI = Noto_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-vi',
  display: 'swap',
})
