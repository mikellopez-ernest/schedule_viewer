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
- `ScheduleUpdateEmail.html`: HTML body for the optional schedule-update notification email

## Database

- The DB is a registry spreadsheet plus one spreadsheet per logical table.
- Script property `db` stores the registry spreadsheet ID.
- In the registry spreadsheet, sheet `tables` is the table registry.
- `tables` column A contains table descriptions.
- `tables` column B contains table spreadsheet IDs.
- Resolve logical table descriptions through `tables`, then open that table's spreadsheet by ID.
- Code maps logical tables to sheet names with `TABLE_SHEETS`: `Horaris` -> `GPU001`, `Dades de professors` main sheet -> `Llista`, `Càrrega lectiva` -> `assignatures`; `Dades de professors` also has `leave_absence`.
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
- `Càrrega lectiva`.`assignatures` translates `Horaris` subject codes. Columns: `short_name`, `ETAPA`, `full_name`, `untis_name`, `true_subject`. Match `Horaris` column 4 against `short_name`; display `full_name` when available and fall back to the raw code.

## Current Scope

The project currently works with these logical tables:

- `Dades de professors`
- `Horaris`
- `Càrrega lectiva`

The endpoint goal is an HTML schedule viewer with visible filters for teacher, school group, and classroom. Subject filtering is planned but the fourth combo should be hidden for now.
The endpoint loads `Horaris`, `Dades de professors`, and `Càrrega lectiva` from the spreadsheet DB on each request, derives combo values from memory, allows only one visible combo filter at a time, includes a reset button, and renders a responsive 12-row by Monday-Friday schedule grid.
Initial/clear state shows the empty 12-by-5 grid. Teacher combo labels use full names but filter by alias; include teachers referenced by `Horaris` even if inactive. Cell format depends on filter: teacher = subject/`Grup: ...`/`Classe: ...`, group = subject/teacher names/`Classe: ...`, classroom = subject/teacher/group. Hidden subject filter remains subject = teacher/group/classroom for later.

Teacher schedule rendering:

- Teacher schedule is active when the first combo has a selected teacher.
- Teacher schedule item lines: subject full name from `Càrrega lectiva`.`assignatures`, `Grup: ` plus grouped group names from `GPU001` column 2, `Classe: ` plus classroom from `GPU001` column 5; omit blank group/classroom lines.
- If the same effective teacher has the same subject in the same day/time/classroom, group classes comma-separated, for example `Grup: 4A, 4B, 4C`.
- Teacher item colors by raw `GPU001` subject code: normal green, `GUARDIA` orange, meeting/reunió/CARREC codes blue (`RC_ESO`, `RC_FP_BAT`, `RDEP`, `RDIM1`, `RDIM2`, `RDIR`, `REAP`, `REC`, `CARREC`), `TUT` pink.
- Schedule item bubbles should be vertically centered inside timetable cells.

Class/group schedule rendering:

- Class/group schedule is active when the second combo has a selected group.
- Class/group item lines: subject full name from `Càrrega lectiva`.`assignatures`, grouped teacher full names from `Dades de professors`.`Llista` columns C+D+E matched by `REDUIT` column F from `GPU001` column 3 after effective-teacher resolution, `Classe: ` plus classroom from `GPU001` column 5; omit blank classroom line.
- If the same selected group has the same subject in the same day/time, group teacher names comma-separated, for example `Mikel López Villarroya, Gemma Codina`; if multiple classrooms appear, group classrooms comma-separated on the `Classe: ` line.
- Class/group schedule item bubbles should be vertically centered inside timetable cells.

Classroom schedule rendering:

- Classroom schedule is active when the third combo has a selected classroom.
- Classroom item lines: subject full name from `Càrrega lectiva`.`assignatures`, grouped teacher full names from `Dades de professors`.`Llista` columns C+D+E matched by `REDUIT` column F from `GPU001` column 3 after effective-teacher resolution, `Grup: ` plus grouped group names from `GPU001` column 2; omit blank group line.
- If the same selected classroom has the same subject/group in the same day/time, group teacher names comma-separated; if it has the same subject/teacher in the same day/time, group groups comma-separated.
- Classroom schedule item bubbles should be vertically centered inside timetable cells.

Admin schedule upload:

- Active user email is read with `Session.getActiveUser().getEmail()`.
- Only `admindomini@iernestlluch.cat` sees the bottom-right `CARREGAR HORARI` button, and the server also enforces this admin check.
- Upload accepts filename `GPU001.txt` case-insensitively; it is comma-separated, encoded as Western / ISO Latin 1 (`ISO-8859-1`), and has the same 7 columns as `Horaris`.`GPU001`: row id, class/group, teacher code, subject, classroom, day, time slot. Trailing empty export columns are ignored before validation.
- Upload replaces the whole configured `Horaris` -> `GPU001` sheet through the same DB registry flow, resizes the sheet to uploaded rows x 7 columns, then reloads the main endpoint page after success by navigating `_top` to the canonical `ScriptApp.getService().getUrl()` URL with a cache-busting query parameter. Avoid `window.location.reload()` because it can reload the HtmlService iframe and leave a blank page.
- Optional checkbox `Notificar usuaris d'aquesta actualització.` sends the schedule update email to the constant recipient `mlvillarroya@gmail.com`; HTML body is in `ScheduleUpdateEmail.html`.
- Web app manifest should execute as deployer/creator and be domain-accessible (`executeAs: USER_DEPLOYING`, `access: DOMAIN`).

Print schedule:

- Non-admin users see a `PRINT` button; admin sees the upload button. `PRINT` is disabled until a teacher/group/classroom combo is selected.
- Printing is client-side from the currently rendered schedule, preserving visible text and colors.
- Printable/PDF output uses A4, title is the selected combo label, keeps Monday-Friday columns, and includes only time-slot rows with at least one non-empty schedule cell.

## Working Notes

- Prefer updating `SPEC.md` for durable requirements.
- Keep this file concise; summarize stable context here instead of copying all implementation details.
- Use `clasp pull`, `clasp push`, and `clasp status` for Apps Script synchronization.
