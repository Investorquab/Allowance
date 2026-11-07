/**
 * Allowance → Telegram approvals. Approve or deny payments from your phone.
 *
 * Runs as its own process next to the app and talks to it over HTTP (so it never shares the
 * data file with the server). When the guard asks about a payment, you get a message with
 * Approve / Deny buttons; tapping one calls the same /api/approvals route the dashboard uses.
 *
 *   TELEGRAM_BOT_TOKEN=...      from @BotFather        (required)
 *   TELEGRAM_CHAT_ID=...        your chat id            (optional — auto-detected from your first message)
 *   ALLOWANCE_ADMIN_TOKEN=...   same token the app uses (required in live; approvals are protected)
 *   ALLOWANCE_BASE_URL=...      default http://localhost:3000
 *
 * Run:  npm run telegram        (alongside `npm run dev`)
 */
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const BASE = process.env.ALLOWANCE_BASE_URL || "http://localhost:3000";
const ADMIN = process.env.ALLOWANCE_ADMIN_TOKEN || "";
let CHAT = process.env.TELEGRAM_CHAT_ID || "";
if (!BOT) { console.error("Set TELEGRAM_BOT_TOKEN (from @BotFather) in .env.local."); process.exit(1); }

const API = `https://api.telegram.org/bot${BOT}`;
const usd = (u: string) => `$${(Number(u) / 1e6).toFixed(3)}`;
const notified = new Set<string>(); // requestIds we've already pushed
const handled = new Set<string>();  // callback/requestIds we've already resolved

async function tg(method: string, body: unknown) {
  const r = await fetch(`${API}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json() as Promise<{ ok: boolean; result?: any; description?: string }>;
}

async function getState() {
  try { return await (await fetch(`${BASE}/api/state`, { cache: "no-store" } as RequestInit)).json(); }
  catch { return null; }
}

async function resolvePayment(requestId: string, outcome: "approved" | "denied", note?: string) {
  const r = await fetch(`${BASE}/api/approvals/${requestId}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(ADMIN ? { authorization: `Bearer ${ADMIN}` } : {}) },
    body: JSON.stringify({ outcome, note }),
  });
  return { ok: r.ok, body: await r.json().catch(() => ({})) };
}

function askKeyboard(id: string) {
  return { inline_keyboard: [[
    { text: "✅ Approve & pay", callback_data: `a:${id}` },
    { text: "⛔ Deny", callback_data: `d:${id}` },
  ], [
    { text: "✅ Approve + auto-approve these under $0.05", callback_data: `r:${id}` },
  ]] };
}

/** Push any new pending asks to Telegram. */
async function pushPending() {
  if (!CHAT) return;
  const s = await getState();
  if (!s?.pending) return;
  for (const p of s.pending) {
    if (notified.has(p.requestId)) continue;
    notified.add(p.requestId);
    const r = p.request.requirement;
    const checks = (p.decision.checks || []).map((c: any) => `• ${c.message}`).join("\n");
    const text = `💸 *Allowance needs you*\n\n*${usd(r.amount)}* to *${r.vendorName}* · ${r.endpoint}\nReason: _${p.request.task}_\npay-to: \`${r.payTo}\`\n\n${checks}`;
    await tg("sendMessage", { chat_id: CHAT, text, parse_mode: "Markdown", reply_markup: askKeyboard(p.requestId) });
  }
}

/** Long-poll Telegram for taps and messages. */
async function pollUpdates() {
  let offset = 0;
  for (;;) {
    try {
      const u = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
      for (const up of u.result || []) {
        offset = up.update_id + 1;
        if (up.message?.chat?.id) {
          CHAT = String(up.message.chat.id);
          await tg("sendMessage", { chat_id: CHAT, text: "Connected. You'll get payment approvals here." });
        }
        if (up.callback_query) await onTap(up.callback_query);
      }
    } catch (e) { await new Promise((r) => setTimeout(r, 2000)); void e; }
  }
}

async function onTap(cq: any) {
  const [kind, requestId] = String(cq.data).split(":");
  const ack = (text: string) => tg("answerCallbackQuery", { callback_query_id: cq.id, text });
  if (handled.has(requestId)) { await ack("Already handled."); return; }
  handled.add(requestId);

  const outcome = kind === "d" ? "denied" : "approved";
  const note = kind === "r" ? "auto-approve under 5 cents from them" : undefined;
  await ack(outcome === "approved" ? "Paying…" : "Denied.");

  const { ok, body } = await resolvePayment(requestId, outcome, note);
  const result = !ok
    ? `⚠️ ${body.error ?? "failed"}`
    : outcome === "denied"
      ? "⛔ Denied — nothing paid."
      : body.digest
        ? `✅ Paid. tx: ${BASE.includes("localhost") ? body.digest : `https://suiscan.xyz/mainnet/tx/${body.digest}`}${note ? "\n📝 Rule saved: auto-approve under $0.05 from them." : ""}`
        : "✅ Done.";
  await tg("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${cq.message.text}\n\n${result}`, parse_mode: "Markdown" });
}

async function main() {
  const me = await tg("getMe", {});
  if (!me.ok) { console.error("Bad TELEGRAM_BOT_TOKEN:", me.description); process.exit(1); }
  console.log(`Telegram bot @${me.result.username} ready. App: ${BASE}`);
  if (!CHAT) console.log("Send your bot any message to link your chat (or set TELEGRAM_CHAT_ID).");
  else console.log(`Pushing approvals to chat ${CHAT}.`);
  pollUpdates();                       // taps + messages (long-poll)
  setInterval(pushPending, 3000);      // new asks → phone
}
main();
