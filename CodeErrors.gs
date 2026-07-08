/**
 * Teacher code coherence checker for the Horaris spreadsheet.
 *
 * Install this file in the Apps Script project bound to the Horaris spreadsheet.
 * Required script property:
 * - db: spreadsheet ID of the database registry spreadsheet
 *
 * Registry structure:
 * - registry sheet: tables
 * - column A: logical table name
 * - column B: table spreadsheet ID
 *
 * Tables used:
 * - Horaris -> active spreadsheet, sheet GPU001
 * - Dades de professors -> registry-resolved spreadsheet, sheet Llista
 *
 * Output:
 * - Creates/replaces sheet code_errors in the active Horaris spreadsheet.
 */

const CHECK_SCRIPT_PROP_DB = 'db';
const CHECK_TABLES_SHEET_NAME = 'tables';
const CHECK_TABLE_PROFESSORS = 'Dades de professors';
const CHECK_HORARIS_SHEET_NAME = 'GPU001';
const CHECK_PROFESSORS_SHEET_NAME = 'Llista';
const CHECK_OUTPUT_SHEET_NAME = 'code_errors';

const CHECK_HORARIS_COLUMNS = {
  rowNumber: 0,
  group: 1,
  teacherCode: 2,
  subject: 3,
  classroom: 4,
  dayNumber: 5,
  slotNumber: 6,
};

const CHECK_PROFESSOR_HEADERS = {
  originalCode: 'ESP',
  firstName: 'NOM',
  surname1: 'COGNOM1',
  surname2: 'COGNOM2',
  reducedCode: 'REDUIT',
};

function checkTeacherCodeErrors() {
  const horarisSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const horarisSheet = getRequiredSheet_(horarisSpreadsheet, CHECK_HORARIS_SHEET_NAME);
  const professorsSheet = openProfessorsSheet_();

  const professors = loadProfessorRows_(professorsSheet);
  const professorCodes = buildProfessorCodeIndex_(professors);
  const horarisRows = loadHorarisRows_(horarisSheet);
  const errors = buildCodeErrors_(horarisRows, professors, professorCodes);

  writeCodeErrors_(horarisSpreadsheet, errors);

  SpreadsheetApp.getUi().alert(
    'Teacher code check finished.\n' +
    'Errors found: ' + Math.max(errors.length - 1, 0) + '\n' +
    'See sheet "' + CHECK_OUTPUT_SHEET_NAME + '".'
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Schedule checks')
    .addItem('Check teacher codes', 'checkTeacherCodeErrors')
    .addToUi();
}

function buildCodeErrors_(horarisRows, professors, professorCodes) {
  const unknownTeacherCodes = {};
  const output = [[
    'error_type',
    'description',
    'source_sheet',
    'source_row',
    'horaris_row_number',
    'teacher_code',
    'teacher_name',
    'group',
    'subject',
    'classroom',
    'day_number',
    'slot_number',
  ]];

  horarisRows.forEach(function(row) {
    if (!row.teacherCode) {
      output.push([
        'HORARIS_MISSING_TEACHER_CODE',
        'Horaris row has no teacher code in column C.',
        CHECK_HORARIS_SHEET_NAME,
        row.sheetRow,
        row.rowNumber,
        '',
        '',
        row.group,
        row.subject,
        row.classroom,
        row.dayNumber,
        row.slotNumber,
      ]);
      return;
    }

    if (!professorCodes[row.teacherCode] && !unknownTeacherCodes[row.teacherCode]) {
      unknownTeacherCodes[row.teacherCode] = true;
      output.push([
        'HORARIS_UNKNOWN_TEACHER_CODE',
        'Teacher code in Horaris column C was not found in Dades de professors -> Llista -> REDUIT. First occurrence only.',
        CHECK_HORARIS_SHEET_NAME,
        row.sheetRow,
        row.rowNumber,
        row.teacherCode,
        '',
        row.group,
        row.subject,
        row.classroom,
        row.dayNumber,
        row.slotNumber,
      ]);
    }
  });

  professors.forEach(function(professor) {
    if (!professor.reducedCode) {
      output.push([
        'LLISTA_MISSING_REDUIT',
        'Teacher in Dades de professors -> Llista has no REDUIT code.',
        CHECK_PROFESSORS_SHEET_NAME,
        professor.sheetRow,
        '',
        '',
        professor.fullName,
        '',
        '',
        '',
        '',
        '',
      ]);
    }
  });

  return output;
}

function loadHorarisRows_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();

  return values.map(function(row, index) {
    return {
      sheetRow: index + 1,
      rowNumber: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.rowNumber]),
      group: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.group]),
      teacherCode: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.teacherCode]),
      subject: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.subject]),
      classroom: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.classroom]),
      dayNumber: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.dayNumber]),
      slotNumber: cleanCheckText_(row[CHECK_HORARIS_COLUMNS.slotNumber]),
    };
  }).filter(function(row) {
    return row.rowNumber || row.group || row.teacherCode || row.subject || row.classroom ||
      row.dayNumber || row.slotNumber;
  });
}

function loadProfessorRows_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(cleanCheckText_);
  const headerIndex = buildHeaderIndex_(headers, [
    CHECK_PROFESSOR_HEADERS.originalCode,
    CHECK_PROFESSOR_HEADERS.firstName,
    CHECK_PROFESSOR_HEADERS.surname1,
    CHECK_PROFESSOR_HEADERS.surname2,
    CHECK_PROFESSOR_HEADERS.reducedCode,
  ], CHECK_PROFESSORS_SHEET_NAME);

  return values.slice(1).map(function(row, index) {
    const firstName = cleanCheckText_(row[headerIndex[CHECK_PROFESSOR_HEADERS.firstName]]);
    const surname1 = cleanCheckText_(row[headerIndex[CHECK_PROFESSOR_HEADERS.surname1]]);
    const surname2 = cleanCheckText_(row[headerIndex[CHECK_PROFESSOR_HEADERS.surname2]]);
    const reducedCode = cleanCheckText_(row[headerIndex[CHECK_PROFESSOR_HEADERS.reducedCode]]);

    return {
      sheetRow: index + 2,
      originalCode: cleanCheckText_(row[headerIndex[CHECK_PROFESSOR_HEADERS.originalCode]]),
      reducedCode: reducedCode,
      fullName: [firstName, surname1, surname2].filter(Boolean).join(' '),
    };
  }).filter(function(professor) {
    return professor.originalCode || professor.reducedCode || professor.fullName;
  });
}

function buildProfessorCodeIndex_(professors) {
  return professors.reduce(function(index, professor) {
    if (professor.reducedCode) {
      index[professor.reducedCode] = professor;
    }

    return index;
  }, {});
}

function writeCodeErrors_(spreadsheet, rows) {
  const existing = spreadsheet.getSheetByName(CHECK_OUTPUT_SHEET_NAME);

  if (existing) {
    existing.clear();
  }

  const sheet = existing || spreadsheet.insertSheet(CHECK_OUTPUT_SHEET_NAME);
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

function openProfessorsSheet_() {
  const registry = loadCheckTableRegistry_();
  const professorsSpreadsheetId = registry[CHECK_TABLE_PROFESSORS];

  if (!professorsSpreadsheetId) {
    throw new Error('Table "' + CHECK_TABLE_PROFESSORS + '" was not found in registry sheet "' +
      CHECK_TABLES_SHEET_NAME + '".');
  }

  const spreadsheet = SpreadsheetApp.openById(professorsSpreadsheetId);
  return getRequiredSheet_(spreadsheet, CHECK_PROFESSORS_SHEET_NAME);
}

function loadCheckTableRegistry_() {
  const registrySpreadsheetId = cleanCheckText_(
    PropertiesService.getScriptProperties().getProperty(CHECK_SCRIPT_PROP_DB)
  );

  if (!registrySpreadsheetId) {
    throw new Error('Missing script property "' + CHECK_SCRIPT_PROP_DB + '" with the registry spreadsheet ID.');
  }

  const registrySpreadsheet = SpreadsheetApp.openById(registrySpreadsheetId);
  const tableSheet = getRequiredSheet_(registrySpreadsheet, CHECK_TABLES_SHEET_NAME);
  const values = tableSheet.getDataRange().getDisplayValues();
  const registry = {};

  values.forEach(function(row) {
    const tableName = cleanCheckText_(row[0]);
    const spreadsheetId = cleanCheckText_(row[1]);

    if (tableName && spreadsheetId) {
      registry[tableName] = spreadsheetId;
    }
  });

  return registry;
}

function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Spreadsheet "' + spreadsheet.getName() + '" is missing sheet "' + sheetName + '".');
  }

  return sheet;
}

function buildHeaderIndex_(headers, requiredHeaders, sheetName) {
  const index = {};

  headers.forEach(function(header, position) {
    index[cleanCheckText_(header)] = position;
    index[normalizeCheckHeader_(header)] = position;
  });

  requiredHeaders.forEach(function(requiredHeader) {
    const normalizedHeader = normalizeCheckHeader_(requiredHeader);

    if (index[normalizedHeader] === undefined) {
      throw new Error('Sheet "' + sheetName + '" is missing required header "' + requiredHeader + '".');
    }

    index[cleanCheckText_(requiredHeader)] = index[normalizedHeader];
  });

  return index;
}

function normalizeCheckHeader_(header) {
  return cleanCheckText_(header)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function cleanCheckText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}
