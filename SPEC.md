# Schedule Viewer Specs

## Goal

The script must expose an HTTP endpoint that renders an HTML page showing schedules.

The page must support viewing and filtering schedules by:

- teacher
- school group
- classroom
- subject

## Endpoint Behavior

The Apps Script web endpoint must:

1. Load the data for `Horaris` and `Dades de professors` into memory for the request.
2. Always resolve and read those tables from the Google Spreadsheet database identified by the `db` script property.
3. Render a responsive HTML page.
4. Show four select controls:
   - teacher
   - school group
   - classroom
   - subject
5. Build the available select values from the in-memory `Horaris`, `Dades de professors`.`Llista`, and `Dades de professors`.`leave_absence` data.
6. Reset the other three select controls whenever one select control receives a value.
7. Provide a clear/reset button that clears all select controls and returns the schedule table to the initial empty state.
8. Present the schedule as a grid:
   - rows are time slots `1` through `12`
   - columns are weekdays Monday through Friday
9. Always show all 12 time-slot rows, even when a row has no matching schedule item.
10. Show matching schedule information in the relevant day/time cell when a filter is active.

Filtering rules:

- Teacher filter matches the effective teacher code for a schedule row. The stored/source teacher code in `Horaris` column 3 is a `REDUIT`; if that teacher is on active leave, resolve to the substitute `REDUIT` before filtering/displaying.
- School group filter matches `Horaris` column 2.
- Classroom filter matches `Horaris` column 5.
- Subject filter matches `Horaris` column 4.
- Only one filter is active at a time because selecting a value in one combo resets the other combos.
- With no active filter, including the fresh endpoint start and after clear/reset, the table shows the 12 time-slot rows and Monday-Friday columns but no schedule items.

Select control rules:

- Teacher select values must filter by teacher `REDUIT`, but labels must show the teacher full name.
- Teacher full name is built from `Dades de professors`.`Llista`: `NOM` + `COGNOM1` + `COGNOM2`.
- Sort teacher labels by `COGNOM1`, then `COGNOM2`, then `NOM`.
- Include teachers that are relevant after active-leave substitution resolution. Do not show an original teacher for timetable rows currently covered by a substitute.
- Group, classroom, and subject select values are built from distinct values in `Horaris`.

Schedule cell display rules:

- Each matching schedule item must display its visible row information vertically.
- Do not show placeholder labels or placeholder values for empty group/classroom/teacher fields.
- Do not show labels such as `Group:`, `Teacher:`, or `Classroom:` inside schedule cells.
- The visible format depends on the active filter:
  - teacher filter: `SUBJECT` / `group or grouped groups` / `classroom`
  - group filter: `SUBJECT` / `teacher or grouped teachers` / `classroom`
  - classroom filter: `SUBJECT` / `teacher or grouped teachers` / `group or grouped groups`
  - subject filter: `TEACHER` / `group or grouped groups` / `classroom`
- Teacher values inside cells must use the full teacher name when the alias can be resolved, and the alias when it cannot.
- When multiple matching items share the same day/time and the same stable visible identity, show one item and group the repeated visible values.
- If multiple matching items remain distinct after grouping, show each item separately inside that cell.

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

## Table: `Horaris`

`Horaris` is the main schedule table. It contains one row per scheduled subject occurrence.

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

## Implementation Changes Needed

To adapt the current project to the updated database:

- Update professor constants from old headers to new headers:
  - `REDUÏT` -> `REDUIT`
  - `SITUACIÓ` -> `SITUACIO`
  - `CORREU XTEC` -> `XTEC`
  - `CORREU INSTIT` -> `CORREU`
  - `ACTIVE` -> `ACTIU`
  - add `JORNADA`, `BAIXA?`, and `SUBST?`
- Load both `Dades de professors` sheets:
  - `Llista`
  - `leave_absence`
- Build indexes:
  - teachers by normalized `REDUIT`
  - teachers by normalized `ESP` when needed
  - active leave rows by normalized original `teacher_code`
  - active leave rows by `substitute_code`
- Normalize teacher-code joins by trimming spaces, removing accents, and uppercasing values.
- For leave resolution, first match `leave_absence.teacher_code` against original `ESP`, then defensively against source `REDUIT`.
- Add robust boolean parsing for real booleans and string `"TRUE"`.
- Add date parsing/comparison for active leave windows using today in `Europe/Madrid`; blank `end_date` means active after `start_date`.
- If an active leave row has a missing/invalid `substitute_code`, fall back to the original teacher without throwing.
- For `Horaris` rows, keep both source teacher and effective teacher:
  - source teacher `REDUIT`
  - source/original teacher `ESP` when resolvable
  - effective teacher `REDUIT`
  - effective teacher full name
- Use effective teacher data for teacher filter options and schedule cell teacher display.
- Sort teacher options by `COGNOM1`, then `COGNOM2`, then `NOM`.
