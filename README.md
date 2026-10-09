# ⚡ CatchUp AI — Executive Chat Catch-Up & Action Intelligence Dashboard

> **ProtocolX Hackathon Submission** | Solving *"The Unread Problem — What Did I Miss?"*

CatchUp AI transforms chaotic, multi-threaded team chat transcripts from Slack, WhatsApp, and Microsoft Teams into structured, actionable intelligence within seconds. Built with a local-first privacy architecture, user transcripts and API keys stay strictly on the client side.

---

## 🔗 Submission Links
* **Live Deployed App:** https://ui-spec-match.lovable.app
* **GitHub Repository:** https://github.com/VISHALM280/ui-spec-match

---

## ✨ Key Features & Capabilities

* 📊 **Noise Signal Meter:** Calculates off-topic noise reduction percentages and estimates time saved per chat thread.
* 🚨 **Urgency & Executive Briefings:** Automatically categorizes context into High, Medium, or Low urgency badges with clean high-level summaries.
* ✅ **Interactive Action Item Checklist:** Extracts tasks with assignees (`@username`), deadlines, and interactive completion checkboxes.
* ⚖️ **Key Decisions & Open Debates Log:** Maps finalized team agreements separately from unassigned urgent tasks or unresolved conflicts.
* ❓ **Interactive "Ask the Chat" Q&A:** Allows users to query the transcript using natural language questions for instant answers.
* 🌐 **Multi-Language Output & Text-to-Speech:** Translates executive summaries into 7+ languages while preserving original usernames, with built-in TTS audio briefings.
* 🌓 **Glassmorphic Light/Dark Mode System:** Native high-contrast theme toggle for seamless executive usability.

---

## 🛠️ Gen AI Services & Architecture

CatchUp AI utilizes a high-availability model fallback chain and local-first browser state execution:

1. **Primary Model Engine — Groq API (`llama-3.3-70b-versatile` & `openai/gpt-oss-20b`)**
   * *Path:* `src/services/apiClient.ts` / `src/utils/groqHandler.ts`
   * *Function:* Sub-second inference extracting raw structured JSON payloads containing executive summaries, action items, assignees, deadlines, and urgency ratings.

2. **Context Search & Failover Engine — Google Gemini API (`gemini-2.0-flash`)**
   * *Path:* `src/services/geminiHandler.ts`
   * *Function:* Dynamic failover cascade handling and direct natural language Q&A chat querying.

3. **Local-First Privacy System**
   * *Path:* `src/context/ApiContext.tsx`
   * *Function:* API requests are executed directly from browser state. API keys stay in browser memory and are never stored on external backends, meeting strict hackathon privacy requirements.

---

## 🚀 Local Setup & Installation

```bash
# Clone the repository
git clone [https://github.com/VISHALM280/ui-spec-match.git](https://github.com/VISHALM280/ui-spec-match.git)

# Navigate to project folder
cd ui-spec-match

# Install dependencies
npm install

# Start development server
npm run dev
