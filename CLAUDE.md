# CLAUDE.md

This repository is **PXL-tracks**, the PixelMasters fork of Bitfocus Companion that runs the PXL Timeline Sequencer module. **Read `PXL-TRACKS.md` first**: repositories, branches, architecture, dev setup, testing and upgrade procedure.

The user writes in French: answer in French.

## Rules

- **Never break the timeline fast path.** The module drives other connections through an IPC batch (`pxl-call`) handled by `companion/lib/Service/Timeline/IpcBridge.ts`, hooked in `ChildHandlerLegacy.ts`. Playback has no fallback. After any change near `Instance/Connection`, `Controls/ControlsTrpcRouter.ts` or entity options, run `yarn vitest run --project companion test/Service/Timeline`.
- **Upstream merges can drop PXL patches silently** (it happened with Companion 4.3). Follow "Upgrading to a new Companion release" in `PXL-TRACKS.md` and check the hook, the option format and the tRPC routes the module uses, not only the conflicts.
- **Never stop a Companion already running on port 8000**, it can be a live show. Test with a second instance (`--admin-port 8100 --config-dir <tmp>`) and set the module `Companion Port` to that port from the first start.
- **Commit hook**: the lint-staged pre-commit hook runs ESLint on staged files and `tsc --build`. Do not commit a big upstream merge with it (it froze a PC): ask the user before using `--no-verify`, and only for the merge commit. On Windows, working trees in CRLF make the hook fail, see `PXL-TRACKS.md`.
- **Private submodule**: `module-local-dev/PXL-timeline-sequencer` is `PXL-tracks/timeline-sequencer` (private). Its changes are committed and pushed in that repository first, then the submodule pointer here. Merge its PRs without squash.
- **Public repository**: this fork is public. Do not commit personal data, machine paths, credentials or show details.
- Keep the PXL changes small and isolated (e.g. logic in `Service/Timeline/`, one-line hooks in upstream files) so upstream merges stay easy.

## Commands

```bash
# Node.js: exact version from .node-version (26.9.0 on tracks-v5), Yarn from corepack
yarn install
yarn check-types                                             # also builds companion/dist
yarn vitest run --project companion test/Service/Timeline    # PXL tests
yarn workspace @companion-app/webui build                    # needed once before starting
node companion/dist/main.js --extra-module-path=module-local-dev --admin-address 127.0.0.1
```
