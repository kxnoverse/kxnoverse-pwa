# KxnoDesk project context

Updated 2026-10-29. This is a handover snapshot, not a completion claim or a redesign plan.

## Project and structure

KxnoDesk is a client-side school productivity PWA built with React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Zustand, Dexie/IndexedDB, i18next, and Lucide React. TipTap powers Docs editing; PDF.js and pdf-lib support PDF viewing and annotation. The optional AI service has a separate implementation under `workers/ai`.

- `src/App.tsx`: hash-routed application entry; pages are lazy-loaded.
- `src/components/`: application shell, brand, background renderer, and shared UI.
- `src/pages/`: Home, Timetable, Settings, Assistant, Calendar, Docs, Timer, Files, Arcade, Calculator, Translate, Workspace, Solve, and Code.
- `src/data/`: IndexedDB schema, feature logic, imports/exports, and backup validation.
- `src/stores/`: persisted client state, including appearance preferences.
- `src/locales/`: English and German translations.
- `src/styles.css`: global application and feature styles.
- `public/`: PWA assets; `.github/workflows/pages.yml`: GitHub Pages build/deploy workflow.

The app uses hash routing and a configurable Vite base path for GitHub Pages. The Pages workflow builds on pushes to `main` and on manual workflow dispatch. This handover did not push or deploy anything.

## Current feature status

Implemented application areas include Home, timetable and subject management, Tasks and Notes inside Docs, document editing/export, PDF annotations, calendar, focus timer, local Files, Workspace, Arcade/minigames, calculator, translation, settings, and the optional AI interface. Each area is routed from `App.tsx`; detailed feature behavior should be checked in its page and `src/data` modules before changing it.

**Code section:** The navigation label is “Code” while the route remains `/code-lab`. Learn, Playground, and Code Garden are implemented. Learn has local progress and interactive HTML/CSS/introductory JavaScript lessons; Playground has locally saved projects and a sandboxed preview iframe; Code Garden has a deterministic custom interpreter, missions, research, sensors, local progress, and a live SVG garden. The shared Code workspace provides movable/resizable/minimizable/maximizable windows and stores layouts separately in localStorage. The garden uses these windows and an isometric view of the current simulation state.

This Code work is an ongoing, uncommitted feature/UI refactor, **not the planned global KxnoDesk redesign**. Remaining work includes deeper browser testing of window gestures/accessibility and the Code flows, checking lesson/reference coverage against the live language, and refining the lightweight textarea-based editor (it is not a full IDE). Do not replace or discard its current features while prototyping the global redesign.

**Docs/PDF work:** The current uncommitted changes include document widgets, export/print handling, PDF annotations, database/backup tests, and related UI/locales. The working tree alone does not establish that this feature work has been handed off or fully reviewed. Inspect these changes before modifying or cleaning them up. The `docsTemplates` table and backup support still exist; data is not automatically removed when template UI changes.

## Shared UI, themes, and Liquid Chrome

`AppShell` supplies the sidebar, page outlet, PWA update notice, and appearance CSS variables. `src/styles.css` contains global layout, controls, responsive rules, and feature-specific styling. Pages use the same CSS variables and translation setup; retain this architecture when prototyping.

Appearance state is persisted by Zustand to localStorage key `kxnodesk-ui` (store version 3). The current model supports dark/light mode, customizable accent/background/surface colors, contrast, border intensity, corner radius, UI scale, and backgrounds: solid, grid, glow, Liquid Chrome, or a custom image. Built-in presets are Obsidian, Amethyst, Arctic, Graphite, Pearl, and Custom; user-created presets are stored in IndexedDB settings. Settings exposes color controls, background-specific controls, image fit/position/blur/overlay, reduced-motion-aware animation controls, and performance mode. Theme mode and accent customization are existing functionality and must continue to work.

Liquid Chrome is an **optional** WebGL background, not a required UI surface. `BackgroundLayer` renders a fluid metallic shader when WebGL and `OES_standard_derivatives` are available, otherwise it shows a static CSS fallback. Settings include intensity, opacity, animation speed, reflection strength, and accent influence; global options include highlights, cursor reactivity, animation, and performance mode. The renderer pauses when the page is hidden, respects reduced-motion preference, and lowers frame rate/resolution in performance mode. Keep it selectable and functional during redesign work.

## Persistence and backup compatibility

Personal application data is local-first in the Dexie database named `KxnoDesk`. The current schema is **version 11**. Stores cover subjects, teachers, timetable, exceptions, settings, AI presets/conversations/messages/attachments, tasks, calendar events, notes, focus sessions, files, arcade data, Workspace, Docs documents/content/images/templates, PDF projects, Code projects/progress, and Code Garden state. Schema upgrades are versioned and additive; do not clear/recreate the database or remove stores as a UI cleanup.

Appearance and language preferences are separately persisted in localStorage. Docs UI preferences and Code window layouts also use localStorage; Code layouts have a `kxnodesk.code-layout.v1.<mode>` prefix and are separate from Code Garden progress.

JSON backup format is `kxnodesk-local-backup`. Exports use schema version 11; imports currently accept schema versions 2 through 11, validate records, support older schemas where later stores were absent, and have size/record-count limits. Blob data is serialized for backup and restored locally. Keep older backup compatibility and existing user data intact when evolving features.

## Verification commands and current results

Run commands from the repository root in PowerShell with `npm.cmd` if PowerShell blocks `npm.ps1`.

- `npm.cmd run typecheck` — TypeScript app and AI worker checks. **Passed on this checkout** (2026-10-29).
- `npm.cmd test -- --maxWorkers=1 --no-file-parallelism` — full sequential Vitest suite. **42 files, 316 tests passed** (2026-10-29).
- `npm.cmd run build` — TypeScript checks plus production Vite/PWA build. **Passed in the prior verification of this same working tree**; generated the service worker and Pages-base-path build.
- `git diff --check` — **passed in the prior verification**; only line-ending normalization warnings were reported.

The production browser was used to verify the Code Garden at the configured Pages base path: the first mission completed, its progress survived a reload, the simulation rendered 35 tiles, and the 390×844 mobile layout was inspected. Not every mission or window gesture was manually browser-tested.

## Git handover state and cautions

At initial inspection (before this handover file was created), the branch was `main` tracking `origin/main`, with **no staged changes, 18 modified tracked files, and 17 untracked files**. Adding this document makes the current total **18 untracked files**. The tracked changes span App navigation/tests, Docs/PDF, backups/schema, locales, and styling. The untracked files include the current Code implementation and tests, Code workspace/reference/layout modules, and Docs widget/print work. The working tree is **not clean**. The full file list is in `git status --short`.

Do not reset, revert, delete, stage, or commit these changes as part of the redesign handover. Review the current diff and untracked files before editing; preserve unrelated Docs/PDF and Code work.

## Global UI redesign roadmap

The Home-only prototype now follows the supplied desktop reference more closely: the normal desktop sidebar is expanded, the masthead pairs the greeting with a compact digital clock, a current/next-lesson feature panel and three summary indicators lead the page, and the timetable is paired with task/event lists and shortcuts. Home-specific styles remain token-based, so existing appearance presets, custom accent colors, responsive sidebar behavior, and optional Liquid Chrome are preserved. Signal remains an additional theme.

For isolated visual review, the development server supports `/#/?homePreview=timetable`. This explicit preview uses fixed sample lessons, tasks, and events in memory only; it does not write to IndexedDB and is unavailable in production. Ordinary Home visits continue to use only the user's persisted data and retain the genuine empty state.

The supplied HTML/ZIP and images are visual references only; they are not permission to replace existing functionality. The screensaver reference informed visual details only; no screensaver layout or behavior was implemented. Do not roll the Home design out across other pages without a separate request. Start-menu work, redesigned Settings, and a new screensaver mode remain follow-up work, not existing features.

The existing Code section redesign and functionality must be preserved. Before any wider redesign work:

1. Re-read `git status --short`, tracked diffs, and the listed untracked Code/Docs files; do not assume any are disposable.
2. Keep feature behavior, IndexedDB contents, exports/backups, and the Code window/game work intact; avoid deployment unless separately authorized.
3. Validate light and dark modes, custom accent colors, reduced motion/transparency, and responsive behavior before considering further rollout.
