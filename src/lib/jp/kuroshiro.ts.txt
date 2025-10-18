// src/lib/jp/kuroshiro.ts
let _kuroshiroPromise: Promise<any> | null = null;

export async function getKuroshiro() {
  if (_kuroshiroPromise) return _kuroshiroPromise;

  _kuroshiroPromise = (async () => {
    const { default: Kuroshiro } = await import('kuroshiro');
    const { default: KuromojiAnalyzer } = await import('kuroshiro-analyzer-kuromoji');

    const kuroshiro = new Kuroshiro();
    const analyzer = new KuromojiAnalyzer({ dictPath: '/kuromoji/dict' }); // served from public/
    await kuroshiro.init(analyzer);
    return kuroshiro;
  })();

  return _kuroshiroPromise;
}

/** Convert JA text -> HTML <ruby> with hiragana furigana */
export async function toFuriganaHtml(ja: string): Promise<string> {
  if (!ja) return '';
  const kuroshiro = await getKuroshiro();
  // mode 'furigana' => <ruby><rb>漢字</rb><rt>かんじ</rt></ruby>
  // to 'hiragana' as requested
  return kuroshiro.convert(ja, { mode: 'furigana', to: 'hiragana' });
}
