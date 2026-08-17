export const COOLDOWN_MS = 10_000;
const DAILY_LIMIT = 20;
const MONTHLY_LIMIT = 480;
const LIMIT_EPOCH = 2;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export class ExtractionGovernor {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const { client } = await request.json();
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const data = (await this.state.storage.get("limits")) || { month, used: 0, clients: {}, epoch: LIMIT_EPOCH };
    if (data.month !== month) { data.month = month; data.used = 0; data.clients = {}; }
    if (data.epoch !== LIMIT_EPOCH) { data.epoch = LIMIT_EPOCH; data.clients = {}; }
    const entry = data.clients[client] || { day, count: 0, next: 0 };
    if (entry.day !== day) { entry.day = day; entry.count = 0; entry.next = 0; }
    if (now < entry.next)
      return Response.json({ error: "One table at a time, please. Try again in a few seconds." }, { status: 429 });
    if (entry.count >= DAILY_LIMIT)
      return Response.json({ error: "AI extraction has reached today’s limit for this visitor. You can still edit a table locally." }, { status: 429 });
    if (data.used >= MONTHLY_LIMIT)
      return Response.json({ error: "AI extraction is resting for the month. You can still edit a table locally." }, { status: 429 });
    entry.count += 1; entry.next = now + COOLDOWN_MS; data.used += 1; data.clients[client] = entry;
    await this.state.storage.put("limits", data);
    return Response.json({ ok: true });
  }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/api/extract-table") return extractTable(request, env);
    const response = await env.ASSETS.fetch(request);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: browserSafeHeaders(response.headers),
    });
  },
};

export async function extractTable(request, env) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (!env.GEMINI_API_KEY || !env.EXTRACTION_RATE_LIMIT_SALT)
    return Response.json({ error: "AI extraction is not configured yet." }, { status: 503 });
  const image = await request.arrayBuffer();
  if (!image.byteLength || image.byteLength > MAX_IMAGE_BYTES)
    return Response.json({ error: "Choose one image smaller than 3 MB." }, { status: 413 });
  const client = await fingerprint(request.headers.get("CF-Connecting-IP") || "unknown", env.EXTRACTION_RATE_LIMIT_SALT);
  const governor = env.EXTRACTION_GOVERNOR.get(env.EXTRACTION_GOVERNOR.idFromName("global"));
  const permitted = await governor.fetch("https://limits/reserve", { method: "POST", body: JSON.stringify({ client }) });
  if (!permitted.ok) return permitted;
  const google = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Extract this benchmark table into one JSON object. Shape: {kind:'matrix',title,metric,columns:string[],rows:[{label,detail,higherIsBetter:true,values:(number|null)[]}]}. Preserve every visible model column and every visible data row. For a row with visible sub-metrics, emit a separate row for each sub-metric. Copy headers and labels exactly. Every row must have one value for each column. Use numbers without symbols and null for dashes. Do not infer missing values." }, { inlineData: { mimeType: request.headers.get("content-type") || "image/png", data: toBase64(image) } }] }], generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "MINIMAL" } } }),
  });
  if (!google.ok) {
    console.error("Gemini extraction failed", google.status, await google.text());
    return Response.json({ error: "Gemini could not extract this table. Try again later or edit locally.", code: "gemini_upstream", upstreamStatus: google.status }, { status: 502 });
  }
  const payload = await google.json();
  const table = generatedJson(payload);
  if (!table) return Response.json({ error: "Gemini returned an unreadable table. Try again or edit locally.", code: "gemini_invalid_json", diagnostic: generatedJsonDiagnostic(payload) }, { status: 502 });
  return Response.json(table);
}

export function generatedJson(payload) {
  const parts = payload?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  for (const part of parts) {
    if (part?.thought || typeof part?.text !== "string") continue;
    const text = part.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const result = JSON.parse(text);
      if (result && typeof result === "object" && !Array.isArray(result)) return result;
    } catch { /* Try later non-thought content parts. */ }
  }
  return null;
}

export function generatedJsonDiagnostic(payload) {
  const candidates = payload?.candidates || [];
  return {
    candidateCount: candidates.length,
    finishReasons: candidates.map((candidate) => candidate?.finishReason || "unknown"),
    parts: candidates.flatMap((candidate) => (candidate?.content?.parts || []).map((part) => ({
      thought: Boolean(part?.thought),
      hasText: typeof part?.text === "string",
      textLength: typeof part?.text === "string" ? part.text.length : 0,
    }))),
  };
}

async function fingerprint(value, salt) { const bytes = new TextEncoder().encode(`${salt}:${value}`); const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function toBase64(buffer) { let result = ""; const bytes = new Uint8Array(buffer); for (let index = 0; index < bytes.length; index += 0x8000) result += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(result); }

export function browserSafeHeaders(source) {
  const headers = new Headers(source);

  // Upstream storage providers may attach a document-level CSP that blocks
  // Benchwarmer's own CSS and JavaScript when their response is proxied.
  headers.delete("content-security-policy");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  headers.set("strict-transport-security", "max-age=31536000");
  headers.set(
    "permissions-policy",
    "geolocation=(), microphone=(), payment=(), usb=()",
  );
  return headers;
}
