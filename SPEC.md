# Schedule Viewer Specs

## Goal

The script must expose an HTTP endpoint that renders an HTML page showing schedules.

The page must support viewing and filtering schedules by:

- teacher
- school group
- classroom
- subject, planned but hidden in the current UI

## Endpoint Behavior

The Apps Script web endpoint must:

1. Render a lightweight HTML shell immediately.
2. Show a centered loading indicator as the first visible screen while schedule data is requested.
3. Load the generated `Horaris`.`schedule_cache` data asynchronously after the initial HTML is visible.
4. Always resolve and read database tables from the Google Spreadsheet database identified by the `db` script property.
5. Hide the loading indicator and render the schedule UI only after the initial schedule data load succeeds.
6. Show a clear load-error message with a retry action if the asynchronous data load fails.
7. Render a responsive HTML page.
8. Show three visible select controls:
   - teacher
   - school group
   - classroom
9. Keep the fourth subject select/filter as a planned control, but hide it for now.
10. Build the available select values from the in-memory `Horaris`.`schedule_cache` data.
11. Reset the other visible select controls whenever one visible select control receives a value.
12. Provide a clear/reset button that clears all select controls and returns the schedule table to the initial empty state.
13. Present the schedule as a grid:
   - rows are time slots `1` through `12`
   - columns are weekdays Monday through Friday
14. Always show all 12 time-slot rows, even when a row has no matching schedule item.
15. Show matching schedule information in the relevant day/time cell when a filter is active.
16. Show an admin-only schedule upload button for the configured administrator user.
17. Show a non-admin `PRINT` button for all users except the configured administrator.
18. Accept POST or GET requests to the web app endpoint to trigger `rebuildScheduleCache`.

Filtering rules:

- Teacher filter matches the effective teacher code for a schedule row. The stored/source teacher code in `Horaris` column 3 is a `REDUIT`; if that teacher is on active leave, resolve to the substitute `REDUIT` before filtering/displaying.
- School group filter matches `Horaris` column 2.
- Classroom filter matches `Horaris` column 5.
- Subject filter matches `Horaris` column 4, the subject short code, but this filter is hidden for now.
- Only one visible filter is active at a time because selecting a value in one combo resets the other visible combos.
- With no active filter, including the fresh endpoint start and after clear/reset, the table shows the 12 time-slot rows and Monday-Friday columns but no schedule items.

Select control rules:

- Teacher select values must filter by teacher `REDUIT`, but labels must show the teacher full name.
- Teacher full name is built from `Dades de professors`.`Llista`: `NOM` + `COGNOM1` + `COGNOM2`.
- Sort teacher labels by `COGNOM1`, then `COGNOM2`, then `NOM`.
- Include teachers that are relevant after active-leave substitution resolution. Do not show an original teacher for timetable rows currently covered by a substitute.
- Group and classroom select values are built from distinct values in `Horaris`.
- Subject select values are built from distinct subject codes in `Horaris`, but labels should use the translated full subject name from `Càrrega lectiva`.`assignatures` when available. The subject select must remain hidden in the current UI.

Schedule cell display rules:

- Each matching schedule item must display its visible row information vertically.
- Do not show placeholder labels or placeholder values for empty group/classroom/teacher fields.
- Subject values shown in schedule cells must use the translated full subject name from `Càrrega lectiva`.`assignatures` when available, falling back to the raw subject code from `Horaris` column 4.
- The visible format depends on the active filter:
  - teacher filter: full subject name / `Grup: grouped groups` / `Classe: classroom`
  - group filter: full subject name / `teacher or grouped teachers` / `Classe: classroom`
  - classroom filter: full subject name / `teacher or grouped teachers` / `Grup: grouped groups`
  - subject filter: `TEACHER` / `group or grouped groups` / `classroom`
- Teacher values inside cells must use the full teacher name when the alias can be resolved, and the alias when it cannot.
- When multiple matching items share the same day/time and the same stable visible identity, show one item and group the repeated visible values.
- If multiple matching items remain distinct after grouping, show each item separately inside that cell.
- Schedule item bubbles must be vertically centered inside their timetable cell.

Teacher schedule display rules:

- A teacher schedule is shown when the user selects a value in the first combo, the teacher combo.
- Each teacher-schedule item must show these lines vertically:
  - subject full name, translated from `Càrrega lectiva`.`assignatures`.`full_name`
  - `Grup: ` plus the group name from `Horaris`.`GPU001` column 2
  - `Classe: ` plus the classroom name from `Horaris`.`GPU001` column 5
- If group or classroom is blank, omit that line.
- If the same teacher has the same subject in the same time slot more than once, show one item and group the groups comma-separated, for example `Grup: 4A, 4B, 4C`.
- Grouping for teacher schedules is based on the effective teacher, day, time slot, subject code/full name, and classroom.
- Teacher-schedule item color is determined by the raw subject code from `Horaris`.`GPU001` column 4:
  - normal subjects: green
  - `GUARDIA`: orange
  - meeting/reunió codes: blue
  - `TUT` and `TUT_FAMILIES`: pink
  - `3R`: yellow
- Meeting/reunió/CARREC/FCT/TREC subject codes are blue: `RC_ESO`, `RC_FP_BAT`, `RDEP`, `RDIM1`, `RDIM2`, `RDIR`, `REAP`, `REC`, `CARREC`, `FCT`, `TREC`.

Class/group schedule display rules:

- A class/group schedule is shown when the user selects a value in the second combo, the group combo.
- Each class/group-schedule item must show these lines vertically:
  - subject full name, translated from `Càrrega lectiva`.`assignatures`.`full_name`
  - teacher full name, built from `Dades de professors`.`Llista` columns C, D, and E (`NOM`, `COGNOM1`, `COGNOM2`) joined with a single space
  - `Classe: ` plus the classroom name from `Horaris`.`GPU001` column 5
- Teacher lookup for class/group schedules uses the teacher code in `Horaris`.`GPU001` column 3, matching `Dades de professors`.`Llista` column F (`REDUIT`), after applying active substitute/effective-teacher resolution.
- If classroom is blank, omit the `Classe: ` line.
- If the same group has the same subject in the same time slot more than once, show one item and group the teachers comma-separated, for example `Mikel López Villarroya, Gemma Codina`.
- Grouping for class/group schedules is based on the selected group, day, time slot, and subject code/full name.
- If grouped rows have more than one classroom, group classrooms comma-separated on the `Classe: ` line.
- Class/group-schedule item bubbles must be vertically centered inside their timetable cell.

Classroom schedule display rules:

- A classroom schedule is shown when the user selects a value in the third combo, the classroom combo.
- Each classroom-schedule item must show these lines vertically:
  - subject full name, translated from `Càrrega lectiva`.`assignatures`.`full_name`
  - teacher full name, built from `Dades de professors`.`Llista` columns C, D, and E (`NOM`, `COGNOM1`, `COGNOM2`) joined with a single space
  - `Grup: ` plus the group name from `Horaris`.`GPU001` column 2
- Teacher lookup for classroom schedules uses the teacher code in `Horaris`.`GPU001` column 3, matching `Dades de professors`.`Llista` column F (`REDUIT`), after applying active substitute/effective-teacher resolution.
- If group is blank, omit the `Grup: ` line.
- If the same classroom has the same subject for the same group in the same time slot more than once, show one item and group the teachers comma-separated, for example `Mikel López Villarroya, Gemma Codina`.
- If the same classroom has the same subject for the same teacher in the same time slot more than once, show one item and group the groups comma-separated, for example `Grup: 4A, 4B, 4C`.
- Grouping for classroom schedules is based on the selected classroom, day, time slot, subject code/full name, teacher, and group; when rows share all grouping identity except teacher, group teachers; when rows share all grouping identity except group, group groups.
- Classroom-schedule item bubbles must be vertically centered inside their timetable cell.

## Database

The project uses Google Spreadsheets as its database.

The Apps Script project has a script property named `db`. Its value is the spreadsheet ID of the database registry spreadsheet.

Inside the database registry spreadsheet, the sheet named `tables` contains the table registry:

- Column A: table description
- Column B: table spreadsheet ID

The script must use the `tables` sheet to resolve logical table descriptions to their concrete spreadsheet IDs.

Each logical table is stored in its own spreadsheet. The table registry identifies the spreadsheet, and the script uses a configured sheet name inside that spreadsheet.

Configured table sheets:

| Logical table | Spreadsheet ID source | Sheet name inside that spreadsheet |
| --- | --- | --- |
| `Dades de professors` | `tables` row where column A is `Dades de professors`, column B is the spreadsheet ID | `Llista` |
| `Dades de professors` leave data | Same `Dades de professors` spreadsheet ID | `leave_absence` |
| `Horaris` | `tables` row where column A is `Horaris`, column B is the spreadsheet ID | `GPU001` |
| `Horaris` cache | Same `Horaris` spreadsheet ID | `schedule_cache` |
| `Càrrega lectiva` subjects | `tables` row where column A is `Càrrega lectiva`, column B is the spreadsheet ID | `assignatures` |

Runtime resolution flow:

1. Read script property `db`.
2. Open the registry spreadsheet identified by `db`.
3. Read registry sheet `tables`.
4. Resolve each required logical table name to its table spreadsheet ID.
5. Open each table spreadsheet by ID.
6. Open the configured sheet for that logical table.
7. Load the sheet data into memory for the request.

## Required Tables

This project works with these logical tables:

- `Dades de professors`
- `Horaris`
- `Càrrega lectiva`

## Table: `Horaris`

`Horaris` contains the source timetable and its generated schedule cache.

### Sheet: `GPU001`

`GPU001` is the source schedule table. It contains one row per scheduled subject occurrence.

Example file studied: `examples/horaris - GPU001.csv`.

Observed example facts:

- No header row in the example CSV.
- 2,308 rows.
- 7 columns in every row.

Column schema:

| Column | Meaning | Notes |
| --- | --- | --- |
| 1 | row number | Schedule row identifier. Multiple rows can share the same row number when the same schedule item spans multiple day/time occurrences or has multiple teachers. |
| 2 | group name | School group, for example `1A`. |
| 3 | teacher | Teacher `REDUIT`. References `Dades de professors`.`Llista`.`REDUIT`. |
| 4 | subject | Subject code, for example `ANG`, `CAT`, `TUT`. |
| 5 | classroom | Classroom code/name, for example `1A`. |
| 6 | day number | `1` Monday, `2` Tuesday, `3` Wednesday, `4` Thursday, `5` Friday. |
| 7 | time slot number | Slot number from `1` to `12`. |

Observed data quality notes:

- Teacher alias is usually present in column 3.
- The example contains rows with a blank teacher alias for row number `328`, group `4F`, subject `DES`, classroom `4F`.
- Code should tolerate blank teacher aliases when filtering or joining teacher data.

### Sheet: `schedule_cache`

`schedule_cache` is the generated effective timetable cache used by the endpoint for normal reads.

Rules:

- `schedule_cache` lives in the same spreadsheet as `Horaris`.`GPU001`.
- `schedule_cache` is generated data. Do not manually edit it except to create the header row initially.
- The endpoint should read `schedule_cache` instead of recalculating teachers, active leaves, and subject names on every page load.
- The cache must be rebuilt after `GPU001.txt` upload.
- The cache must be rebuildable through an exposed function named `rebuildScheduleCache`.
- The cache must be rebuildable through POST or GET requests to the web app endpoint with `action` equal to `rebuildScheduleCache`.
- A daily time-driven trigger should run `rebuildScheduleCache` to refresh active leave/substitute status.
- If `schedule_cache` has only headers/no rows, the endpoint may rebuild it once and then read it.

Header row:

```csv
row_id,group,source_teacher_code,source_teacher_name,source_teacher_original_code,effective_teacher_code,effective_teacher_name,teacher_was_substituted,subject_code,subject_full_name,classroom,day,slot
```

Column schema:

| Header | Meaning |
| --- | --- |
| `row_id` | Original `GPU001` column 1. |
| `group` | Original `GPU001` column 2. |
| `source_teacher_code` | Original `GPU001` column 3, teacher `REDUIT`. |
| `source_teacher_name` | Original/source teacher full name from `Dades de professors`.`Llista`. |
| `source_teacher_original_code` | Original/source teacher `ESP` from `Dades de professors`.`Llista`. |
| `effective_teacher_code` | Teacher `REDUIT` after active leave/substitute resolution. |
| `effective_teacher_name` | Effective teacher full name after active leave/substitute resolution. |
| `teacher_was_substituted` | Real boolean indicating whether the source teacher changed to a substitute. |
| `subject_code` | Original `GPU001` column 4. |
| `subject_full_name` | Full subject name from `Càrrega lectiva`.`assignatures`, with fallback to `subject_code`. |
| `classroom` | Original `GPU001` column 5. |
| `day` | Original `GPU001` column 6. |
| `slot` | Original `GPU001` column 7. |

Source/effective teacher rules:

- `source_teacher_code`, `source_teacher_name`, and `source_teacher_original_code` must always preserve the teacher from the source `GPU001` row.
- If that source teacher is on active leave, the source teacher must still remain visible in the cache for audit/debugging.
- `effective_teacher_code` and `effective_teacher_name` must contain the substitute when active leave resolution succeeds.
- The endpoint must use `effective_teacher_code` and `effective_teacher_name` for teacher filters and visible teacher display.
- A row with `source_teacher_name = Gemma Escudé Pont`, `effective_teacher_name = Alba Martínez López`, and `teacher_was_substituted = TRUE` is a successful substitution, not a failed cache rebuild.

## Table: `Càrrega lectiva`

`Càrrega lectiva` contains teaching-load reference data. This project uses its subject catalog sheet.

### Sheet: `assignatures`

`assignatures` translates short subject codes from `Horaris` into full subject names for display.

Structure:

- Header row is present.
- Data starts in row 2.

Column schema:

| Header | Meaning |
| --- | --- |
| `short_name` | Short subject code. This matches `Horaris` column 4. |
| `ETAPA` | Educational stage. |
| `full_name` | Full subject name to display in the endpoint. |
| `untis_name` | Subject name/code as used by Untis. |
| `true_subject` | Canonical or normalized subject value. |

Subject translation rules:

- For each `Horaris` row, read the subject code from column 4.
- Look up that code in `Càrrega lectiva`.`assignatures`.`short_name`.
- When a matching subject exists, use `full_name` as the user-facing subject name.
- When no matching subject exists or `full_name` is blank, fall back to the raw `Horaris` subject code.
- Subject filtering should keep using the raw subject code as the stable value.
- Subject combo labels and schedule-cell subject text should use the translated full subject name when available.

## Table: `Dades de professors`

`Dades de professors` is the teacher database spreadsheet. It contains at least these sheets:

- `Llista`
- `leave_absence`

### Sheet: `Llista`

`Llista` contains teacher metadata.

Structure:

- Header row is present.
- Data starts in row 2.
- 16 columns.

Column schema:

| Column | Header | Meaning |
| --- | --- | --- |
| 1 | `ESP` | Original teacher code. This is the code used by `leave_absence.teacher_code`. |
| 2 | `DEPT.` | Department code. |
| 3 | `NOM` | First name. |
| 4 | `COGNOM1` | First surname. |
| 5 | `COGNOM2` | Second surname. |
| 6 | `REDUIT` | Short teacher code used by most timetable/substitution logic. |
| 7 | `SITUACIO` | Employment/status description. Do not infer substitute status from this value. |
| 8 | `JORNADA` | Workload/schedule fraction from source data. |
| 9 | `DNI` | ID document value. |
| 10 | `TELF` | Phone number. |
| 11 | `XTEC` | XTEC email. |
| 12 | `CORREU` | Institutional or main email. |
| 13 | `NOUS` | New teacher boolean flag. |
| 14 | `ACTIU` | Active teacher boolean flag. |
| 15 | `BAIXA?` | Leave-of-absence boolean flag. |
| 16 | `SUBST?` | Substitute boolean flag. This is the only source of substitute status. |

`Llista` rules:

- `REDUIT` column F is the short teacher code used by most timetable/substitution logic.
- `ESP` column A is the original teacher code used in `leave_absence.teacher_code`.
- Teacher full name is `NOM + " " + COGNOM1 + " " + COGNOM2`, omitting blank parts.
- Sort teacher names by `COGNOM1`, then `COGNOM2`, then `NOM`.
- Boolean fields are `NOUS`, `ACTIU`, `BAIXA?`, and `SUBST?`.
- Read both real boolean `true` and string `"TRUE"` as true.
- Writes to boolean columns must use real booleans.
- `SUBST?` is the only source of substitute status. Do not infer substitute status from `SITUACIO`.
- A teacher is active when `ACTIU` is true.
- A teacher is an eligible substitute when both `SUBST?` and `ACTIU` are true.

### Sheet: `leave_absence`

`leave_absence` tracks original teachers currently or historically covered by substitutes.

Structure:

- Header row is present.
- Data starts in row 2.
- 6 columns.

Column schema:

| Column | Header | Meaning |
| --- | --- | --- |
| 1 | `row_id` | Original row number in `Llista`. |
| 2 | `teacher_code` | Original teacher `ESP` from `Llista` column A. |
| 3 | `substitute_code` | Substitute teacher `REDUIT` from `Llista` column F. |
| 4 | `start_date` | Leave start date. |
| 5 | `end_date` | Leave end date. Blank means still active. |
| 6 | `comments` | Free comments. |

Leave-of-absence rules:

- A leave is active when the relevant date is between `start_date` and `end_date`, inclusive.
- If `end_date` is blank, treat the leave as still active.
- Starting a leave sets `Llista` column O `BAIXA?` to true.
- Ending a leave fills `leave_absence.end_date` and sets `Llista` column O `BAIXA?` to false.
- `leave_absence.teacher_code` is always the original teacher `ESP`.
- `leave_absence.substitute_code` is always the substitute teacher `REDUIT`.
- Do not store a substitute as `ESP`.

## Relationships

- `Horaris` column 3 stores a teacher `REDUIT`.
- `Dades de professors`.`Llista`.`REDUIT` stores the matching teacher short code.
- `Dades de professors`.`Llista`.`ESP` stores the original teacher code used by leave mappings.
- `Dades de professors`.`leave_absence`.`teacher_code` references the original teacher `ESP`.
- `Dades de professors`.`leave_absence`.`substitute_code` references the substitute teacher `REDUIT`.
- Use these relationships to enrich schedule rows with teacher names and metadata and to resolve active substitute coverage.
- A schedule row may have no teacher alias; such rows must remain usable for group, classroom, subject, day, and time-slot views.

## Effective Teacher Resolution

Some features need the stored/source teacher. Other features need the teacher who is actually covering the schedule row after active leave substitution.

Definitions:

- Source teacher: the teacher stored in the source row, usually a `REDUIT` in `Horaris` column 3.
- Original teacher code: `Llista`.`ESP`.
- Substitute code: substitute teacher `Llista`.`REDUIT`.
- Effective teacher: the teacher to display/process after applying active leave mappings.
- Relevant date for active leave resolution in this schedule viewer: today, using the Apps Script/project timezone `Europe/Madrid`.
- Code key: normalized teacher code used for joins. It trims spaces, removes accents, and uppercases values before comparison.

Direct teacher use:

- When a program needs to display or process a teacher directly, use the selected/stored teacher's `REDUIT`.
- Only apply leave mapping when the feature specifically needs original-teacher coverage resolution.

Resolving who covers an original teacher during active leave:

1. Read the original/source teacher code from the relevant timetable/source row.
2. Normalize teacher codes before all comparisons.
3. If the source code is a `REDUIT`, map it to that teacher's `ESP` using `Llista`.
4. Look for an active row in `leave_absence`.
5. Match `leave_absence.teacher_code` against the original teacher `ESP`.
6. As a defensive fallback, also allow `leave_absence.teacher_code` to match the source teacher `REDUIT`.
7. If a matching active leave row is found and its `substitute_code` resolves to a valid teacher `REDUIT`, replace the original teacher with that substitute.
8. If no active leave row is found, keep the original teacher.
9. If the active leave row points to a missing or invalid substitute code, keep the original teacher and do not break the page.

Schedule viewer effective-teacher behavior:

- The schedule viewer should build teacher filters and teacher display values from effective teachers, not from inactive original teachers currently covered by substitutes.
- If a `Horaris` row belongs to an original teacher with an active leave row, use the substitute teacher instead of the original teacher for teacher filtering and cell display.
- Do not show or assign the original teacher while their active leave is covered by a substitute.
- A teacher cannot cover two partners at the same time; active substitute coverage is expected to be exclusive for a substitute on the relevant date.
- Still de-duplicate teachers by `REDUIT` when building filter lists.
- Keep the original/source teacher fields available internally for audit/debugging and for features that need original timetable lookup.

## Admin Schedule Upload

The endpoint must include an administrator-only workflow for replacing the `Horaris`.`GPU001` schedule sheet from a text file.

Deployment/access requirements:

- The web app deployment must execute as the deploying/creator user.
- The web app must be reachable without an interactive Google login so another Apps Script project can call it with `UrlFetchApp`.
- Manifest/deployment access should be anonymous-reachable, using `access: ANYONE_ANONYMOUS` when available.
- Because the deployment is reachable anonymously, write actions must be protected inside the endpoint with a shared token.
- The app reads the active user's email on each request.
- The upload control is visible only when the active user email is `admindomini@iernestlluch.cat`.
- Server-side upload execution must also verify the active user email before changing the spreadsheet. The UI visibility check is not sufficient security by itself.

Upload UI:

- Display a fixed bottom-right button labeled `CARREGAR HORARI` only for `admindomini@iernestlluch.cat`.
- Clicking the button opens a modal dialog with:
  - a file browser for the schedule file
  - a checkbox labeled `Notificar usuaris d'aquesta actualització.`
  - `OK` and `CANCEL` buttons
- The selected file must be named `GPU001.txt`, ignoring case. Valid examples include `GPU001.txt`, `gpu001.txt`, `GPU001.TXT`, and `gpu001.TXT`.
- The client validates the filename before submitting, and the server repeats the same validation.

Upload file:

- `GPU001.txt` is comma-separated.
- `GPU001.txt` is encoded as Western / ISO Latin 1, and the client must read it as `ISO-8859-1`.
- It has exactly the same 7-column structure as the `Horaris`.`GPU001` sheet.
- The 7 upload columns are: row id, class/group, teacher code, subject, classroom, day, time slot.
- Blank lines are ignored.
- Every nonblank row must contain exactly 7 comma-separated columns.
- Trailing empty columns from a text export may be ignored, but non-empty extra columns must be treated as invalid data.

Upload behavior:

1. Resolve the `Horaris` spreadsheet through the normal DB registry flow:
   - script property `db`
   - registry sheet `tables`
   - logical table `Horaris`
   - configured sheet `GPU001`
2. Clear/replace the entire `GPU001` sheet content with the parsed rows from `GPU001.txt`.
3. Resize the sheet to the uploaded row count and 7 columns after writing the data.
4. Rebuild `Horaris`.`schedule_cache` immediately after writing `GPU001`.
5. After a successful upload and cache rebuild, close or leave the modal only long enough to show success feedback, then reload the main endpoint page automatically.
6. Reload must navigate the top window to the canonical Apps Script web app URL returned by the server, with a cache-busting query parameter. Do not rely on `window.location.reload()` inside the HtmlService sandbox, because it may reload the iframe URL and leave a blank page.
7. Reloading the endpoint after upload must show the updated schedule data from `schedule_cache`.

Optional notification:

- If `Notificar usuaris d'aquesta actualització.` is checked, send an email after the sheet is updated.
- The notification recipient is stored in an easy-to-change constant: `mlvillarroya@gmail.com`.
- Email subject: `Canvis als horaris del centre.`
- Plain-text message:
  `Els horaris del centre acaben de ser actualitzats. Per accedir a la nova versió, obre la intranet i ves a la secció "Racó del professor -> Horaris".`
- The HTML email body must live in its own Apps Script HTML template file so it can be edited independently.

## Cache Rebuild Endpoint

The same web app endpoint must accept POST or GET requests that trigger a schedule cache rebuild.

Deployment requirement:

- The web app must execute as the deploying/creator user.
- The web app must be reachable without interactive Google login, because other Apps Script projects call it with `UrlFetchApp`.
- Security for this action is enforced by the endpoint token check, not by Google login.

Request rules:

- The action must be `rebuildScheduleCache`.
- POST payload may be JSON or form-encoded.
- GET query parameters may be used for bookmark/browser access.
- JSON payload example:

```json
{
  "action": "rebuildScheduleCache",
  "token": "optional-shared-token"
}
```

- GET/bookmark URL shape:

```text
WEB_APP_URL?action=rebuildScheduleCache&token=optional-shared-token
```

Authorization rules:

- The request is allowed when the active user is the configured administrator `admindomini@iernestlluch.cat`.
- For script-to-script calls, the request is also allowed when the payload includes `token` matching script property `cache_rebuild_token`.
- If script property `cache_rebuild_token` is not set, token authorization is disabled and only the admin active user can trigger the rebuild.
- Unauthorized requests must return JSON, never an HTML page.

Response rules:

- Response must be JSON.
- Successful response shape:

```json
{
  "ok": true,
  "action": "rebuildScheduleCache",
  "rows": 2308,
  "updatedAt": "2026-07-22T06:00:00.000Z"
}
```

- Failed response shape:

```json
{
  "ok": false,
  "action": "rebuildScheduleCache",
  "error": "Error message"
}
```

Audit log:

- Every GET/POST cache rebuild request must append one row to `Horaris`.`cache_rebuild_log`.
- This log is meant to make endpoint calls inspectable without relying on Apps Script execution logs.
- The token value must never be written to the log.
- Log columns:
  - `timestamp`
  - `method`
  - `action`
  - `ok`
  - `authorized`
  - `authorized_by`
  - `user_email`
  - `has_configured_token`
  - `has_request_token`
  - `token_matches`
  - `rows`
  - `updated_at`
  - `duration_ms`
  - `error`

## Print Schedule

The endpoint must support printing/exporting the currently displayed schedule for non-admin users.

Visibility and state:

- The configured admin user `admindomini@iernestlluch.cat` sees the admin upload button and does not need the `PRINT` button.
- Every non-admin user must see a `PRINT` button.
- The `PRINT` button must be disabled while no combo/filter is selected, because the initial schedule is empty and has no document title.
- The `PRINT` button becomes enabled when a teacher, group, or classroom is selected.

Print/PDF generation:

- Generate the printable document client-side from the schedule currently rendered on screen.
- The printable output should preserve the same visible text and colors as the screen schedule.
- The page size should be A4.
- The document title must be the selected combo label:
  - selected teacher full name for teacher schedules
  - selected group for group schedules
  - selected classroom for classroom schedules
- The printable schedule must keep the weekday columns Monday through Friday.
- Only print time-slot rows that have at least one non-empty schedule cell.
- Empty time-slot rows must be omitted from the printable document.

Guard/substitution candidate behavior:

- If building a list of teachers available for guard/substitution from a timetable, resolve each timetable row to its effective teacher first.
- If a timetable row belongs to an original teacher with an active leave row, use the substitute teacher instead of the original teacher.
- The substitute is identified by `leave_absence.substitute_code`, which is a `REDUIT`.
- Do not duplicate a substitute if they replace more than one matching row; de-duplicate by `REDUIT`.

Absent substitute timetable lookup:

- If a selected absent teacher is a substitute (`SUBST?` true), their own timetable may not exist directly.
- To resolve the timetable for a substitute:
  1. Use the substitute's `REDUIT`.
  2. Find an active `leave_absence` row where `substitute_code` equals that `REDUIT`.
  3. Use the matching `leave_absence.teacher_code` to identify the original teacher.
  4. Resolve the original teacher's timetable using the code format expected by the timetable source.
  5. Store the selected substitute's `REDUIT` as the selected/absent teacher code.
  6. Use the resolved original teacher code only for timetable lookup.

## Current Implementation Notes

The current implementation follows these database and substitution rules:

- Professor constants use the current `Llista` headers:
  - `REDUIT`
  - `SITUACIO`
  - `XTEC`
  - `CORREU`
  - `ACTIU`
  - `JORNADA`
  - `BAIXA?`
  - `SUBST?`
- Both `Dades de professors` sheets are loaded when rebuilding the cache:
  - `Llista`
  - `leave_absence`
- Cache rebuilding builds indexes:
  - teachers by normalized `REDUIT`
  - teachers by normalized `ESP` when needed
  - active leave rows by normalized original `teacher_code`
  - active leave rows by `substitute_code`
- Normalize teacher-code joins by trimming spaces, removing accents, and uppercasing values.
- For leave resolution, first match `leave_absence.teacher_code` against original `ESP`, then defensively against source `REDUIT`.
- Boolean parsing accepts real booleans and string `"TRUE"`.
- Active leave date comparison uses today in `Europe/Madrid`; blank `end_date` means active after `start_date`.
- If an active leave row has a missing/invalid `substitute_code`, fall back to the original teacher without throwing.
- For `Horaris` rows, keep both source teacher and effective teacher:
  - source teacher `REDUIT`
  - source/original teacher `ESP` when resolvable
  - effective teacher `REDUIT`
  - effective teacher full name
- Use effective teacher data for teacher filter options and schedule cell teacher display.
- Sort teacher options by `COGNOM1`, then `COGNOM2`, then `NOM`.
