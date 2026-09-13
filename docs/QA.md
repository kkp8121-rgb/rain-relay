# RAIN RELAY — release verification

Verified 2026-09-13 on Windows. All browser runs were headless. No visible browser or emulator was opened.

## Engine and geometry

`npm test`: **17 passed, 0 failed** (10 routing/editing tests and 7 geometry tests).

The engine checks fixed cells, part budgets, replacement refunds, undo, port direction, non-cloning alternating valves, simultaneous different-color bridge traffic, additive flower light, rejected colors, bounded loops, immediate third-leak failure, hint behavior and retry preservation. Every authored solution completes through engine ticks.

Geometry checks measure real pipe mouth endpoints, source orientation, fixed flower mouths, tile surface/rims, a continuous elevated north/south bridge and its separate east/west route, and supported model bounds. The deliberately shallow rock embedding is bounded separately.

## Actual campaign

`npm run test:campaign` placed **63 pieces** using real keyboard navigation, tool selection, rotation and Space. It did not mutate live play state or force a win.

| Garden | Cost | Flow time (s) | Delivered | Leaks | Grade |
|---|---:|---:|---:|---:|---|
| First dew | 5 | 2.8833 | 2 | 0 | S |
| Red memory | 8 | 4.1667 | 2 | 0 | S |
| Sunlight recipe | 9 | 5.4500 | 3 | 0 | S |
| Two canals | 11 | 4.8167 | 4 | 0 | S |
| Crossing rain | 19 | 8.0167 | 6 | 0 | S |
| Rain without clouds | 17 | 8.3333 | 6 | 0 | S |

All six result screens led to the ending. All six records survived reload unchanged. Times above measure automated **water trials**, excluding player planning; they are not estimates of human completion time.

Campaign bundle SHA-256: `3d6abfd673d4544061e9b6f677e5fa2e33e0a6582a965a6dd837883ec01e635f`. The packaged bundle has the same hash. Later portrait CSS cleanup was covered by the final interaction run.

## Browser, audio and touch

Direct `file:///C:/Projects/rain-relay/index.html` and HTTP `/rain-relay/` both passed keyboard placement, undo, copied-observer isolation, pause/guide/resume, actual audio output, mute, natural third-leak failure, Enter retry and hint checks. Both original WebP assets decoded at 1536×1024 and 1254×1254. No page errors, console errors, failed asset requests or external runtime requests occurred.

Final audio peaks were 0.009916 for direct-file loading and 0.005282 for HTTP. Both muted measurements were zero. Campaign peak was 0.022442.

`npm run test:interaction`: **9 passed**. Actual CDP touch ran at 390×844 and 844×390, covering selection, placement, rotation, removal, undo, hints, pointer cancellation and blocked fixed cells. Visible active controls met 44×44 CSS pixels, stayed in the viewport and were hit-testable at their centers. The last garden's three simultaneous quota rows were also checked for text overlap and clipping.

Other cases checked over-budget edits, blur pause, guide navigation, stopping with the network preserved, corrupt storage rejection, zero-volume and mute restoration, blocked localStorage, absent AudioContext, and the visible fallback with disabled start when WebGL is unavailable. Only the expected renderer-creation diagnostic is accepted in that deliberate WebGL failure case.

Screenshots of the title, editing, full networks, flow, results, ending and mobile layouts were inspected. Local reports and captures are in ignored `artifacts/`.

## Dedicated performance sample

Last garden, complete network, 300 or more observed play frames per sample:

| Renderer | CPU throttle | Render pixels | Average (ms) | p95 (ms) |
|---|---:|---:|---:|---:|
| SwiftShader Vulkan | 1× | 399,288 | 18.0914 | 33.3 |
| SwiftShader Vulkan | 4× | 399,288 | 18.4750 | 33.4 |
| NVIDIA RTX 3060 Ti, D3D11 | 1× | 595,200 | 16.6660 | 16.8 |

Renderer identities came from Chromium's GPU information, not from launch flags alone. Hardware rendered 331 calls / 25,772 triangles including shadows; software rendered 194 calls / 16,994 triangles. Timing samples describe this machine and are not universal performance guarantees.

## Package and repository

`npm run pack` and `npm run test:package` passed. The ZIP is **745,183 bytes**, contains **8 relative entries**, and each decompressed entry matches the built local file by SHA-256. `game.js` is **624,333 bytes**. Entry names and cases are checked explicitly, including root `index.html`, `.nojekyll`, both WebP files, favicon and Three.js license.

Credential-pattern scans produced no matching authored files. All 15 original game repositories were freshly checked clean. They were not modified.

Public push and actual Pages verification require the separate user approval for this release. The completed local and subdirectory checks do not claim a live Pages deployment before that approval.
