# Horaris schedule_cache Reference

This document describes the generated `Horaris -> schedule_cache` sheet so other Google Apps Script projects can use it instead of reading and resolving `Horaris -> GPU001` directly.

## Purpose

`schedule_cache` is a denormalized effective schedule table.

It starts from each source row in `Horaris -> GPU001`, then adds the teacher and subject information that most apps need:

- source teacher code and name
- original teacher `ESP` code
- effective teacher code and name after active leave/substitute resolution
- subject full name from `Càrrega lectiva -> assignatures`
- a boolean flag indicating whether the row was substituted

The cache deliberately keeps both the source/original teacher and the effective teacher. This is important:

- `source_teacher_*` fields are audit/source fields and still show the original teacher from `GPU001`.
- `effective_teacher_*` fields are operational/display fields and show the substitute when a leave is active.

Other scripts should prefer `schedule_cache` when they need the current visible/effective schedule.

Use `GPU001` directly only when the feature explicitly needs the raw Untis/source timetable without substitutions or subject-name enrichment.

## Location

The database follows the shared registry pattern.

1. Read Apps Script property `db`.
2. Open that spreadsheet ID. This is the database registry spreadsheet.
3. Open the registry sheet named `tables`.
4. Find the row where column A is `Horaris`.
5. Column B of that row is the spreadsheet ID for the `Horaris` database.
6. Open that spreadsheet by ID.
7. Read the sheet named `schedule_cache`.

`schedule_cache` lives in the same spreadsheet as `Horaris -> GPU001`.

## Header

The first row must be:

```csv
row_id,group,source_teacher_code,source_teacher_name,source_teacher_original_code,effective_teacher_code,effective_teacher_name,teacher_was_substituted,subject_code,subject_full_name,classroom,day,slot
```

Data starts in row 2.

## Fields

| Field | Type | Description |
| --- | --- | --- |
| `row_id` | string/number | Original `GPU001` column 1. Source row identifier. |
| `group` | string | Original `GPU001` column 2. School group/class, for example `1A`, `2B`, `4ESO`. |
| `source_teacher_code` | string | Original `GPU001` column 3. Teacher `REDUIT` stored in the raw timetable. |
| `source_teacher_name` | string | Full name of the source teacher from `Dades de professors -> Llista`, built from `NOM COGNOM1 COGNOM2`. Blank or code fallback can appear if the teacher is not found. |
| `source_teacher_original_code` | string | Source/original teacher `ESP` from `Dades de professors -> Llista`. This is the code used by `leave_absence.teacher_code`. |
| `effective_teacher_code` | string | Teacher `REDUIT` after active leave/substitute resolution. Usually equals `source_teacher_code`; when the source teacher is on active leave, this is the substitute's `REDUIT`. |
| `effective_teacher_name` | string | Full name of the effective teacher after substitution resolution. |
| `teacher_was_substituted` | boolean | Real boolean. `true` when an active leave changed the source teacher to a substitute; otherwise `false`. |
| `subject_code` | string | Original `GPU001` column 4. Raw subject short code, for example `MAT`, `TUT`, `GUARDIA`. |
| `subject_full_name` | string | Display subject name from `Càrrega lectiva -> assignatures.full_name`, matched by `assignatures.short_name = subject_code`. Falls back to `subject_code` when no translation exists. |
| `classroom` | string | Original `GPU001` column 5. Classroom code/name. |
| `day` | number | Original `GPU001` column 6. `1` Monday, `2` Tuesday, `3` Wednesday, `4` Thursday, `5` Friday. |
| `slot` | number | Original `GPU001` column 7. Time slot number from `1` to `12`. |

## Source Tables Used To Build It

### Horaris -> GPU001

Raw timetable. No header row.

| Column | Meaning |
| --- | --- |
| 1 | row id |
| 2 | group |
| 3 | teacher `REDUIT` |
| 4 | subject code |
| 5 | classroom |
| 6 | day |
| 7 | slot |

### Dades de professors -> Llista

Teacher table.

Important fields:

| Header | Meaning |
| --- | --- |
| `ESP` | Original teacher code. |
| `NOM` | First name. |
| `COGNOM1` | First surname. |
| `COGNOM2` | Second surname. |
| `REDUIT` | Short teacher code used by `GPU001`. |
| `ACTIU` | Active flag. |
| `BAIXA?` | Leave flag. |
| `SUBST?` | Substitute flag. |

Teacher full name is built by joining nonblank `NOM`, `COGNOM1`, and `COGNOM2` with spaces.

### Dades de professors -> leave_absence

Leave/substitute mapping.

| Header | Meaning |
| --- | --- |
| `teacher_code` | Original teacher `ESP`. |
| `substitute_code` | Substitute teacher `REDUIT`. |
| `start_date` | Leave start date. |
| `end_date` | Leave end date. Blank means still active. |

A leave is active when today in `Europe/Madrid` is between `start_date` and `end_date`, inclusive. If `end_date` is blank, the leave is still active.

### Càrrega lectiva -> assignatures

Subject catalog.

| Header | Meaning |
| --- | --- |
| `short_name` | Raw subject code from `GPU001`. |
| `full_name` | Display subject name. |

## Effective Teacher Logic

`GPU001` stores the teacher in column 3 as `REDUIT`.

When building `schedule_cache`, each row resolves the source teacher like this:

1. Read `source_teacher_code` from `GPU001` column 3.
2. Match it to `Dades de professors -> Llista.REDUIT`.
3. Read that teacher's original `ESP`.
4. Look for an active `leave_absence` row where `teacher_code` equals that `ESP`.
5. If an active leave exists, read `substitute_code`.
6. Match `substitute_code` to `Llista.REDUIT`.
7. If the substitute exists, set `effective_teacher_code` and `effective_teacher_name` to the substitute.
8. If no active leave exists, or the substitute code is invalid, keep the source teacher as the effective teacher.

Teacher-code comparisons should be normalized:

- trim spaces
- remove accents
- uppercase

The current schedule viewer also defensively allows `leave_absence.teacher_code` to match the source `REDUIT` if the expected `ESP` match is not found. New apps should still write and expect `leave_absence.teacher_code` as `ESP`.

### Substitution Example

If `GPU001` contains teacher `ESCANG`, and `leave_absence` says that teacher is currently covered by substitute `MAREXP`, a cache row may contain:

```text
source_teacher_code=ESCANG
source_teacher_name=Gemma Escudé Pont
source_teacher_original_code=Ang
effective_teacher_code=MAREXP
effective_teacher_name=Alba Martínez López
teacher_was_substituted=TRUE
```

This is the expected successful result. Gemma remains in the source fields because she is the original timetable owner. Alba appears in the effective fields because she is the teacher currently used for filters and display.

## How To Use It

### Teacher Schedule

Filter rows by:

```text
effective_teacher_code == selectedTeacherReduit
```

Use these fields for display:

- `subject_full_name`
- `group`
- `classroom`

This shows the current real teacher responsible for the timetable row, including active substitutes.

### Group Schedule

Filter rows by:

```text
group == selectedGroup
```

Use these fields for display:

- `subject_full_name`
- `effective_teacher_name`
- `classroom`

Use `effective_teacher_name`, not `source_teacher_name`, when the UI should show who is currently covering the lesson.

### Classroom Schedule

Filter rows by:

```text
classroom == selectedClassroom
```

Use these fields for display:

- `subject_full_name`
- `effective_teacher_name`
- `group`

### Subject Schedule

Filter rows by:

```text
subject_code == selectedSubjectCode
```

Use these fields for display:

- `effective_teacher_name`
- `group`
- `classroom`

Keep `subject_code` as the stable filter value. Use `subject_full_name` only as the label/display value.

## Choosing Source vs Effective Teacher

Use `effective_teacher_code` and `effective_teacher_name` for normal schedule display, guard/substitution candidate lists, and anything that should reflect active substitutions.

Use `source_teacher_code`, `source_teacher_name`, and `source_teacher_original_code` when you need to audit the raw timetable or understand who the row originally belonged to.

Do not infer substitute status from teacher names or `SITUACIO`. Use `teacher_was_substituted` for this cache row, and use `Dades de professors -> Llista.SUBST?` when you need to know whether a teacher is marked as a substitute in the teacher database.

## Rebuild Rules

The cache must be rebuilt whenever source data that affects effective schedules changes:

- after replacing `Horaris -> GPU001`
- after changing active leave rows in `Dades de professors -> leave_absence`
- after changing teacher codes/names in `Dades de professors -> Llista`
- after changing subject names in `Càrrega lectiva -> assignatures`
- daily, so open-ended or newly ended leave periods are reflected by date

In this project:

- `rebuildScheduleCache()` regenerates the cache.
- `installDailyScheduleCacheTrigger()` installs a daily trigger for `rebuildScheduleCache`.
- uploading `GPU001.txt` calls `rebuildScheduleCache()` immediately.

## Notes For Other Apps

- Treat `schedule_cache` as generated, read-only data.
- Do not manually edit cache rows.
- If you need fresh data immediately after editing leave or teacher tables, call or trigger `rebuildScheduleCache()`.
- If another app cannot call this project's function directly, it can still read the cache as long as it uses the same DB registry spreadsheet and has permission to read the `Horaris` spreadsheet.
- Blank teacher codes can exist in the raw timetable. Other apps should tolerate blank `source_teacher_code` and blank `effective_teacher_code`.
- Use `day` and `slot` as numbers for schedule grid placement.
- Keep `row_id` as an identifier, not as a unique key. Multiple source rows can share the same visual cell or be grouped in the UI.
