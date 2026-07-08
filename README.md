# Schedule Viewer Apps Script

Google Apps Script web app for viewing school schedules by teacher, group, classroom, or subject.

The app reads schedule and teacher data from Google Sheets, resolves active substitute coverage for teachers on leave, and renders a responsive Monday-Friday schedule grid.

## Features

- Web endpoint rendered with Apps Script HTML service.
- Four mutually exclusive filters:
  - teacher
  - school group
  - classroom
  - subject
- Empty initial state: the page shows the full 12-slot grid without schedule items until a filter is selected.
- Responsive schedule table with 12 time slots and Monday-Friday columns.
- Teacher names are shown as full names, sorted by surname.
- Active leave-of-absence records replace original teachers with their current substitutes.
- Teacher-code matching is normalized to tolerate spaces, accents, and casing differences.
- Standalone helper script to audit teacher-code mismatches between `Horaris` and `Dades de professors`.

## Project Files

| File | Purpose |
| --- | --- |
| `Código.js` | Apps Script server code: database loading, teacher normalization, leave/substitute resolution, HTML bootstrap data. |
| `Index.html` | Responsive client UI for the schedule viewer. |
| `appsscript.json` | Apps Script manifest. |
| `SPEC.md` | Detailed behavior and database specification. |
| `project-context.md` | Compact context summary for future development. |
| `CodeErrors.gs` | Standalone helper script for the `Horaris` spreadsheet project; not pushed with this web app. |
| `.claspignore` | Prevents helper/docs/example files from being pushed to the Apps Script web app project. |

## Database Architecture

The project uses a registry spreadsheet plus one spreadsheet per logical table.

The Apps Script project must have a script property named `db`.

`db` stores the spreadsheet ID of the registry spreadsheet.

Inside the registry spreadsheet, sheet `tables` maps logical table names to table spreadsheet IDs:

| Column | Meaning |
| --- | --- |
| A | Logical table name |
| B | Spreadsheet ID for that logical table |

Required logical tables:

| Logical table | Spreadsheet source | Sheet used by this app |
| --- | --- | --- |
| `Horaris` | `tables` row where column A is `Horaris` | `GPU001` |
| `Dades de professors` | `tables` row where column A is `Dades de professors` | `Llista` |
| `Dades de professors` leave data | Same `Dades de professors` spreadsheet | `leave_absence` |

## Horaris Sheet

Sheet name: `GPU001`

The sheet has no header row. Each row is one scheduled subject occurrence.

| Column | Meaning |
| --- | --- |
| A | row number |
| B | group |
| C | teacher `REDUIT` |
| D | subject |
| E | classroom |
| F | day number, `1` Monday through `5` Friday |
| G | time slot number, `1` through `12` |

## Teacher Sheets

### `Dades de professors -> Llista`

Teacher metadata. Row 1 is headers; data starts in row 2.

Important columns:

| Header | Meaning |
| --- | --- |
| `ESP` | Original teacher code used by `leave_absence.teacher_code`. |
| `NOM` | First name. |
| `COGNOM1` | First surname. |
| `COGNOM2` | Second surname. |
| `REDUIT` | Short teacher code used by `Horaris` and most timetable logic. |
| `SITUACIO` | Employment/status text. Substitute status is not inferred from this. |
| `ACTIU` | Active teacher boolean. |
| `BAIXA?` | Leave-of-absence boolean. |
| `SUBST?` | Substitute boolean. This is the only source of substitute status. |

Boolean cells may be real booleans or the string `TRUE`.

### `Dades de professors -> leave_absence`

Leave/substitute mapping. Row 1 is headers; data starts in row 2.

| Header | Meaning |
| --- | --- |
| `row_id` | Original row number in `Llista`. |
| `teacher_code` | Original teacher `ESP`. |
| `substitute_code` | Substitute teacher `REDUIT`. |
| `start_date` | Leave start date. |
| `end_date` | Leave end date. Blank means still active. |
| `comments` | Free comments. |

An active leave is one where today, in the Apps Script timezone, is between `start_date` and `end_date` inclusive. A blank `end_date` means the leave is still active.

## Effective Teacher Resolution

The schedule source stores teacher codes in `Horaris` column C as `REDUIT`.

When a teacher is on active leave:

1. Read the source `REDUIT` from `Horaris`.
2. Find that teacher in `Llista`.
3. Resolve their original `ESP`.
4. Find an active `leave_absence` row where `teacher_code` matches that `ESP`.
5. Resolve `substitute_code` as a substitute `REDUIT`.
6. Use the substitute as the effective teacher for filtering and display.

Teacher-code joins are normalized before comparison:

- trim spaces
- remove accents
- uppercase

As a defensive fallback, `leave_absence.teacher_code` may also match the source `REDUIT`. This protects the page if a leave row was entered with the short code instead of `ESP`.

If a leave row has a missing or invalid substitute code, the app keeps the original teacher and continues rendering.

## UI Behavior

The web page has four select controls. Only one filter is active at a time. Selecting one resets the other three.

The Clear button resets all controls and returns to the empty grid.

Cell display depends on the active filter:

| Active filter | Cell format |
| --- | --- |
| teacher | `SUBJECT` / group(s) / classroom |
| group | `SUBJECT` / teacher(s) / classroom |
| classroom | `SUBJECT` / teacher(s) / group(s) |
| subject | `TEACHER` / group(s) / classroom |

Empty values are omitted. Labels such as `Group:`, `Teacher:`, and `Classroom:` are not shown inside cells.

## Local Development

Install and authenticate `clasp`:

```sh
npm install -g @google/clasp
clasp login
```

Clone or configure this Apps Script project:

```sh
clasp clone 1z_HTAfUw115MLU0Sw-RslP5V2dC1OoZ0yUFxBwoJipwjLZWC34gNj6v2
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
node -e "const fs=require('fs'); const html=fs.readFileSync('Index.html','utf8'); const m=html.match(/<script>([\s\S]*)<\/script>/); if(!m) throw new Error('missing script'); const js=m[1].replace('const APP_DATA = <?!= bootstrapJson ?>;','const APP_DATA = {filters:{teachers:[],groups:[],classrooms:[],subjects:[]},days:[],slots:[],scheduleRows:[]};'); new Function(js); console.log('client script syntax ok');"
```

## Deployment

Push tracked Apps Script files:

```sh
clasp push -f
```

Redeploy the existing web app deployment:

```sh
clasp deploy -i AKfycbyhSqCTkS27bDxsfILI64rlSMUTN5A7VbHGgpSf_G6efxrWfOuUKJULnN2rlMtHuWqwmA -d "deployment description"
```

Current endpoint URL:

```text
https://script.google.com/macros/s/AKfycbyhSqCTkS27bDxsfILI64rlSMUTN5A7VbHGgpSf_G6efxrWfOuUKJULnN2rlMtHuWqwmA/exec
```

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
