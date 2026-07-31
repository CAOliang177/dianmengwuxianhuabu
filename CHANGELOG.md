# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.44] - 2026-07-31

### Fixed

- New Channel synchronous image requests now use the full generation timeout
  instead of the 90-second async submission timeout, preventing successful
  relay jobs from being reported as not received.
- Async submissions still use the short task-id acknowledgement timeout, then
  switch to normal long polling.
- Timeout messages now state that the relay may still be processing the job,
  avoiding misleading retry advice and accidental duplicate billing.

## [0.1.43] - 2026-07-31

### Fixed

- Keep every node mounted while any canvas task is pending or processing, so
  panning a running node out of view cannot tear down its live task
  subscription and stop generation.
- Re-enable off-screen node virtualization only after all tasks become
  terminal, while retaining the persistence coalescing and history recovery
  improvements from v0.1.42.

## [0.1.42] - 2026-07-31

### Changed

- Large canvases render only visible nodes, including while generation tasks
  are running.
- Bursts of node, edge, and metadata persistence are coalesced into fewer
  atomic disk writes.

### Fixed

- Stale renderer snapshots can no longer overwrite generation history already
  recorded by the background task runner.
- Startup recovery merges local and disk history and restores recoverable
  completed images from the local task database across every saved canvas.
- Legacy second/millisecond/microsecond timestamps are normalized before
  sorting and applying the one-week history retention window.
- Empty, missing, or over-20-MB input images now show an actionable Chinese
  error instead of the raw byte-limit message.

## [0.1.13] - 2026-07-04

### Added

- **Audio understanding** — new `audio-describe` ABI slot and canvas node:
  select an audio node and hit **Describe** on the smart island to get a
  natural-language description of the clip (genre, mood, instruments,
  vocals, events), with an optional custom prompt. Implemented by four
  official plugins: **Gemini** (native audio in `generateContent`),
  **OpenAI** (`gpt-audio` via `input_audio` part), **Agnes**
  (`agnes-2.0-flash`, `input_audio` part), and **Gemma 4** (GPU, existing
  multimodal pipeline). Requires `tongflow==0.2.2`.
- **Reference audio for music generation** — the music node (`gen-music`)
  gains an optional `ref_audio` input handle: connect an audio node to
  condition the song on a reference track. ACE-Step uses it for
  style-transfer conditioning (`reference_audio`); LeVo uses it as the
  melody prompt (`melody_wavs`, first 10 s). Requires `tongflow==0.2.1`
  (published) and redeployed `tongflow-modal-ace-step` /
  `tongflow-modal-levo` plugins.

### Changed

- **Uploads: 50 MB file-size limit removed** — large media files can now be
  added to the canvas directly.
- Python SDK **0.2.1** / **0.2.2** published to PyPI (generated models and
  `NodeSlots` for the two new capabilities above). Official plugin repos
  created for **LeVo**, **Bernini**, **FastWan**, and **SenseNova-U1**.

### Fixed

- **Upload failures are no longer silent** — per-file upload errors are
  surfaced instead of quietly dropping the file.
- **Node prompt boxes no longer stretch endlessly** — long input now stops
  at a fixed height and scrolls (the auto-growing textarea previously
  expanded the whole node with no scrollbar).
- **Gemini plugin worked around Google's model retirement** — the default
  `gemini-2.0-flash` now 404s upstream; bumped to `gemini-2.5-flash` so the
  plugin works out of the box again.

## [0.1.12] - 2026-07-04

### Added

- **Agnes AI official plugin** (`tongflow-api-agnes`) — one API key covers
  **12 slots** via the OpenAI-compatible [Agnes AI](https://agnes-ai.com)
  gateway: text generation / splitting / combining and image understanding
  (`agnes-2.0-flash`, 512K context), image generation / editing
  (`agnes-image-2.1-flash` / `2.0-flash`, per-node model picker), multi-image
  fusion (`agnes-image-2.0-flash`), and async text / image / multi-image /
  first-last-frame → video (`agnes-video-v2.0`, up to ~18 s per clip).
- **Desktop auto-update** — the app checks for new releases and updates
  itself via an in-app update button; no more manual installer downloads.
- **Uninstall plugins** — installed plugins can now be removed from the
  plugin manager.
- **Cancel running nodes** — a running node can be cancelled from its
  loading overlay.

### Changed

- **Per-plugin env var cards** — Settings renders each plugin's declared
  environment variables (`tongflow.plugin.json`) as a pre-filled card;
  shared keys are hoisted into a single "Shared" card.
- **In-app dialogs** — native `confirm`/`alert` popups replaced with
  in-app dialogs.

## [0.1.11] - 2026-07-03

### Fixed

- **Plugin installs behind corporate proxies / private CAs** — installing a
  plugin no longer fails with `git failed: unable to verify the first
  certificate` when the network uses a TLS-inspection proxy or the plugin
  repo is served under a privately-trusted CA. The desktop app now launches
  its bundled Node server with `--use-system-ca`, so the OS trust store
  (macOS Keychain / Windows certificate store) is honored in addition to
  Node's built-in CA list.

## [0.1.10] - 2026-07-02

### Added

- **Per-node model picker for router-style plugins** — a plugin can now declare
  per-slot model lists (a `TONGFLOW_SLOT_MODELS` constant, discovered by the
  scanner without importing plugin code). The node shows a **Model** dropdown
  next to the plugin selector, and the selection travels top-level — like
  `pluginId` — through task creation, the `tasks` table, the plugin envelope,
  and workflow export. Fully opt-in: plugins that declare no models are
  unchanged, and new plugins degrade gracefully to their default model on
  older runtimes.
- **APIMart official plugin** (`tongflow-api-apimart`) — one API key routes
  **46 models across 7 slots** via the [APIMart](https://apimart.ai) gateway:
  image generation / editing (Z-Image-Turbo, Seedream 4.5 / 4.0 / 5.0-Lite,
  Nano Banana Pro / 2 / classic, GPT-Image 1 / 2, Imagen 4.0, Qwen Image 2.0,
  Wan2.7, Grok Imagine), text / image → video (Kling v3 / 3.0-Turbo / 2.6,
  VEO3.1 fast / quality / lite, Sora 2 / Pro, Seedance 2.0 / 1.5-Pro), text
  generation (GPT-5.x, Claude, Gemini, DeepSeek), Whisper transcription, and
  TTS — with the backing model selectable per node.
- **Link node** — link modality asset node plus a link → text transform,
  wired through connection validation and the workflow exporter.
- Registered the **LeVo** official plugin (`tongflow-modal-levo`).

### Changed

- Python SDK **0.2.0** published to PyPI: the plugin scanner emits per-slot
  model lists and the workflow engine forwards the node's model selection to
  plugins.

## [0.1.9] - 2026-06-30

### Added

- **Korean (`ko`) locale** — full UI translation, joining the existing
  English / Chinese / Japanese languages.
- Registered the **Boogu-Image** official plugin (`tongflow-modal-boogu`).

### Fixed

- Execution feedback is now cleared when a node's plugin is not installed,
  instead of leaving a stale error on the node.

## [0.1.8] - 2026-06-28

### Added

- **Doubao Seedance 2.0** official API plugin (`tongflow-api-bytedance`):
  Volcengine Ark video generation covering text → video, image → video,
  first/last-frame video, and image + audio → video.
- **Images → Video** node — free multi-image reference fusion: connect several
  reference images plus a prompt to generate a new video (Seedance multimodal
  reference). Backed by a new `images-gen-video` ABI slot, reachable from the
  smart-island compose menu when 2–9 image nodes (optionally plus one text
  node) are selected.
- **Video editing** node (`video-edit` ABI slot) and the **Bernini-R** unified
  renderer plugin (`tongflow-modal-bernini`).

### Fixed

- Image Fusion: a prompt fed from an upstream text node is now actually used at
  execution. Previously the node displayed the upstream text but refused to run
  with "required input text is empty"; the text handle is now wired into the
  ABI prompt (upstream edge wins, the manual textarea is the fallback).

## [0.1.7] - 2026-06-27

### Changed

- Canvas edges are no longer created by dragging from a handle. Handles set
  `isConnectableStart={false}`, so connections are created only via the
  operation panel (expands/compose). Users can still **reconnect** an existing
  edge's endpoint to another node.

### Added

- Reconnecting an edge endpoint is validated against the ABI contract: the
  upstream modality must match the target handle, single-value (non-array)
  input handles accept only one edge, `add` nodes fan out to a single edge,
  and modality nodes can't feed each other.
- Dropping a dragged edge endpoint on empty canvas prompts to delete the
  connection. The reconnect preview line matches the edge style so it stays
  visible and tracks the cursor.

### Fixed

- Aspect-ratio picker labels no longer overflow their button in English; long
  labels wrap onto multiple lines instead of clipping past the border.

## [0.1.6] - 2026-06-26

### Added

- Image generation nodes gain a **resolution tier** picker (1K / 2K / 4K)
  alongside the aspect-ratio picker. The chosen width/height is the aspect
  ratio's base (1K) dimensions scaled by the tier, persisted directly to the
  existing `width`/`height` ABI fields (no new contract field).

### Fixed

- Desktop release pipeline no longer fails to publish under GitHub's immutable
  releases. Per-arch installers are uploaded to a draft release and the draft
  is published once after all assets are attached, instead of publishing
  immediately and 422-ing on subsequent asset uploads. (Supersedes 0.1.5,
  which never shipped a usable release.)

## [0.1.4] - 2026-06-25

### Fixed

- Plugins no longer crash on a non-UTF-8 system locale (notably Windows
  Simplified-Chinese, whose ANSI code page is GBK / cp936). A spawned Python's
  stdout/stderr defaulted to the system locale, so a plugin printing a
  non-ASCII character — such as the `✓` emitted while downloading model
  weights — raised `UnicodeEncodeError: 'gbk' codec can't encode character`
  and surfaced as "downloading weights failed (exit 1)". Every Python spawn
  site now forces UTF-8 mode (`PYTHONUTF8=1`).

## [0.1.3] - 2026-06-22

### Added

- Official plugin **Unlimited-OCR** (`tongflow-modal-unlimited-ocr`) — Baidu's
  Unlimited-OCR for long-horizon document / PDF → text on the `parse-document`
  slot, a GPU alternative to Docling and PaddleOCR.

## [0.1.2] - 2026-06-20

### Added

- Official plugins **TripoSplat** (single image → 3D Gaussian Splatting) and
  **SCAIL-2** (controlled character animation) are now in the plugin registry.
- The 3D model node renders Gaussian-splat assets (`.splat`, `.ply`, `.spz`,
  `.ksplat`, `.sog`) in-app via SparkJS, with a free-tumble trackball camera and
  on-demand rendering for smooth performance on large splats.

### Fixed

- Plugin `model` (3D) outputs are now persisted to file references and rendered
  on the canvas; previously such outputs were dropped and the node showed
  nothing.

## [0.1.1] - 2026-06-16

### Fixed

- Installed plugins now appear in node pickers without reloading the app, and
  the plugin manager recovers from a directory left behind by an interrupted or
  failed clone instead of treating it as already installed.
- Packaged desktop app: rebuild `better-sqlite3`'s native binary for the bundled
  Node runtime during packaging, fixing `ERR_DLOPEN_FAILED` errors (e.g. "Failed
  to save workflow") when the build machine's Node differs from the bundled one.
- Exclude `.env` files from the packaged app bundle; the desktop app reads all
  configuration from the in-app settings store.

### Changed

- Bundled Node runtime and CI upgraded to Node 24.

## [0.1.0] - 2026-06-16

First public open-source release of TongFlow.

[Unreleased]: https://github.com/tong-io/tongflow/compare/v0.1.12...HEAD
[0.1.12]: https://github.com/tong-io/tongflow/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/tong-io/tongflow/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/tong-io/tongflow/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/tong-io/tongflow/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/tong-io/tongflow/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/tong-io/tongflow/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/tong-io/tongflow/compare/v0.1.5...v0.1.6
[0.1.4]: https://github.com/tong-io/tongflow/compare/v0.1.3...v0.1.5
[0.1.3]: https://github.com/tong-io/tongflow/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/tong-io/tongflow/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/tong-io/tongflow/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tong-io/tongflow/releases/tag/v0.1.0
