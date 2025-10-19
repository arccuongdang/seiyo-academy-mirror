
'use client'

import { useEffect, useState } from 'react'
import { toFuriganaHtml } from '../lib/jp/kuroshiro'

type Props = {
  ja?: string
  vi?: string
  lang: 'JA' | 'VI'
  showFurigana?: boolean
  className?: string
}

export default function BilingualText({ ja, vi, lang, showFurigana, className }: Props) {
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (lang === 'JA') {
        const text = (ja ?? '').trim()
        if (!text) { if (mounted) setHtml(''); return }
        if (showFurigana) {
          try {
            const h = await toFuriganaHtml(text)
            if (mounted) setHtml(h || escapeHtml(text))
            return
          } catch {
            if (mounted) setHtml(escapeHtml(text))
            return
          }
        }
        if (mounted) setHtml(escapeHtml(text))
      } else {
        const t = (vi ?? '').trim()
        if (mounted) setHtml(escapeHtml(t || (ja ?? '')))
      }
    })()
    return () => { mounted = false }
  }, [ja, vi, lang, showFurigana])

  if (!html) return null
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
