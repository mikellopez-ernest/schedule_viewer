# Schedule Viewer Apps Script

Google Apps Script web app for viewing school schedules by teacher, school group, or classroom.

The app reads its database from Google Sheets, uses a generated `schedule_cache` sheet for normal endpoint reads, resolves active leave-of-absence substitutions, and renders a responsive Monday-Friday timetable.

## Features

- Apps Script HTML Service web endpoint.
- Centered loading indicator shown immediately while the browser asks the server for schedule data.
- Three visible mutually exclusive filters:
  - teacher
  - school group
  - classroom
- Hidden subject filter kept in the data/model for future use.
- Empty initial state: the page shows the full 12-slot by 5-day grid without schedule items until a filter is selected.
- Effective teacher handling: teachers currently on active leave are replaced by their configured substitute in the schedule view.
- Subject-code translation through `Càrrega lectiva -> assignatures`.
- Admin-only upload workflow for replacing `Horaris -> GPU001` from `GPU001.txt`.
- Automatic cache rebuild after schedule upload, plus a daily trigger helper for refreshing substitution state.
- POST/GET action for rebuilding `Horaris -> schedule_cache` from another script, bookmark, or authorized caller.
- Optional schedule-update notification email.
- Non-admin client-side `PRINT` button for generating an A4 printable/PDF version of the currently displayed schedule.
- Standalone helper script to audit teacher-code mismatches between `Horaris` and `Dades de professors`.

## Project Files

| File | Purpose |
| --- | --- |
| `Código.js` | Apps Script server code: endpoint shell, DB registry access, async schedule data, upload workflow. |
| `CacheService.js` | Cache builder service: regenerates `Horaris -> schedule_cache` and installs the daily trigger. |
| `Index.html` | Responsive client UI, filter behavior, upload modal, and client-side print/PDF rendering. |
| `ScheduleUpdateEmail.html` | HTML template for the optional schedule-update notification email. |
| `appsscript.json` | Apps Script manifest. |
| `SPEC.md` | Detailed behavior and database specification. |
| `project-context.md` | Compact durable context for future Codex sessions. |
| `docs/schedule-cache.md` | Detailed reference for the generated `schedule_cache` table. |
| `CodeErrors.gs` | Standalone helper script for the `Horaris` spreadsheet project; not pushed with this web app. |
| `.claspignore` | Prevents helper/docs/example files from being pushed to the Apps Script web app project. |

## Database Architecture

The project uses a registry spreadsheet plus one spreadsheet per logical table.

The Apps Script project must have a script property named `db`.

`db` stores the spreadsheet ID of the registry spreadsheet.

Inside the registry spreadsheet, sheet `tables` maps logical table names to spreadsheet IDs:

| Column | Meaning |
| --- | --- |
| A | Logical table name |
| B | Spreadsheet ID for that logical table |

Required logical tables:

| Logical table | Spreadsheet source | Sheet used by this app |
| --- | --- | --- |
| `Horaris` | `tables` row where column A is `Horaris` | `GPU001` |
| `Horaris` cache | Same `Horaris` spreadsheet | `schedule_cache` |
| `Dades de professors` | `tables` row where column A is `Dades de professors` | `Llista` |
| `Dades de professors` leave data | Same `Dades de professors` spreadsheet | `leave_absence` |
| `Càrrega lectiva` subjects | `tables` row where column A is `Càrrega lectiva` | `assignatures` |

## Source Schedule

`Horaris -> GPU001` is the source timetable table.

It has no header row. Each row is one scheduled subject occurrence.

| Column | Meaning |
| --- | --- |
| A | row id |
| B | group |
| C | source teacher code, `REDUIT` |
| D | subject code |
| E | classroom |
| F | day number, `1` Monday through `5` Friday |
| G | time slot number, `1` through `12` |

The endpoint does not normally read `GPU001` directly. It reads the generated `Horaris -> schedule_cache` sheet.

## Schedule Cache

`Horaris -> schedule_cache` is generated data used by the endpoint for faster and simpler reads.

Header:

```csv
row_id,group,source_teacher_code,source_teacher_name,source_teacher_original_code,effective_teacher_code,effective_teacher_name,teacher_was_substituted,subject_code,subject_full_name,classroom,day,slot
```

The cache enriches each `GPU001` row with:

- source teacher name and original `ESP`
- effective teacher code/name after active leave substitution
- translated subject full name
- a boolean substitution flag

Important: the cache intentionally keeps both teacher identities.

- `source_teacher_*` fields describe the original teacher from `GPU001` and remain present even when that teacher is on leave.
- `effective_teacher_*` fields describe the teacher currently responsible for the row after active substitution.
- The endpoint teacher filters and schedule display use `effective_teacher_code` and `effective_teacher_name`.

Example substituted row:

```text
source_teacher_code=ESCANG
source_teacher_name=Gemma Escudé Pont
effective_teacher_code=MAREXP
effective_teacher_name=Alba Martínez López
teacher_was_substituted=TRUE
```

This means Gemma is preserved as the source/original teacher, but Alba is the teacher used by the viewer.

The cache is rebuilt:

- after a successful admin upload of `GPU001.txt`
- by running `rebuildScheduleCache()` manually
- by calling the web app endpoint with `action=rebuildScheduleCache`
- by the daily trigger installed with `installDailyScheduleCacheTrigger()`
- once by the endpoint if the cache exists but has no data rows

See `docs/schedule-cache.md` for the full cache table reference.

### Endpoint Cache Rebuild

The web app endpoint accepts POST requests to rebuild the cache:

```json
{
  "action": "rebuildScheduleCache",
  "token": "optional-shared-token"
}
```

It also accepts GET for browser bookmarks:

```text
WEB_APP_URL?action=rebuildScheduleCache&token=your-cache-rebuild-token
```

The request is authorized when either:

- the active user is `admindomini@iernestlluch.cat`
- `token` matches script property `cache_rebuild_token`

If `cache_rebuild_token` is not set, token authorization is disabled and only the admin active user can trigger the rebuild.

Every GET/POST cache rebuild request appends an audit row to:

```text
Horaris -> cache_rebuild_log
```

The log records method, authorization result, success/error, rows rebuilt, and duration. It never records the token value.

Example from another Apps Script project:

```js
const response = UrlFetchApp.fetch(WEB_APP_URL, {
  method: 'post',
  contentType: 'application/json',
  payload: JSON.stringify({
    action: 'rebuildScheduleCache',
    token: 'your-cache-rebuild-token',
  }),
});

const result = JSON.parse(response.getContentText());
```

## Teacher Database

`Dades de professors -> Llista` contains teacher metadata.

Important columns:

| Header | Meaning |
| --- | --- |
| `ESP` | Original teacher code used by `leave_absence.teacher_code`. |
| `NOM` | First name. |
| `COGNOM1` | First surname. |
| `COGNOM2` | Second surname. |
| `REDUIT` | Short teacher code used by `Horaris` and most timetable logic. |
| `ACTIU` | Active teacher boolean. |
| `BAIXA?` | Leave-of-absence boolean. |
| `SUBST?` | Substitute boolean. This is the only source of substitute status. |

Boolean cells may be real booleans or the string `TRUE`.

`Dades de professors -> leave_absence` maps original teachers on leave to their substitutes.

| Header | Meaning |
| --- | --- |
| `teacher_code` | Original teacher `ESP`. |
| `substitute_code` | Substitute teacher `REDUIT`. |
| `start_date` | Leave start date. |
| `end_date` | Leave end date. Blank means still active. |

An active leave is one where today, in the `Europe/Madrid` Apps Script timezone, is between `start_date` and `end_date` inclusive. A blank `end_date` means the leave is still active.

If an active leave row points to a missing/invalid substitute, the app keeps the original teacher and continues rendering.

## Subject Catalog

`Càrrega lectiva -> assignatures` translates raw timetable subject codes.

| Header | Meaning |
| --- | --- |
| `short_name` | Raw subject code from `GPU001` column D. |
| `full_name` | User-facing subject name. |

The app displays `full_name` when available and falls back to the raw subject code.

## Schedule Rendering

Only one visible filter is active at a time. Selecting a teacher, group, or classroom resets the other visible filters.

With no active filter, including a fresh page load and after Clear, the timetable grid remains visible but contains no schedule bubbles.

Cell display:

| Active filter | Cell format |
| --- | --- |
| teacher | subject full name / `Grup: ...` / `Classe: ...` |
| group | subject full name / teacher name(s) / `Classe: ...` |
| classroom | subject full name / teacher name(s) / `Grup: ...` |

Empty values are omitted. Schedule bubbles are vertically centered inside timetable cells.

Subject colors are based on the raw subject code:

| Subject code | Color |
| --- | --- |
| `GUARDIA` | orange |
| `RC_ESO`, `RC_FP_BAT`, `RDEP`, `RDIM1`, `RDIM2`, `RDIR`, `REAP`, `REC`, `CARREC`, `FCT`, `TREC` | blue |
| `TUT`, `TUT_FAMILIES` | pink |
| `3R` | yellow |
| all others | green |

## Admin Schedule Upload

Only `admindomini@iernestlluch.cat` sees the fixed bottom-right `CARREGAR HORARI` button. The server also verifies this email before modifying the spreadsheet.

The upload modal accepts only `GPU001.txt`, case-insensitively:

- `GPU001.txt`
- `gpu001.txt`
- `GPU001.TXT`
- `gpu001.TXT`

The file is comma-separated, encoded as Western / ISO Latin 1, and read as `ISO-8859-1`.

Each nonblank row must contain the same 7 columns as `Horaris -> GPU001`.

After upload, the app:

1. Replaces all content in `Horaris -> GPU001`.
2. Resizes the sheet to uploaded rows x 7 columns.
3. Rebuilds `Horaris -> schedule_cache`.
4. Optionally sends the notification email.
5. Reloads the top-level web app URL with a cache-busting query parameter.

Notification recipient and admin email live in constants in `Código.js`.

## Print

Non-admin users see a `PRINT` button.

The button is disabled until a teacher, group, or classroom is selected.

Printing is client-side from the currently rendered schedule:

- A4 page
- selected combo label as title
- Monday-Friday columns
- same visible text and colors as the page
- only time-slot rows with at least one non-empty schedule cell

## Local Development

Install and authenticate `clasp`:

```sh
npm install -g @google/clasp
clasp login
```

Useful commands:

```sh
clasp status
clasp pull
clasp push -f
clasp deployments
```

Syntax checks used during development:

```sh
node --check Código.js
node --check CacheService.js
node -e "const fs=require('fs'); const html=fs.readFileSync('Index.html','utf8'); const m=html.match(/<script>([\\s\\S]*)<\\/script>/); if(!m) throw new Error('missing script'); const js=m[1].replace('const APP_DATA = <?!= bootstrapJson ?>;','const APP_DATA = {filters:{teachers:[],groups:[],classrooms:[],subjects:[]},days:[],slots:[],scheduleRows:[],isAdmin:false,userEmail:\"\",serviceUrl:\"\"};'); new Function(js); console.log('client script syntax ok');"
```

## Deployment

Push tracked Apps Script files:

```sh
clasp push -f
```

Redeploy the existing web app deployment so the URL stays the same:

```sh
clasp deploy -i AKfycbyhSqCTkS27bDxsfILI64rlSMUTN5A7VbHGgpSf_G6efxrWfOuUKJULnN2rlMtHuWqwmA -d "deployment description"
```

Current endpoint URL:

```text
https://script.google.com/macros/s/AKfycbyhSqCTkS27bDxsfILI64rlSMUTN5A7VbHGgpSf_G6efxrWfOuUKJULnN2rlMtHuWqwmA/exec
```

The web app is configured to execute as the deploying user and to be reachable without interactive login so other Apps Script projects can call it with `UrlFetchApp`.

Security for cache rebuild calls is enforced inside the endpoint with script property `cache_rebuild_token`.

After the first deployment that includes `CacheService.js`, run `installDailyScheduleCacheTrigger()` once from the Apps Script editor if the daily cache trigger is not already installed.

## Standalone Teacher-Code Checker

`CodeErrors.gs` is a standalone helper script intended for the Apps Script project bound to the `Horaris` spreadsheet.

It checks:

- `Horaris` rows with no teacher code.
- teacher codes used in `Horaris` but missing from `Dades de professors -> Llista -> REDUIT`.
- teachers in `Llista` without a `REDUIT` code.

It creates or replaces a sheet named `code_errors`.

`CodeErrors.gs` is excluded from this web app deployment by `.claspignore`.

## Notes

- The project uses Apps Script V8.
- The manifest timezone is `Europe/Madrid`.
- Detailed requirements live in `SPEC.md`.
- Compact development context lives in `project-context.md`.
