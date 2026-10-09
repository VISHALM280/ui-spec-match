import { afterEach, describe, expect, it, vi } from "vitest";
import { askTranscript, type ActionItem } from "../lib/catchup";
import { filterTasks } from "../lib/task-filters";

const tasks: ActionItem[] = [
  { task: "Review design", assignee: "Elena", deadline: null, deadline_text: "" },
  { task: "Ship update", assignee: "Marcus", deadline: null, deadline_text: "" },
  { task: "Approve release", assignee: "Elena", deadline: null, deadline_text: "" },
];
afterEach(() => vi.unstubAllGlobals());

describe("task filters", () => {
  it("All Tasks preserves all tasks and their original indices", () => {
    expect(filterTasks(tasks, [false, true, true], "", "all").map((t) => t.index)).toEqual([0, 1, 2]);
  });
  it("an assignee or Mine identity includes only that person's tasks", () => {
    expect(filterTasks(tasks, [], "Elena", "all").map((t) => t.index)).toEqual([0, 2]);
  });
  it("Pending excludes completed tasks, including when filtering by person", () => {
    expect(filterTasks(tasks, [false, true, true], "Elena", "pending").map((t) => t.index)).toEqual([0]);
  });
  it("Completed includes only completed tasks with stable indices", () => {
    expect(filterTasks(tasks, [false, true, true], "", "completed").map((t) => t.index)).toEqual([1, 2]);
  });
});

describe("transcript Q&A", () => {
  it("sends the question and transcript to Groq's primary and parses a concise JSON answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"answer":"Elena will review the design on Friday."}\n```' } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const answer = await askTranscript("gsk_test-only", "Elena: I'll review the design on Friday.", "Who reviews the design?", "English");
    expect(answer).toBe("Elena will review the design on Friday.");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(JSON.parse(body.messages[1].content)).toEqual({ transcript: "Elena: I'll review the design on Friday.", question: "Who reviews the design?" });
  });
  it("uses the configured Groq fallback on 429", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"error":{"message":"Rate limited"}}', { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"Elena owns the review."}' } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await askTranscript("gsk_test-only", "Elena owns the review.", "Who owns the review?", "English")).toBe("Elena owns the review.");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("openai/gpt-oss-20b");
  });
  it("sends question and transcript through Gemini when a Gemini key is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"answer":"Elena est responsable."}' }] } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await askTranscript("test-only", "Elena owns the review.", "Who owns the review?", "French")).toBe("Elena est responsable.");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ transcript: "Elena owns the review.", question: "Who owns the review?" });
    expect(fetchMock.mock.calls[0][0]).toContain("models/gemini-2.0-flash:generateContent");
  });
  it("does not make requests after cancellation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(askTranscript("gsk_test-only", "transcript", "question", "English", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});