import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ClipboardPaste,
  Download,
  Eraser,
  FileText,
  Gavel,
  KeyRound,
  ListChecks,
  Loader2,
  Moon,
  Pause,
  Play,
  Radar,
  Share2,
  ShieldCheck,
  Sparkle,
  Sun,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TranscriptQuestion } from "@/components/transcript-question";
import { filterTasks, type TaskStatus } from "@/lib/task-filters";
import {
  LANGUAGES,
  SAMPLE_CHAT,
  SPEECH_LANG,
  analyzeChat,
  RawResponseError,
  calendarUrl,
  detectProvider,
  toMarkdown,
  toSlack,
  type CatchUpResult,
  type Language,
} from "@/lib/catchup";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CatchUp AI — What did I miss?" },
      { name: "description", content: "Paste a Slack, WhatsApp, Teams or Discord transcript and get summary, action items, decisions and conflicts instantly." },
      { property: "og:title", content: "CatchUp AI — What did I miss?" },
      { property: "og:description", content: "Executive catch-up briefings from messy chat transcripts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const KEY_STORE = "catchup.apiKey";

function Index() {
  const [dark, setDark] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [language, setLanguage] = useState<Language>("English");
  const [chat, setChat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatchUpResult | null>(null);
  const [rawFallback, setRawFallback] = useState<string | null>(null);
  const [done, setDone] = useState<boolean[]>([]);
  const [personFilter, setPersonFilter] = useState("");
  const [myUsername, setMyUsername] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("all");
  const [speaking, setSpeaking] = useState<"idle" | "playing" | "paused">("idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem(KEY_STORE) ?? "");
    const t = localStorage.getItem("catchup.theme");
    if (t) setDark(t === "dark");
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("catchup.theme", dark ? "dark" : "light");
  }, [dark]);

  const saveKey = (v: string) => {
    setApiKey(v);
    localStorage.setItem(KEY_STORE, v);
  };

  const provider = apiKey.trim() ? detectProvider(apiKey) : null;

  async function run() {
    if (!apiKey.trim()) { toast.error("Add a Groq or Gemini API key first."); return; }
    if (!chat.trim()) { toast.error("Paste a chat transcript first."); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    setRawFallback(null);
    stopSpeech();
    let parsedResult: CatchUpResult | null = null;
    try {
      parsedResult = await analyzeChat(apiKey, chat, language, ac.signal);
      console.log("Parsed JSON Output:", parsedResult);
    } catch (e) {
      console.error("CatchUp failed:", e);
      if (e instanceof RawResponseError) setRawFallback(e.rawText);
      else if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (parsedResult) {
        setResult(parsedResult);
        setDone(parsedResult.action_items.map(() => false));
        setPersonFilter("");
        setMineOnly(false);
        setTaskStatus("all");
      }
      setLoading(false);
    }
  }

  async function pasteClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      setChat(t);
      toast.success("Pasted from clipboard");
    } catch {
      toast.error("Clipboard access was blocked by your browser.");
    }
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    setSpeaking("idle");
  }

  function toggleSpeech() {
    const synth = window.speechSynthesis;
    if (!synth || !result) return toast.error("Speech isn't supported in this browser.");
    if (speaking === "playing") {
      synth.pause();
      return setSpeaking("paused");
    }
    if (speaking === "paused") {
      synth.resume();
      return setSpeaking("playing");
    }
    const text = [
      result.summary,
      ...result.action_items.map((a) => `${a.assignee}: ${a.task}. ${a.deadline_text}`),
      ...result.decisions,
    ].join(". ");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[language];
    const voice = synth.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking("idle");
    u.onerror = () => setSpeaking("idle");
    synth.cancel();
    synth.speak(u);
    setSpeaking("playing");
  }

  async function copySlack() {
    if (!result) return;
    await navigator.clipboard.writeText(toSlack(result));
    toast.success("Copied in Slack format");
  }

  function downloadMd() {
    if (!result) return;
    const blob = new Blob([toMarkdown(result, done)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "catchup-briefing.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPdf() {
    if (!result) return;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const html = toMarkdown(result, done)
      .split("\n")
      .map((l) =>
        l.startsWith("# ") ? `<h1>${esc(l.slice(2))}</h1>`
        : l.startsWith("## ") ? `<h2>${esc(l.slice(3))}</h2>`
        : l.startsWith("- ") ? `<li>${esc(l.slice(2))}</li>`
        : l ? `<p>${esc(l).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>` : "",
      )
      .join("");
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to export PDF."); return; }
    w.document.write(
      `<html><head><title>CatchUp Briefing</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;line-height:1.55;color:#0f172a}h2{margin-top:28px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}li{margin:4px 0}</style></head><body>${html}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  const completed = done.filter(Boolean).length;
  const assignees = [...new Set(result?.action_items.map((a) => a.assignee) ?? [])];
  const visibleTasks = filterTasks(result?.action_items ?? [], done, mineOnly ? myUsername : personFilter, taskStatus);

  return (
    <div className="min-h-screen bg-ambient">
      <Toaster theme={dark ? "dark" : "light"} position="top-center" richColors />

      <header className="sticky top-0 z-20 border-b border-border/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-brand text-primary-foreground shadow-card">
              <Radar className="size-5" />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">CatchUp <span className="text-brand">AI</span></h1>
              <p className="text-xs text-muted-foreground">What did I miss?</p>
            </div>
          </div>
          <div className="order-3 flex w-full items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-[11px] font-medium text-muted-foreground sm:order-none sm:w-auto">
            <ShieldCheck className="size-3.5 shrink-0 text-primary" />
            <span>GenAI Transparency: Powered by Groq / Gemini API | Local-First Architecture</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <button type="button" onClick={() => setDark(false)} aria-label="Light mode" className="cursor-pointer rounded p-1 hover:text-foreground">
              <Sun className="size-4" />
            </button>
            <Switch
              checked={dark}
              onCheckedChange={(v) => {
                document.documentElement.classList.toggle("dark", v);
                setDark(v);
              }}
              aria-label="Toggle dark mode"
            />
            <button type="button" onClick={() => setDark(true)} aria-label="Dark mode" className="cursor-pointer rounded p-1 hover:text-foreground">
              <Moon className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Control center */}
        <section className="glass flex flex-col gap-4 rounded-2xl p-5 lg:sticky lg:top-20 lg:self-start">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => saveKey(e.target.value)}
                placeholder="Groq (gsk_…) or Gemini API key"
                className="pl-9 pr-20"
                autoComplete="off"
              />
              {provider && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                  {provider}
                </span>
              )}
            </div>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">Your key stays in this browser and is sent only to the provider.</p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setChat(SAMPLE_CHAT)}><Sparkle /> Load Sample Chat</Button>
            <Button variant="outline" size="sm" onClick={pasteClipboard}><ClipboardPaste /> Paste</Button>
            <Button variant="ghost" size="sm" onClick={() => setChat("")} disabled={!chat}><Eraser /> Clear</Button>
          </div>

          <textarea
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder={"[09:02] alex: paste your Slack / WhatsApp / Teams / Discord export here…"}
            className="min-h-[340px] w-full resize-y rounded-xl border border-input bg-background/60 p-4 font-mono text-[13px] leading-relaxed outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 lg:min-h-[440px]"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{chat ? `${chat.split("\n").filter(Boolean).length} lines` : "No transcript yet"}</span>
            <span>{chat.length.toLocaleString()} chars</span>
          </div>

          <Button size="lg" onClick={run} disabled={loading} className="bg-brand text-primary-foreground shadow-card transition hover:scale-[1.01] hover:opacity-95">
            {loading ? <Loader2 className="animate-spin" /> : <Wand2 />}
            {loading ? "Reading the chat…" : "Catch Me Up"}
          </Button>
        </section>

        {/* Results */}
        <section className="flex min-w-0 flex-col gap-5">
          <TranscriptQuestion apiKey={apiKey} transcript={chat} language={language} />
          {error && (
            <div className="animate-rise flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <div><p className="font-semibold">Couldn't analyze the chat</p><p className="text-muted-foreground">{error}</p></div>
            </div>
          )}

          {rawFallback && !loading && (
            <div className="glass rounded-2xl p-5 text-sm">
              <p className="font-semibold">Couldn't format the briefing — raw model output:</p>
              <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap text-muted-foreground">{rawFallback}</pre>
            </div>
          )}
          {!result && !loading && !error && !rawFallback && <EmptyState />}
          {loading && <LoadingState />}

          {result && !loading && (
            <>
              {/* Noise meter + toolbar */}
              <div className="glass animate-rise rounded-2xl p-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">Noise Signal Meter</span>
                  <span className="text-muted-foreground">Filtered {result.noise_percent}% off-topic noise • Saved ~{result.minutes_saved} mins</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-1000" style={{ width: `${result.noise_percent}%` }} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={toggleSpeech}>
                    {speaking === "playing" ? <Pause /> : <Play />}
                    {speaking === "playing" ? "Pause" : speaking === "paused" ? "Resume" : "Listen to Briefing"}
                  </Button>
                  {speaking !== "idle" && <Button size="sm" variant="ghost" onClick={stopSpeech}>Stop</Button>}
                  <Button size="sm" variant="outline" onClick={copySlack}><Share2 /> Copy for Slack</Button>
                  <Button size="sm" variant="outline" onClick={exportPdf}><FileText /> PDF</Button>
                  <Button size="sm" variant="outline" onClick={downloadMd}><Download /> Markdown</Button>
                </div>
              </div>

              {/* Summary */}
              <Card title="Executive Summary" icon={<Radar className="size-4" />} delay={60} extra={<UrgencyBadge level={result.urgency} />}>
                <p className="leading-relaxed text-foreground/90">{result.summary}</p>
              </Card>

              {/* Actions */}
              <Card
                title="Action Items"
                icon={<ListChecks className="size-4" />}
                delay={120}
                extra={<span className="text-xs text-muted-foreground">{completed}/{result.action_items.length} done</span>}
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={!mineOnly && !personFilter ? "secondary" : "ghost"} aria-pressed={!mineOnly && !personFilter} onClick={() => { setPersonFilter(""); setMineOnly(false); setTaskStatus("all"); }}>All Tasks</Button>
                  <Button size="sm" variant={mineOnly ? "secondary" : "ghost"} aria-pressed={mineOnly} disabled={!myUsername || !assignees.includes(myUsername)} onClick={() => { setMineOnly(true); setPersonFilter(""); }}>Mine{myUsername ? ` / @${myUsername}` : " / @username"}</Button>
                  <Select value={myUsername || undefined} onValueChange={(v) => { setMyUsername(v); setMineOnly(true); setPersonFilter(""); }}>
                    <SelectTrigger aria-label="Your username" className="h-8 w-auto min-w-36 max-w-full text-xs"><SelectValue placeholder="Your username" /></SelectTrigger>
                    <SelectContent>{assignees.map((name) => <SelectItem key={name} value={name}>@{name}</SelectItem>)}</SelectContent>
                  </Select>
                  {personFilter && <Button size="sm" variant="secondary" aria-pressed onClick={() => setPersonFilter("")}>@{personFilter} ×</Button>}
                </div>
                <div className="mb-4 flex gap-1 border-b border-border pb-2" role="group" aria-label="Task status">
                  {([ ["all", "Any status"], ["pending", "Pending"], ["completed", "Completed"] ] as const).map(([status, label]) => (
                    <Button key={status} size="sm" variant={taskStatus === status ? "secondary" : "ghost"} aria-pressed={taskStatus === status} onClick={() => setTaskStatus(status)}>{label}</Button>
                  ))}
                </div>
                {result.action_items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No action items found.</p>
                ) : visibleTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks match these filters.</p>
                ) : (
                  <ul className="grid gap-2.5">
                    {visibleTasks.map(({ item: a, index: i }) => {
                      const cal = calendarUrl(a);
                      return (
                        <li
                          key={i}
                          className={cn(
                            "group flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3.5 transition hover:-translate-y-0.5 hover:border-ring/50",
                            done[i] && "opacity-60",
                          )}
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={!!done[i]}
                            onCheckedChange={(v) => setDone((d) => d.map((x, j) => (j === i ? !!v : x)))}
                            aria-label="Mark complete"
                          />
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-sm font-medium", done[i] && "line-through")}>{a.task}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                              <Button variant="ghost" size="sm" aria-label={`Filter tasks for @${a.assignee}`} onClick={() => { setPersonFilter(a.assignee); setMineOnly(false); }} className="h-auto max-w-full whitespace-normal break-words rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">@{a.assignee}</Button>
                              {a.deadline_text && <span className="text-muted-foreground">⏱ {a.deadline_text}</span>}
                            </div>
                          </div>
                          {cal && (
                            <a href={cal} target="_blank" rel="noreferrer" title="Add to Google Calendar"
                              className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground">
                              <CalendarPlus className="size-4" />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <div className="grid gap-5 md:grid-cols-2">
                <Card title="Key Decisions" icon={<Gavel className="size-4" />} delay={180}>
                  {result.decisions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No confirmed decisions.</p>
                  ) : (
                    <ul className="grid gap-2">
                      {result.decisions.map((d, i) => (
                        <li key={i} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-low" />{d}</li>
                      ))}
                    </ul>
                  )}
                </Card>

                <div className="animate-rise rounded-2xl border border-warn-foreground/30 bg-warn p-5" style={{ animationDelay: "240ms" }}>
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-warn-foreground">
                    <AlertTriangle className="size-4" /> Unresolved Conflicts & Open Debates
                  </h3>
                  {result.conflicts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing left hanging.</p>
                  ) : (
                    <ul className="grid gap-2">
                      {result.conflicts.map((c, i) => (
                        <li key={i} className="flex gap-2 text-sm"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn-foreground" />{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Card({ title, icon, extra, delay = 0, children }: { title: string; icon: React.ReactNode; extra?: React.ReactNode; delay?: number; children: React.ReactNode }) {
  return (
    <div className="glass animate-rise rounded-2xl p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><span className="text-primary">{icon}</span>{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

function UrgencyBadge({ level }: { level: CatchUpResult["urgency"] }) {
  const cls = { HIGH: "bg-high/15 text-high border-high/40", MEDIUM: "bg-medium/15 text-medium border-medium/40", LOW: "bg-low/15 text-low border-low/40" }[level];
  return <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wider", cls)}>{level} URGENCY</span>;
}

function EmptyState() {
  return (
    <div className="glass flex min-h-[420px] flex-col items-center justify-center rounded-2xl p-10 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Radar className="size-7" /></div>
      <h2 className="text-xl font-semibold tracking-tight">Your briefing will appear here</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">Paste a transcript (or load the sample), add your key, and hit <b>Catch Me Up</b>.</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-5">
      {[80, 140, 200].map((h, i) => (
        <div key={i} className="glass animate-pulse rounded-2xl" style={{ height: h }} />
      ))}
    </div>
  );
}
