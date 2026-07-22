const SCRIPT_PROP_DB = 'db';
const TABLES_SHEET_NAME = 'tables';
const TABLE_HORARIS = 'Horaris';
const TABLE_PROFESSORS = 'Dades de professors';
const TABLE_CARREGA_LECTIVA = 'Càrrega lectiva';
const ADMIN_EMAIL = 'admindomini@iernestlluch.cat';
const CACHE_REBUILD_TOKEN_PROPERTY = 'cache_rebuild_token';
const CACHE_REBUILD_LOG_SHEET_NAME = 'cache_rebuild_log';
const SCHEDULE_UPLOAD_FILENAME = 'GPU001.txt';
const SCHEDULE_UPLOAD_FILENAME_KEY = SCHEDULE_UPLOAD_FILENAME.toUpperCase();
const SCHEDULE_UPLOAD_COLUMN_COUNT = 7;
const SCHEDULE_UPDATE_NOTIFICATION_EMAIL = 'mlvillarroya@gmail.com';
const SCHEDULE_UPDATE_EMAIL_SUBJECT = 'Canvis als horaris del centre.';
const SCHEDULE_UPDATE_EMAIL_TEMPLATE = 'ScheduleUpdateEmail';
const SCHEDULE_UPDATE_EMAIL_TEXT =
  'Els horaris del centre acaben de ser actualitzats. Per accedir a la nova versió, ' +
  'obre la intranet i ves a la secció "Racó del professor -> Horaris".';

const TABLE_SHEETS = {
  [TABLE_HORARIS]: 'GPU001',
  [TABLE_PROFESSORS]: 'Llista',
  [TABLE_CARREGA_LECTIVA]: 'assignatures',
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

const SUBJECT_COLUMNS = {
  shortName: 'short_name',
  stage: 'ETAPA',
  fullName: 'full_name',
  untisName: 'untis_name',
  trueSubject: 'true_subject',
};

const CACHE_REBUILD_LOG_HEADERS = [
  'timestamp',
  'method',
  'action',
  'ok',
  'authorized',
  'authorized_by',
  'user_email',
  'has_configured_token',
  'has_request_token',
  'token_matches',
  'rows',
  'updated_at',
  'duration_ms',
  'error',
];

function doGet(e) {
  const action = cleanText_(e && e.parameter && e.parameter.action);
  console.log(JSON.stringify({
    event: 'doGet_received',
    action,
    hasToken: Boolean(e && e.parameter && e.parameter.token),
    parameterKeys: Object.keys((e && e.parameter) || {}),
  }));

  if (action === 'rebuildScheduleCache') {
    return handleCacheRebuildRequest_(e && e.parameter, 'GET');
  }

  const template = HtmlService.createTemplateFromFile('Index');

  return template
    .evaluate()
    .setTitle('Schedule Viewer')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const payload = parsePostPayload_(e);
  const action = cleanText_(payload.action || (e && e.parameter && e.parameter.action));
  console.log(JSON.stringify({
    event: 'doPost_received',
    action,
    hasToken: Boolean(payload.token),
    parameterKeys: Object.keys(payload || {}),
  }));

  if (action === 'rebuildScheduleCache') {
    return handleCacheRebuildRequest_(payload, 'POST');
  }

  return jsonResponse_({
    ok: false,
    action,
    error: 'Unsupported POST action "' + action + '".',
  });
}

function getScheduleViewerData() {
  return loadScheduleViewerData_();
}

function loadScheduleViewerData_() {
  const tableRegistry = loadTableRegistry_();
  const userEmail = getActiveUserEmail_();

  const cacheSheet = openScheduleCacheSheet_(tableRegistry);
  let scheduleRows = loadScheduleRowsFromCache_(cacheSheet);

  if (!scheduleRows.length) {
    rebuildScheduleCache();
    scheduleRows = loadScheduleRowsFromCache_(cacheSheet);
  }

  return {
    generatedAt: new Date().toISOString(),
    tables: {
      schedule: TABLE_HORARIS,
      professors: TABLE_PROFESSORS,
      subjects: TABLE_CARREGA_LECTIVA,
    },
    user: {
      email: userEmail,
      isAdmin: isAdminUser_(userEmail),
    },
    days: [
      { value: 1, label: 'Monday' },
      { value: 2, label: 'Tuesday' },
      { value: 3, label: 'Wednesday' },
      { value: 4, label: 'Thursday' },
      { value: 5, label: 'Friday' },
    ],
    slots: buildNumberRange_(1, 12),
    filters: buildFilterOptions_(scheduleRows),
    scheduleRows,
  };
}

function uploadScheduleFile(payload) {
  const userEmail = getActiveUserEmail_();

  if (!isAdminUser_(userEmail)) {
    throw new Error('Only the schedule administrator can upload timetable files.');
  }

  const filename = cleanText_(payload && payload.filename);
  const content = String(payload && payload.content !== undefined ? payload.content : '');
  const notify = Boolean(payload && payload.notify);

  if (filename.toUpperCase() !== SCHEDULE_UPLOAD_FILENAME_KEY) {
    throw new Error('The uploaded file must be named exactly "' + SCHEDULE_UPLOAD_FILENAME + '".');
  }

  const rows = parseScheduleUpload_(content);
  const scheduleSheet = openTableSheet_(loadTableRegistry_(), TABLE_HORARIS);
  replaceSheetValues_(scheduleSheet, rows);
  const cacheResult = rebuildScheduleCache();

  if (notify) {
    sendScheduleUpdateNotification_();
  }

  return {
    rows: rows.length,
    cacheRows: cacheResult.rows,
    notified: notify,
    updatedAt: new Date().toISOString(),
    reloadUrl: buildReloadUrl_(),
  };
}

function buildReloadUrl_() {
  const serviceUrl = cleanText_(ScriptApp.getService().getUrl());

  if (!serviceUrl) {
    return '';
  }

  return serviceUrl + (serviceUrl.indexOf('?') === -1 ? '?' : '&') + 'refresh=' + Date.now();
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

function getActiveUserEmail_() {
  try {
    return cleanText_(Session.getActiveUser().getEmail()).toLowerCase();
  } catch (error) {
    return '';
  }
}

function isAdminUser_(email) {
  return cleanText_(email).toLowerCase() === ADMIN_EMAIL;
}

function handleCacheRebuildRequest_(payload, method) {
  const action = 'rebuildScheduleCache';
  const startTime = new Date();
  const audit = {
    timestamp: startTime.toISOString(),
    method: method || '',
    action,
    hasRequestToken: Boolean(payload && payload.token),
  };

  console.log(JSON.stringify({
    event: 'cache_rebuild_request_received',
    action,
    method: audit.method,
    hasToken: Boolean(payload && payload.token),
    payloadKeys: Object.keys(payload || {}),
    startedAt: startTime.toISOString(),
  }));

  try {
    const authorization = getCacheRebuildAuthorization_(payload);
    Object.assign(audit, authorization);

    if (!authorization.authorized) {
      throw new Error(
        'Not authorized to rebuild the schedule cache. Use the admin account or provide a valid "' +
        CACHE_REBUILD_TOKEN_PROPERTY + '" token.'
      );
    }

    console.log(JSON.stringify({
      event: 'cache_rebuild_authorized',
      action,
      method: audit.method,
      authorizedBy: authorization.authorizedBy,
      authorizedAt: new Date().toISOString(),
    }));

    const result = rebuildScheduleCache();
    const finishedAt = new Date();
    audit.ok = true;
    audit.rows = result.rows;
    audit.updatedAt = result.updatedAt;
    audit.durationMs = finishedAt.getTime() - startTime.getTime();

    console.log(JSON.stringify({
      event: 'cache_rebuild_success',
      action,
      rows: result.rows,
      updatedAt: result.updatedAt,
      durationMs: audit.durationMs,
      finishedAt: finishedAt.toISOString(),
    }));

    return jsonResponse_({
      ok: true,
      action,
      rows: result.rows,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    audit.ok = false;
    audit.error = error && error.message ? error.message : String(error);
    audit.durationMs = new Date().getTime() - startTime.getTime();

    console.error(JSON.stringify({
      event: 'cache_rebuild_error',
      action,
      method: audit.method,
      error: audit.error,
      durationMs: audit.durationMs,
    }));

    return jsonResponse_({
      ok: false,
      action,
      error: audit.error,
    });
  } finally {
    writeCacheRebuildAudit_(audit);
  }
}

function getCacheRebuildAuthorization_(payload) {
  const userEmail = getActiveUserEmail_();
  const isAdmin = isAdminUser_(userEmail);
  const configuredToken = cleanText_(
    PropertiesService.getScriptProperties().getProperty(CACHE_REBUILD_TOKEN_PROPERTY)
  );
  const requestToken = cleanText_(payload && payload.token);
  const tokenMatches = Boolean(configuredToken && requestToken && requestToken === configuredToken);
  const authorized = isAdmin || tokenMatches;
  const authorizedBy = isAdmin ? 'admin' : tokenMatches ? 'token' : '';

  console.log(JSON.stringify({
    event: 'cache_rebuild_authorization_check',
    userEmail,
    isAdmin,
    hasConfiguredToken: Boolean(configuredToken),
    hasRequestToken: Boolean(requestToken),
    tokenMatches,
    authorized,
    authorizedBy,
  }));

  if (isAdmin) {
    console.log(JSON.stringify({
      event: 'cache_rebuild_authorized_by_admin',
      userEmail,
    }));
  }

  if (tokenMatches) {
    console.log(JSON.stringify({
      event: 'cache_rebuild_authorized_by_token',
    }));
  }

  return {
    userEmail,
    authorized,
    authorizedBy,
    hasConfiguredToken: Boolean(configuredToken),
    hasRequestToken: Boolean(requestToken),
    tokenMatches,
  };
}

function writeCacheRebuildAudit_(audit) {
  try {
    const tableRegistry = loadTableRegistry_();
    const spreadsheet = openTableSpreadsheet_(tableRegistry, TABLE_HORARIS);
    let sheet = spreadsheet.getSheetByName(CACHE_REBUILD_LOG_SHEET_NAME);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(CACHE_REBUILD_LOG_SHEET_NAME);
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, CACHE_REBUILD_LOG_HEADERS.length).setValues([CACHE_REBUILD_LOG_HEADERS]);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      audit.timestamp || new Date().toISOString(),
      audit.method || '',
      audit.action || '',
      Boolean(audit.ok),
      Boolean(audit.authorized),
      audit.authorizedBy || '',
      audit.userEmail || '',
      Boolean(audit.hasConfiguredToken),
      Boolean(audit.hasRequestToken),
      Boolean(audit.tokenMatches),
      audit.rows || '',
      audit.updatedAt || '',
      audit.durationMs || '',
      audit.error || '',
    ]);
  } catch (logError) {
    console.error(JSON.stringify({
      event: 'cache_rebuild_audit_log_error',
      error: logError && logError.message ? logError.message : String(logError),
    }));
  }
}

function parsePostPayload_(e) {
  const payload = {};

  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function(key) {
      payload[key] = e.parameter[key];
    });
  }

  const postData = e && e.postData && e.postData.contents;

  if (!postData) {
    return payload;
  }

  try {
    const parsed = JSON.parse(postData);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.keys(parsed).forEach(function(key) {
        payload[key] = parsed[key];
      });
    }
  } catch (error) {
    // Form-encoded POSTs are already exposed through e.parameter.
  }

  return payload;
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseScheduleUpload_(content) {
  if (!cleanText_(content)) {
    throw new Error('The uploaded file is empty.');
  }

  const rows = Utilities.parseCsv(content)
    .filter(function(row) {
      return row.some(function(cell) {
        return cleanText_(cell);
      });
    });

  if (!rows.length) {
    throw new Error('The uploaded file does not contain schedule rows.');
  }

  rows.forEach(function(row, index) {
    trimTrailingEmptyCells_(row);

    if (row.length !== SCHEDULE_UPLOAD_COLUMN_COUNT) {
      throw new Error(
        'Row ' + (index + 1) + ' must contain exactly ' + SCHEDULE_UPLOAD_COLUMN_COUNT +
        ' columns: rowId, class, teacher code, subject, classroom, day, time_slot. ' +
        'Found ' + row.length + '.'
      );
    }
  });

  return rows.map(function(row) {
    return row.map(function(cell) {
      return cleanText_(cell);
    });
  });
}

function trimTrailingEmptyCells_(row) {
  while (row.length > SCHEDULE_UPLOAD_COLUMN_COUNT && !cleanText_(row[row.length - 1])) {
    row.pop();
  }
}

function replaceSheetValues_(sheet, values) {
  const rowCount = values.length;
  const columnCount = values[0].length;
  const currentRows = sheet.getMaxRows();
  const currentColumns = sheet.getMaxColumns();

  if (currentRows < rowCount) {
    sheet.insertRowsAfter(currentRows, rowCount - currentRows);
  }

  if (currentColumns < columnCount) {
    sheet.insertColumnsAfter(currentColumns, columnCount - currentColumns);
  }

  sheet.clear();
  sheet.getRange(1, 1, rowCount, columnCount).setValues(values);

  if (sheet.getMaxRows() > rowCount) {
    sheet.deleteRows(rowCount + 1, sheet.getMaxRows() - rowCount);
  }

  if (sheet.getMaxColumns() > columnCount) {
    sheet.deleteColumns(columnCount + 1, sheet.getMaxColumns() - columnCount);
  }
}

function sendScheduleUpdateNotification_() {
  const htmlBody = HtmlService
    .createTemplateFromFile(SCHEDULE_UPDATE_EMAIL_TEMPLATE)
    .evaluate()
    .getContent();

  MailApp.sendEmail({
    to: SCHEDULE_UPDATE_NOTIFICATION_EMAIL,
    subject: SCHEDULE_UPDATE_EMAIL_SUBJECT,
    body: SCHEDULE_UPDATE_EMAIL_TEXT,
    htmlBody,
  });
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

function loadScheduleRows_(sheet, teachersByAlias, activeLeavesByTeacherCode, subjectsByShortName) {
  const values = sheet.getDataRange().getDisplayValues();

  return values
    .map(function(row) {
      const sourceTeacherAlias = cleanText_(row[HORARIS_COLUMNS.teacherAlias]);
      const subjectCode = cleanText_(row[HORARIS_COLUMNS.subject]);
      const subject = subjectsByShortName[codeKey_(subjectCode)];
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
        sourceTeacherName: sourceTeacher ? sourceTeacher.fullName : sourceTeacherAlias,
        sourceTeacherOriginalCode: sourceTeacher ? sourceTeacher.originalCode : '',
        teacherAlias: effectiveTeacherAlias,
        teacherName: effectiveTeacher ? effectiveTeacher.fullName : effectiveTeacherAlias,
        teacherWasSubstituted: Boolean(
          sourceTeacher &&
          effectiveTeacher &&
          sourceTeacher.alias !== effectiveTeacher.alias
        ),
        subject: subjectCode,
        subjectCode,
        subjectName: subject && subject.fullName ? subject.fullName : subjectCode,
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

function loadSubjects_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(cleanText_);
  const headerIndex = indexRequiredHeaders_(headers, [
    SUBJECT_COLUMNS.shortName,
    SUBJECT_COLUMNS.fullName,
  ], 'Subject table');

  return values.slice(1)
    .map(function(row) {
      const shortName = cleanText_(row[headerIndex[SUBJECT_COLUMNS.shortName]]);
      const fullName = cleanText_(row[headerIndex[SUBJECT_COLUMNS.fullName]]);

      return {
        shortName,
        stage: cleanText_(row[headerIndex[SUBJECT_COLUMNS.stage]]),
        fullName: fullName || shortName,
        untisName: cleanText_(row[headerIndex[SUBJECT_COLUMNS.untisName]]),
        trueSubject: cleanText_(row[headerIndex[SUBJECT_COLUMNS.trueSubject]]),
      };
    })
    .filter(function(subject) {
      return subject.shortName;
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

function buildFilterOptions_(scheduleRows) {
  const teacherAliases = uniqueSorted_(
    scheduleRows
      .map(function(row) {
        return row.teacherAlias;
      })
      .filter(Boolean),
    function(alias) {
      const matchingRow = findRowByValue_(scheduleRows, 'teacherAlias', alias);
      return matchingRow && matchingRow.teacherName ? matchingRow.teacherName : alias;
    }
  );

  return {
    teachers: teacherAliases.map(function(alias) {
      const matchingRow = findRowByValue_(scheduleRows, 'teacherAlias', alias);

      return {
        value: alias,
        label: matchingRow && matchingRow.teacherName ? matchingRow.teacherName : alias,
      };
    }),
    groups: valuesToOptions_(scheduleRows, 'group'),
    classrooms: valuesToOptions_(scheduleRows, 'classroom'),
    subjects: valuesToOptions_(scheduleRows, 'subject', function(row) {
      return row.subjectName || row.subject;
    }),
  };
}

function findRowByValue_(rows, key, value) {
  return rows.find(function(row) {
    return row[key] === value;
  });
}

function valuesToOptions_(rows, key, labelResolver) {
  return uniqueSorted_(
    rows
      .map(function(row) {
        return row[key];
      })
      .filter(Boolean)
  ).map(function(value) {
    const matchingRow = findRowByValue_(rows, key, value);

    return {
      value,
      label: labelResolver && matchingRow ? labelResolver(matchingRow) : value,
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
