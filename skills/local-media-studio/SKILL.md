---
name: local-media-studio
description: Plan and run a free-first, local-first AI media production workflow inspired by public capabilities of creative suites such as Higgsfield. Use for image/video planning, shot lists, camera directions, character references, audio, editing, and OmniRoute orchestration. Never assume a model is installed or run a paid/external generation job without explicit approval.
---

# Local Media Studio — Reference Skill

## Mission
Turn a plain-language creative brief into a validated, reproducible media-production plan that can be routed through OmniRoute. This is an independent implementation inspired by publicly described creative-workflow capabilities; it is not Higgsfield source code and does not imitate private endpoints.

## Required workflow
1. **Clarify the deliverable from the brief**: topic, audience, platform, aspect ratio, target duration, language, voice/identity references, rights/consent constraints, and budget.
2. **Inspect available tools before execution**: OmniRoute version and provider registry; Ollama availability; installed local media tools; free disk space; GPU/RAM; model files; FFmpeg; ComfyUI if present. Do not assume availability.
3. **Create a production manifest** with stable project/scene/asset IDs, prompts, model/provider, seed where supported, input hashes, output paths, status, and provenance.
4. **Break the brief into scenes**: narrative purpose, duration, visual subject, action, environment, lighting, camera movement, framing, dialogue, sound, transition, reference assets, and acceptance checks.
5. **Choose the lowest-cost viable path**: local tools first; no paid API, external account-credit job, download of large model weights, or network transmission of private reference assets without explicit approval.
6. **Validate before generation**: path safety, free disk space, input file readability, model/license availability, expected output size, hardware fit, and consent/rights for real-person likeness or voice.
7. **Run a small smoke test** first. Never queue a large batch until the smoke test passes and resource requirements are known.
8. **Assemble and inspect** outputs; preserve originals; generate a contact sheet/proxy when useful; run FFmpeg checks for duration, resolution, audio presence, and codec.
9. **Report evidence**: what actually ran, tool/model versions, output locations, tests, limitations, failures, and any user action still required. Never claim a generation or test succeeded without observed evidence.

## OmniRoute adapter contract
Expose each engine through a narrow adapter with:
- `id`, `display_name`, `capabilities`, `local_only`, `requires_auth`, `estimated_vram_gb`, `estimated_ram_gb`, `license_url`
- `health_check()`
- `validate_request(request)`
- `submit(request) -> job_id`
- `job_status(job_id)`
- `cancel(job_id)` where supported
- `collect_artifacts(job_id)`
- `provenance(job_id)`

A provider must declare capabilities truthfully (e.g. text-to-image, image-to-video, audio generation, interpolation, editing). Do not pretend a video editor is a generative video model.

## Safety and resource rules
- Default to local loopback endpoints; do not bind local services publicly.
- Never print API keys, cookies, access tokens, or full secret environment values.
- Never automate login, defeat anti-bot systems, bypass usage limits, or copy proprietary source/weights.
- Never upload private reference images/audio/video to an external service without approval.
- Preserve source media; write outputs into a new project-specific directory.
- Apply explicit approval gates to external paid providers and destructive file operations.
- For likeness/voice work, require appropriate consent and use the supplied references only for the intended project.

## Hardware-aware fallback ladder
1. Existing local tools and already-downloaded models.
2. Lightweight CPU-friendly operations (storyboards, prompt planning, image resizing, subtitle generation, timeline assembly).
3. Small, quantized local models only after disk/RAM/VRAM checks and license review.
4. If local video diffusion is beyond available hardware, use still-image storyboards plus motion editing/interpolation and FFmpeg assembly. Be honest that this is not equivalent to native AI video generation.
5. External providers remain disabled unless the user explicitly enables and approves them.

## First smoke test
- Confirm OmniRoute responds at `127.0.0.1:20128`.
- Confirm Ollama responds at `127.0.0.1:11434` and the configured `qwen2.5:3b` model answers a short planning prompt.
- Inspect installed media binaries and GPU/RAM/disk.
- Produce a JSON scene plan only; do not generate video yet.
- Save a redacted report and verify no secrets were written.

## Acceptance criteria
- Reproducible project manifest and scene plan.
- All adapters health-check independently.
- Jobs have explicit queued/running/succeeded/failed/cancelled states.
- Errors are actionable and never silently swallowed.
- Outputs are traceable to inputs, model/provider, and settings.
- Local-only mode makes no external generation requests.
- Paid/external routes require explicit opt-in and a visible approval gate.
