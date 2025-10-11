declare module 'kuroshiro' {
  type ConvertMode = 'romaji' | 'katakana' | 'hiragana' | 'furigana';
  type ToTarget = 'hiragana' | 'katakana' | 'romaji';
  type RomajiSystem = 'hepburn' | 'kunrei' | 'passport';

  export default class Kuroshiro {
    constructor();
    init(analyzer: any): Promise<void>;
    convert(
      str: string,
      options?: {
        mode?: ConvertMode;
        to?: ToTarget;
        romajiSystem?: RomajiSystem;
        delimiter_start?: string;
        delimiter_end?: string;
      }
    ): Promise<string>;
  }
}

declare module 'kuroshiro-analyzer-kuromoji' {
  export default class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
  }
}
