# MeetingMind AI

Enterprise meeting intelligence platform with real-time transcription, speaker identification, and action item extraction — all stored locally in the browser via IndexedDB. No external services or API keys required.

## Run & Operate

- `pnpm --filter @workspace/meetingmind run dev` — run the frontend (Vite dev server)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite, wouter (routing), TanStack Query, shadcn/radix UI
- Storage: IndexedDB via `idb` library — all data stored in browser, no backend
- Auth: Local email+password stored in IndexedDB (base64 hash + salt)
- Recording: MediaRecorder API for mic audio capture
- Themes: next-themes (light/dark/system)

## Where things live

- `artifacts/meetingmind/src/lib/db.ts` — IndexedDB schema + all CRUD operations (single source of truth)
- `artifacts/meetingmind/src/providers/auth-provider.tsx` — local auth context (replaces Supabase)
- `artifacts/meetingmind/src/App.tsx` — routing setup (wouter)
- `artifacts/meetingmind/src/pages/` — all page components
- `artifacts/meetingmind/src/components/layout/app-layout.tsx` — sidebar nav layout

## Architecture decisions

- **IndexedDB only** — no Supabase, no API server calls. All meetings, transcripts, speaker profiles stored in browser. User explicitly chose this for offline-first local use.
- **Local auth** — email+password stored in IndexedDB with simple base64 hash+salt. Session stored in `localStorage` as `meetingmind_user_id`.
- **MediaRecorder API** — mic audio captured locally for transcript segments; no cloud speech SDK.
- **Speaker enrollment simulation** — enrollment count increments locally; 30 samples marks user as `enrolled`.
- **Admin-only users page** — only visible to users with `role: 'admin'`.

## Product

- Sign in / sign up with local accounts
- Dashboard with stats (meetings, speakers, action items)
- Meeting management (create, start, end, delete)
- Meeting room with real-time mic recording → transcript segments saved to IndexedDB
- Transcript viewer with TXT/JSON export
- Analytics dashboard with period filtering
- Voice enrollment for speaker identification
- Admin user management (create, delete, view enrollment status)

## User preferences

- Use IndexedDB for all data storage — no Supabase or external services
- All data stays in the browser (local-first approach)

## Gotchas

- IndexedDB data is browser-local — clearing browser data deletes all meetings/users
- Default admin: create any account; to get admin role you must create the user via the `createUser` function with `role: 'admin'` directly, or use a seeding approach
- `artifacts/meetingmind/src/providers/supabase-provider.tsx` still exists but is unused — safe to delete

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
