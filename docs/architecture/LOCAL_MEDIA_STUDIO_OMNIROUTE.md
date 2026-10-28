# Local Media Studio for OmniRoute — Engineering Plan

## Status
Design/reference-skill milestone only. This document does not claim that a local service has been installed or that media generation has been executed. The local Windows machine must be inspected before runtime changes.

## Product objective
Build a Higgsfield-inspired, independently implemented creative workflow around OmniRoute. The experience should plan, route, validate, and assemble media work, while local/open-source engines do the actual processing.

## Competitive capability map
The public Higgsfield product descriptions suggest these broad workflow categories:
- image creation and editing;
- text/image/video-conditioned video generation;
- character/reference consistency;
- camera and shot direction;
- storyboarding and multi-shot sequencing;
- voiceover, lip-sync, and localization;
- product/ad creative workflows;
- node-based reusable pipelines;
- an agent that coordinates tasks end-to-end.

We implement the user-facing workflow patterns, not proprietary internals, branding, private APIs, or model weights.

## Target architecture

```text
User / Local UI
      |
      v
OmniRoute workflow coordinator
      |
      +-- Local LLM planner (Ollama; qwen2.5:3b baseline)
      |
      +-- Scene / shot planner ------> project manifest (JSON)
      |
      +-- Provider registry
      |      +-- Local image engine (only if installed/licensed)
      |      +-- Local video engine (hardware-fit check required)
      |      +-- Audio / TTS engine (optional)
      |      +-- Editing / FFmpeg adapter
      |      +-- Subtitle / localization adapter
      |
      +-- Job ledger + approval gates
      |
      v
Project output directory + provenance report
```

## Hardware-aware constraint
The known baseline includes Intel UHD 620 graphics with about 1 GB reported VRAM and about 16.8 GB RAM. That is not a realistic assumption for running large video diffusion models at useful speed. Do not download multi-gigabyte models until disk space, model requirements, license, and expected runtime have been checked. Begin with planning, still-image storyboards, editing, audio/subtitles where feasible, and FFmpeg assembly. Treat native local video generation as a separate feasibility test.

## Suggested implementation phases

### Phase 0 — Discover and protect
- Inspect the actual OmniRoute install and data directories on D:.
- Read provider/adapter configuration and package scripts without changing them.
- Verify Ollama and the local Qwen model.
- Check free disk space, RAM, GPU, FFmpeg, Python/Node versions, and existing ComfyUI installation.
- Do not overwrite existing providers, Open WebUI data, credentials, or production resources.
- Produce a redacted inventory.

**Exit gate:** reproducible baseline report; no secrets; no configuration mutations.

### Phase 1 — Provider-neutral production manifest
- Define JSON schema for project, scene, asset, model/provider, settings, job status, and provenance.
- Build a scene planner using the existing local LLM.
- Validate prompts and output paths.
- Generate a no-media dry run and tests.

**Exit gate:** valid manifest, deterministic IDs, tests pass, no network generation calls.

### Phase 2 — Editing-first local engine
- Detect FFmpeg rather than assuming it exists.
- Add adapters for probe/metadata, resize/crop, concatenate, audio mix, subtitles, and export.
- Keep originals untouched and write to a project-specific output directory.
- Test with generated or public-domain sample assets.

**Exit gate:** a short landscape and vertical sample assembled locally with verified duration, dimensions, and audio metadata.

### Phase 3 — Local image engine
- Compare supported local options (for example, ComfyUI plus a compatible open model) against actual hardware.
- Inspect licenses and model download size before installation.
- Use an isolated model directory on D:.
- Add health checks and a single-image smoke test.

**Exit gate:** one local image generated and validated, with model/license recorded.

### Phase 4 — Video feasibility and animation
- Test only models whose requirements fit the machine, or use a low-memory/CPU strategy if realistic.
- If diffusion is infeasible, support image-to-motion editing, pan/zoom, interpolation where supported, and timeline assembly.
- Do not label edited stills as generated video.
- Make hardware constraints visible in the UI.

**Exit gate:** measured runtime and memory evidence; explicit capability labels.

### Phase 5 — OmniRoute integration
- Register the local media adapters as a separate provider/tool group without changing existing providers.
- Expose health checks, capabilities, job status, cancellation where supported, and output artifact links.
- Add local-only mode and an external-provider approval gate.
- Test provider errors, timeouts, cancelled jobs, missing models, and invalid paths.

**Exit gate:** smoke tests pass and existing OmniRoute/Ollama workflows remain healthy.

### Phase 6 — Production workflows
- LUO VINE introduction episode template.
- Presenter/character reference catalog with consent and asset provenance.
- Script-to-scene planning, landscape master, vertical derivatives, subtitles, and sound.
- Product/ad templates and batch variations after resource tests.
- Reusable node/workflow templates.

## Security / reliability requirements
- Local services bind to loopback unless a deliberate network configuration is approved.
- Never store secrets in source control or include them in logs.
- External generation and any paid API route are disabled by default.
- No scraping private assets, reverse-engineering private protocols, login bypass, or quota evasion.
- Use safe output paths; reject traversal and overwrites by default.
- Keep an audit trail of the selected engine, input asset hashes, settings, and outputs.
- Fail closed if the provider cannot prove it is local-only while local-only mode is active.

## Official and open-source reference points
- Higgsfield product overview: https://higgsfield.ai/creator-hub/help-center/getting-started/what-is-higgsfield
- Higgsfield public integration docs: https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-access-higgsfield-via-cli
- Wan 2.2 open model repository: https://github.com/Wan-Video/Wan2.2
- ComfyUI repository: https://github.com/Comfy-Org/ComfyUI

These are references for feature research and compatibility, not an instruction to install every dependency. Re-check current hardware requirements and licenses before choosing a model.
