# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## What this is

Electron desktop app: 涡轮增压器测试台进气空调 (AHU) 设计计算器 — a precision intake Air Handling Unit design calculator for turbocharger test benches. Vanilla JavaScript (no framework, no bundler, no transpilation). Psychrometric calculations follow GB/T 35226-2017 (Magnus formula).

## Commands

```bash
npm install          # install deps (electron, electron-builder, xlsx)
npm start            # dev run = electron .
npm run build        # package = npx electron-builder --win portable
```

`build.bat` is the Windows packaging wrapper: ensures Node, `npm install`, sets `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`, then `npx electron-builder --win portable`.

**No tests, no lint, no formatting config.** There is no `test` script, no `*.test.js`, no `.eslintrc`/`.prettierrc`. Do not invent test/lint commands.

## Architecture

### Process model

`main.js` is the Electron main process. It creates one `BrowserWindow` (1200×800) loading `index.html`, with **`nodeIntegration: true` and `contextIsolation: false`** — the renderer uses `require('electron')` directly, no preload. IPC handlers (`ipcMain.on`) for `save-excel-file`, `save-svg-file`, `save-pdf-file` show native save dialogs and write to disk; PDF export renders SVG into a hidden `BrowserWindow` and calls `printToPDF`.

### Renderer: 5 global scripts, load order is load-bearing

`index.html` loads scripts in this exact order (index.html:326-330):

```
calculations.js → tutorial.js → renderer.js → extreme.js → component_design.js
```

**No ES modules.** Every file declares globals on `window`; later scripts depend on globals from earlier ones. Reordering or wrapping in modules will break cross-module calls.

### Module ownership

| File | Size | Owns |
|------|------|------|
| `calculations.js` | ~2KB | Pure psychrometrics lib: `satPressure` (Magnus), `humidityRatio`, `enthalpy`, `calcHumidityRatio`, `satVaporPressure` (Sonntag, for chart), `fmt` (number formatter used app-wide). |
| `renderer.js` | ~284KB, ~4400 lines | **The monolith.** Tab switching, presets, real-time calc (300ms debounce), air-state summary, physics explanations, detailed process steps, structural design, main `calculate()`, equipment selection, Canvas psychrometric chart, Excel/SVG/PDF export (Electron + browser fallbacks), inline QA/knowledge search. Also defines `calcDewPoint`, `calcTemperatureFromW`, `calcSensibleRatio` — consumed by other modules. Organized into ten Chinese-numbered sections (一…十). |
| `tutorial.js` | ~49KB | Self-contained teaching system: `beginnerSteps`/`advancedSteps`/`practiceSteps` arrays, `knowledgeData`, render/nav functions. Owns 设计指南 + 知识库 tabs. Globals: `currentModule`, `currentStepIndex`. |
| `extreme.js` | ~42KB | Extreme-condition component sizing: `analyzeCoil/Heater/Humidifier/Fan/WaterSystem/Structure/WaterValves/ControlSystem/AirDistribution/Installation`, hand-drawn Canvas charts (`drawChart`/`drawBarChart` with DPR scaling), `runExtremeAnalysis` orchestrator. Owns the 极值分析 tab. |
| `component_design.js` | ~17KB | Detailed part design (coil/heater/humidifier): `importFromCalc`, `switchDesignTab`, `buildDesignReport`. Owns the 零部件设计 tab. |

### Non-obvious patterns

- **Inline `onclick="..."` handlers** throughout `index.html` (e.g. `switchTab('calc')`, `setPreset('summer')`, `calculate()`); `setPreset` relies on the implicit global `event.target`. Do not assume addEventListener is the only event binding.
- **Naming inconsistency**: `extreme.js` calls `humidityRatio(satPressure(T), RH, P)` (two-step), while `component_design.js` calls `calcHumidityRatio(T, RH, P)` (one-step). Both exist in `calculations.js` and return the same result — keep both signatures.
- **Cross-module coupling**: `extreme.js` and `component_design.js` call `calcDewPoint`, `calcTemperatureFromW`, and `fmt` from `renderer.js`. These must remain global and cannot be renamed without updating callers.
- **Hand-rolled Canvas charts** — no charting library. DPR-scaling boilerplate is duplicated between `renderer.js` and `extreme.js`.
- **GB standards cited pervasively** in comments and UI: GB/T 35226-2017 (psychrometrics), GB 50736-2012 (HVAC design), GB/T 14294-2026 (AHU units), GB/T 23341.1-2018 (turbochargers), GB/T 18300-2025 (water), GB/T 29736-2013 (humidifiers), GB/T 14689-2008 (drawing sheet sizes), plus material specs (GB/T 1527, 3880, 2518, 8163) and JB/T 2379. Preserve standard references when editing calculation or equipment-selection code.

## Build config — known mismatches (verify before packaging)

Three sources disagree; resolve intentionally before relying on a build:

1. **Target**: `package.json` `build.win.target` = `dir`, but `npm run build` and `build.bat` pass `--win portable` (CLI flag wins → produces portable exe).
2. **Output dir**: `package.json` `build.directories.output` = `release`, but `builder-effective-config.yaml` (last effective build) shows `dist`. The CLI target produces a `release/` dir; older builds went to `dist/`.
3. **Files list**: `builder-effective-config.yaml` **omits `extreme.js` and `component_design.js`** (the current `package.json` `files` array does include them). The last packaged exe would have broken 极值分析 + 零部件设计 tabs. If you package, confirm `extreme.js` and `component_design.js` are in the effective `files` list.

`release.rar` (75MB) and `release/` are stale build artifacts (gitignored).

## Non-source files at root — do NOT edit

These are Electron runtime binaries or build artifacts (gitignored), not project source:

`chrome_100_percent.pak`, `chrome_200_percent.pak`, `d3dcompiler_47.dll`, `ffmpeg.dll`, `libEGL.dll`, `libGLESv2.dll`, `vk_swiftshader.dll`, `vulkan-1.dll`, `icudtl.dat`, `resources.pak`, `snapshot_blob.bin`, `v8_context_snapshot.bin`, `vk_swiftshader_icd.json`, `LICENSE.electron.txt`, `LICENSES.chromium.html`, `locales/`, `resources/`, `node_modules/`, `.builder-cache/`, `release/`, `release.rar`, `debug.log`, `package-lock.json`, `builder-effective-config.yaml`, `启动进气空调设计计算器.bat` (launcher).

Editable source files: `main.js`, `index.html`, `renderer.js`, `calculations.js`, `tutorial.js`, `extreme.js`, `component_design.js`, `styles.css`, `package.json`, `build.bat`, `.gitignore`, `README.md`, `产品需求文档_涡轮增压器测试台进气调节空调.md` (product requirements doc).

## Reference

- `README.md` — feature overview, tech stack, quick start, project structure, cited standards.
- `产品需求文档_涡轮增压器测试台进气调节空调.md` — product requirements / scope.
- `软件详细设计文档.md` — software architecture, module design, data flow, UI layout.
- `测试文档_测试用例_测试报告.md` — test cases (60 items), test process, test report.
- `CHANGELOG.md` — version history and changelog.
- `REVIEW_工程化审查报告.md` — engineering review report.
