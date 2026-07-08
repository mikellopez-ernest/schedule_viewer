const SCRIPT_PROP_DB = 'db';
const TABLES_SHEET_NAME = 'tables';
const TABLE_HORARIS = 'Horaris';
const TABLE_PROFESSORS = 'Dades de professors';

const TABLE_SHEETS = {
  [TABLE_HORARIS]: 'GPU001',
  [TABLE_PROFESSORS]: 'Llista',
};

const PROFESSOR_LEAVE_SHEET_NAME = 'leave_absence';

const HORARIS_COLUMNS = {
  rowNumber: 0,
  group: 1,
  teacherAlias: 2,
  subject: 3,
  classroom: 4,
  dayNumber: 5,
  slotNumber: 6,
};

const PROFESSOR_COLUMNS = {
  originalCode: 'ESP',
  department: 'DEPT.',
  firstName: 'NOM',
  surname1: 'COGNOM1',
  surname2: 'COGNOM2',
  alias: 'REDUIT',
  status: 'SITUACIO',
  workload: 'JORNADA',
  dni: 'DNI',
  phone: 'TELF',
  xtecEmail: 'XTEC',
  institutionEmail: 'CORREU',
  newFlag: 'NOUS',
  activeFlag: 'ACTIU',
  leaveFlag: 'BAIXA?',
  substituteFlag: 'SUBST?',
};

const LEAVE_ABSENCE_COLUMNS = {
  rowId: 'row_id',
  teacherCode: 'teacher_code',
  substituteCode: 'substitute_code',
  startDate: 'start_date',
  endDate: 'end_date',
  comments: 'comments',
};

function doGet() {
  const appData = loadScheduleViewerData_();
  const template = HtmlService.createTemplateFromFile('Index');
  template.bootstrapJson = safeJsonForHtml_(appData);

  return template
    .evaluate()
    .setTitle('Schedule Viewer')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function loadScheduleViewerData_() {
  const tableRegistry = loadTableRegistry_();

  const scheduleSheet = openTableSheet_(tableRegistry, TABLE_HORARIS);
  const professorsSpreadsheet = openTableSpreadsheet_(tableRegistry, TABLE_PROFESSORS);
  const professorsSheet = openConfiguredSheet_(professorsSpreadsheet, TABLE_PROFESSORS);
  const leaveAbsenceSheet = openSheetByName_(professorsSpreadsheet, PROFESSOR_LEAVE_SHEET_NAME);

  const professors = loadProfessors_(professorsSheet);
  const leaveAbsences = loadLeaveAbsences_(leaveAbsenceSheet);
  const teachersByAlias = indexByCode_(professors, 'alias');
  const activeLeavesByTeacherCode = indexActiveLeavesByTeacherCode_(leaveAbsences);
  const scheduleRows = loadScheduleRows_(
    scheduleSheet,
    teachersByAlias,
    activeLeavesByTeacherCode
  );

  return {
    generatedAt: new Date().toISOString(),
    tables: {
      schedule: TABLE_HORARIS,
      professors: TABLE_PROFESSORS,
    },
    days: [
      { value: 1, label: 'Monday' },
      { value: 2, label: 'Tuesday' },
      { value: 3, label: 'Wednesday' },
      { value: 4, label: 'Thursday' },
      { value: 5, label: 'Friday' },
    ],
    slots: buildNumberRange_(1, 12),
    filters: buildFilterOptions_(scheduleRows, teachersByAlias),
    teachersByAlias,
    scheduleRows,
  };
}

function loadTableRegistry_() {
  const dbSpreadsheetId = getDatabaseSpreadsheetId_();
  const dbSpreadsheet = SpreadsheetApp.openById(dbSpreadsheetId);
  const sheet = dbSpreadsheet.getSheetByName(TABLES_SHEET_NAME);

  if (!sheet) {
    throw new Error('Database spreadsheet is missing sheet "' + TABLES_SHEET_NAME + '".');
  }

  const values = sheet.getDataRange().getDisplayValues();
  const registry = {};

  values.forEach(function(row) {
    const tableName = cleanText_(row[0]);
    const spreadsheetId = cleanText_(row[1]);

    if (tableName && spreadsheetId) {
      registry[tableName] = spreadsheetId;
    }
  });

  return registry;
}

function getDatabaseSpreadsheetId_() {
  const dbSpreadsheetId = cleanText_(
    PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_DB)
  );

  if (!dbSpreadsheetId) {
    throw new Error('Missing script property "' + SCRIPT_PROP_DB + '" with the database spreadsheet ID.');
  }

  return dbSpreadsheetId;
}

function openTableSpreadsheet_(tableRegistry, tableName) {
  const spreadsheetId = tableRegistry[tableName];

  if (!spreadsheetId) {
    throw new Error('Table "' + tableName + '" was not found in the table registry.');
  }

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error(
      'Table "' + tableName + '" points to spreadsheet ID "' + spreadsheetId +
      '", but it could not be opened. Original error: ' + error.message
    );
  }

  return spreadsheet;
}

function openTableSheet_(tableRegistry, tableName) {
  const spreadsheet = openTableSpreadsheet_(tableRegistry, tableName);
  return openConfiguredSheet_(spreadsheet, tableName);
}

function openConfiguredSheet_(spreadsheet, tableName) {
  const sheetName = TABLE_SHEETS[tableName];

  if (!sheetName) {
    throw new Error('No sheet name has been configured for table "' + tableName + '".');
  }

  return openSheetByName_(spreadsheet, sheetName, 'Table "' + tableName + '"');
}

function openSheetByName_(spreadsheet, sheetName, context) {
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error((context || 'Spreadsheet') + ' is missing sheet "' + sheetName + '".');
  }

  return sheet;
}

function loadScheduleRows_(sheet, teachersByAlias, activeLeavesByTeacherCode) {
  const values = sheet.getDataRange().getDisplayValues();

  return values
    .map(function(row) {
      const sourceTeacherAlias = cleanText_(row[HORARIS_COLUMNS.teacherAlias]);
      const sourceTeacher = sourceTeacherAlias ? teachersByAlias[codeKey_(sourceTeacherAlias)] : null;
      const effectiveTeacher = resolveEffectiveTeacher_(
        sourceTeacher,
        sourceTeacherAlias,
        teachersByAlias,
        activeLeavesByTeacherCode
      );
      const effectiveTeacherAlias = effectiveTeacher ? effectiveTeacher.alias : sourceTeacherAlias;

      return {
        rowNumber: cleanText_(row[HORARIS_COLUMNS.rowNumber]),
        group: cleanText_(row[HORARIS_COLUMNS.group]),
        sourceTeacherAlias,
        sourceTeacherOriginalCode: sourceTeacher ? sourceTeacher.originalCode : '',
        teacherAlias: effectiveTeacherAlias,
        teacherName: effectiveTeacher ? effectiveTeacher.fullName : effectiveTeacherAlias,
        teacherWasSubstituted: Boolean(
          sourceTeacher &&
          effectiveTeacher &&
          sourceTeacher.alias !== effectiveTeacher.alias
        ),
        subject: cleanText_(row[HORARIS_COLUMNS.subject]),
        classroom: cleanText_(row[HORARIS_COLUMNS.classroom]),
        dayNumber: Number(row[HORARIS_COLUMNS.dayNumber]),
        slotNumber: Number(row[HORARIS_COLUMNS.slotNumber]),
      };
    })
    .filter(function(item) {
      return item.dayNumber >= 1 &&
        item.dayNumber <= 5 &&
        item.slotNumber >= 1 &&
        item.slotNumber <= 12;
    });
}

function loadProfessors_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(cleanText_);
  const headerIndex = indexHeaders_(headers);

  return values.slice(1)
    .map(function(row) {
      const alias = cleanText_(row[headerIndex[PROFESSOR_COLUMNS.alias]]);
      const originalCode = cleanText_(row[headerIndex[PROFESSOR_COLUMNS.originalCode]]);
      const firstName = cleanText_(row[headerIndex[PROFESSOR_COLUMNS.firstName]]);
      const surname1 = cleanText_(row[headerIndex[PROFESSOR_COLUMNS.surname1]]);
      const surname2 = cleanText_(row[headerIndex[PROFESSOR_COLUMNS.surname2]]);
      const active = parseBooleanValue_(row[headerIndex[PROFESSOR_COLUMNS.activeFlag]]);
      const substitute = parseBooleanValue_(row[headerIndex[PROFESSOR_COLUMNS.substituteFlag]]);

      return {
        alias,
        originalCode,
        fullName: [firstName, surname1, surname2].filter(Boolean).join(' ') || alias,
        sortKey: [surname1, surname2, firstName, alias].join('\u001f'),
        firstName,
        surname1,
        surname2,
        department: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.department]]),
        workload: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.workload]]),
        dni: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.dni]]),
        phone: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.phone]]),
        xtecEmail: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.xtecEmail]]),
        institutionEmail: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.institutionEmail]]),
        status: cleanText_(row[headerIndex[PROFESSOR_COLUMNS.status]]),
        isNew: parseBooleanValue_(row[headerIndex[PROFESSOR_COLUMNS.newFlag]]),
        active,
        onLeave: parseBooleanValue_(row[headerIndex[PROFESSOR_COLUMNS.leaveFlag]]),
        substitute,
        eligibleSubstitute: substitute && active,
      };
    })
    .filter(function(professor) {
      return professor.alias;
    });
}

function indexHeaders_(headers) {
  return indexRequiredHeaders_(headers, [
    PROFESSOR_COLUMNS.originalCode,
    PROFESSOR_COLUMNS.alias,
    PROFESSOR_COLUMNS.firstName,
    PROFESSOR_COLUMNS.surname1,
    PROFESSOR_COLUMNS.surname2,
  ], 'Professor table');
}

function loadLeaveAbsences_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(cleanText_);
  const headerIndex = indexRequiredHeaders_(headers, [
    LEAVE_ABSENCE_COLUMNS.teacherCode,
    LEAVE_ABSENCE_COLUMNS.substituteCode,
    LEAVE_ABSENCE_COLUMNS.startDate,
    LEAVE_ABSENCE_COLUMNS.endDate,
  ], 'leave_absence');
  const todayKey = getTodayDateKey_();

  return values.slice(1)
    .map(function(row) {
      const startDateKey = dateKey_(row[headerIndex[LEAVE_ABSENCE_COLUMNS.startDate]]);
      const endDateKey = dateKey_(row[headerIndex[LEAVE_ABSENCE_COLUMNS.endDate]]);

      return {
        rowId: cleanText_(row[headerIndex[LEAVE_ABSENCE_COLUMNS.rowId]]),
        teacherCode: cleanText_(row[headerIndex[LEAVE_ABSENCE_COLUMNS.teacherCode]]),
        substituteCode: cleanText_(row[headerIndex[LEAVE_ABSENCE_COLUMNS.substituteCode]]),
        startDateKey,
        endDateKey,
        comments: cleanText_(row[headerIndex[LEAVE_ABSENCE_COLUMNS.comments]]),
        active: isLeaveActive_(startDateKey, endDateKey, todayKey),
      };
    })
    .filter(function(leave) {
      return leave.teacherCode && leave.active;
    });
}

function indexRequiredHeaders_(headers, requiredHeaders, tableLabel) {
  const index = {};

  headers.forEach(function(header, position) {
    index[cleanText_(header)] = position;
    index[normalizeHeader_(header)] = position;
  });

  requiredHeaders.forEach(function(requiredHeader) {
    const normalizedHeader = normalizeHeader_(requiredHeader);

    if (index[normalizedHeader] === undefined) {
      throw new Error((tableLabel || 'Table') + ' is missing required header "' + requiredHeader + '".');
    }

    index[cleanText_(requiredHeader)] = index[normalizedHeader];
  });

  return index;
}

function normalizeHeader_(header) {
  return cleanText_(header)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function indexActiveLeavesByTeacherCode_(leaveAbsences) {
  return leaveAbsences.reduce(function(index, leave) {
    const teacherCodeKey = codeKey_(leave.teacherCode);

    if (teacherCodeKey && !index[teacherCodeKey]) {
      index[teacherCodeKey] = leave;
    }

    return index;
  }, {});
}

function resolveEffectiveTeacher_(
  sourceTeacher,
  sourceTeacherAlias,
  teachersByAlias,
  activeLeavesByTeacherCode
) {
  if (!sourceTeacher) {
    return sourceTeacherAlias ? teachersByAlias[codeKey_(sourceTeacherAlias)] : null;
  }

  const originalCode = sourceTeacher.originalCode;
  const activeLeave = activeLeavesByTeacherCode[codeKey_(originalCode)] ||
    activeLeavesByTeacherCode[codeKey_(sourceTeacher.alias)];

  if (!activeLeave || !activeLeave.substituteCode) {
    return sourceTeacher;
  }

  return teachersByAlias[codeKey_(activeLeave.substituteCode)] || sourceTeacher;
}

function buildFilterOptions_(scheduleRows, teachersByAlias) {
  const teacherAliases = uniqueSorted_(
    scheduleRows
      .map(function(row) {
        return row.teacherAlias;
      })
      .filter(Boolean),
    function(alias) {
      const teacher = teachersByAlias[codeKey_(alias)];
      return teacher ? teacher.sortKey : alias;
    }
  );

  return {
    teachers: teacherAliases.map(function(alias) {
      const teacher = teachersByAlias[codeKey_(alias)];

      return {
        value: alias,
        label: teacher ? teacher.fullName : alias,
      };
    }),
    groups: valuesToOptions_(scheduleRows, 'group'),
    classrooms: valuesToOptions_(scheduleRows, 'classroom'),
    subjects: valuesToOptions_(scheduleRows, 'subject'),
  };
}

function valuesToOptions_(rows, key) {
  return uniqueSorted_(
    rows
      .map(function(row) {
        return row[key];
      })
      .filter(Boolean)
  ).map(function(value) {
    return {
      value,
      label: value,
    };
  });
}

function uniqueSorted_(values, labelResolver) {
  const seen = {};

  values.forEach(function(value) {
    seen[value] = true;
  });

  return Object.keys(seen).sort(function(left, right) {
    const leftLabel = labelResolver ? labelResolver(left) : left;
    const rightLabel = labelResolver ? labelResolver(right) : right;

    return leftLabel.localeCompare(rightLabel, 'ca', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function indexBy_(items, key) {
  return items.reduce(function(index, item) {
    if (item[key]) {
      index[item[key]] = item;
    }

    return index;
  }, {});
}

function indexByCode_(items, key) {
  return items.reduce(function(index, item) {
    const valueKey = codeKey_(item[key]);

    if (valueKey) {
      index[valueKey] = item;
    }

    return index;
  }, {});
}

function buildNumberRange_(start, end) {
  const result = [];

  for (let value = start; value <= end; value += 1) {
    result.push(value);
  }

  return result;
}

function cleanText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function codeKey_(value) {
  return cleanText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseBooleanValue_(value) {
  return value === true || cleanText_(value).toUpperCase() === 'TRUE';
}

function getTodayDateKey_() {
  const timezone = Session.getScriptTimeZone() || 'Europe/Madrid';
  return Utilities.formatDate(new Date(), timezone, 'yyyyMMdd');
}

function dateKey_(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Europe/Madrid', 'yyyyMMdd');
  }

  const text = cleanText_(value);
  if (!text) {
    return '';
  }

  const isoMatch = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    return isoMatch[1] +
      String(isoMatch[2]).padStart(2, '0') +
      String(isoMatch[3]).padStart(2, '0');
  }

  const localMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (localMatch) {
    return localMatch[3] +
      String(localMatch[2]).padStart(2, '0') +
      String(localMatch[1]).padStart(2, '0');
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone() || 'Europe/Madrid', 'yyyyMMdd');
  }

  return '';
}

function isLeaveActive_(startDateKey, endDateKey, todayKey) {
  if (!startDateKey) {
    return false;
  }

  return startDateKey <= todayKey && (!endDateKey || todayKey <= endDateKey);
}

function safeJsonForHtml_(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
