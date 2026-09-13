# RAIN RELAY — production decisions

## Candidate comparison

| Candidate | Genre / camera | Input and central rule | Goal and progression |
|---|---|---|---|
| Seasonal ecology | Ecological simulation, landscape cross-section | Keyboard weather controls; persistent soil and plant succession | Recover a watershed across seasons; difficult feedback calibration within a small release |
| Orbital survey | Navigation, cockpit and orbital map | Thruster keys; finite delta-v and gravitational transfers | Visit survey targets; too close to the preceding physical space game |
| RAIN RELAY | Automation puzzle, fixed isometric diorama | Keyboard grid construction; droplets accumulate flower light and alternate at valves | Restore six authored gardens under part and water budgets, progressing from routing to nested branches |

RAIN RELAY was chosen for a clear new play structure: construct, observe, diagnose, revise. Its theme is a rule rather than decoration. A droplet retains every flower's light, exact mixtures determine acceptance, branches conserve water, and bridges preserve independent crossing streams.

The player's fantasy is tending a miniature greenhouse instrument with Nara and three adult garden keepers. There is no combat or reaction deadline while editing. Planning, rotation, rebuilding and checking the network form the main play.

## Scope

Six 7×7 gardens introduce straight connections, direction-changing pipes, additive light, alternating splitters, elevated crossings, and nested splits. Successful authored solutions use 63 placed pieces costing 69 total parts across all six boards. Their receiver quotas total 23 droplets. The budget belongs to each garden, not to a shared campaign resource.

Three leaks stop a trial immediately. A finite source and a 100-tick cap also bound unsuccessful trials. Stopping or failing preserves the network; editing supports exact undo and refunds. Records store the best grade, part cost, leaks and flow time. Settings and records are validated before restoring.

## Iteration from observed play

- Moved save initialization after its helpers to make reload restoration work.
- Routed failure retry back through the engine's edit transition, preserving the built network.
- Made the editor's stop button visible during trials and synchronized desktop and touch button states.
- Reworked portrait level selection and landscape controls so the board and active buttons remain accessible.
- Removed foreground greenhouse beams that crossed playable cells.
- Replaced duplicated tile meshes with six instanced batches. The first garden now draws 54 calls in the browser check; the previous version drew 350.
- Built continuous bent and raised water channels and shared their route geometry with droplet animation.
- Replaced opaque pipe end caps with open sleeves, corrected collector arrows and splitter indicators, and added visible receiver quotas.
- Kept feedback focused on construction, tinting, receiving and leaks, rather than every ordinary flow step.
- Showed the failed cell and moved the editing cursor there after a leak.
- Avoided rebuilding the DOM when the displayed play state has not changed.

## Delivery boundaries

Standalone project, independent of PROMPTRON and the original 15 cartridges. No CDN, remote font, runtime package fetch, remote audio, or credential belongs to the web bundle. ImageGen sources are documented separately. Local direct-file loading and an HTTP subdirectory are checked before asking for a per-push publication approval. A Pages deployment is verified against the actual committed bytes after approval.
