export const BACKUP_FORMAT = "prepmate-admin-backup";
export const BACKUP_VERSION = 1;

export const BACKUP_OPTIONS = [
  { key: "profiles", label: "User Profiles & Accounts", desc: "Candidate metadata and registration records" },
  { key: "questions", label: "Question Bank", desc: "Curated technical, behavioral, and HR questions" },
  { key: "interview_results", label: "Interview Results & Transcripts", desc: "Evaluation metrics, AI feedback, and answers" },
  { key: "staff", label: "Staff Accounts", desc: "Supervisor credentials and department assignments" },
];

export const TABLE_SCHEMAS = {
  profiles: {
    columns: [
      "id",
      "full_name",
      "email",
      "account_status",
      "last_online",
      "avatar_url",
      "auth_user_id",
      "deactivation_reason",
      "deactivation_details",
      "deactivated_at",
      "deactivated_by",
      "deactivation_agreed",
      "deactivation_agreed_at",
      "created_at",
    ],
    booleanCols: new Set(["deactivation_agreed"]),
    integerCols: new Set(),
    jsonCols: new Set(),
    strictNullIfEmptyCols: new Set([
      "id",
      "auth_user_id",
      "last_online",
      "deactivated_at",
      "deactivated_by",
      "deactivation_agreed",
      "deactivation_agreed_at",
      "created_at",
    ]),
    notNullTextCols: new Set(["full_name", "account_status"]),
    signatureCols: ["account_status", "deactivation_reason", "last_online", "auth_user_id"],
  },
  questions: {
    columns: [
      "id",
      "category",
      "question",
      "difficulty",
      "question_set",
      "ideal_answer",
      "job_role",
      "is_active",
      "is _active",
      "ai_suggested_difficulty",
      "cognitive_level",
      "difficulty_assessment",
      "difficulty_reason",
      "classification_status",
      "classification_method",
      "created_at",
    ],
    booleanCols: new Set(["is_active", "is _active"]),
    integerCols: new Set(),
    jsonCols: new Set(["difficulty_assessment"]),
    strictNullIfEmptyCols: new Set([
      "id",
      "is_active",
      "is _active",
      "difficulty_assessment",
      "created_at",
    ]),
    notNullTextCols: new Set(["category"]),
    signatureCols: ["category", "question", "ideal_answer", "question_set"],
  },
  interview_sessions: {
    columns: [
      "id",
      "profile_id",
      "overall_score",
      "speech_score",
      "camera_score",
      "question_count",
      "completed_count",
      "summary",
      "created_at",
    ],
    booleanCols: new Set(),
    integerCols: new Set([
      "overall_score",
      "speech_score",
      "camera_score",
      "question_count",
      "completed_count",
    ]),
    jsonCols: new Set(),
    strictNullIfEmptyCols: new Set([
      "id",
      "profile_id",
      "overall_score",
      "speech_score",
      "camera_score",
      "question_count",
      "completed_count",
      "created_at",
    ]),
    notNullTextCols: new Set(["summary"]),
    signatureCols: ["overall_score", "speech_score", "camera_score", "question_count"],
  },
  interview_results: {
    columns: [
      "id",
      "profile_id",
      "question_id",
      "session_id",
      "user_transcript",
      "ai_score",
      "ai_feedback",
      "movement_data",
      "created_at",
    ],
    booleanCols: new Set(),
    integerCols: new Set(["id", "ai_score"]),
    jsonCols: new Set(["movement_data"]),
    strictNullIfEmptyCols: new Set([
      "id",
      "profile_id",
      "question_id",
      "session_id",
      "ai_score",
      "movement_data",
      "created_at",
    ]),
    notNullTextCols: new Set(),
    signatureCols: ["user_transcript", "ai_score", "ai_feedback", "movement_data", "question_id"],
  },
  staff: {
    columns: [
      "id",
      "full_name",
      "email",
      "position",
      "department",
      "is_active",
      "can_email_unassigned_students",
      "created_at",
    ],
    booleanCols: new Set(["is_active", "can_email_unassigned_students"]),
    integerCols: new Set(),
    jsonCols: new Set(),
    strictNullIfEmptyCols: new Set([
      "id",
      "is_active",
      "can_email_unassigned_students",
      "created_at",
    ]),
    notNullTextCols: new Set(["full_name", "email"]),
    signatureCols: ["position", "department", "can_email_unassigned_students"],
  },
  staff_student_assignments: {
    columns: ["id", "staff_id", "student_user_id", "assigned_by", "created_at"],
    booleanCols: new Set(),
    integerCols: new Set(),
    jsonCols: new Set(),
    strictNullIfEmptyCols: new Set(["id", "staff_id", "student_user_id", "assigned_by", "created_at"]),
    notNullTextCols: new Set(),
    signatureCols: ["staff_id", "student_user_id"],
  },
  admins: {
    columns: ["id", "full_name", "role", "is_active", "created_at"],
    booleanCols: new Set(["is_active"]),
    integerCols: new Set(),
    jsonCols: new Set(),
    strictNullIfEmptyCols: new Set(["id", "is_active", "created_at"]),
    notNullTextCols: new Set(["full_name", "role"]),
    signatureCols: ["role"],
  },
};

const KNOWN_TABLE_NAMES = new Set(Object.keys(TABLE_SCHEMAS));

function escapeCsvCell(value, forceQuote = false) {
  const str = String(value);
  if (
    forceQuote ||
    str.includes('"') ||
    str.includes(",") ||
    str.includes("\r") ||
    str.includes("\n") ||
    /^\s|\s$/.test(str)
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function serializeValueToCsvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value === "") {
    return '""';
  }
  if (typeof value === "object") {
    return escapeCsvCell(JSON.stringify(value));
  }
  return escapeCsvCell(String(value));
}

function resolveTableColumns(tableName, rows) {
  const schemaCols = TABLE_SCHEMAS[tableName]?.columns || [];
  const columnSet = new Set(schemaCols);
  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      columnSet.add(key);
    }
  }
  return Array.from(columnSet);
}

function serializeTableSection(tableName, rows) {
  const columns = resolveTableColumns(tableName, rows);
  const lines = [columns.map((col) => escapeCsvCell(col)).join(",")];
  for (const row of rows || []) {
    lines.push(columns.map((col) => serializeValueToCsvCell(row?.[col])).join(","));
  }
  return lines;
}

export function buildBackupFilename(tableNames, date = new Date()) {
  const ymd = date.toISOString().slice(0, 10);
  if (Array.isArray(tableNames) && tableNames.length === 1 && tableNames[0]) {
    return `prepmate-${tableNames[0]}-backup-${ymd}.csv`;
  }
  return `prepmate-admin-backup-${ymd}.csv`;
}

export function buildBackupCsv(tablesByName, createdAt = new Date().toISOString()) {
  const tableNames = Object.keys(tablesByName || {});
  if (tableNames.length === 0) {
    throw new Error("Select at least one table to generate a CSV backup.");
  }

  let lines;
  if (tableNames.length === 1) {
    const onlyTable = tableNames[0];
    lines = serializeTableSection(onlyTable, tablesByName[onlyTable]);
  } else {
    lines = [
      ["prepmate_backup_format", "version", "created_at"].join(","),
      [escapeCsvCell(BACKUP_FORMAT), String(BACKUP_VERSION), escapeCsvCell(createdAt)].join(","),
    ];

    for (const tableName of tableNames) {
      lines.push("");
      lines.push(["table", escapeCsvCell(tableName)].join(","));
      lines.push(...serializeTableSection(tableName, tablesByName[tableName]));
    }
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function parseCsvRecords(rawText) {
  const text = String(rawText ?? "").replace(/^\uFEFF/, "");
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let wasQuoted = false;
  let fieldStarted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (!fieldStarted && ch === '"') {
      inQuotes = true;
      wasQuoted = true;
      fieldStarted = true;
      continue;
    }

    if (ch === ",") {
      row.push({ value: field, quoted: wasQuoted });
      field = "";
      wasQuoted = false;
      fieldStarted = false;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push({ value: field, quoted: wasQuoted });
      records.push(row);
      row = [];
      field = "";
      wasQuoted = false;
      fieldStarted = false;
      continue;
    }

    field += ch;
    fieldStarted = true;
  }

  if (inQuotes) {
    throw new Error("The CSV file contains an unclosed quoted field.");
  }

  if (fieldStarted || row.length > 0) {
    row.push({ value: field, quoted: wasQuoted });
    records.push(row);
  }

  return records;
}

function isBlankCsvRow(cells) {
  return !cells || cells.length === 0 || (cells.length === 1 && !cells[0].quoted && cells[0].value.trim() === "");
}

function detectTableName(headers, filename = "") {
  const normalizedSet = new Set(headers);
  const lowerFilename = String(filename || "").toLowerCase();

  let bestTable = null;
  let bestScore = -1;

  for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
    const sigMatches = schema.signatureCols.filter((col) => normalizedSet.has(col)).length;
    const colMatches = schema.columns.filter((col) => normalizedSet.has(col)).length;
    const unknownCols = headers.filter((col) => !schema.columns.includes(col)).length;

    if (colMatches === 0 || unknownCols > 0) continue;

    let score = sigMatches * 100 + colMatches;
    if (lowerFilename.includes(tableName)) {
      score += 50;
    }

    if (sigMatches > 0 || (normalizedSet.has("id") && colMatches >= 3) || lowerFilename.includes(tableName)) {
      if (score > bestScore) {
        bestScore = score;
        bestTable = tableName;
      }
    }
  }

  if (bestTable) return bestTable;

  for (const tableName of KNOWN_TABLE_NAMES) {
    if (lowerFilename.includes(tableName) && headers.length > 0) {
      return tableName;
    }
  }

  return null;
}

function coerceCsvCell(tableName, colName, cell) {
  const schema = TABLE_SCHEMAS[tableName];
  const raw = cell?.value ?? "";
  const trimmed = raw.trim();

  if (!schema) {
    if (raw === "" && !cell?.quoted) return null;
    return raw;
  }

  if (schema.booleanCols.has(colName)) {
    if (trimmed === "") return null;
    if (/^(true|t|yes|1)$/i.test(trimmed)) return true;
    if (/^(false|f|no|0)$/i.test(trimmed)) return false;
    throw new Error(`Invalid boolean value "${raw}" in column "${colName}" of table "${tableName}".`);
  }

  if (schema.integerCols.has(colName)) {
    if (trimmed === "") return null;
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(`Invalid integer value "${raw}" in column "${colName}" of table "${tableName}".`);
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Out-of-range integer value "${raw}" in column "${colName}" of table "${tableName}".`);
    }
    return parsed;
  }

  if (schema.jsonCols.has(colName)) {
    if (trimmed === "") return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON value in column "${colName}" of table "${tableName}".`, { cause: err });
    }
  }

  if (schema.strictNullIfEmptyCols.has(colName)) {
    return trimmed === "" ? null : trimmed;
  }

  if (raw === "") {
    if (schema.notNullTextCols.has(colName)) return "";
    return cell?.quoted ? "" : null;
  }

  return raw;
}

function rowsToObjects(tableName, headers, dataRows) {
  const rows = [];
  for (const rowCells of dataRows) {
    if (isBlankCsvRow(rowCells)) continue;
    const record = {};
    for (let index = 0; index < headers.length; index += 1) {
      const colName = headers[index];
      if (!colName) continue;
      record[colName] = coerceCsvCell(tableName, colName, rowCells[index] || { value: "", quoted: false });
    }
    rows.push(record);
  }
  return rows;
}

export function parseBackupCsvContent(csvText, filename = "") {
  const records = parseCsvRecords(csvText);
  while (records.length > 0 && isBlankCsvRow(records[records.length - 1])) {
    records.pop();
  }

  if (records.length === 0) {
    throw new Error("The selected CSV file is empty.");
  }

  let index = 0;
  while (index < records.length && isBlankCsvRow(records[index])) {
    index += 1;
  }

  const firstRowValues = records[index].map((cell) => cell.value.trim());
  const isMultiTable =
    firstRowValues[0] === "prepmate_backup_format" &&
    firstRowValues[1] === "version";

  const tables = {};
  let createdAt = new Date().toISOString();

  if (isMultiTable) {
    index += 1;
    if (index >= records.length) {
      throw new Error("This CSV file is not a valid Prepmate AI admin backup.");
    }
    const metaRow = records[index].map((cell) => cell.value.trim());
    if (metaRow[0] !== BACKUP_FORMAT || Number(metaRow[1]) !== BACKUP_VERSION) {
      throw new Error("This file is not a recognized Prepmate AI admin backup.");
    }
    if (metaRow[2]) {
      createdAt = metaRow[2];
    }
    index += 1;

    while (index < records.length) {
      while (index < records.length && isBlankCsvRow(records[index])) {
        index += 1;
      }
      if (index >= records.length) break;

      const markerRow = records[index].map((cell) => cell.value.trim());
      if (markerRow[0] !== "table" || !markerRow[1]) {
        throw new Error(`Unexpected section header in CSV backup near row ${index + 1}.`);
      }

      const tableName = markerRow[1];
      if (!KNOWN_TABLE_NAMES.has(tableName)) {
        throw new Error(`Unsupported backup table "${tableName}".`);
      }

      index += 1;
      if (index >= records.length || isBlankCsvRow(records[index])) {
        throw new Error(`Missing column headers for table "${tableName}".`);
      }

      const headers = records[index].map((cell) => cell.value);
      index += 1;

      const sectionRows = [];
      while (index < records.length) {
        if (isBlankCsvRow(records[index])) {
          let lookahead = index + 1;
          while (lookahead < records.length && isBlankCsvRow(records[lookahead])) {
            lookahead += 1;
          }
          const nextValues = lookahead < records.length
            ? records[lookahead].map((cell) => cell.value.trim())
            : null;
          if (!nextValues || (nextValues[0] === "table" && KNOWN_TABLE_NAMES.has(nextValues[1]))) {
            index = lookahead;
            break;
          }
        }
        sectionRows.push(records[index]);
        index += 1;
      }

      tables[tableName] = rowsToObjects(tableName, headers, sectionRows);
    }
  } else {
    let tableName = null;
    if (firstRowValues.length === 2 && firstRowValues[0] === "table" && KNOWN_TABLE_NAMES.has(firstRowValues[1])) {
      tableName = firstRowValues[1];
      index += 1;
    }

    if (index >= records.length || isBlankCsvRow(records[index])) {
      throw new Error("The selected CSV file does not contain column headers.");
    }

    const headers = records[index].map((cell) => cell.value);
    if (!tableName) {
      tableName = detectTableName(headers, filename);
    }

    if (!tableName) {
      throw new Error("The selected CSV file does not match any recognized Prepmate AI table.");
    }

    const dataRows = records.slice(index + 1);
    tables[tableName] = rowsToObjects(tableName, headers, dataRows);
  }

  if (Object.keys(tables).length === 0) {
    throw new Error("No restorable tables were found in the selected CSV file.");
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: createdAt,
    tables,
  };
}

export function validateJsonBackup(backup) {
  if (
    backup?.format !== BACKUP_FORMAT ||
    backup?.version !== BACKUP_VERSION ||
    !backup.tables ||
    typeof backup.tables !== "object" ||
    Object.keys(backup.tables).length === 0
  ) {
    throw new Error("This file is not a recognized Prepmate AI admin backup.");
  }

  const invalidTable = Object.entries(backup.tables).find(([, rows]) => !Array.isArray(rows));
  if (invalidTable) {
    throw new Error(`Backup table "${invalidTable[0]}" contains corrupt or non-array data.`);
  }

  return backup;
}

export async function parseBackupFiles(files) {
  const fileList = Array.from(files || []);
  if (fileList.length === 0) {
    throw new Error("Select a backup file before restoring.");
  }

  const mergedTables = {};
  let latestCreatedAt = new Date().toISOString();

  for (const file of fileList) {
    const lowerName = String(file.name || "").toLowerCase();
    const content = await file.text();

    let parsed;
    if (lowerName.endsWith(".json") || (!lowerName.endsWith(".csv") && content.trimStart().startsWith("{"))) {
      try {
        parsed = validateJsonBackup(JSON.parse(content));
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw new Error(`"${file.name}" is not a valid JSON backup document.`, { cause: err });
        }
        throw err;
      }
    } else {
      parsed = parseBackupCsvContent(content, file.name);
    }

    if (parsed.created_at) {
      latestCreatedAt = parsed.created_at;
    }

    for (const [tableName, rows] of Object.entries(parsed.tables)) {
      if (Object.prototype.hasOwnProperty.call(mergedTables, tableName)) {
        throw new Error(`Duplicate table "${tableName}" found across selected backup files.`);
      }
      mergedTables[tableName] = rows;
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: latestCreatedAt,
    tables: mergedTables,
  };
}
