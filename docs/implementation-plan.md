# All in one MMO - implementation plan

## Phase 1: Foundation
1. Create the web app shell with Google login via Supabase Auth.
2. Wire the app to the `allinonemmo` database schema.
3. Build the permission engine for roles, features, license, and per-user overrides.
4. Add admin UI for users, roles, plans, licenses, and feature catalog.

## Phase 2: Core user flow
1. Implement local provider settings for API keys.
2. Support Gemini key rotation from a local imported list.
3. Support OpenAI-compatible, Gemini-compatible, and Grok-compatible providers.
4. Add license gate and feature gate before any menu is shown.

## Phase 3: Content creation
1. Port `Tao noi dung` into the web UI.
2. Keep title generation, outline generation, script generation, description, and tags.
3. Save user content to Supabase with row-level security so only the owner can read it.
4. Add copy and download TXT only.

## Phase 4: Rewrite flow
1. Port `Tao lai noi dung`.
2. Keep keep-percent and expand/target-word logic.
3. Auto-generate title, description, and tags after rewrite.
4. Save to Supabase with the same owner-only visibility rules.

## Phase 5: Video merge
1. Build `Ghep video am nhac` with `ffmpeg.wasm`.
2. Keep it browser-local only.
3. Do not store video or audio on Supabase.
4. Export the finished MP4 directly to the user.

## Phase 6: Hardening
1. Add audit logs for admin actions.
2. Add feature catalog rows for future menus instead of hardcoding permissions.
3. Test content isolation per user.
4. Test provider config persistence on the same machine/browser.

