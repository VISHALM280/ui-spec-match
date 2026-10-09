https://github.com/VISHALM280/ui-spec-match
```[cite: 30]

---

### **Requirement 3: Deployed Project Link**[cite: 26, 27]
```text
https://ui-spec-match.lovable.app
```[cite: 7]

---

### **Requirement 4: Brief Description of the Project Built**[cite: 26, 27]
```text
CatchUp AI addresses "The Unread Problem — What Did I Miss?" challenge by ingesting noisy, multi-threaded team chat transcripts (Slack, WhatsApp, Teams) and instantly extracting structured, actionable summaries.

Key features include:
- Noise Signal Meter: Visual indicator quantifying noise reduction percentage and estimated time saved per chat thread.
- Executive Summary & Urgency Tagging: High-level overview with auto-calculated High, Medium, or Low urgency badges.
- Interactive Action Item Checklist: Lists tasks, assignees (@username), deadlines, and interactive completion checkboxes.
- Key Decisions & Debates Log: Maps confirmed team agreements separately from unresolved debates or unassigned urgent tasks.
- Interactive Q&A Search: "Ask the Chat" bar for natural-language context querying.
- Accessibility & Multi-Language: Built-in Text-to-Speech audio briefings and output translation into 7+ languages while preserving original usernames.
- Executive UI: Light/Dark theme switching with a sleek glassmorphic dashboard design system.
```[cite: 28]

---

### **Requirement 5: Gen AI Services Used & Location**[cite: 26, 27]
```text
1. Primary Inference Engine — Groq API (llama-3.3-70b-versatile & openai/gpt-oss-20b):
   - Location: src/services/apiClient.ts / src/utils/groqHandler.ts
   - Usage: Sub-second extraction of structured JSON containing executive summaries, action items, assignees, deadlines, and urgency ratings.

2. Context Search & Failover Engine — Google Gemini API (gemini-2.0-flash):
   - Location: src/services/geminiHandler.ts
   - Usage: Dynamic fallback cascade processing and interactive Q&A querying ("Ask the Chat").

3. Client-Side Local-First Architecture:
   - Location: src/context/ApiContext.tsx
   - Usage: Executes API calls directly from browser state. API keys stay local in browser memory, satisfying the local-first processing requirement.
```[cite: 27, 28]
