<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Briefing analysis and transcript Q&A share the browser-side provider request cascade in `src/lib/catchup.ts` so user-selected provider routing stays consistent.
- Task filters return original task indices so completion state and exports remain correct when the visible list changes.
- Transcript Q&A owns an independent cancellable request and invalidates answers when its transcript, language, or key changes to prevent stale context.
