import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askTranscript, RawResponseError, type Language } from "@/lib/catchup";

export function TranscriptQuestion({ apiKey, transcript, language }: { apiKey: string; transcript: string; language: Language }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setAnswer("");
    setError("");
    return () => request.current?.abort();
  }, [apiKey, transcript, language]);

  async function submit() {
    if (loading || !question.trim() || !transcript.trim() || !apiKey.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setAnswer("");
    setError("");
    try {
      const response = await askTranscript(apiKey, transcript, question, language, controller.signal);
      if (!controller.signal.aborted) setAnswer(response);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof RawResponseError ? e.rawText : e instanceof Error ? e.message : "Couldn't answer this question.");
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }

  return (
    <div className="border-b border-border pb-4">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Ask a question about this transcript..." placeholder="Ask a question about this transcript..." value={question} onChange={(e) => setQuestion(e.target.value)} className="pl-9" disabled={loading} />
        </div>
        {loading ? (
          <Button type="button" size="icon" variant="outline" aria-label="Stop answering" title="Stop answering" onClick={() => { request.current?.abort(); setLoading(false); }}><Square className="size-4" /></Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Ask question" title="Ask question" disabled={!apiKey.trim() || !transcript.trim() || !question.trim()}><ArrowUp /></Button>
        )}
      </form>
      <div aria-live="polite" aria-busy={loading}>
        {loading && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Finding relevant context…</p>}
        {answer && <p className="mt-3 border-l-2 border-primary pl-3 text-sm leading-relaxed break-words">{answer}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>}
      </div>
    </div>
  );
}