'use client';

import { useEffect, useState } from 'react';

type Mode = 'subject' | 'year';

export type FilterFormProps = {
  mode: Mode;
  courseId: string;

  // khóa sẵn theo URL
  lockedSubjectId?: string | null; // mode=subject
  lockedYear?: number | null;      // mode=year

  // dữ liệu có thật đã được page chuẩn bị
  availableYears?: number[]; // desc – chỉ dùng cho mode=subject
  availableSubjects?: { subjectId: string; nameJA?: string; nameVI?: string }[]; // chỉ dùng cho mode=year

  // mặc định
  defaults?: { count?: 5 | 10 | 15 | 20 | 25; shuffleOptions?: boolean };

  // key lưu localStorage (per course+mode)
  storageKey?: string;

  // callback khi bấm “Bắt đầu”
  onConfirm: (params: {
    mode: Mode;
    subjectId?: string;
    year?: number;
    randomLast?: 5 | 10 | null;
    years?: number[];
    count?: 5 | 10 | 15 | 20 | 25;
    shuffle?: boolean; // shuffle đáp án
  }) => void;
};

/** State được “siết kiểu” để tránh boolean | undefined */
type State = {
  subjectId: string | null;
  year: number | null;
  randomLast: 5 | 10 | null;
  years: number[];                       // << luôn là mảng
  count: 5 | 10 | 15 | 20 | 25;          // << luôn có giá trị
  shuffleOptions: boolean;               // << luôn có giá trị
};

const COUNT_CHOICES = [5, 10, 15, 20, 25] as const;
const RANDOM_PRESETS = [5, 10] as const;

function toEraLabel(y: number): string {
  if (y >= 2019) return `令和${y - 2018}年（${y}年）`;
  if (y >= 1989) return `平成${y - 1988}年（${y}年）`;
  return `${y}年`;
}

export default function FilterForm({
  mode,
  courseId,
  lockedSubjectId,
  lockedYear,
  availableYears = [],
  availableSubjects = [],
  defaults,
  storageKey,
  onConfirm,
}: FilterFormProps) {
  const storageKeyFinal = storageKey || `seiyo:filter:${courseId}:${mode}`;

  // --- init state (có guard localStorage & luôn điền default đầy đủ) -----------
  const [state, setState] = useState<State>(() => {
    const base: State = {
      subjectId: lockedSubjectId ?? null,
      year: lockedYear ?? null,
      randomLast: null,
      years: [],
      count: (defaults?.count ?? 10) as State['count'],
      shuffleOptions: !!defaults?.shuffleOptions,
    };
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(storageKeyFinal);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<State>;
          return {
            subjectId: parsed.subjectId ?? base.subjectId,
            year: parsed.year ?? base.year,
            randomLast: (parsed.randomLast as State['randomLast']) ?? base.randomLast,
            years: Array.isArray(parsed.years) ? parsed.years : base.years,
            count: (parsed.count as State['count']) ?? base.count,
            shuffleOptions:
              typeof parsed.shuffleOptions === 'boolean' ? parsed.shuffleOptions : base.shuffleOptions,
          };
        }
      }
    } catch {
      // ignore
    }
    return base;
  });

  // đồng bộ khi khóa thay đổi
  useEffect(() => {
    setState(s => ({
      ...s,
      subjectId: lockedSubjectId ?? s.subjectId ?? null,
      year: lockedYear ?? s.year ?? null,
    }));
  }, [lockedSubjectId, lockedYear]);

  // nếu đang chọn preset (randomLast) thì cập nhật years theo availableYears mỗi khi availableYears đổi
  useEffect(() => {
    if (mode === 'subject' && state.randomLast && availableYears.length) {
      const picked = availableYears.slice(0, state.randomLast);
      setState(s => ({ ...s, years: picked }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears]);

  // lưu localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKeyFinal, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, storageKeyFinal]);

  // helpers
  function set<K extends keyof State>(key: K, val: State[K]) {
    setState(s => ({ ...s, [key]: val }));
  }

  function toggleYear(y: number) {
    setState(s => {
      const setYears = new Set<number>(s.years);
      if (setYears.has(y)) setYears.delete(y);
      else setYears.add(y);
      return {
        ...s,
        years: Array.from(setYears).sort((a, b) => b - a),
        randomLast: null, // chọn cụ thể thì bỏ preset
      };
    });
  }

  function setPreset(n: 5 | 10 | null) {
    setState(s => ({
      ...s,
      randomLast: n,
      years: n ? availableYears.slice(0, n) : s.years, // nếu null → giữ years hiện tại
    }));
  }

  // submit
  function handleStart() {
    if (mode === 'subject') {
      if (!state.subjectId) {
        alert('Vui lòng chọn môn.');
        return;
      }
      onConfirm({
        mode,
        subjectId: state.subjectId,
        randomLast: state.randomLast,
        years: state.randomLast ? undefined : state.years, // chỉ gửi years khi KHÔNG dùng preset
        count: state.count,
        shuffle: state.shuffleOptions,
      });
    } else {
      if (!state.year) {
        alert('Thiếu năm.');
        return;
      }
      if (!state.subjectId) {
        alert('Vui lòng chọn môn.');
        return;
      }
      onConfirm({
        mode,
        subjectId: state.subjectId,
        year: state.year,
        shuffle: state.shuffleOptions,
      });
    }
  }

  // --- UI ---------------------------------------------------------------------
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* MODE = SUBJECT */}
      {mode === 'subject' && (
        <>
          {/* Môn */}
          <section style={box}>
            <div style={boxTitle}>Môn</div>
            <div><code>{state.subjectId}</code></div>
            <div style={hint}>
              Môn được cố định từ trang trước. Muốn chọn môn khác? Quay lại trang khoá học.
            </div>
          </section>

          {/* Năm */}
          <section style={box}>
            <div style={boxTitle}>Năm</div>

            {/* Presets */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {RANDOM_PRESETS.map(n => (
                <button
                  key={n}
                  onClick={() => setPreset(n)}
                  style={chip(state.randomLast === n)}
                >
                  {n} năm gần nhất
                </button>
              ))}
              <button onClick={() => setPreset(null)} style={chip(state.randomLast == null)}>
                Chọn cụ thể
              </button>
            </div>

            {/* Danh sách năm */}
            {/* << sửa cú pháp & boolean thuần */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableYears.length ? (
                availableYears.map(y => (
                  <button
                    key={y}
                    onClick={() => toggleYear(y)}
                    style={chip(state.years.includes(y))}  
                  >
                    {toEraLabel(y)}
                  </button>
                ))
              ) : (
                <div style={hint}>Môn này chưa có năm nào trong dữ liệu.</div>
              )}
            </div>

            <div style={hint}>
              * Nếu preset 5/10 năm mà dữ liệu ít hơn, hệ thống sẽ dùng tất cả năm hiện có.
            </div>
          </section>

          {/* Số câu */}
          <section style={box}>
            <div style={boxTitle}>Số câu</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COUNT_CHOICES.map(c => (
                <button
                  key={c}
                  onClick={() => set('count', c)}
                  style={chip(state.count === c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </section>

          {/* Tuỳ chọn */}
          <section style={box}>
            <div style={boxTitle}>Tuỳ chọn</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={state.shuffleOptions}
                onChange={e => set('shuffleOptions', e.target.checked)}
              />
              Trộn đáp án (mặc định tắt)
            </label>
          </section>
        </>
      )}

      {/* MODE = YEAR */}
      {mode === 'year' && (
        <>
          {/* Năm */}
          <section style={box}>
            <div style={boxTitle}>Năm</div>
            <div><code>{state.year}</code></div>
            <div style={hint}>Năm được cố định từ trang trước.</div>
          </section>

          {/* Môn */}
          <section style={box}>
            <div style={boxTitle}>Môn</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableSubjects.length ? (
                availableSubjects.map(s => (
                  <button
                    key={s.subjectId}
                    onClick={() => set('subjectId', s.subjectId)}
                    style={chip(state.subjectId === s.subjectId)}
                  >
                    {s.nameJA || s.subjectId}
                  </button>
                ))
              ) : (
                <div style={hint}>Chưa có môn nào cho năm này.</div>
              )}
            </div>
          </section>

          {/* Tuỳ chọn */}
          <section style={box}>
            <div style={boxTitle}>Tuỳ chọn</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={state.shuffleOptions}
                onChange={e => set('shuffleOptions', e.target.checked)}
              />
              Trộn đáp án (mặc định tắt)
            </label>
          </section>
        </>
      )}

      {/* Start */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={handleStart} style={primaryBtn}>
          Bắt đầu
        </button>
      </div>
    </div>
  );
}

/* ===== styles ===== */

const box: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
};

const boxTitle: React.CSSProperties = {
  fontWeight: 800,
  marginBottom: 8,
};

const hint: React.CSSProperties = {
  color: '#6b7280',
  fontSize: 12,
  marginTop: 6,
};

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: active ? '2px solid #175cd3' : '1px solid #e5e7eb',
    background: active ? '#eff6ff' : '#fff',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
  };
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #175cd3',
  background: '#175cd3',
  color: '#fff',
  fontWeight: 800,
};
