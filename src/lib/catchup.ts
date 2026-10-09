export type Urgency = "HIGH" | "MEDIUM" | "LOW";

export interface ActionItem {
  task: string;
  assignee: string;
  deadline: string | null; // ISO 8601 or null
  deadline_text: string;
}

export interface CatchUpResult {
  summary: string;
  urgency: Urgency;
  noise_percent: number;
  minutes_saved: number;
  action_items: ActionItem[];
  decisions: string[];
  conflicts: string[];
}

export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Hindi",
  "Mandarin",
  "Japanese",
] as const;
export type Language = (typeof LANGUAGES)[number];

export const SPEECH_LANG: Record<Language, string> = {
  English: "en-US",
  Spanish: "es-ES",
  French: "fr-FR",
  German: "de-DE",
  Hindi: "hi-IN",
  Mandarin: "zh-CN",
  Japanese: "ja-JP",
};

export type Provider = "groq" | "gemini";
export const detectProvider = (key: string): Provider =>
  key.trim().startsWith("gsk_") ? "groq" : "gemini";

function systemPrompt(language: Language) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are a chat summarizer. Output ONLY a valid raw JSON object without markdown formatting.\nYou are CatchUp AI, an executive assistant that reads messy chat transcripts (Slack, WhatsApp, Teams, Discord) and extracts what someone missed.
Today's date is ${today}. Resolve relative dates ("Friday", "tomorrow EOD") into ISO 8601 datetimes when possible.
Write ALL natural-language output (summary, tasks, deadline_text, decisions, conflicts) in ${language}. Keep person names / usernames exactly as written in the transcript.
Only use information present in the transcript. Never invent people, tasks or dates.
Respond with RAW, valid JSON only. Do NOT wrap it in markdown code fences (no backtick characters), and add no commentary before or after. The first character must be { and the last must be }. Use this exact shape:
{
  "summary": string (3-5 sentence executive overview),
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "noise_percent": integer 0-100 (share of messages that were off-topic chatter),
  "minutes_saved": integer (estimated reading time saved),
  "action_items": [{"task": string, "assignee": string (username or "Unassigned"), "deadline": ISO 8601 string or null, "deadline_text": string (human readable, or "")}],
  "decisions": [string],
  "conflicts": [string] (open debates, unanswered questions, unassigned urgent work)
}`;
}

function normalize(raw: unknown): CatchUpResult {
  const r = (raw ?? {}) as Partial<CatchUpResult>;
  const u = String(r.urgency ?? "MEDIUM").toUpperCase();
  return {
    summary: String(r.summary ?? ""),
    urgency: (["HIGH", "MEDIUM", "LOW"].includes(u) ? u : "MEDIUM") as Urgency,
    noise_percent: Math.max(0, Math.min(100, Math.round(Number(r.noise_percent) || 0))),
    minutes_saved: Math.max(0, Math.round(Number(r.minutes_saved) || 0)),
    action_items: Array.isArray(r.action_items)
      ? r.action_items.map((a) => ({
          task: String(a?.task ?? ""),
          assignee: String(a?.assignee ?? "Unassigned").replace(/^@/, ""),
          deadline: a?.deadline && !isNaN(Date.parse(a.deadline)) ? a.deadline : null,
          deadline_text: String(a?.deadline_text ?? ""),
        }))
      : [],
    decisions: Array.isArray(r.decisions) ? r.decisions.map(String) : [],
    conflicts: Array.isArray(r.conflicts) ? r.conflicts.map(String) : [],
  };
}

export class RawResponseError extends Error {
  constructor(public rawText: string) {
    super("The model's reply couldn't be parsed as JSON. Showing the raw output instead.");
  }
}

function sanitize(rawText: string) {
  const t = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start >= 0 && end > start ? t.substring(start, end + 1) : t;
}

function parseJson(text: string) {
  return JSON.parse(sanitize(text));
}

async function errorMessage(res: Response) {
  try {
    const j = await res.json();
    return j?.error?.message || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
] as const;
export const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"] as const;

const ATTEMPT_TIMEOUT_MS = 20000;
const FAILOVER_STATUSES = new Set([404, 429, 503]);

class AttemptError extends Error {
  constructor(
    message: string,
    public failover: boolean,
  ) {
    super(message);
  }
}

async function callModel(
  provider: Provider,
  model: string,
  key: string,
  sys: string,
  user: string,
  outer?: AbortSignal,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener("abort", onOuter);
  try {
    const res =
      provider === "groq"
        ? await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: ctrl.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              temperature: 0.2,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: sys },
                { role: "user", content: user },
              ],
            }),
          })
        : await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
            {
              method: "POST",
              signal: ctrl.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: sys }] },
                contents: [{ role: "user", parts: [{ text: user }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
              }),
            },
          );
    if (!res.ok) throw new AttemptError(await errorMessage(res), FAILOVER_STATUSES.has(res.status));
    const data = await res.json();
    const text: string =
      provider === "groq"
        ? (data.choices?.[0]?.message?.content ?? "")
        : (data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "");
    if (!text.trim()) throw new AttemptError("The model returned an empty response.", true);
    return text;
  } catch (e) {
    if (outer?.aborted) throw e; // user cancelled: stop the cascade
    if (e instanceof AttemptError) throw e;
    // timeout or network failure -> fail over
    throw new AttemptError(e instanceof Error ? e.message : "Network error", true);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}

export async function analyzeChat(
  apiKey: string,
  transcript: string,
  language: Language,
  signal?: AbortSignal,
): Promise<CatchUpResult> {
  const key = apiKey.trim();
  const provider = detectProvider(key);
  const sys = systemPrompt(language);
  const user = `Transcript:\n"""\n${transcript}\n"""\nReturn the JSON now.`;
  const models: readonly string[] = provider === "groq" ? GROQ_MODELS : GEMINI_MODELS;

  let lastErr = "No model responded.";
  let lastRaw = "";
  for (const model of models) {
    try {
      const text = await callModel(provider, model, key, sys, user, signal);
      lastRaw = text;
      // Parsing is inside the cascade: unreadable output also fails over.
      return normalize(parseJson(text));
    } catch (e) {
      if (signal?.aborted) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      const failover = e instanceof AttemptError ? e.failover : true; // parse errors fail over
      if (!failover) {
        console.warn(`[CatchUp] ${model} failed (non-retryable): ${msg}`);
        // Bad key etc. will fail on every model; stop early.
        throw new Error(msg);
      }
      console.warn(`[CatchUp] ${model} unavailable (${msg}). Trying next model…`);
    }
  }
  if (lastRaw) throw new RawResponseError(lastRaw);
  throw new Error(`All models in the fallback chain failed. Last error: ${lastErr}`);
}

// ---------- Exports ----------

export function toSlack(r: CatchUpResult) {
  const lines = [
    `*:newspaper: CatchUp Briefing* — Urgency: *${r.urgency}*`,
    "",
    `>${r.summary}`,
    "",
    "*Action Items*",
    ...r.action_items.map(
      (a) => `• :white_large_square: ${a.task} — <@${a.assignee}>${a.deadline_text ? ` _(due ${a.deadline_text})_` : ""}`,
    ),
    "",
    "*Key Decisions*",
    ...r.decisions.map((d) => `• :white_check_mark: ${d}`),
  ];
  if (r.conflicts.length) lines.push("", "*Open Conflicts*", ...r.conflicts.map((c) => `• :warning: ${c}`));
  return lines.join("\n");
}

export function toMarkdown(r: CatchUpResult, done: boolean[] = []) {
  return [
    `# CatchUp AI Briefing`,
    ``,
    `**Urgency:** ${r.urgency}  `,
    `**Noise filtered:** ${r.noise_percent}% • ~${r.minutes_saved} min saved`,
    ``,
    `## Executive Summary`,
    r.summary,
    ``,
    `## Action Items`,
    ...r.action_items.map(
      (a, i) => `- [${done[i] ? "x" : " "}] ${a.task} — @${a.assignee}${a.deadline_text ? ` (due ${a.deadline_text})` : ""}`,
    ),
    ``,
    `## Key Decisions`,
    ...r.decisions.map((d) => `- ${d}`),
    ``,
    `## Unresolved Conflicts`,
    ...(r.conflicts.length ? r.conflicts.map((c) => `- ${c}`) : ["- None"]),
  ].join("\n");
}

export function calendarUrl(a: ActionItem) {
  if (!a.deadline) return null;
  const start = new Date(a.deadline);
  const end = new Date(start.getTime() + 30 * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: a.task,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Assigned to @${a.assignee} — via CatchUp AI`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export const SAMPLE_CHAT = `[09:02] priya.sharma: morning all ☕ anyone else's train delayed again lol
[09:03] marcus: mine was fine for once 😂
[09:05] priya.sharma: ok real talk — client demo for Northwind moved UP to Thursday 3pm. not Friday.
[09:06] dev_ankit: wait what?? the payments flow is still half broken on staging
[09:07] lena.k: 🙃 cool cool cool
[09:08] marcus: did anyone watch the match last night?
[09:08] lena.k: marcus focus 😅
[09:10] priya.sharma: @dev_ankit can you get the payments fix merged by Wednesday EOD?
[09:11] dev_ankit: yes if @lena.k reviews the PR tomorrow morning
[09:11] lena.k: deal, I'll review by 11am tomorrow
[09:14] tom.r: re: pricing slide — I still think we should show annual pricing first
[09:15] priya.sharma: hmm I disagree, monthly converts better for their size. let's not decide now
[09:15] tom.r: we need to decide before thursday though
[09:16] marcus: lunch at the thai place?
[09:16] lena.k: 🙋‍♀️
[09:20] priya.sharma: DECISION: we're going with the dark theme for the demo deck. final.
[09:21] tom.r: 👍 agreed
[09:23] dev_ankit: also confirmed — we drop the analytics module from v1 scope, it ships in v1.1
[09:24] priya.sharma: yes confirmed, thanks ankit
[09:26] marcus: who's handling the demo environment data seeding? nobody owns that yet
[09:27] marcus: it's kind of urgent, northwind wants real-looking data
[09:31] lena.k: not me, I'm on QA all week
[09:40] tom.r: sending the updated deck draft to priya by tomorrow 5pm
[09:41] priya.sharma: 🙏 perfect
[09:45] marcus: anyone seen my charger
[09:52] dev_ankit: also security review — do we need sign-off from legal before showing the SSO flow? no one answered last week
[09:55] lena.k: brb coffee`;
