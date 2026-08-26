# Roblox Clothing Designer

Lean, mobile-first editor for designing Roblox classic clothing (shirt/pants templates) for children aged 8-10, with a template compositor, lazy-loaded R6 3D preview, and parent-gated AI pattern generation. Built with Preact + Vite + TypeScript; the app never persists project content or keys to browser storage.

## Dev commands

- `npm install` - install dependencies (Node >= 22)
- `npm run dev` - start the Vite dev server
- `npm run build` - production build to `dist/` (sourcemaps off, 3D preview as a lazy chunk)
- `npm run typecheck` - `tsc --noEmit` (TypeScript 7 native compiler)
- `npm run lint` - ESLint with typescript-eslint
- `npm run test:unit` - Vitest node-environment unit tests
- `npm run test:browser` - Vitest browser-mode tests (Chromium full, Firefox/WebKit smoke)
- `npm run test:e2e` - Playwright end-to-end suite
- `npx playwright install chromium firefox webkit` - one-time browser binary install
- `npm run test:pwa`, `npm run check:bundle`, `npm run check:release` - placeholders until later milestones

## Toolchain note

`typescript` 7 is the native (Go) compiler without a stable JS API; per the official TypeScript 7 migration guide it is installed as `@typescript/native` (npm alias of `typescript@7.0.2`) so `npx tsc` uses TS 7, while `typescript` aliases `@typescript/typescript6` to provide the TS 6 API that `typescript-eslint` requires.
