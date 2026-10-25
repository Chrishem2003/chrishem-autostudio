# Shared AI Platform Integration Plan

## Goal

Provide one authenticated, multi-user AI capability across CHRISHEM AUTO-STUDIO, Sovereign Intelligence, NEMA-AGORA/BioEDGE, and Bio-Research Enterprise. AI must be available to authorized users through a server-side API; it must not depend on the founder's laptop or expose local Ollama to the public internet.

## Target architecture

1. **User interfaces**: each product keeps its own user experience and domain-specific tools.
2. **Shared AI gateway**: a server-side service authenticates requests, authorizes the user and product, validates inputs, applies rate/size limits, records minimal operational metadata, and routes to an explicitly configured model provider.
3. **Provider adapters**: Ollama for self-hosted inference, with optional cloud providers. Provider selection and fallback are explicit policy decisions; private prompts must not silently move to a cloud provider.
4. **Supabase**: identity/authorization and product data where configured. Enforce tenant/user isolation with Row Level Security; never trust a user ID supplied only in a request body.
5. **Render or equivalent hosting**: host the web/API services. A remote Ollama provider must run on a reachable, secured host with sufficient CPU/RAM/GPU; 127.0.0.1 on Render means the Render container itself, not a developer's computer.
6. **Auditability**: attach request IDs, product/module identifiers, provider/model identifiers, duration, and outcome. Do not log API keys or full sensitive prompts by default.

## Product capabilities

### CHRISHEM AUTO-STUDIO
- Accept a plain-language automation request.
- Convert it into a structured workflow proposal (trigger, steps, connectors, inputs/outputs, error paths, permissions, and expected result).
- Show a preview and ask for missing details.
- Validate schema, credentials/connector availability, permissions, and dangerous side effects before execution.
- Require explicit user confirmation before enabling or running workflows that send messages, modify records, spend money, delete data, or affect external systems.
- Save drafts separately from active workflows; provide versioning, test/dry-run, execution logs, retries, and a kill switch.
- Never execute arbitrary model-generated code or expose connector secrets to the model.

### NEMA-AGORA / BioEDGE
- Provide evidence-linked summaries, case triage assistance, draft reports, and anomaly explanations.
- Treat AI output as decision support, not an official regulatory finding. Preserve source evidence, uncertainty, reviewer identity, and human approval gates.
- Do not invent sensor readings, satellite observations, legal requirements, or case facts.

### Bio-Research Enterprise
- Assist with literature/protocol organization, intake checks, analysis planning, quality-control explanations, and draft publication material.
- Preserve provenance and distinguish supplied data from model-generated suggestions.
- Keep private or regulated research data within the approved processing policy.

### Sovereign Intelligence and other modules
- Reuse the same gateway and security controls, with module-specific tools and data scopes. Do not give every module universal access to every user's records.

## API contract (initial target)

POST /v1/ai/respond
- Requires a validated user session or service identity.
- Body: product, task, input, optional context_refs, optional response-format schema.
- Server derives the user/tenant from verified authentication; callers cannot self-assign privileges.
- Response: request_id, provider, model, output, warnings, usage when available.
- Apply request-size limits, timeouts, rate limits, and structured error responses.

POST /v1/automations/draft
- Accepts a natural-language automation description and returns a validated workflow draft only.
- Does not execute the draft. Execution uses a separate endpoint with authorization, policy checks, and explicit confirmation.

## Security and reliability requirements

- Keep provider secrets in server-side environment variables or a managed secret store; never in browser code, Git, or user-visible logs.
- Do not expose Ollama's port directly to the public internet. Put it behind private networking or a strongly authenticated gateway.
- Enforce per-user/per-tenant authorization, rate limits, quotas, input validation, timeouts, and safe error messages.
- Use least-privilege connector credentials and scope each workflow to the minimum required permissions.
- Treat model output, uploaded documents, and retrieved content as untrusted input. Ignore embedded instructions that attempt to override system policy or disclose secrets.
- Make provider fallback configurable and visible. For sensitive modules, fail closed instead of sending data to an unapproved provider.
- Add tests for unauthenticated access, cross-user data access, prompt injection, malformed workflow output, unsafe actions, provider outage, and concurrency.

## Delivery gates

1. Inspect the current Notion Live Analyzer/Sovereign Intelligence API and existing local Ollama work; preserve uncommitted user changes.
2. Implement and test a shared provider interface and authenticated API in a feature branch.
3. Prove local Ollama routing with a deterministic test and prove no cloud request is made when Ollama is selected.
4. Implement Auto-Studio natural-language-to-workflow drafts with schema validation and dry-run only.
5. Integrate NEMA-AGORA and Bio-Research through narrow, domain-specific tools and approval gates.
6. Run unit, integration, security, and multi-user isolation tests.
7. Deploy to staging, verify secrets/networking/health checks and real user flows, then request approval before production rollout.

## Current status

This file records the intended integration contract; it is not evidence that the shared service has been implemented or deployed. The local Ollama instance is currently a development provider only. Production availability for all users requires the shared API, hosting, authentication, provider capacity, and end-to-end validation.
