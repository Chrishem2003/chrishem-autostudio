---
name: luo-vine-production-intelligence
description: Evidence-led, zero-paid-cost production planning and execution for LUO VINE. Use for presenter-led videos, scripts, shot lists, voice matching, talking-head/lip-sync research, captions, landscape/vertical edits, free-tier audits, provider troubleshooting, and reusable production workflows.
---

# LUO VINE Production Intelligence Skill

**Version:** 0.1.0  
**Last research pass:** 2026-10-28  
**Owner/project:** LUO VINE Media Hub  
**Primary constraint:** no paid generations, subscriptions, trial activation, or unapproved credit consumption.

## Mission

Produce the best realistic, coherent LUO VINE video deliverables possible while keeping costs at zero. Prefer a reliable finished video over endless installation work. Reuse the presenters' approved reference assets, voice recordings, brand decisions, shot plans, caption styles, and verified provider findings across episodes.

This is a persistent project reference, not a claim that the assistant can alter its underlying model weights. Improve it through evidence, tested results, versioned updates, and user approval for consequential actions.

## Hard rules

1. **Zero-cost gate:** Before any external generation or rendering job, verify the exact service, current free allowance, billing state, and expected credit cost. If any cost/credit impact is uncertain, stop and ask. Never start a trial or upgrade plan.
2. **No access-control bypass:** Do not circumvent login, CAPTCHA, paywalls, quotas, rate limits, or anti-abuse systems. Diagnose legitimate session/configuration issues; if blocked, use another route.
3. **Truthful status:** Distinguish *researched*, *configured*, *submitted*, *completed*, and *quality-checked*. Never call a job successful without checking the output.
4. **Protect assets and secrets:** Never place private presenter media, API keys, browser cookies, voice models, or secrets in a public repository. Do not print secrets in logs.
5. **Identity and voice integrity:** Match Chris Shem to Chris's approved voice/reference; Kimberly Jael to Kimberly's; Lucky Bianka to Bianka's. Do not swap voices. Use only assets the project owner is authorized to use.
6. **No destructive changes:** Do not delete/overwrite production services, existing assets, or repositories without explicit approval. Work on a branch and preserve original files.
7. **Approval gates:** Get explicit approval before using a generation quota, cloning/processing a voice on a third-party service, publishing, changing production infrastructure, or paying anything. Local script/storyboard/edit prep may proceed without that gate.
8. **Licenses matter:** Check code, model-weight, dataset, and music/asset licenses separately. A permissive code license does not automatically license the weights or training data.

## LUO VINE asset registry (Dropbox paths)

The following files were found in the connected Dropbox search on 2026-10-28. They have not yet been content-inspected or audio-listened-to in this research pass.

- Chris photo: `/LUO VINE REFRENCES/PODCAST PHOTOS/CHRIS/CHRIS_SOURCE .jpg`
- Kimberly photo: `/LUO VINE REFRENCES/PODCAST PHOTOS/KIMBERLY/KIMBERLY_SOURCE.jpg`
- Lucky/Bianka photo: `/LUO VINE REFRENCES/PODCAST PHOTOS/BIANCA/BIANKA_SOURCE.jpg`
- Chris voice: `/LUO VINE REFRENCES/PODCAST PHOTOS/CHRIS/CHRIS_001.wav` (also a VOICES-folder copy)
- Kimberly voice: `/LUO VINE REFRENCES/PODCAST PHOTOS/KIMBERLY/KIMBERLY_001.wav` (also a VOICES-folder copy)
- Lucky/Bianka voice: `/LUO VINE REFRENCES/PODCAST PHOTOS/BIANCA/BIANKA_001.wav` (also a VOICES-folder copy)

Do not assume these WAVs contain the launch script. First listen/transcribe/measure them, then determine whether they are voice references or finished narration. Preserve originals.

## Episode 01 baseline

**Deliverables**
- Master: 60 seconds, 1920×1080 (16:9), H.264 MP4, AAC audio.
- Vertical: 60 seconds, 1080×1920 (9:16), independently reframed; do not blindly center-crop faces or captions.
- Captions: corrected English subtitles, high contrast, safe margins, timed to actual speech.
- Branding: consistent LUO VINE wordmark/title, tasteful original motion graphics, coordinated visual palette, clean transitions.
- Audio: dialogue intelligible, matched loudness, no clipping, music safely below speech.
- Keep an editable project/timeline and a manifest with inputs, output hashes, versions, license notes, and QA status.

**Working script / timing draft (must be checked against actual delivered audio):**
- 00:00–00:08 Chris: “Welcome to LUO VINE — where ideas grow, stories connect us, and our voices reach beyond borders.”
- 00:08–00:22 Kimberly: “I’m Kimberly Jael. We’ll explore technology, education, and fresh ideas that help us learn, create, and shape our future.”
- 00:22–00:36 Lucky Bianka: “And I’m Lucky Bianka! We’re bringing you culture, business, entertainment, and the people making things happen.”
- 00:36–00:52 Chris: “I’m Chris Shem, and together we’re LUO VINE. Real conversations, bold perspectives, and stories worth sharing.”
- 00:52–01:00 Group/title close: “Join the conversation. Follow LUO VINE — and let’s grow together.”

Do not fabricate a group performance by combining voices unless the source audio supports it. A designed title card with separate speaker clips is a valid fallback.

## Production architecture

Use a provider-neutral pipeline so one failed vendor cannot block the project:

1. **Asset intake:** inventory file, size, duration, sample rate, resolution, rights/consent, and checksum. Never alter originals.
2. **Story design:** script, shot list, per-speaker timing, image/scene prompts, visual continuity guide, captions, and platform crops.
3. **Voice preparation:** determine if recordings are reference samples or narration. Use original recorded speech whenever possible. If new speech is needed, prefer an approved, zero-cost, local/authorized method; don't assume voice cloning is free or legal for all models.
4. **Presenter visuals:** try verified free image-to-video/talking-head options only after a cost gate. Generate one short speaker test at a time only after user approval. Check likeness, mouth motion, face stability, clothing continuity, and audio sync before scaling up.
5. **B-roll and motion graphics:** create reusable original backgrounds, maps, icons, lower thirds, animated logo/title cards, and non-speaking shots. This can make a polished production even when realistic talking-head generation is unavailable.
6. **Edit and render:** use a reproducible timeline and local tools (FFmpeg, Remotion, or a free NLE already installed). Keep the workflow light for the user's Intel UHD 620 / 1 GB VRAM system; do not recommend large diffusion models as local defaults.
7. **Quality assurance:** inspect the whole export; check duration, audio, subtitle timing, framing, identity, black frames, encoding, safe margins, and both aspect ratios. Save a report and revise failures.
8. **Archive:** save script, storyboard, timeline/project, captions (.srt/.ass), output files, manifest, provider/version notes, test outcomes, and next-episode improvements.

## Research reference catalogue (checked 2026-10-28)

### 1. Google Vids — possible free hosted scene generation
- Official announcement: https://blog.google/products-and-platforms/products/workspace/gemini-omni-in-google-vids/
- Google announced free HD video creation in Google Vids using Gemini Omni 1.1 Flash on 2026-09-23. This is a separate Google Vids product; it does **not** establish an accessible free API or OmniRoute integration. Account, regional, feature and quota availability must be checked in the user's own account before relying on it.
- Use as a potential human-operated fallback for scene generation; do not claim the assistant has generated anything there unless an authorized tool actually did so.

### 2. Vanta — architectural inspiration, not yet validated as install-ready
- Repository: https://github.com/itsjwill/vanta
- Its README describes a Remotion-centered engine combining voice, avatar/lip-sync, captions, video generation, transitions and editing. Useful architecture pattern: a common timeline and pluggable integrations rather than separate demos.
- Treat repository marketing claims as unverified until source, dependencies, licenses, model requirements, and test outputs are checked. Do not clone/install blindly, especially with limited C: drive space.

### 3. ReelForge — practical local caption/export pattern
- Repository: https://github.com/waseemnasir2k26/reelforge
- README describes local faster-whisper transcription, word-timed ASS captions, hook cards, FFmpeg 9:16 reframing, and CPU x264 fallback.
- Good ideas to adapt: local captioning, brand preset, deterministic exports, no per-export API. Verify code quality, dependency licenses, and compatibility before adoption; do not require Claude Code.

### 4. MuseTalk — possible lip-sync research
- Repository: https://github.com/TMElyralab/MuseTalk
- Its README says the code is MIT and weights are available, while other model dependencies retain their own licenses. It reports real-time inference on a Tesla V100; this is not evidence that it will run acceptably on Intel UHD 620 with 1 GB VRAM.
- Treat as a future hosted/remote or sufficiently equipped-machine candidate, not the default local route for this user.

### 5. HunyuanVideo — hardware reality check
- Repository: https://github.com/Tencent-Hunyuan/HunyuanVideo
- Published requirements list roughly 45–60 GB GPU memory for listed settings. This confirms that some high-quality open models are not practical on this PC. Avoid recommending heavyweight local generation unless hardware changes.

### 6. OmniRoute Veo AI Free — installed but unverified
- Local provider ID: `veoaifree-web`, display name “Veo AI Free”; OmniRoute version observed: 3.8.52.
- Static code inspection found a CSRF nonce fetch, WordPress AJAX action `veo_video_generator`, cookie handling, and retryable artifact-not-ready errors.
- This proves the implementation exists; it does not prove the remote website currently accepts unauthenticated requests or that the generated video can be retrieved. Do not bypass authentication or send generation requests without an explicit zero-cost check and user approval.
- Current state: **not verified working**; no generation request was sent during inspection.

## Hardware and storage constraints

- User PC: Intel UHD 620, approximately 1 GB VRAM, around 16.8 GB RAM; D: drive preferred for tools/data due to historically very low C: free space.
- Do not install model weights or large dependencies on C: without checking current free space.
- Prefer cloud free-tier generation only when genuinely available and approved; use local CPU tools for assembly, captions and compositing.
- Avoid promising fully realistic local diffusion output on this hardware.

## Required evaluation scorecard

For each provider/model, record:
- Date and exact model/version.
- Access route and whether account/login is required.
- Free quota and evidence source, plus any credit cost before execution.
- Can it accept reference images? Can it accept supplied audio? Does it preserve identity?
- Max duration, resolution, aspect ratio, queue/timeout behavior.
- License/usage terms and whether commercial use is allowed.
- Exact test prompt and output location (never store secrets).
- Results: completed/failed, elapsed time, identity match, visual quality, lip-sync, audio quality, watermark, and reproducibility.
- Decision: adopt / limited use / retest / reject, with reasons.

Do not score a provider as “working” from documentation alone. A successful result needs a completed output and quality check.

## Skill improvement loop

After each research or production milestone:
1. Separate evidence from vendor claims and guesses.
2. Add only reusable, sourced findings to this file.
3. Record exact versions, dates, constraints, failures and successful tests.
4. Prefer a small, reversible experiment over a large installation.
5. Update the version and change log; never silently overwrite the user's production assets.
6. Ask before spending credits, creating trials, cloning voices on external services, publishing, or changing production infrastructure.

## Next execution sequence

1. Inspect the real three portrait images and WAV files; establish which audio is reference speech versus final narration.
2. Create the full 60-second storyboard, narration/voice map, caption script, shot prompts, and both aspect-ratio layouts.
3. Build a lightweight editable motion-graphics master with the real assets while checking whether any already-connected free generation path is genuinely usable.
4. Only after the user approves a verified zero-cost test, evaluate one short talking-head clip per presenter; do not batch jobs before quality passes.
5. Render, inspect, and package Episode 01 plus vertical cut and reusable project files.

## Change log

- **0.1.0 — 2026-10-28:** Initial skill. Captured zero-cost/approval rules, Dropbox asset paths, Episode 01 script, provider-neutral pipeline, and initial research on Google Vids, Vanta, ReelForge, MuseTalk, HunyuanVideo and OmniRoute.
