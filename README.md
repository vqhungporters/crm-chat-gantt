# Gantt workspace

React + Vite + Tailwind app for a four-layer WBS: **Phase → Deliverable → Epic → Task**. The supplied WBS contains 4 phases, 17 deliverables, 29 epics and 89 tasks. The 18 previously completed tasks retain their sprint allocations. Newly defined Phase 3 tasks start unscheduled.

Run `npm install` and `npm run dev`, then open http://localhost:5173. Build with `npm run build`; serve with `npm run preview`.

## Working on the chart

- Add phases with names and dates, deliverables under phases, epics under deliverables, and tasks under epics. Parent selectors follow the hierarchy; + buttons prefill ancestors.
- Click a name or bar to edit. Collapse phases, deliverables or epics individually or all together. Search/status filtering retains matching items' ancestors.
- Phase dates generate the global Monday–Friday sprint calendar. Each child's sprint range must fit its immediate parent. Blank sprint fields mean Unscheduled.
- Drag a deliverable onto a phase, an epic onto a deliverable, or a task onto an epic. Descendants follow. Schedules shift to fit while preserving durations and relative offsets. Moves into unscheduled/shorter destinations are rejected when they cannot fit.
- Move bars to shift their sprint allocation or drag edges to resize. Moving parents moves every scheduled descendant. Resizing cannot exclude descendants.
- Task statuses: Planned, In progress, Done, Canceled. All three parent levels calculate progress from descendant tasks. Canceled tasks are excluded. All active tasks must be Done; empty parents stay Planned; parents with only canceled tasks are Canceled.
- Undo/redo covers hierarchy, scheduling, editing, deletion, status changes and imports.

## Import and export

Download the four-layer XLSX template from Import WBS. XLSX, CSV and JSON are supported, with a 10 MB limit. Import validates/previews the file before replacing the chart; Undo restores previous work.

Column order: `Layer, Name, ID, Phase, Deliverable, Epic, Start Date, End Date, Start Sprint, End Sprint, Status, Color`.

| Layer | Required fields | Optional fields |
|---|---|---|
| 1 — Phase | Name, Start Date, End Date | ID, Color |
| 2 — Deliverable | Name, Phase | ID, Start Sprint, End Sprint |
| 3 — Epic | Name, Phase, Deliverable | ID, Start Sprint, End Sprint |
| 4 — Task | Name, Phase, Deliverable, Epic | ID, Start Sprint, End Sprint, Status |

Use YYYY-MM-DD. Parents can use IDs or unique names within the selected hierarchy. Blank task status becomes Planned; parent statuses are calculated. Schedule each parent before scheduling children. Export preserves IDs, ancestors, sprint ranges and statuses, and includes Sprint Calendar. Import matches headers by name, independent of column order.

JSON uses `version: 2` and arrays `phases`, `deliverables`, `epics`, `tasks`. Deliverables have `phaseId`, epics have `deliverableId`, and tasks have `epicId`.

Legacy three-layer XLSX/CSV, version 1 JSON and the earlier four-sheet roadmap remain supported. Old big tasks become deliverables with an epic inserted beneath each; old stories become tasks. Saved browser data matching the original Chat WBS uses the new epic grouping where tasks can be matched, preserving all existing items, statuses and sprint ranges.

## Persistence

Data is stored under `chat-gantt.workspace.v2`. On first load the app migrates `chat-gantt.workspace.v1` if version 2 does not exist. The original key remains as a backup. Existing saved work takes precedence over the new initial WBS.

No backend, cross-device sync or Jira/Shortcut API connection. Export to share/back up. No ESLint, Prettier or test framework is configured.

## GitHub Pages

The Vite base path is `/crm-chat-gantt/`. Local development and preview also use this path; follow the URL printed by Vite.

In the repository's **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. Commit and push the configuration to `main`. The workflow in `.github/workflows/deploy.yml` installs dependencies with `npm ci`, builds the app and publishes `dist`. It can also be triggered manually through the Actions tab.

After a successful deployment, the app is available at https://vqhungporters.github.io/crm-chat-gantt/ . GitHub Pages serves the app; each browser continues to store its own WBS locally.
