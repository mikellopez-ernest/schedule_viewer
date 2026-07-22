const SCHEDULE_CACHE_SHEET_NAME = 'schedule_cache';
const SCHEDULE_CACHE_DAILY_TRIGGER_HOUR = 5;

const SCHEDULE_CACHE_HEADERS = [
  'row_id',
  'group',
  'source_teacher_code',
  'source_teacher_name',
  'source_teacher_original_code',
  'effective_teacher_code',
  'effective_teacher_name',
  'teacher_was_substituted',
  'subject_code',
  'subject_full_name',
  'classroom',
  'day',
  'slot',
];

const SCHEDULE_CACHE_COLUMNS = {
  rowId: 'row_id',
  group: 'group',
  sourceTeacherCode: 'source_teacher_code',
  sourceTeacherName: 'source_teacher_name',
  sourceTeacherOriginalCode: 'source_teacher_original_code',
  effectiveTeacherCode: 'effective_teacher_code',
  effectiveTeacherName: 'effective_teacher_name',
  teacherWasSubstituted: 'teacher_was_substituted',
  subjectCode: 'subject_code',
  subjectFullName: 'subject_full_name',
  classroom: 'classroom',
  day: 'day',
  slot: 'slot',
};

function rebuildScheduleCache() {
  const tableRegistry = loadTableRegistry_();
  const scheduleSheet = openTableSheet_(tableRegistry, TABLE_HORARIS);
  const cacheSheet = openScheduleCacheSheet_(tableRegistry);
  const professorsSpreadsheet = openTableSpreadsheet_(tableRegistry, TABLE_PROFESSORS);
  const professorsSheet = openConfiguredSheet_(professorsSpreadsheet, TABLE_PROFESSORS);
  const leaveAbsenceSheet = openSheetByName_(professorsSpreadsheet, PROFESSOR_LEAVE_SHEET_NAME);
  const subjectsSheet = openTableSheet_(tableRegistry, TABLE_CARREGA_LECTIVA);

  const professors = loadProfessors_(professorsSheet);
  const teachersByAlias = indexByCode_(professors, 'alias');
  const activeLeavesByTeacherCode = indexActiveLeavesByTeacherCode_(loadLeaveAbsences_(leaveAbsenceSheet));
  const subjectsByShortName = indexByCode_(loadSubjects_(subjectsSheet), 'shortName');
  const scheduleRows = loadScheduleRows_(
    scheduleSheet,
    teachersByAlias,
    activeLeavesByTeacherCode,
    subjectsByShortName
  );
  const cacheValues = scheduleRows.map(scheduleRowToCacheValues_);

  writeScheduleCache_(cacheSheet, cacheValues);

  return {
    rows: cacheValues.length,
    updatedAt: new Date().toISOString(),
  };
}

function installDailyScheduleCacheTrigger() {
  const handler = 'rebuildScheduleCache';

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyDays(1)
    .atHour(SCHEDULE_CACHE_DAILY_TRIGGER_HOUR)
    .create();

  return {
    handler,
    hour: SCHEDULE_CACHE_DAILY_TRIGGER_HOUR,
  };
}

function openScheduleCacheSheet_(tableRegistry) {
  const scheduleSpreadsheet = openTableSpreadsheet_(tableRegistry, TABLE_HORARIS);
  return openSheetByName_(scheduleSpreadsheet, SCHEDULE_CACHE_SHEET_NAME, 'Table "' + TABLE_HORARIS + '"');
}

function loadScheduleRowsFromCache_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(cleanText_);
  const headerIndex = indexRequiredHeaders_(headers, SCHEDULE_CACHE_HEADERS, 'Schedule cache');

  return values.slice(1)
    .map(function(row) {
      return {
        rowNumber: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.rowId]]),
        group: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.group]]),
        sourceTeacherAlias: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.sourceTeacherCode]]),
        sourceTeacherName: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.sourceTeacherName]]),
        sourceTeacherOriginalCode: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.sourceTeacherOriginalCode]]),
        teacherAlias: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.effectiveTeacherCode]]),
        teacherName: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.effectiveTeacherName]]),
        teacherWasSubstituted: parseBooleanValue_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.teacherWasSubstituted]]),
        subject: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.subjectCode]]),
        subjectCode: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.subjectCode]]),
        subjectName: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.subjectFullName]]),
        classroom: cleanText_(row[headerIndex[SCHEDULE_CACHE_COLUMNS.classroom]]),
        dayNumber: Number(row[headerIndex[SCHEDULE_CACHE_COLUMNS.day]]),
        slotNumber: Number(row[headerIndex[SCHEDULE_CACHE_COLUMNS.slot]]),
      };
    })
    .filter(function(item) {
      return item.dayNumber >= 1 &&
        item.dayNumber <= 5 &&
        item.slotNumber >= 1 &&
        item.slotNumber <= 12;
    });
}

function scheduleRowToCacheValues_(row) {
  return [
    row.rowNumber,
    row.group,
    row.sourceTeacherAlias,
    row.sourceTeacherName,
    row.sourceTeacherOriginalCode,
    row.teacherAlias,
    row.teacherName,
    row.teacherWasSubstituted,
    row.subjectCode,
    row.subjectName,
    row.classroom,
    row.dayNumber,
    row.slotNumber,
  ];
}

function writeScheduleCache_(sheet, values) {
  const output = [SCHEDULE_CACHE_HEADERS].concat(values);
  replaceSheetValues_(sheet, output);
}
