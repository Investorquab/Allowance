# ALLOWANCE — MASTER HACKATHON VIDEO PRODUCTION PROMPT

## Premium ~2:45 Product Film for Total Recall (Tatum × Walrus)

You are acting as a world-class product filmmaker, creative director, documentary-style commercial director, senior motion designer, sound designer, male voiceover director, and technically rigorous Web3 product storyteller.

Your task is to create a polished, cinematic, technically accurate demonstration video for **Allowance**, a live spending-guard for autonomous AI agents, deployed on **Sui mainnet** and settling in **USDC via Tatum**, with its learned rules stored in **Walrus Memory**.

This is not a request for a storyboard alone. Inspect the repository, understand the actual product, design the narrative, produce the assets, generate the voiceover, edit and render the video, inspect the finished output, and fix issues before declaring it complete.

The final result should feel like a sophisticated product film from a leading fintech-infrastructure startup — not a template hackathon video, generic blockchain advert, AI slideshow, or a plain screen recording with narration.

Primary audience: **Total Recall judges** (Tatum × Walrus). Secondary: developers building paying agents.

The video must communicate three things:

1. The problem is real and immediately understandable: agents can now spend money, and that's dangerous.
2. Allowance is a distinctive, working solution — live on Sui mainnet, with memory that actually changes its behaviour.
3. It's worth supporting and building on.

Make it memorable through clarity, storytelling, visual precision, and demonstrable functionality — not exaggerated claims or effects.

---

# PART 1 — NON-NEGOTIABLE REQUIREMENTS

## Target deliverable
- Target duration ~2:45 (acceptable 2:30–3:00 if the narrative needs it).
- 1920×1080, 16:9, 30 fps, MP4 (H.264 video, AAC audio).
- Clear, natural male narration; mixed music; restrained sound design.
- Presentation-ready for a competitive hackathon.

Primary filename: `Allowance_TotalRecall_Master.mp4`
Output folder: `video/` with subfolders for source assets, narration, music attribution, render scripts, storyboard, and notes.

Do not deliver only a script, storyboard, screenshots, or an un-rendered/un-inspected video.

## Mandatory voice direction
**The narrator must sound like a real adult man speaking naturally — not a voice assistant.** Warm, grounded, conversational, medium-to-low register, clear international English, relaxed confidence, genuine emphasis, natural rhythm and breathing. Like a knowledgeable founder explaining a product he believes in.

Avoid robotic TTS cadence, corporate-announcer polish, trailer-deep voices, uniform pitch, every line ending on the same downward inflection, unnatural pauses, over-pronounced technical terms, synthetic enthusiasm, exaggerated American ad accent, phone-system voices.

**Voice workflow:** write the spoken script first; pick the best natural male voice available; test a short passage and actually evaluate it; reject anything robotic; generate in sections with a consistent voice identity and loudness; assemble with natural pauses; avoid heavy denoise/reverb/pitch-shift. If no natural voice tool exists, do not pass off a robotic one as natural — document the limitation and recommend an alternative. Do not claim a voice sounds natural just because synthesis completed.

---

# PART 2 — UNDERSTAND THE PRODUCT BEFORE FILMING

Repository: https://github.com/Investorquab/Allowance
Live app (Sui mainnet): https://allowance.185-7-81-139.sslip.io
Health: https://allowance.185-7-81-139.sslip.io/api/health
Chain: **Sui mainnet**, settled in native **USDC** (`0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC`), all on-chain actions via **Tatum's Sui GraphQL gateway**.
Memory: **Walrus Memory** (mainnet).
Example real payment (suiscan): `9yeQWKKRtu6pGkrDwKpK6F1uR6GzZppm1fJY5nQQPuTW`

Before filming, read: `README.md`, `HANDOFF.md`, `CHECKLIST.md`, `FIELD-TEST.md`, `src/lib/guard/*` (engine, policy, learn), `src/lib/chain/tatum.ts`, `src/lib/memory/store.ts`, `src/lib/vendor-server.ts`, `src/lib/x402.ts`.

Create: `video/FACTS.md`, `video/CAPABILITIES.md`, `video/STORYBOARD.md`, `video/VOICEOVER.md`, `video/SHOT_LIST.md`.

`CAPABILITIES.md` must separate: **implemented & demonstrated** · **implemented, not demonstrated** · **planned/future** · **unverified**. The film must never present planned work as working.

### Facts you MAY state (verify against code first)
- Live on Sui mainnet; real USDC micro-payments; the vendor verifies each tx on-chain via Tatum before serving data.
- 8+ distinct Sui RPC operations through Tatum (gas price, balance, list balances, coin/gas build, simulate/dry-run, execute, get/wait transaction).
- Walrus Memory drives decisions (not a log): rules, payees and decisions are recalled and the policy is derived from them on every payment. 29 memories on Walrus mainnet.
- Learns rules from plain words; loose phrasing is extracted by Walrus `analyze()`.
- Checks: hard caps (memory can never raise them), exact dry-run match, look-alike payee, payee-changed, live demo-attack block, duplicate, price spike, new-payee ask, learned trust.
- **PriceWire** guards a *real* external API (CoinGecko / Frankfurter) behind the Sui-settled 402.
- Approvals from Telegram; a "Memory switch" view decides with vs without memory.
- 51 automated tests pass. Field test: 12 mainnet payments, all verified on-chain; ~0.00142 SUI gas each; ~33s/payment on Tatum's free tier.

### Facts you must NOT imply are live
- **Base/EVM settlement is scaffolded and unit-tested only — NOT live-verified.** Present it, if at all, as "the architecture supports a second settlement chain," never as a working payment.
- On-chain payee *history* degrades to zero over the current Tatum GraphQL indexer; known payees come from Walrus memory. Don't imply payee-history is a working data signal.

### Do not fabricate
Users, transaction volume, adoption, partnerships, revenue, testimonials, audit results, or live counters beyond what the app genuinely shows.

---

# PART 3 — THE CORE STORY

**One line:** Allowance gives an AI agent a spending allowance it can't blow.

**Tagline:** *"It pays the routine, stops the rest, and remembers why."*

**The central insight:** agents can now pay per request (HTTP 402 / x402). That leaves two bad options — hard caps only (one bad prompt → a surprise bill) or approve-everything (you rubber-stamp until it's meaningless). Allowance is the third way: it pays routine spending itself, asks you about the unusual, blocks what's wrong, and **learns your rules from every approve or deny** — rules that live on Walrus, so they follow the agent anywhere. Every payment is dry-run and verified on-chain before a coin moves.

Don't make the film about blockchain in the abstract. Make it about the *experience*: an agent you can trust with a wallet.

**Emotional arc:** Recognition ("I get this problem") → Friction ("those are both bad options") → Discovery ("give it an allowance") → Proof ("this is real, on mainnet, and I can see why it decided") → Possibility ("useful infrastructure for any paying agent").

---

# PART 4 — VISUAL CREATIVE DIRECTION

## Creative concept: THE STEWARD AT THE GATE
The central metaphor is a trusted steward standing between the agent and the paid world. A payment request arrives; the steward checks it against what it remembers and a dry-run of the exact transaction, then does one of three things: **PAY** (green), **ASK YOU** (gold), **BLOCK** (red). That three-way decision, with its reasons and the memories it used, is the visual signature of the film.

Gold is money, trust and attention. Green is settled. Red is stopped. Memory is a quiet presence the steward consults.

## Brand identity (use the real tokens)
- Ink background `#0b0f14`; panels `#10161d` / `#161e27`; hairlines `#212c37`.
- Text `#edf1f4`; muted `#8a97a6`.
- **Accent / "ask" gold `#e6b54a`** (brass gold — money, trust, attention).
- **Pay / settled green `#46c08a`**; **Block / stopped red `#e46b64`**.
- Typography: **Geist** (sans, headlines + UI), **Geist Mono** (addresses, hashes, amounts, code). Use **tabular numerals** for money.
- The balance is the hero number, in gold. Keep the treasury-console feel: calm, precise, financial.

## Visual style
Premium fintech product filmmaking: restrained cinematic lighting, elegant motion graphics, precisely composed real product UI, beautiful typography and negative space, subtle depth, clear hierarchy, calm confident pacing, authentic on-chain evidence. Ink dominates; gold/green/red are emphasis, not wallpaper.

Avoid: purple/blue "blockchain" gradients, neon crypto imagery, floating coins, people-at-laptops stock footage, futuristic cityscapes, heavy glows, 3D token renders, fake dashboards, holograms, glitch/hacking effects, endless scrolling code, PowerPoint-looking slides, unreadable walls of text. Feel expensive through restraint.

---

# PART 5 — THE FILM STRUCTURE (~165s)

Build a storyboard before rendering. Timings are a guide; adjust slightly for natural narration and convincing demos. Put a small caption **"Sim mode · same guard logic"** on every simulated beat, and drop it when you cut to live.

## SCENE 1 — THE HOOK (0:00–0:12)
Start immediately — no multi-second logo intro. Ink screen; the Allowance Overview with the balance in gold. An agent fires off a payment request. **Flash the `LIVE · Sui mainnet` badge / a real Suiscan tx for ~1s** to plant "real money" early.
On-screen: **AGENTS CAN SPEND YOUR MONEY NOW.** then **SO WHO'S WATCHING WHAT THEY BUY?**
VO (curious, conversational): introduce the danger of an agent with a wallet.

## SCENE 2 — THE FRICTION (0:12–0:33)
Two bad options, cleanly animated: **hard cap only** (a surprise bill slips through) vs **approve everything** (a stream of one-cent asks you stop reading). Keep it honest — illustration, not fake screenshots. No fabricated statistics.
On-screen: **HARD CAPS MISS THE ONE THAT MATTERS.** / **APPROVING EVERYTHING ISN'T APPROVING ANYTHING.**

## SCENE 3 — INTRODUCING ALLOWANCE (0:33–0:46)
The real wordmark. A clean path forms: **AGENT → ALLOWANCE → PAID API**, gold marking the trusted route. The three-way stamp (PAY · ASK · BLOCK) appears.
On-screen: **ALLOWANCE** / *"It pays the routine, stops the rest, and remembers why."*
VO: Allowance sits between the agent and the paid world; it decides pay, ask, or block — and learns.

## SCENE 4 — THE MECHANISM (0:46–1:14)
The most important explanatory section. Four short steps, real UI where possible:
1. **A 402 arrives** — the paid API answers "Payment Required" with amount, payee, USDC-on-Sui, a nonce.
2. **Recall from Walrus** — your rules, past approvals, known payees come back; the policy is derived from them.
3. **Check via Tatum** — balance, and an **exact dry-run** of the transaction on Sui; it must move *exactly* the asked amount to the payee, nothing else.
4. **Decide** — PAY · ASK · BLOCK, each with its reasons and the memories it used.
Readable labels, restrained motion. The audience should follow it without reading paragraphs.

## SCENE 5 — IT LEARNS (1:14–1:34)
Show a real approval with a plain-language note — *"keep it under two bucks a day"* — and **Walrus `analyze()`** turning it into an enforceable rule, stored as memory on Walrus. Then the same vendor runs again and **auto-pays**, citing the remembered rule.
On-screen: **YOUR WORDS BECOME ITS RULES.**
(Accuracy: a rule can tighten spending but can never raise the hard caps.)

## SCENE 6 — THE REAL PRODUCT & REAL MONEY (1:34–2:06)
Prove it works. Cut to the **live** dashboard (drop the sim caption). Use actual screens:
- A real `402` from the deployed service (e.g. `/api/vendors/pricewire/spot`) — note **PriceWire fronts a real external API**, unlocked by a cent of USDC on Sui.
- A paid Activity row → the **Suiscan** link → the real mainnet tx (−USDC agent → vendor), with the **"✓ verified by vendor"** badge.
- The scam/look-alike scenario **blocked** — no USDC moves.
VO: "This is mainnet. 12 payments in testing, all verified on-chain through Tatum." Never fake a balance, hash, or status; prefer an existing tx over sending a new one.

## SCENE 7 — WHY WALRUS, WHY TATUM (2:06–2:24)
Explain the engineering, quietly and legibly:
- **Walrus** is the *policy, not a log* — decisions are derived from recalled memory, so judgment is portable.
- **Tatum** is the single Sui gateway for every on-chain read, the dry-run, the execute, and the vendor's verification (ported to Tatum's GraphQL after Sui dropped JSON-RPC).
Then the **portability proof, on camera**: delete the local database, restart, run a known vendor → it **still auto-pays**, because the rule came back from Walrus.
On-screen: **THE RULES LIVE ON WALRUS. / SETTLED ON SUI, VIA TATUM.**

## SCENE 8 — THE INFRASTRUCTURE STORY (2:24–2:37)
Shift from "clever feature" to "useful infrastructure." Simple, honest examples of agents that spend: data/API calls, research, inference, tooling. One line on integration: point any agent at `/api/agent/run` and it routes payments through Allowance. If you show Telegram, show the real Approve/Deny flow. Present these as what the infrastructure supports, not as live integrations. (If you mention a second settlement chain, say the architecture *supports* Base/EVM — it is scaffolded, not live.)

## SCENE 9 — THE CLOSE (2:37–2:45)
Return to the steward metaphor: a routine payment passes the gate and settles; a suspicious one is stopped. Resolve cleanly — no confetti. Real wordmark.
Headline: **A SPENDING ALLOWANCE YOUR AGENT CAN'T BLOW.**
Secondary: **Live on Sui mainnet · Built with Tatum + Walrus · Total Recall.**
End card (readable, restrained): `allowance.185-7-81-139.sslip.io` · `github.com/Investorquab/Allowance`. Leave time to read. No long thank-you screen.

---

# PART 6 — VOICEOVER WRITING RULES
Spoken English, not documentation. Sound like a technically informed founder explaining something useful to a peer. Contractions where natural; short, varied sentences; simple explanations. ~330–370 spoken words with breathing room for the demos — calculate the actual timing.

Ban: "in today's rapidly evolving landscape," "revolutionizing DeFi," "seamless/frictionless," "unlocking unprecedented," "the future is here," "paradigm shift," "game-changing." Don't read UI word-for-word or narrate every animation. Select the few details that explain the mechanism, prove it's real, and tie it to Walrus + Tatum.

Build a table: Scene · exact narration · est. duration · visual action · on-screen text · pronunciation notes. Test pronunciation of **Allowance, USDC, Sui, Tatum, Walrus, 402, GraphQL**. Do **not** have the narrator read contract addresses or long hashes — display those on screen.

---

# PART 7 — MUSIC & SOUND DESIGN
Minimal electronic pulse, warm ambient textures, restrained percussion, subtle low-end, a controlled build; no competing melodies, no epic-trailer orchestra, no dubstep/cyberpunk. Restrained, tactile SFX for: request arriving, memory recalled, dry-run check, PAY (settled), BLOCK (stopped), approval. Don't make transactions sound like a game. Mix narration clearly above music; meter for clipping/sibilance; keep loudness consistent between scenes. Licensed music only; record attribution.

---

# PART 8 — PRODUCT CAPTURE & MOTION GRAPHICS
The running app is the source of truth. Capture clean, high-res real screens (sim for the fast story, live for proof). Hide `.env.local`, keys, dev tools, notifications, and unrelated tabs. Don't send unnecessary mainnet transactions — prefer existing tx evidence; if a new one is truly needed, use the smallest amount and get approval.

Reusable motion components (brand palette): agent, 402 request, Allowance decision stamp (PAY/ASK/BLOCK), Walrus memory, Tatum/Sui settlement, a paid API, a scam/look-alike payee, transaction evidence. Motion must show causality (recall → check → decide → settle). Technical labels available for judges but never overwhelming the story.

---

# PART 9 — PROOF & FACTUAL ACCURACY
Strongest proof is the product working on mainnet. Use the live URL, the repo, the health endpoint, a real Suiscan tx, the Walrus memory count, and the 51 passing tests as evidence. No fabricated users/volume/partnerships/audit/testimonials. No "unhackable/perfectly secure/guaranteed." Include an honest line: **Not independently audited — use small amounts.** Disclose the real limits: single-process store (one instance), free-tier latency, the default Walrus relayer sees memory plaintext, and **Base/EVM settlement is scaffolded, not live**. Don't hide limitations to look more impressive.

---

# PART 10 — TECHNICAL PRODUCTION WORKFLOW
Inspect available tools (browser capture, audio generation, video editing, FFmpeg, SVG/vector animation, audio mixing, frame extraction). Reuse existing deps; don't install a huge stack without justification. If FFmpeg exists, use it for render/assembly; pick a sensible motion-graphics approach; keep scripts/assets so the video can be regenerated. If a tool is missing, choose the best alternative and document the trade-off. Never claim to have generated/auditioned audio or rendered/inspected video you didn't.

**Phases:** A Audit (`FACTS.md`, `CAPABILITIES.md`) · B Narrative (`STORYBOARD.md`, `VOICEOVER.md`, `SHOT_LIST.md`, check timing) · C Voice test (sample, evaluate, revise) · D Visual production (motion assets, real captures, timeline) · E Render (export MP4) · F Inspect (extract frames at opening/each transition/demo/proof/close; check layout, readability, colours, artifacts, honesty; listen for sync/clipping/pacing; verify duration, codec, resolution, fps, audio track) · G Revise and re-render until clean.

---

# PART 11 — FINAL QUALITY CHECKLIST
**Story:** first 10s create curiosity; problem clear without crypto knowledge; the pay/ask/block mechanism explained correctly; real mainnet demo; Walrus+Tatum relevance specific; memorable, concise ending.
**Voice:** natural adult male; conversational; no robotic delivery; correct pronunciation; no rushed technical passages; fits timeline; intelligible over music.
**Visuals:** correct Allowance palette (ink/gold/green/red) and Geist type; no fake screens presented as real; no unreadable code/clutter; smooth intentional transitions; correct URLs; strong final frame.
**Accuracy:** no unsupported guarantees; no invented users/stats; honest security + limitation disclosure; **Base shown as scaffolded, not live**; payee-history not implied as a working signal; memory correctly shown as the policy.
**Technical:** MP4 plays start to finish; 1920×1080, 16:9, 30 fps; audio present and synced; no black frames/gaps; no clipped narration; correct duration; assets organized and regeneratable.

---

# PART 12 — REQUIRED FINAL DELIVERABLES
1. `Allowance_TotalRecall_Master.mp4` · 2. `FACTS.md` · 3. `CAPABILITIES.md` · 4. `STORYBOARD.md` · 5. `VOICEOVER.md` · 6. `SHOT_LIST.md` · 7. a short `README.md` on reproducing the video · 8. the voiceover audio file · 9. the regeneratable project/assets where practical.

Report at completion: exact output path; actual duration; resolution/fps; audio format; voice method used; whether narration was actually auditioned; which product flows were shown; which claims were verified; what remains unverified; whether the render was inspected; any remaining limitations. If a requirement couldn't be met, say so plainly and give the best available deliverable. Never claim success for work not actually performed.

---

# FINAL CREATIVE DIRECTION
Allowance's story isn't that blockchain is revolutionary. It's that agents can already spend money, that's genuinely risky, and Allowance makes it safe by giving the agent an allowance — paying the routine, stopping the rest, and remembering why, with real settlement on Sui and portable memory on Walrus.

Show the risk. Reveal the mechanism. Prove it on mainnet. Explain why Walrus and Tatum make it work. End with the sense that any agent that spends money needs this. Throughout, the narrator must sound like a real person who understands the problem — not a machine reading a script.
