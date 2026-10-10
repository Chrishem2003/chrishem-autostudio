# Chrishem AutoStudio

Chrishem AutoStudio turns plain-language work requests into reviewable automation drafts. The product is built around one non-negotiable rule: **an automation must never claim to be live unless the server can execute its steps for real.**

The current stack is React, TypeScript, TanStack Start, Supabase, and the Lovable Vite/TanStack build configuration.

## Product principles

- **Draft → Preview → Live.** A flow is not live just because it appears on the canvas.
- **Truthful capability labels.** An unimplemented connector must remain Test only or Coming soon.
- **Server-side secrets.** Credentials must never be returned to the browser or written to logs.
- **Validated inputs.** Persisted workflows and AI responses must pass schemas before execution.
- **Safe outbound HTTP.** Only HTTP(S) is accepted; private/special-use IPs are rejected, DNS answers are checked, and connections are pinned to a validated address.
- **One execution path.** Manual and scheduled steps use the same server-side step executor.

## Current implementation status

The builder, templates, cloud persistence/version history, run logs, Gmail connection flow, HTTP/webhook actions, and chat-webhook steps are present. The connector catalog is larger than the set of live adapters; catalog presence alone does not mean a provider is implemented.

The shared executor currently supports scheduled triggers, Gmail sends, configured chat webhooks, HTTP requests, and outgoing webhooks. Other trigger/action nodes fail closed in live mode until their adapters are implemented. The job queue, full connector manifest registry, provider verification lifecycle, workspace roles, and all roadmap differentiators remain in progress.

## Development

The repository's committed lockfile is `bun.lock`. Use the pinned Bun toolchain to install dependencies reproducibly.

```sh
git clone https://github.com/Chrishem2003/chrishem-autostudio.git
cd chrishem-autostudio
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

Set the required Supabase values and a trusted `APP_BASE_URL` in your local environment or secret manager. Use `http://localhost:3000` only for local development; production must use the exact HTTPS origin registered with the OAuth provider. Never commit `.env`, OAuth tokens, provider keys, service-role keys, or cron secrets.

### Quality gates

```sh
bun run typecheck
bun run test
bun run build
```

GitHub Actions runs the same typecheck, unit tests, and production build for pushes to `main` / `audit/**` and for pull requests into `main`. The CI environment uses placeholder public configuration only; it does not connect to a production Supabase project.

## Scheduler setup

The scheduled runner is an authenticated endpoint:

`POST /api/public/cron/run-scheduled`

Call it every five minutes from an external scheduler. Configure `LOVABLE_CRON_SECRET` as a deployment secret with a long, randomly generated value. Do not put the secret in source control, a URL, or a query string.

Example request (replace the host with your deployed app URL and supply the secret through your scheduler's secret store):

```sh
curl --fail --silent --show-error --max-time 60 \
  -X POST "https://YOUR_DEPLOYED_HOST/api/public/cron/run-scheduled" \
  -H "Authorization: Bearer $LOVABLE_CRON_SECRET"
```

A successful response reports the number of automations checked, runs started, and runs that failed. The endpoint itself does not create a schedule; the external timer must call it. Keep the scheduler secret separate from all user connector credentials. If the secret is missing, the endpoint returns a server configuration error; an incorrect secret returns 401.

Only automations saved with cloud status `live` and a `trigger.schedule` node are considered. The runner claims each flow through an atomic, service-role-only database lease so overlapping cron calls do not send the same flow twice. It records each step, stops after a failed step, enforces a four-minute execution budget, and advances its cadence cursor after a failed run to avoid hot-looping.

## Security and execution notes

- Live status changes require a saved flow, a clean validation pass, supported live steps, and a successful Preview after the latest save.
- Preview mode does not send messages or call external services.
- Gmail uses the least-privilege `gmail.send` scope. Authorization remains pending until the user explicitly sends a test email to a recipient they control; test sends are limited to three per user per hour. The integration still depends on the Lovable connector gateway; migration to a directly managed Google OAuth application is a later roadmap item.
- DNS checks reduce SSRF risk by rejecting unsafe answers and pinning the chosen IP for the request. Network egress controls at the deployment layer are still recommended as defense in depth.
- **Deployment runtime gate:** the pinned transport uses Node HTTP(S) request APIs, while the current build configuration defaults to a Cloudflare target. A green build is not proof of runtime compatibility. Do not enable live HTTP/chat-webhook steps on a Cloudflare Worker until a deployed smoke test proves the transport works; otherwise use a Node.js runtime or a dedicated SSRF-safe egress service.
- Do not deploy database migrations until they have been reviewed and tested against a non-production Supabase project.

## Roadmap

See [the repository audit and phased delivery gates](docs/automation-studio-audit.md) and the [P0 hardening pull request](https://github.com/Chrishem2003/chrishem-autostudio/pull/1). The Master Plan's P0–P8 acceptance criteria remain the source of truth; no connector should be labeled Live before real verification and end-to-end tests pass.
