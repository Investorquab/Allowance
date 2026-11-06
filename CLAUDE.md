# Allowance — instructions for Claude Code

Read **HANDOFF.md** first (setup, audit items, test plan) and **CHECKLIST.md** (hackathon requirements). Also see AGENTS.md: this is Next.js 16.4 — check `node_modules/next/dist/docs/` before changing routing/caching.

- Project: AI-agent spending guard. HTTP 402 paywall → guard decides pay/ask/block → USDC on Sui mainnet via Tatum RPC → learns rules in Walrus Memory.
- Deadline: Tue 10 Nov 2026 17:00 UTC.
- Work in `ALLOWANCE_MODE=sim` unless running the live tests in HANDOFF.md §5.3.
- Never print, log, or commit secrets or `.env.local`. If the user pastes a key into chat, tell them to delete it and rotate it.
- Keep `src/lib/guard/engine.ts#decide` pure; hard limits are never raised by memory.
- Before committing: `npm test && npm run typecheck && npm run build`.
- Next priorities: HANDOFF.md §4 P0 items (A1 auth, A2 live demo-attack safety, A3 balance caching), then live tests L1–L10.
