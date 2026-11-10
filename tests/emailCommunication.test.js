import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_TEMPLATES,
  applyEmailTemplate,
  formatEmailBodyToHtml,
  getEmailStatusMeta,
  validateEmailDraft,
} from "../src/services/emailCommunication.js";

test("EMAIL_TEMPLATES provides expected reusable templates and interpolates recipient name", () => {
  assert.ok(EMAIL_TEMPLATES.length >= 6);

  const single = applyEmailTemplate("account_concern", {
    studentName: "Maria Santos",
    multiple: false,
  });
  assert.equal(single?.subject, "Concern Regarding Your PrepMate AI Account");
  assert.ok(single?.bodyText.includes("Dear Maria Santos,"));

  const multi = applyEmailTemplate("general_announcement", {
    studentName: "Maria Santos",
    multiple: true,
  });
  assert.ok(multi?.bodyText.includes("Dear Student,"));
});

test("formatEmailBodyToHtml escapes XSS payloads and converts paragraphs, bold, italic, and bullets", () => {
  const raw = [
    "Hello <script>alert(1)</script> **Maria**,",
    "",
    "Please review your *OJT milestones*:",
    "- Complete interview #1",
    "- Verify email",
  ].join("\n");

  const html = formatEmailBodyToHtml(raw);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("<strong>Maria</strong>"));
  assert.ok(html.includes("<em>OJT milestones</em>"));
  assert.ok(html.includes("<ul"));
  assert.ok(html.includes("Complete interview #1"));
});

test("validateEmailDraft enforces admin vs staff permissions and valid registered student emails", () => {
  const assignedStudent = {
    id: "11111111-1111-1111-1111-111111111111",
    full_name: "John Loyd",
    email: "john@example.com",
    is_assigned: true,
  };
  const unassignedStudent = {
    id: "22222222-2222-2222-2222-222222222222",
    full_name: "Jane Doe",
    email: "jane@example.com",
    is_assigned: false,
  };
  const missingEmailStudent = {
    id: "33333333-3333-3333-3333-333333333333",
    full_name: "No Email",
    email: "",
    is_assigned: true,
  };

  // Standard staff can email assigned student
  assert.equal(
    validateEmailDraft({
      recipients: [assignedStudent],
      subject: "OJT Reminder",
      messageText: "Please submit your mock interview this week.",
      isAdmin: false,
      canEmailUnassigned: false,
    }).valid,
    true
  );

  // Standard staff blocked from emailing unassigned student
  const unassignedBlocked = validateEmailDraft({
    recipients: [unassignedStudent],
    subject: "OJT Reminder",
    messageText: "Hello",
    isAdmin: false,
    canEmailUnassigned: false,
  });
  assert.equal(unassignedBlocked.valid, false);

  // Staff with explicit permission can email unassigned student individually
  assert.equal(
    validateEmailDraft({
      recipients: [unassignedStudent],
      subject: "OJT Reminder",
      messageText: "Hello",
      isAdmin: false,
      canEmailUnassigned: true,
    }).valid,
    true
  );

  const secondAssignedStudent = {
    id: "44444444-4444-4444-4444-444444444444",
    full_name: "Robert Tzy",
    email: "robert@example.com",
    is_assigned: true,
  };

  // Staff can multi-select and email assigned students
  assert.equal(
    validateEmailDraft({
      recipients: [assignedStudent, secondAssignedStudent],
      subject: "Assigned Group Update",
      messageText: "Reminder for my assigned students.",
      isAdmin: false,
      canEmailUnassigned: false,
    }).valid,
    true
  );

  // Standard staff blocked from including unassigned students in multi-select
  assert.equal(
    validateEmailDraft({
      recipients: [assignedStudent, unassignedStudent],
      subject: "Assigned Group Update",
      messageText: "Reminder",
      isAdmin: false,
      canEmailUnassigned: false,
    }).valid,
    false
  );

  // Staff with unassigned permission can multi-select students too
  assert.equal(
    validateEmailDraft({
      recipients: [assignedStudent, unassignedStudent],
      subject: "Announcement",
      messageText: "Hello all",
      isAdmin: false,
      canEmailUnassigned: true,
    }).valid,
    true
  );

  // Admin can send announcements to multiple students
  assert.equal(
    validateEmailDraft({
      recipients: [assignedStudent, unassignedStudent],
      subject: "System Announcement",
      messageText: "Important update for all candidates.",
      isAdmin: true,
    }).valid,
    true
  );

  // Rejects recipients without valid email
  assert.equal(
    validateEmailDraft({
      recipients: [missingEmailStudent],
      subject: "Hello",
      messageText: "Testing",
      isAdmin: true,
    }).valid,
    false
  );
});

test("getEmailStatusMeta distinguishes Sent/Accepted from Confirmed Delivered, Failed, and Bounced", () => {
  assert.equal(getEmailStatusMeta("accepted").label, "Sent / Accepted");
  assert.equal(getEmailStatusMeta("delivered").label, "Delivered");
  assert.equal(getEmailStatusMeta("failed").label, "Failed");
  assert.equal(getEmailStatusMeta("bounced").label, "Bounced");
  assert.equal(getEmailStatusMeta("pending").label, "Pending");
});
