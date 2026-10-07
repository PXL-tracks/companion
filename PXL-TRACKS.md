# PXL-tracks

PXL-tracks is the PixelMasters fork of [Bitfocus Companion](https://github.com/bitfocus/companion). It runs the **PXL Timeline Sequencer**, a Companion module that plays keyframe timelines and drives other Companion connections (OBS, video mixers, custom variables...) at frame rate (25 fps and more).

This file is the entry point to work on the project from any machine or VM: everything needed is in the GitHub repositories listed below. It was written during the migration to Companion v5 (October 2026).

## Repositories

| Repository                                                                        | Visibility                         | Role                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PXL-tracks/companion](https://github.com/PXL-tracks/companion)                   | public, fork of bitfocus/companion | Companion + the PXL patches (this repository)                                                                                                                                                                                      |
| [PXL-tracks/timeline-sequencer](https://github.com/PXL-tracks/timeline-sequencer) | private                            | The Companion module, git submodule at `module-local-dev/PXL-timeline-sequencer`                                                                                                                                                   |
| [PXL-tracks/pxl-launcher](https://github.com/PXL-tracks/pxl-launcher)             | private                            | `pxl-start.bat` / `pxl-start.ps1` / `pxl-start.sh`: clone, build and start PXL-tracks                                                                                                                                              |
| `DeeJayMX/PXL-PlayXus`, `DeeJayMX/PXL-Player-V2`                                  | private (personal account)         | WebCodecs / WebGPU video player. It started inside the sequencer (v0.603) and became its own project. Leftovers of that first attempt are archived on the `archive/webcodecs-moc` branch of timeline-sequencer, they are not used. |
| `DeeJayMX/PXL-Tape`                                                               | private (personal account)         | Browser playback engine (WebCodecs, WebGPU, native forward/reverse). **Media playback of PXL-tracks moves there**, driven by the sequencer (see Status).                                                                           |

### Branches

| Repository         | Branch               | Content                                                                                   |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------- |
| companion          | `pxl-stable`         | Production, Companion 4.2 + PXL patches, Node.js 22.21.1                                  |
| companion          | `tracks-v5`          | Migration to Companion 5.0.7, Node.js 26.9.0 (PR #1 → `pxl-stable`)                       |
| companion          | `pxl-stable-update`  | Abandoned merge of upstream 4.3 (March 2026), superseded by `tracks-v5`, do not use       |
| companion          | `main`               | Old mirror of upstream `main` (January 2026), not maintained                              |
| timeline-sequencer | `main`               | v0.602                                                                                    |
| timeline-sequencer | `tracks-v5`          | v0.602 + Companion v5 fixes (PR #1 → `main`)                                              |
| pxl-launcher       | `main` / `tracks-v5` | `tracks-v5` = launchers with per-version Node.js (PR #1 → `main`), works with 4.2 and 5.x |

## How it works

The module runs in its own Node.js process, like every Companion module. It talks to Companion over two channels:

```
Timeline Sequencer module (module-base 1.13, node18 runtime)
  │
  ├─ IPC fast path, used by playback, one batch per tick
  │    process.send({ _type: 'pxl-call', _id: 'tl_<n>', actions: [{ connectionId, actionId, options }] })
  │      → ChildHandlerLegacy (one-line hook)
  │      → companion/lib/Service/Timeline/IpcBridge.ts
  │      → global.pxlCore.executeActions (Service/Timeline/Executor.ts)
  │      → processManager.getConnectionChild(id).actionRun(...)   (all actions in parallel)
  │      ← process message { _replyTo: 'tl_<n>', success, result }
  │
  └─ tRPC over WebSocket ws://127.0.0.1:<Companion Port>/trpc
       controls.pxlFire   run actions (single actions, fallback)
       controls.pxlSniff  read the current value of a connection through a feedback "learn"
       controls.pxlPeek   action metadata (options, min/max, choices...)
       + stock routes: instances.connections.watch, instances.statuses.watch,
         instances.definitions.actions, customVariables.create/delete/setCurrent, appInfo.version
```

- **Playback has no tRPC fallback**: if the IPC hook is missing, every batch times out after 5 s and nothing reaches the target connections. tRPC is about twice as slow (measured on v5.0.7: 0.64 ms per 4-action batch over IPC, 1.20 ms with `pxlFire`).
- **Option format**: since Companion 4.3, entity options are `{ value, isExpression }` objects. The module sends raw values, so the Executor, `pxlFire` and `pxlSniff` wrap them with `optionsObjectToExpressionOptions(options, false)`, and `pxlSniff` unwraps the learned values with `convertExpressionOptionsWithoutParsing` so the module still receives raw values.
- **Companion Port**: the module connects tRPC to `127.0.0.1` on its `Companion Port` config field (default 8000). With several Companions on one machine, set it to the port of the Companion running the module, otherwise it talks to the other one.
- **Telemetry** to Bitfocus is disabled (`companion/lib/Data/UsageStatistics.ts`, `#cycle` returns early).

## PXL changes in this fork

Everything else is upstream Companion.

| Path                                                                          | Change                                                                                    |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `companion/lib/Service/Timeline/Controller.ts`, `Executor.ts`, `IpcBridge.ts` | Fast path: executor registered as `global.pxlCore`, IPC message handling                  |
| `companion/lib/Instance/Connection/ChildHandlerLegacy.ts`                     | One-line hook calling `handlePxlIpcMessage` in the module message handler                 |
| `companion/lib/Controls/ControlsTrpcRouter.ts`                                | `pxlFire`, `pxlSniff`, `pxlPeek` procedures, extra `processManager` parameter             |
| `companion/lib/Controls/Controller.ts`                                        | Passes `processManager` to the router                                                     |
| `companion/lib/Service/Controller.ts`                                         | Creates `ServiceTimeline`                                                                 |
| `companion/lib/Data/UsageStatistics.ts`                                       | Telemetry disabled                                                                        |
| `companion/test/Service/Timeline/IpcBridge.test.ts`                           | Tests of the executor, the IPC bridge and the ChildHandlerLegacy hook                     |
| `.gitmodules`, `module-local-dev/PXL-timeline-sequencer`                      | The module as a private submodule                                                         |
| `setup-dev.ps1`, `config-template/`                                           | Windows dev setup: node runtimes, module data template, Companion config template         |
| `.github/workflows/*`                                                         | `submodules: false`: CI cannot clone the private submodule and the build does not need it |
| `_typos.toml`                                                                 | `;ba\b` ignore, same line as upstream `main`                                              |
| `.gitignore`                                                                  | `/companion-data/` ignored, `config-template/` kept                                       |

## Development setup

You need git and access to the private repositories (`gh auth login`, or a token/SSH key with access to PXL-tracks).

### With the launcher (recommended)

See the [pxl-launcher README](https://github.com/PXL-tracks/pxl-launcher). It downloads the right Node.js, builds when the commit changes and starts Companion. On Windows put `pxl-start.*` in a folder, the repository is cloned next to it in `companion/`.

### By hand (Linux / macOS / VM)

```bash
git clone --recurse-submodules https://github.com/PXL-tracks/companion.git
cd companion
git checkout tracks-v5            # or pxl-stable for Companion 4.2
git submodule update --init

# Node.js: use exactly the version in .node-version (26.9.0 for v5).
# Node 25+ does not ship corepack anymore:
npm install -g corepack && corepack enable
yarn install                      # Yarn version comes from package.json (packageManager)

yarn build:ts                     # v5. For 4.2 see the launcher (shared build + tsc + webpack)
yarn workspace @companion-app/webui build

(cd module-local-dev/PXL-timeline-sequencer && npm install)
```

Module runtimes: Companion starts modules with the Node.js versions of `assets/nodejs-versions.json` (`node18` for the sequencer), from `.cache/node-runtime/<platform>-<arch>-<version>/`. `setup-dev.ps1` (Windows) and `pxl-start.sh` (macOS/Linux) download them.

Start:

```bash
node companion/dist/main.js --extra-module-path=module-local-dev --admin-address 0.0.0.0
```

- Admin UI on port 8000 (`--admin-port` to change it), the sequencer UI on port 8002 (module config `HTTP Port`).
- Companion config: `env-paths('companion')` config folder, e.g. `%APPDATA%\companion-nodejs\Config\v5.0` on Windows, one folder per Companion release. On first start a new release copies the config of the previous one (v4.2 → v5.0), the old folder is left untouched. `setup-dev.ps1` only copies `config-template/db.sqlite` when no config exists at all.
- Module data (timelines, presets, assets): `companion-data/module-data/pxl-timeline/` at the repository root (ignored by git). `config-template/module-data/` is the template.

### Checks

```bash
yarn check-types
yarn vitest run --project companion test/Service/Timeline   # PXL tests, must pass
yarn vitest run --project companion --project shared-lib    # full suite
```

On Windows without developer mode, 5 or 6 upstream tests fail with `EPERM ... symlink` (symlink / UNC path tests), unrelated to PXL.

## Testing in a real Companion without touching another one

A machine may already run a Companion on port 8000 (for example a live show). Never stop it, start a second instance instead:

```bash
node companion/dist/main.js --admin-port 8100 --admin-address 127.0.0.1 \
  --config-dir /tmp/pxl-test-config --extra-module-path=module-local-dev --log-level debug
```

The sequencer connection must use `Companion Port` = 8100 **from its first start**: Companion applies the default config (8000) on the first init of a new connection, so the module would first talk to the Companion on 8000. Either check that nothing listens on 8000, or pre-create the connection in the test config (`instances` table of `db.sqlite`, JSON value with `"isFirstInit": false` and `"config": { "companionPort": 8100, "httpPort": 8102 }`).

Useful checks with `--log-level debug`:

- module logs `✅ IPC initialisé` and `✅ tRPC WebSocket connecté`
- `TRPC/Call ... "customVariables.setCurrent/mutation" 200` during playback of a preset with custom variable tracks
- no `Batch failed` / `Batch execution timeout`

### IPC probe module

To test the fast path alone (for example after an upstream merge), a minimal module-base 1.13 module that sends batches to itself:

`<dev-modules>/pxl-probe/companion/manifest.json`

```json
{
	"id": "pxl-probe",
	"name": "pxl-probe",
	"shortname": "pxl-probe",
	"description": "PXL-tracks IPC fast path probe",
	"version": "1.0.0",
	"license": "MIT",
	"repository": "git+https://github.com/PXL-tracks/companion.git",
	"bugs": "https://github.com/PXL-tracks/companion/issues",
	"maintainers": [{ "name": "PXL-tracks" }],
	"manufacturer": "PixelMasters",
	"products": ["Probe"],
	"keywords": ["test"],
	"legacyIds": [],
	"runtime": { "type": "node18", "api": "nodejs-ipc", "apiVersion": "1.13.4", "entrypoint": "../main.js" }
}
```

`<dev-modules>/pxl-probe/main.js` (`npm install @companion-module/base@1.13.1` in that folder)

```js
const { InstanceBase, InstanceStatus, runEntrypoint } = require('@companion-module/base')

class PxlProbe extends InstanceBase {
	async init() {
		this.updateStatus(InstanceStatus.Ok)
		this.setActionDefinitions({
			probe: {
				name: 'Probe',
				options: [{ type: 'number', id: 'volume', label: 'Volume', default: 0, min: 0, max: 100 }],
				callback: (action) => this.log('info', `PROBE_ACTION ${JSON.stringify(action.options)}`),
			},
		})
		process.on('message', (msg) => {
			if (msg && msg._replyTo === 'tl_probe_1') this.log('info', `PROBE_REPLY ${JSON.stringify(msg)}`)
		})
		setTimeout(() => {
			process.send({
				_type: 'pxl-call',
				_id: 'tl_probe_1',
				actions: [{ connectionId: this.id, actionId: 'probe', options: { volume: 42 } }],
			})
		}, 3000)
	}
	async destroy() {}
	async configUpdated() {}
	getConfigFields() {
		return []
	}
}

runEntrypoint(PxlProbe, [])
```

Start the test instance with `--extra-module-path=<dev-modules>`, add a `pxl-probe` connection, and expect `PROBE_ACTION {"volume":42}` then `PROBE_REPLY {... "success":true ...}` in the log. `PROBE_ACTION {}` means the option format is broken, no reply means the IPC hook is missing.

## Upgrading to a new Companion release

1. Fetch the release tag and branch from the current PXL branch:
   ```bash
   git fetch --no-tags https://github.com/bitfocus/companion.git refs/tags/vX.Y.Z:refs/tags/vX.Y.Z
   git switch -c tracks-vX pxl-stable
   git merge --no-ff vX.Y.Z
   ```
2. Conflicts are usually small (imports of `ControlsTrpcRouter.ts`, members of `Service/Controller.ts`, `.gitignore`).
3. **Check what git does not flag.** The 4.3 merge dropped the IPC hook without any conflict: upstream had split `ChildHandler.ts` into `ChildHandlerLegacy.ts` / `ChildHandlerNew.ts`. After every merge check:
   - `yarn vitest run --project companion test/Service/Timeline` (fails if the hook is gone)
   - `RunActionExtras`, `actionRun`, `entityLearnValues` signatures, `ActionEntityModel` / option format
   - the tRPC routes and input schemas the module uses (list above)
   - supported module-base versions (`shared-lib/lib/ModuleApiVersionCheck.ts`), node runtimes (`assets/nodejs-versions.json`), `.node-version`
   - modules still spawned with an `'ipc'` stdio channel (`companion/lib/Instance/ProcessManager.ts`)
   - then the real instance test and the probe above
4. Commit the merge commit with `--no-verify`: the lint-staged pre-commit hook runs ESLint on every staged file plus `tsc --build`, on a ~1500 file merge this froze a Windows PC. Commit the PXL fixes separately, with the hook.
5. Windows: with `core.autocrlf=true` the working tree is CRLF, prettier wants LF and lint-staged rewrites files to CRLF when it restores them, so the hook always fails. Use a worktree with `git config extensions.worktreeConfig true` and `git config --worktree core.autocrlf false`, and convert touched files to LF before staging (check `git diff` only shows the real lines).
6. CI: the `lint` job has a 5 minute timeout and sometimes hits it on slow runners, re-run it.

### Module-base 2.x

The sequencer uses `@companion-module/base` 1.13 (handled by `ChildHandlerLegacy`, `'ipc'` channel). Companion 5 still supports it. A module on module-base 2.x is handled by `ChildHandlerNew`, which from 5.1 uses a separate data channel socket: `process.send` still exists in the module (the `'ipc'` stdio channel stays open) but nothing listens to it, so the hook would have to be added to `ChildHandlerNew` too. module-base 2.x also removes `parseVariablesInString` (used by the module) and changes learn callbacks.

## Status and next steps (October 2026)

- `tracks-v5`: Companion 5.0.7 + PXL fast path restored, all CI checks green including `Build binaries` on every platform. Tested in a real Companion 5.0.7 with the probe and with the real module (playback, custom variables).
- Open PRs, merge in this order: [timeline-sequencer#1](https://github.com/PXL-tracks/timeline-sequencer/pull/1) **without squash** (the submodule pointer of `tracks-v5` points to its commits), [pxl-launcher#1](https://github.com/PXL-tracks/pxl-launcher/pull/1), [companion#1](https://github.com/PXL-tracks/companion/pull/1).
- Then switch a machine to v5: `git checkout tracks-v5` (or `pxl-stable` once merged) in the launcher's `companion/` folder, `git submodule update --init`, run the launcher. It downloads Node.js 26.9.0, rebuilds and Companion imports the 4.2 config.
- Not tested yet: `pxl-start.sh` on a real macOS / Linux machine.
- **Media playback moves to PXL-Tape** (decided October 2026): video/audio playback leaves the sequencer, PXL-Tape will play the media and the sequencer will drive it like any other Companion connection once PXL-Tape has a remote control API (still a draft spec there). The sequencer media code (Assets Manager, IndexedDB video cache, preview player) is still in the module; keeping the Assets Manager as media library or porting it to PXL-Tape (which has its own upload, media registry and clip metadata) is **not decided yet**. Details in the module README, section "Direction".
- Later: module runtime `node18` is end of life, module-base 2.x migration (see above).
- Known module issues (not related to v5): the test preset `timeline-environment.json` of the module has groups without `type` (the engine skips them, needs `"type": "classic"`); on a fresh install `pixelmasters.pxlenv` has no `presets` and loading logs `Cannot read properties of undefined (reading 'sort')`; `Companion version: [object Object]` in the module log.
