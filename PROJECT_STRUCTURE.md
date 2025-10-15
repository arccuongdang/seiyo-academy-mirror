# Project structure for Seiyo-academy

This file was generated automatically from `repo_files.txt` on 2025-10-15.

Top-level layout (folders and important files):

- .firebaserc                    - Firebase project config
- .gitignore
- .vscode/settings.json
- README.md
- data-source/                   - raw data and spreadsheets
  - SeiyoQuestions_Database_v2_202513.xlsm
- eslint.config.mjs
- firebase.json
- firestore.indexes.json
- firestore.rules
- global.d.ts
- next.config.ts
- package.json
- package-lock.json
- postcss.config.mjs
- repo_structure.txt
- PROJECT_STRUCTURE.md            - this file
- public/                        - static assets
  - data/
    - index.json
    - 2k-kientruc/2024/*.csv
    - tokutei/2024/*.csv
  - file.svg
  - globe.svg
  - kuromoji/dict/*.dat.gz
  - next.svg
  - snapshots/
    - KTS2/*.json
    - manifest.json
    - subjects.json
  - vercel.svg
  - window.svg
- scripts/
  - copy-kuromoji-dict.cjs
  - publish-snapshots.ts
- src/
  - app/
    - admin/
      - courses/[course]/passing/page.tsx
      - data/layout.tsx
      - data/page.tsx
    - api/auth/[...nextauth]/route.ts
    - courses/
      - layout.tsx
      - page.tsx
      - [course]/
        - page.tsx
        - filter/page.tsx
        - practice/
          - page.tsx
          - start/page.tsx
          - year/page.tsx
    - favicon.ico
    - globals.css
    - layout.tsx
    - login/page.tsx
    - mypage/page.tsx
    - onboarding/page.tsx
    - page.tsx
    - providers/AuthProvider.tsx
    - signin/page.tsx
  - components/
    - AuthGate.tsx
    - BottomNav.tsx
    - FilterForm.tsx
    - ProfileGate.tsx
    - SignOutButton.tsx
    - TopNav.tsx
  - lib/
    - analytics/attempts.ts
    - auth/useAuth.ts
    - firebase/client.ts
    - jp/kuroshiro.ts
    - passing/rules.ts
    - qa/
      - excel.ts
      - formatters.ts
      - grade.ts
      - guards.ts
      - jpEra.ts
      - normalize.ts
      - schema.ts
      - shuffle.ts
      - types.ts
  - types/
    - file-saver.d.ts
    - kuroshiro.d.ts
- tsconfig.json

How to regenerate this file

From a command-line at the repo root (Windows cmd):

  dir /s /b > repo_files.txt
  (manually review `repo_files.txt`)
  (then update `PROJECT_STRUCTURE.md` by hand or re-run any generator script you use)

Notes and suggestions

- The project is a Next.js app (see `src/app` and `next.config.ts`).
- Static data lives under `public/data` and `public/snapshots`.
- Consider adding an npm script (e.g. `npm run tree`) to regenerate a machine-readable tree if you want to keep this file up-to-date.

Small enhancement suggestion (optional): Add a script `scripts/gen-structure.js` that reads `repo_files.txt` and outputs `PROJECT_STRUCTURE.md` in a consistent format.

Completion status: created by script.
