import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteConfigRecord,
  normalizeComparableKey,
  normalizeConfigName,
  validateIndustryInput,
  validateJobRoleInput,
} from "../src/services/interviewMode.js";

test("normalizeConfigName collapses internal whitespace and trims", () => {
  assert.equal(normalizeConfigName("  Software   Engineering  "), "Software Engineering");
  assert.equal(normalizeComparableKey("  Software   Engineering  "), "software engineering");
});

test("validateIndustryInput rejects duplicates regardless of case/spacing and allows self-edit", () => {
  const existing = [{ id: "ind-1", name: "Technology", is_active: true }];

  const dup = validateIndustryInput({ name: "  technology  " }, existing);
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already exists/i);

  const selfEdit = validateIndustryInput(
    { name: "Technology", description: "Updated", is_active: true },
    existing,
    "ind-1"
  );
  assert.equal(selfEdit.ok, true);
  assert.equal(selfEdit.value.name, "Technology");

  const validNew = validateIndustryInput({ name: "Healthcare", description: "Clinical roles" }, existing);
  assert.equal(validNew.ok, true);
  assert.equal(validNew.value.name, "Healthcare");
});

test("validateJobRoleInput requires industry, blocks duplicates per industry, and allows self-edit", () => {
  const existing = [
    { id: "role-1", industry_id: "ind-tech", name: "Frontend Developer", is_active: true },
    { id: "role-2", industry_id: "ind-tech", name: "Backend Developer", is_active: true },
    { id: "role-3", industry_id: "ind-tech", name: "Android Developer", is_active: true },
  ];

  const missingIndustry = validateJobRoleInput({ industry_id: "", name: "UI Designer" }, existing);
  assert.equal(missingIndustry.ok, false);
  assert.match(missingIndustry.error, /industry/i);

  const dupSameInd = validateJobRoleInput(
    { industry_id: "ind-tech", name: "  frontend   developer " },
    existing
  );
  assert.equal(dupSameInd.ok, false);
  assert.match(dupSameInd.error, /already exists in the selected industry/i);

  const selfEdit = validateJobRoleInput(
    { industry_id: "ind-tech", name: "Frontend Developer", description: "Updated scope", is_active: true },
    existing,
    "role-1"
  );
  assert.equal(selfEdit.ok, true);
  assert.equal(selfEdit.value.name, "Frontend Developer");

  const okDiffInd = validateJobRoleInput(
    { industry_id: "ind-biz", name: "Business Analyst" },
    existing
  );
  assert.equal(okDiffInd.ok, true);
  assert.equal(okDiffInd.value.industry_id, "ind-biz");
  assert.equal(okDiffInd.value.is_active, true);
});

test("canDeleteConfigRecord prevents deleting referenced industries or job roles", () => {
  assert.equal(canDeleteConfigRecord({ questions: 2 }).allowed, false);
  assert.equal(canDeleteConfigRecord({ sessions: 1 }).allowed, false);
  assert.equal(canDeleteConfigRecord({ childRoles: 3 }).allowed, false);
  assert.equal(canDeleteConfigRecord({ questions: 0, sessions: 0, childRoles: 0 }).allowed, true);
});
