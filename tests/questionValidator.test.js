import test from "node:test";
import assert from "node:assert/strict";
import {
  validateQuestionSync,
  autoCorrectGrammar,
  calculateTokenSimilarity,
  toDisplayDifficultyTier,
  toDifficultyCode,
  validateDifficultyClassification,
  resolveDifficultyPersistence,
} from "../src/services/questionValidator.js";

const SAMPLE_EXISTING_QUESTIONS = [
  {
    id: "q-1",
    question: "Can you describe a challenging programming project you completed?",
    category: "Technical",
    difficulty: "Medium",
  },
  {
    id: "q-2",
    question: "How would you handle a disagreement with a team member?",
    category: "Behavioral",
    difficulty: "Medium",
  },
  {
    id: "q-3",
    question: "What is the difference between a primary key and a foreign key?",
    category: "Technical",
    difficulty: "Easy",
  },
];

test("autoCorrectGrammar automatically corrects user screenshot: 'what is your goals'", () => {
  const result = autoCorrectGrammar("what is your goals");
  assert.equal(result.correctedText, "What are your goals?");
  assert.equal(result.wasCorrected, true);
  assert.ok(result.changes.length > 0);
});

test("autoCorrectGrammar automatically corrects: 'what is you goal'", () => {
  const result = autoCorrectGrammar("what is you goal");
  assert.equal(result.correctedText, "What is your goal?");
  assert.equal(result.wasCorrected, true);
});

test("autoCorrectGrammar automatically corrects: 'tell me about you self'", () => {
  const result = autoCorrectGrammar("tell me about you self");
  assert.equal(result.correctedText, "Tell me about yourself.");
  assert.equal(result.wasCorrected, true);
});

test("autoCorrectGrammar automatically corrects: 'why you want to work here'", () => {
  const result = autoCorrectGrammar("why you want to work here");
  assert.equal(result.correctedText, "Why do you want to work here?");
  assert.equal(result.wasCorrected, true);
});

test("autoCorrectGrammar automatically corrects user example 1: 'What are your strength and weakness?'", () => {
  const result = autoCorrectGrammar("What are your strength and weakness?");
  assert.equal(result.correctedText, "What are your strengths and weaknesses?");
  assert.equal(result.wasCorrected, true);
});

test("autoCorrectGrammar automatically corrects user example 2: 'How you handle difficult situation in workplace?'", () => {
  const result = autoCorrectGrammar("How you handle difficult situation in workplace?");
  assert.equal(result.correctedText, "How do you handle difficult situations in the workplace?");
  assert.equal(result.wasCorrected, true);
});

test("autoCorrectGrammar automatically corrects user example 3: 'Explain what is the different between frontend and backend development?'", () => {
  const result = autoCorrectGrammar("Explain what is the different between frontend and backend development?");
  assert.equal(result.correctedText, "Explain the difference between frontend and backend development.");
  assert.equal(result.wasCorrected, true);
});

test("autoCorrectGrammar preserves already correct questions without alteration", () => {
  const text = "Can you describe a challenging programming project you completed?";
  const result = autoCorrectGrammar(text);
  assert.equal(result.correctedText, text);
  assert.equal(result.wasCorrected, false);
});

test("autoCorrectGrammar fixes common typos and missing capitalization", () => {
  const result = autoCorrectGrammar("explain the definiton of oop and programing");
  assert.equal(result.correctedText, "Explain the definition of oop and programming.");
  assert.equal(result.wasCorrected, true);
});

test("Valid questions pass all 5 indicators with status 'valid'", () => {
  const result1 = validateQuestionSync({
    question: "Can you describe a challenging programming project you completed?",
    category: "Technical",
    difficulty: "Medium",
    existingQuestions: [],
  });
  assert.equal(result1.status, "valid");
  assert.equal(result1.checks.grammarAndSpelling.status, "pass");
  assert.equal(result1.checks.structureAndClarity.status, "pass");
  assert.equal(result1.checks.categoryRelevance.status, "pass");
  assert.equal(result1.checks.interviewSuitability.status, "pass");
  assert.equal(result1.checks.duplicateDetection.status, "pass");

  const result2 = validateQuestionSync({
    question: "How would you handle a disagreement with a team member in a project?",
    category: "Behavioral",
    difficulty: "Medium",
    existingQuestions: [],
  });
  assert.equal(result2.status, "valid");

  const result3 = validateQuestionSync({
    question: "What is the difference between a primary key and a foreign key in SQL?",
    category: "Technical",
    difficulty: "Easy",
    existingQuestions: [],
  });
  assert.equal(result3.status, "valid");
});

test("Rejects empty questions, whitespace-only, and symbol gibberish", () => {
  const emptyRes = validateQuestionSync({
    question: "   ",
    category: "Technical",
    difficulty: "Easy",
  });
  assert.equal(emptyRes.status, "invalid");
  assert.equal(emptyRes.checks.structureAndClarity.status, "fail");

  const symbolRes = validateQuestionSync({
    question: "??? !!! @@@ ### $$$ %%%",
    category: "HR",
    difficulty: "Easy",
  });
  assert.equal(symbolRes.status, "invalid");
  assert.equal(symbolRes.checks.structureAndClarity.status, "fail");
});

test("Rejects questions shorter than minimum length or fewer than 4 words", () => {
  const shortRes = validateQuestionSync({
    question: "Why code?",
    category: "Technical",
    difficulty: "Easy",
  });
  assert.equal(shortRes.status, "invalid");
  assert.equal(shortRes.checks.structureAndClarity.status, "fail");
});

test("Identifies and rejects broken question structure (user examples)", () => {
  // Example 1: "Describe challenging project can you?"
  const salad1 = validateQuestionSync({
    question: "Describe challenging project can you?",
    category: "Technical",
    difficulty: "Medium",
  });
  assert.equal(salad1.status, "invalid");
  assert.equal(salad1.checks.grammarAndSpelling.status, "fail");

  // Example 2: "How would you handle?"
  const incomplete = validateQuestionSync({
    question: "How would you handle?",
    category: "Behavioral",
    difficulty: "Medium",
  });
  assert.equal(incomplete.status, "invalid");
  assert.equal(incomplete.checks.structureAndClarity.status, "fail");

  // Example 3: "Programming team database what?"
  const salad2 = validateQuestionSync({
    question: "Programming team database what?",
    category: "Technical",
    difficulty: "Medium",
  });
  assert.equal(salad2.status, "invalid");
  assert.equal(salad2.checks.structureAndClarity.status, "fail");
});

test("Flags discriminatory / prohibited interview topics as 'invalid'", () => {
  const ageRes = validateQuestionSync({
    question: "What is your date of birth and how old are you?",
    category: "HR",
    difficulty: "Easy",
  });
  assert.equal(ageRes.status, "invalid");
  assert.equal(ageRes.checks.interviewSuitability.status, "fail");

  const maritalRes = validateQuestionSync({
    question: "Are you married and do you have children?",
    category: "HR",
    difficulty: "Easy",
  });
  assert.equal(maritalRes.status, "invalid");
  assert.equal(maritalRes.checks.interviewSuitability.status, "fail");

  const religionRes = validateQuestionSync({
    question: "What is your religion and what church do you attend?",
    category: "HR",
    difficulty: "Easy",
  });
  assert.equal(religionRes.status, "invalid");
  assert.equal(religionRes.checks.interviewSuitability.status, "fail");
});

test("Detects exact duplicate questions in database and prevents saving", () => {
  const exactRes = validateQuestionSync({
    question: "What is the difference between a primary key and a foreign key?",
    category: "Technical",
    difficulty: "Easy",
    existingQuestions: SAMPLE_EXISTING_QUESTIONS,
  });
  assert.equal(exactRes.status, "invalid");
  assert.equal(exactRes.checks.duplicateDetection.status, "fail");
  assert.equal(exactRes.checks.duplicateDetection.matches.length, 1);
});

test("Ignores self when editing an existing question", () => {
  const selfRes = validateQuestionSync({
    question: "What is the difference between a primary key and a foreign key?",
    category: "Technical",
    difficulty: "Easy",
    existingQuestions: SAMPLE_EXISTING_QUESTIONS,
    currentQuestionId: "q-3",
  });
  assert.equal(selfRes.checks.duplicateDetection.status, "pass");
});

test("Detects near-duplicates and returns 'needs_revision' warning", () => {
  const nearRes = validateQuestionSync({
    question: "Can you describe a challenging coding project you have completed?",
    category: "Technical",
    difficulty: "Medium",
    existingQuestions: SAMPLE_EXISTING_QUESTIONS,
  });
  assert.equal(nearRes.checks.duplicateDetection.status, "warn");
  assert.equal(nearRes.status, "needs_revision");
});

test("Warns about cross-category mismatch", () => {
  const mismatchRes = validateQuestionSync({
    question: "What are your salary expectations and relocation preferences?",
    category: "Technical",
    difficulty: "Easy",
  });
  assert.equal(mismatchRes.checks.categoryRelevance.status, "warn");
});

test("calculateTokenSimilarity computes token overlap between questions", () => {
  const exact = calculateTokenSimilarity(
    "describe a challenging project",
    "describe a challenging project"
  );
  assert.equal(exact, 1);

  const partial = calculateTokenSimilarity(
    "describe a challenging coding project",
    "describe a challenging programming project"
  );
  assert.ok(partial > 0.6);
});

test("toDisplayDifficultyTier normalizes difficulty tiers safely", () => {
  assert.equal(toDisplayDifficultyTier("Easy"), "Easy");
  assert.equal(toDisplayDifficultyTier("EASY"), "Easy");
  assert.equal(toDisplayDifficultyTier("medium"), "Medium");
  assert.equal(toDisplayDifficultyTier("HARD"), "Hard");
  assert.equal(toDisplayDifficultyTier("hard"), "Hard");
  assert.equal(toDisplayDifficultyTier("invalid"), "");
  assert.equal(toDisplayDifficultyTier(""), "");
  assert.equal(toDisplayDifficultyTier(null), "");
});

test("toDifficultyCode normalizes difficulty tiers to uppercase codes", () => {
  assert.equal(toDifficultyCode("Easy"), "EASY");
  assert.equal(toDifficultyCode("medium"), "MEDIUM");
  assert.equal(toDifficultyCode("HARD"), "HARD");
  assert.equal(toDifficultyCode("other"), "");
});

test("validateDifficultyClassification validates all 4 criteria and rejects incomplete payloads", () => {
  const valid = validateDifficultyClassification({
    suggestedDifficulty: "medium",
    difficultyReason: "Requires applying SQL indexing concepts to improve query latency.",
    difficultyAssessment: {
      knowledge_required: "Understanding of B-tree indexes and query execution plans.",
      cognitive_complexity: "Applying indexing trade-offs to practical read/write workloads.",
      problem_solving: "Diagnosing slow queries and selecting an index strategy.",
      experience_required: "Practical coursework or OJT project database tuning.",
    },
  });

  assert.equal(valid?.difficulty, "MEDIUM");
  assert.equal(valid?.difficultyTier, "Medium");
  assert.equal(valid?.assessment.knowledge_required, "Understanding of B-tree indexes and query execution plans.");

  // Rejects unsupported difficulty values
  assert.equal(
    validateDifficultyClassification({
      suggestedDifficulty: "EXPERT",
      difficultyReason: "reason",
      difficultyAssessment: {
        knowledge_required: "k",
        cognitive_complexity: "c",
        problem_solving: "p",
        experience_required: "e",
      },
    }),
    null
  );

  // Rejects missing criteria or missing reason instead of defaulting silently
  assert.equal(
    validateDifficultyClassification({
      suggestedDifficulty: "EASY",
      difficultyReason: "",
      difficultyAssessment: {
        knowledge_required: "k",
        cognitive_complexity: "c",
        problem_solving: "p",
        experience_required: "e",
      },
    }),
    null
  );
  assert.equal(
    validateDifficultyClassification({
      suggestedDifficulty: "HARD",
      difficultyReason: "Requires deep trade-off evaluation.",
      difficultyAssessment: {
        knowledge_required: "k",
        cognitive_complexity: "",
        problem_solving: "p",
        experience_required: "e",
      },
    }),
    null
  );
  assert.equal(validateDifficultyClassification(null), null);
});

test("resolveDifficultyPersistence tracks AI vs ADMIN_OVERRIDE and blocks incomplete saves", () => {
  const sampleAssessment = {
    knowledge_required: "Fundamental database concepts.",
    cognitive_complexity: "Applying normalization rules to schema design.",
    problem_solving: "Resolving redundancy in a moderate table structure.",
    experience_required: "Academic database project experience.",
  };

  const accepted = resolveDifficultyPersistence({
    selectedDifficulty: "Medium",
    aiSuggestedDifficulty: "MEDIUM",
    assessment: sampleAssessment,
    reason: "Applies database design knowledge.",
    hasCompletedClassification: true,
  });
  assert.equal(accepted.isComplete, true);
  assert.equal(accepted.difficulty, "Medium");
  assert.equal(accepted.ai_suggested_difficulty, "MEDIUM");
  assert.equal(accepted.classification_status, "COMPLETED");
  assert.equal(accepted.classification_method, "AI");

  const overridden = resolveDifficultyPersistence({
    selectedDifficulty: "Hard",
    aiSuggestedDifficulty: "MEDIUM",
    assessment: sampleAssessment,
    reason: "Applies database design knowledge.",
    hasCompletedClassification: true,
  });
  assert.equal(overridden.isComplete, true);
  assert.equal(overridden.difficulty, "Hard");
  assert.equal(overridden.ai_suggested_difficulty, "MEDIUM");
  assert.equal(overridden.classification_method, "ADMIN_OVERRIDE");

  const incomplete = resolveDifficultyPersistence({
    selectedDifficulty: "Medium",
    aiSuggestedDifficulty: "",
    assessment: null,
    reason: "",
    hasCompletedClassification: false,
  });
  assert.equal(incomplete.isComplete, false);
});
