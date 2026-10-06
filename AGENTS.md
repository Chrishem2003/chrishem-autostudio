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
- Real outbound web calls go through `callWeb` in src/lib/web-steps.server.ts (private-address block, 3 retries) — one guarded path for both manual and scheduled runs.
- Scheduled runs are executed by POST /api/public/cron/run-scheduled (cron-secret auth) using `isDue` in src/lib/schedule.ts — keeps schedule rules pure and testable.
- Chat-app message steps send for real through the app's incoming-webhook link via buildChatRequest in src/lib/chat-steps.ts (host allow-list per app), then callWeb — no per-app developer keys needed.
- Per-user app accounts (Gmail) use App User Connectors; encrypted keys live in app_user_connections, read only by server code — users' credentials never reach the browser.
