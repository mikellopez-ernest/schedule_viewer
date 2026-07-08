# Project Context

Use this file as the first compact context source for future work in this repository.
Load fuller files only when the task needs their details.

## Project

- Name: Schedule Viewer Apps Script
- Local path: `/Users/mikellopez/Documents/Codex/schedule_viewer`
- Google Apps Script ID: `1z_HTAfUw115MLU0Sw-RslP5V2dC1OoZ0yUFxBwoJipwjLZWC34gNj6v2`
- Runtime: Apps Script V8
- Time zone: `Europe/Madrid`
- Tooling: `clasp`

## Files

- `project-context.md`: compact durable context for Codex sessions
- `SPEC.md`: project specs
- `README.md`: local setup and common commands
- `.clasp.json`: local clasp project binding
- `appsscript.json`: Apps Script manifest
- `Código.js`: current script source, initially a placeholder

## Database

- The DB is a registry spreadsheet plus one spreadsheet per logical table.
- Script property `db` stores the registry spreadsheet ID.
- In the registry spreadsheet, sheet `tables` is the table registry.
- `tables` column A contains table descriptions.
- `tables` column B contains table spreadsheet IDs.
- Resolve logical table descriptions through `tables`, then open that table's spreadsheet by ID.
- Code maps logical tables to sheet names with `TABLE_SHEETS`: `Horaris` -> `GPU001`, `Dades de professors` main sheet -> `Llista`; `Dades de professors` also has `leave_absence`.
- `Horaris` is the main schedule table: 7 columns, no header in example, one row per scheduled subject occurrence.
- `Dades de professors`.`Llista` is the teacher metadata sheet: new structure has 16 columns, including `ESP`, `REDUIT`, `ACTIU`, `BAIXA?`, `SUBST?`.
- `Horaris` column 3 is teacher `REDUIT` and joins to `Dades de professors`.`Llista`.`REDUIT`.
- `Llista`.`ESP` is the original teacher code used by `leave_absence.teacher_code`; `leave_absence.substitute_code` is a substitute `REDUIT`.
- Active leave resolution maps source `REDUIT` -> original `ESP` -> active `leave_absence.teacher_code` -> substitute `REDUIT`; relevant date is today in `Europe/Madrid`; use effective teacher for schedule display/filtering when coverage is active.
- Teacher-code joins are normalized: trim spaces, remove accents, uppercase. Leave resolution first matches `leave_absence.teacher_code` against original `ESP`, then defensively against source `REDUIT`.
- If a leave row has a missing/invalid substitute, keep the original teacher and keep the page working.
- A substitute cannot cover two partners at the same time; active substitute coverage is expected to be exclusive by substitute on the relevant date.
- `SUBST?` plus `ACTIU` determines eligible substitutes; never infer substitute status from `SITUACIO`.
- `Horaris` columns: row number, group, teacher, subject, classroom, day number, time slot number.
- Day numbers are 1 Monday through 5 Friday; time slots are 1 through 12.

## Current Scope

The project currently works with these logical tables:

- `Dades de professors`
- `Horaris`

The endpoint goal is an HTML schedule viewer with filters for teacher, school group, classroom, and subject.
The endpoint loads `Horaris` and `Dades de professors` from the spreadsheet DB on each request, derives combo values from memory, allows only one active combo filter at a time, includes a reset button, and renders a responsive 12-row by Monday-Friday schedule grid.
Initial/clear state shows the empty 12-by-5 grid. Teacher combo labels use full names but filter by alias; include teachers referenced by `Horaris` even if inactive. Cell format depends on filter: teacher = subject/groups/classroom, group = subject/teacher/classroom, classroom = subject/teacher/group, subject = teacher/group/classroom.

## Working Notes

- Prefer updating `SPEC.md` for durable requirements.
- Keep this file concise; summarize stable context here instead of copying all implementation details.
- Use `clasp pull`, `clasp push`, and `clasp status` for Apps Script synchronization.
