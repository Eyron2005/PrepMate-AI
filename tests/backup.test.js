import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupCsv,
  buildBackupFilename,
  parseBackupCsvContent,
  parseBackupFiles,
  parseCsvRecords,
} from "../src/services/backup.js";

function makeMemoryFile(name, content) {
  return {
    name,
    async text() {
      return content;
    },
  };
}

test("buildBackupFilename produces CSV filenames for single and multi-table exports", () => {
  const fixedDate = new Date("2026-11-10T10:15:00.000Z");
  assert.equal(buildBackupFilename(["staff"], fixedDate), "prepmate-staff-backup-2026-11-10.csv");
  assert.equal(
    buildBackupFilename(["profiles", "questions", "interview_results", "staff"], fixedDate),
    "prepmate-admin-backup-2026-11-10.csv"
  );
});

test("buildBackupCsv and parseBackupCsvContent round-trip single-table CSV with Excel BOM and null/empty handling", () => {
  const staffRows = [
    {
      id: "b37f11d4-0502-43df-9b80-7190ae67c293",
      full_name: 'Dr. "Ada", Lovelace',
      email: "ada@prepmate.site",
      position: "Coordinator",
      department: null,
      is_active: true,
      can_email_unassigned_students: false,
      created_at: "2026-10-28T05:00:00.000Z",
    },
  ];

  const csv = buildBackupCsv({ staff: staffRows }, "2026-11-10T10:15:00.000Z");
  assert.ok(csv.startsWith("\uFEFFid,full_name,email,position,department"));
  assert.ok(!csv.includes("prepmate_backup_format"));

  const parsed = parseBackupCsvContent(csv, "renamed-export.csv");
  assert.equal(parsed.format, BACKUP_FORMAT);
  assert.equal(parsed.version, BACKUP_VERSION);
  assert.deepEqual(parsed.tables.staff, staffRows);
});

test("buildBackupCsv and parseBackupCsvContent round-trip multi-table CSV including JSONB, integers, multiline text, and 0-row tables", () => {
  const payload = {
    profiles: [
      {
        id: "15ca91e3-32ae-401d-be59-20bdb2d47a7a",
        full_name: "Mark Joseph Balatbat",
        email: "mjbalatbat@example.com",
        account_status: "active",
        last_online: "2026-11-10T06:07:00.000Z",
        avatar_url: null,
        auth_user_id: "15ca91e3-32ae-401d-be59-20bdb2d47a7a",
        deactivation_reason: null,
        deactivation_details: null,
        deactivated_at: null,
        deactivated_by: null,
        deactivation_agreed: null,
        deactivation_agreed_at: null,
        created_at: "2026-11-04T00:00:00.000Z",
      },
    ],
    questions: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        category: "Technical",
        question: "Explain recursion.\nGive an example including null checks.",
        difficulty: "Medium",
        question_set: "Core CS",
        ideal_answer: "",
        job_role: "Software Engineer",
        is_active: true,
        "is _active": true,
        ai_suggested_difficulty: "MEDIUM",
        cognitive_level: "Understanding",
        difficulty_assessment: { score: 0.72, tags: ["algorithms", "base-case"] },
        difficulty_reason: 'Quoted "reasoning", with comma',
        classification_status: "COMPLETED",
        classification_method: "AI",
        created_at: "2026-11-01T00:00:00.000Z",
      },
    ],
    interview_results: [
      {
        id: 42,
        profile_id: "15ca91e3-32ae-401d-be59-20bdb2d47a7a",
        question_id: "11111111-1111-1111-1111-111111111111",
        session_id: "22222222-2222-2222-2222-222222222222",
        user_transcript: "null",
        ai_score: 85,
        ai_feedback: "Strong structure\nClear base case.",
        movement_data: { eye_contact: 91, posture: "upright" },
        created_at: "2026-11-05T12:00:00.000Z",
      },
    ],
    staff: [],
  };

  const csv = buildBackupCsv(payload, "2026-11-10T10:15:00.000Z");
  const parsed = parseBackupCsvContent(csv, "prepmate-admin-backup-2026-11-10.csv");

  assert.equal(parsed.created_at, "2026-11-10T10:15:00.000Z");
  assert.deepEqual(parsed.tables.profiles, payload.profiles);
  assert.deepEqual(parsed.tables.questions, payload.questions);
  assert.deepEqual(parsed.tables.interview_results, payload.interview_results);
  assert.deepEqual(parsed.tables.staff, []);
});

test("parseBackupCsvContent tolerates Excel-style uppercase booleans and LF line endings", () => {
  const excelSavedCsv = [
    "id,full_name,email,position,department,is_active,can_email_unassigned_students,created_at",
    "b37f11d4-0502-43df-9b80-7190ae67c293,Staff1,staff@test.com,Staff,,TRUE,FALSE,2026-10-28T05:00:00.000Z",
  ].join("\n");

  const parsed = parseBackupCsvContent(excelSavedCsv, "staff_edited.csv");
  assert.deepEqual(parsed.tables.staff, [
    {
      id: "b37f11d4-0502-43df-9b80-7190ae67c293",
      full_name: "Staff1",
      email: "staff@test.com",
      position: "Staff",
      department: null,
      is_active: true,
      can_email_unassigned_students: false,
      created_at: "2026-10-28T05:00:00.000Z",
    },
  ]);
});

test("parseBackupFiles merges multiple per-table CSV files and supports legacy JSON backups", async () => {
  const staffCsv = buildBackupCsv({
    staff: [
      {
        id: "b37f11d4-0502-43df-9b80-7190ae67c293",
        full_name: "Staff1",
        email: "staff@prepmate.site",
        position: "Staff",
        department: "CCS",
        is_active: true,
        can_email_unassigned_students: false,
        created_at: "2026-10-28T05:00:00.000Z",
      },
    ],
  });
  const questionsCsv = buildBackupCsv({
    questions: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        category: "HR",
        question: "Tell me about yourself.",
        difficulty: "Easy",
        question_set: "General",
        ideal_answer: "Concise background summary.",
        job_role: null,
        is_active: true,
        "is _active": true,
        ai_suggested_difficulty: null,
        cognitive_level: null,
        difficulty_assessment: null,
        difficulty_reason: null,
        classification_status: null,
        classification_method: null,
        created_at: "2026-10-28T05:00:00.000Z",
      },
    ],
  });

  const merged = await parseBackupFiles([
    makeMemoryFile("prepmate-staff-backup-2026-11-10.csv", staffCsv),
    makeMemoryFile("prepmate-questions-backup-2026-11-10.csv", questionsCsv),
  ]);

  assert.equal(merged.tables.staff.length, 1);
  assert.equal(merged.tables.questions.length, 1);

  const legacyJson = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: "2026-11-10T09:00:00.000Z",
    tables: {
      staff: [{ id: "b37f11d4-0502-43df-9b80-7190ae67c293", full_name: "Staff1" }],
    },
  });
  const parsedJson = await parseBackupFiles([makeMemoryFile("prepmate-admin-backup-2026-11-10.json", legacyJson)]);
  assert.equal(parsedJson.tables.staff[0].full_name, "Staff1");
});

test("CSV parser rejects unclosed quotes, invalid types, duplicate tables, and unrecognized files", async () => {
  assert.throws(() => parseCsvRecords('id,name\n1,"unclosed'), /unclosed quoted field/i);

  assert.throws(
    () =>
      parseBackupCsvContent(
        "id,full_name,email,position,is_active\nuuid-1,Staff1,a@b.com,Staff,maybe",
        "staff.csv"
      ),
    /Invalid boolean value/i
  );

  assert.throws(
    () => parseBackupCsvContent("foo,bar,baz\n1,2,3", "random.csv"),
    /does not match any recognized Prepmate AI table/i
  );

  const staffCsv = buildBackupCsv({ staff: [{ id: "1", full_name: "A", email: "a@b.com" }] });
  await assert.rejects(
    () =>
      parseBackupFiles([
        makeMemoryFile("prepmate-staff-backup-1.csv", staffCsv),
        makeMemoryFile("prepmate-staff-backup-2.csv", staffCsv),
      ]),
    /Duplicate table "staff"/i
  );
});
