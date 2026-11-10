import { supabase } from "./supabase.js";

/**
 * Question Validation & Grammar Correction Engine for PrepMate AI.
 *
 * Implements:
 * 1. AI-assisted / Heuristic Automatic Grammar & Spelling Correction
 * 2. 5 Distinct Validation Indicators:
 *    - Grammar & Spelling
 *    - Question Structure & Clarity
 *    - Category Relevance
 *    - Interview Suitability
 *    - Duplicate Detection
 * 3. 3 Authoritative Status Tiers:
 *    - Valid (Green)
 *    - Needs Revision (Amber)
 *    - Invalid (Rose)
 */

export const VALID_CATEGORIES = ["Technical", "Behavioral", "Situational", "HR"];
export const VALID_DIFFICULTIES = ["Easy", "Medium", "Hard"];

export const MIN_QUESTION_LENGTH = 15;
export const MAX_QUESTION_LENGTH = 500;
export const MIN_WORD_COUNT = 4;

// Common English question starters and imperative interview prompt starters
const DIRECT_QUESTION_STARTERS = [
  "can", "could", "how", "what", "why", "when", "where", "which",
  "who", "whom", "whose", "would", "will", "do", "does", "did",
  "is", "are", "have", "has", "should",
];

const IMPERATIVE_PROMPT_STARTERS = [
  "describe", "explain", "discuss", "walk", "tell", "share",
  "give", "outline", "detail", "clarify", "illustrate", "compare",
  "contrast", "summarize", "elaborate", "identify",
];

const HYPOTHETICAL_STARTERS = [
  "if", "in a situation", "suppose", "imagine", "consider",
  "in the event", "assuming",
];

// Transitive verbs requiring a grammatical object
const TRANSITIVE_VERBS_REQUIRING_OBJECT = [
  "handle", "manage", "resolve", "address", "complete",
  "implement", "solve", "overcome", "navigate", "tackle",
];

// Prohibited inquiry patterns under labor and employment regulations
const PROHIBITED_INQUIRY_PATTERNS = [
  {
    topic: "Age / Year of Birth",
    regex: /\b(how old are you|what is your age|date of birth|year (did you|of) graduat(e|ion)|when were you born|when do you plan to retire)\b/i,
    explanation: "Inquiries regarding an applicant's age or birth year are prohibited under employment non-discrimination regulations.",
  },
  {
    topic: "Marital Status / Family Planning",
    regex: /\b(are you married|marital status|do you have (kids|children)|planning (to have|a) (baby|family|children)|are you pregnant|childcare arrangements|your (husband|wife|spouse))\b/i,
    explanation: "Inquiries regarding marital status, pregnancy, family planning, or children are protected personal matters prohibited in employment interviews.",
  },
  {
    topic: "Religion / Faith",
    regex: /\b(what is your religion|what church|do you believe in god|religious (beliefs|practices|holidays)|what faith|do you attend church|do you pray)\b/i,
    explanation: "Questions concerning an applicant's religious beliefs or affiliations are strictly prohibited in employment interviews.",
  },
  {
    topic: "Race / Ethnicity / Origin",
    regex: /\b(what (is your )?race|what (is your )?ethnicity|skin color|what country are you originally from|where are your parents from|are you a native speaker)\b/i,
    explanation: "Questions regarding race, ethnicity, or national origin violate employment non-discrimination standards.",
  },
  {
    topic: "Disability / Medical History",
    regex: /\b(do you have (a )?disabilit(y|ies)|medical (history|conditions|issues)|health problems|mental illness|prescription drugs|how many sick days did you take)\b/i,
    explanation: "Questions inquiring into an applicant's medical history or disabilities violate disability rights and employment regulations.",
  },
  {
    topic: "Sexual Orientation / Gender Identity",
    regex: /\b(sexual orientation|are you (gay|lesbian|straight|bisexual|transgender)|gender identity)\b/i,
    explanation: "Inquiries regarding sexual orientation or gender identity are prohibited in professional job interviews.",
  },
  {
    topic: "Political Affiliation",
    regex: /\b(who did you vote for|political (party|affiliation|views|beliefs)|are you (democrat|republican))\b/i,
    explanation: "Political affiliation questions are inappropriate for professional employment assessments.",
  },
];

// Prompt injection or irrelevant directives
const INJECTION_PATTERNS = [
  /\bignore (all )?(previous|prior) (instructions|prompts)\b/i,
  /\bsystem prompt\b/i,
  /\bjailbreak\b/i,
  /\byou are now (a|an)\b/i,
  /\bwrite a (poem|story|song|essay) about\b/i,
];

// Profanity / Vulgarity pattern
const PROFANITY_PATTERN = /\b(fuck|shit|bitch|asshole|bastard|cunt|dick|pussy|fag|nigger|retard)\b/i;

// Domain Keyword Dictionaries for Category Relevance Checking
const CATEGORY_LEXICONS = {
  Technical: [
    "code", "coding", "program", "programming", "software", "developer", "development",
    "database", "sql", "nosql", "query", "schema", "table", "index", "primary key", "foreign key",
    "api", "rest", "graphql", "endpoint", "crud", "http", "https", "status code",
    "algorithm", "data structure", "array", "linked list", "tree", "graph", "stack", "queue", "hash map",
    "complexity", "big o", "runtime", "memory", "space complexity",
    "git", "github", "version control", "merge", "branch", "commit", "pull request", "rebase",
    "react", "angular", "vue", "node", "express", "python", "javascript", "typescript", "java", "c++", "c#", "php", "ruby", "go", "rust",
    "frontend", "backend", "full stack", "fullstack", "ui", "ux", "responsive", "css", "html",
    "server", "client", "network", "tcp", "ip", "dns", "ssl", "tls", "socket", "port",
    "cloud", "aws", "azure", "gcp", "docker", "kubernetes", "container", "ci/cd", "devops",
    "oop", "object-oriented", "class", "inheritance", "polymorphism", "encapsulation", "abstraction",
    "async", "asynchronous", "await", "promise", "concurrency", "thread", "multithreading", "deadlock",
    "test", "testing", "unit test", "integration test", "debugging", "debug", "refactor", "lint",
    "framework", "library", "architecture", "microservices", "monolith", "cache", "redis",
  ],
  Behavioral: [
    "time when", "situation where", "give an example", "describe an instance", "have you ever",
    "experience", "past project", "previous role", "disagreement", "conflict", "colleague",
    "team member", "coworker", "teammate", "manager", "supervisor", "client", "customer",
    "mistake", "failure", "failed", "learned", "overcome", "challenge", "difficult",
    "leadership", "led", "teamwork", "collaborat", "pressure", "deadline", "stress",
    "priority", "prioritized", "achievement", "accomplishment", "proud of", "feedback",
    "criticism", "adapt", "adapted", "change", "resolved", "initiative",
  ],
  Situational: [
    "what would you do if", "how would you handle", "imagine", "suppose", "hypothetically",
    "if a client", "if a customer", "if a colleague", "if a team member", "if your manager",
    "if you disagree", "if you discovered", "if you missed", "if you were given",
    "what steps would you take", "how would you react", "how would you resolve",
    "faced with", "unclear requirements", "tight deadline", "competing priorities",
    "production bug", "outage", "system down", "unhappy client", "scenario",
  ],
  HR: [
    "career", "goals", "background", "tell me about yourself", "strengths", "weaknesses",
    "work ethic", "values", "culture", "fit", "salary", "compensation", "expectation",
    "availability", "start date", "notice period", "relocat", "remote", "hybrid", "onsite",
    "education", "degree", "college", "university", "motivation", "motivate", "interest in",
    "why do you want", "why should we hire", "5 years", "five years", "passion", "long-term",
    "work environment", "management style", "leave your current", "resume", "cv",
  ],
};

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(text, keyword) {
  const escaped = escapeRegExp(keyword);
  if (/[^a-z0-9]$/i.test(keyword)) {
    const regex = new RegExp(`(?:^|\\s|[.,!?;])${escaped}(?:$|\\s|[.,!?;])`, "i");
    return regex.test(text);
  }
  const regex = new RegExp(`\\b${escaped}`, "i");
  return regex.test(text);
}

/**
 * Normalizes text for comparison and token extraction.
 */
export function normalizeText(text) {
  if (!text) return "";
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Strips punctuation and stop words for semantic similarity comparison.
 */
export function extractKeyTokens(text) {
  if (!text) return [];
  const stopWords = new Set([
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "by", "from",
    "and", "or", "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "can", "could", "would", "should", "will", "i",
    "you", "your", "my", "we", "our", "it", "its", "that", "this", "these", "those",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculates token similarity (Dice coefficient) between two strings (0.0 to 1.0).
 */
export function calculateTokenSimilarity(textA, textB) {
  const tokensA = new Set(extractKeyTokens(textA));
  const tokensB = new Set(extractKeyTokens(textB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((token) => tokensB.has(token)));
  return (2 * intersection.size) / (tokensA.size + tokensB.size);
}

/**
 * Automatically corrects grammar, spelling, punctuation, capitalization,
 * missing auxiliary verbs, and awkward phrasing while strictly preserving the
 * question's original meaning and technical terms.
 *
 * @param {string} text - Raw input question
 * @returns {{ correctedText: string, wasCorrected: boolean, changes: string[] }}
 */
export function autoCorrectGrammar(text) {
  if (!text || typeof text !== "string") {
    return { correctedText: "", wasCorrected: false, changes: [] };
  }

  const originalTrimmed = text.trim();
  if (!originalTrimmed) {
    return { correctedText: "", wasCorrected: false, changes: [] };
  }

  let corrected = originalTrimmed.replace(/\s+/g, " ");
  const changes = [];

  // 1. Common spelling typos in interview questions
  const SPELLING_CORRECTIONS = [
    [/\bstrength and weakness\b/gi, "strengths and weaknesses", "Fixed pluralization: 'strength and weakness' -> 'strengths and weaknesses'"],
    [/\bstrength and weaknesses\b/gi, "strengths and weaknesses", "Fixed pluralization: 'strength and weaknesses' -> 'strengths and weaknesses'"],
    [/\bstrengths and weakness\b/gi, "strengths and weaknesses", "Fixed pluralization: 'strengths and weakness' -> 'strengths and weaknesses'"],
    [/\bstrenght\b/gi, "strength", "Corrected spelling: 'strenght' -> 'strength'"],
    [/\bstrenghts\b/gi, "strengths", "Corrected spelling: 'strenghts' -> 'strengths'"],
    [/\bweaknes\b/gi, "weakness", "Corrected spelling: 'weaknes' -> 'weakness'"],
    [/\bweaknesss\b/gi, "weaknesses", "Corrected spelling: 'weaknesss' -> 'weaknesses'"],
    [/\bdefiniton\b/gi, "definition", "Corrected spelling: 'definiton' -> 'definition'"],
    [/\bdefinitons\b/gi, "definitions", "Corrected spelling: 'definitons' -> 'definitions'"],
    [/\bprograming\b/gi, "programming", "Corrected spelling: 'programing' -> 'programming'"],
    [/\bdevelopement\b/gi, "development", "Corrected spelling: 'developement' -> 'development'"],
    [/\bresponce\b/gi, "response", "Corrected spelling: 'responce' -> 'response'"],
    [/\bresponces\b/gi, "responses", "Corrected spelling: 'responces' -> 'responses'"],
    [/\bchalenge\b/gi, "challenge", "Corrected spelling: 'chalenge' -> 'challenge'"],
    [/\bchalenges\b/gi, "challenges", "Corrected spelling: 'chalenges' -> 'challenges'"],
    [/\bchalenging\b/gi, "challenging", "Corrected spelling: 'chalenging' -> 'challenging'"],
    [/\bexperiance\b/gi, "experience", "Corrected spelling: 'experiance' -> 'experience'"],
    [/\bexperiances\b/gi, "experiences", "Corrected spelling: 'experiances' -> 'experiences'"],
    [/\boppurtunity\b/gi, "opportunity", "Corrected spelling: 'oppurtunity' -> 'opportunity'"],
    [/\bopurtunity\b/gi, "opportunity", "Corrected spelling: 'opurtunity' -> 'opportunity'"],
    [/\bmanagment\b/gi, "management", "Corrected spelling: 'managment' -> 'management'"],
    [/\benviornment\b/gi, "environment", "Corrected spelling: 'enviornment' -> 'environment'"],
    [/\bsuccesful\b/gi, "successful", "Corrected spelling: 'succesful' -> 'successful'"],
    [/\bpriviledge\b/gi, "privilege", "Corrected spelling: 'priviledge' -> 'privilege'"],
    [/\bseperate\b/gi, "separate", "Corrected spelling: 'seperate' -> 'separate'"],
    [/\boccured\b/gi, "occurred", "Corrected spelling: 'occured' -> 'occurred'"],
    [/\brecieve\b/gi, "receive", "Corrected spelling: 'recieve' -> 'receive'"],
    [/\barchitechture\b/gi, "architecture", "Corrected spelling: 'architechture' -> 'architecture'"],
    [/\btechnolgy\b/gi, "technology", "Corrected spelling: 'technolgy' -> 'technology'"],
    [/\bposistion\b/gi, "position", "Corrected spelling: 'posistion' -> 'position'"],
    [/\breponsibility\b/gi, "responsibility", "Corrected spelling: 'reponsibility' -> 'responsibility'"],
    [/\breponsibilities\b/gi, "responsibilities", "Corrected spelling: 'reponsibilities' -> 'responsibilities'"],
    [/\bdiffrence\b/gi, "difference", "Corrected spelling: 'diffrence' -> 'difference'"],
    [/\bdiffrent\b/gi, "different", "Corrected spelling: 'diffrent' -> 'different'"],
    [/\bdiffernce\b/gi, "difference", "Corrected spelling: 'differnce' -> 'difference'"],
    [/\bworkpalce\b/gi, "workplace", "Corrected spelling: 'workpalce' -> 'workplace'"],
    [/\bcollegue\b/gi, "colleague", "Corrected spelling: 'collegue' -> 'colleague'"],
    [/\bcollegues\b/gi, "colleagues", "Corrected spelling: 'collegues' -> 'colleagues'"],
    [/\bcowoker\b/gi, "coworker", "Corrected spelling: 'cowoker' -> 'coworker'"],
    [/\bcowokers\b/gi, "coworkers", "Corrected spelling: 'cowokers' -> 'coworkers'"],
    [/\byou self\b/gi, "yourself", "Corrected spelling: 'you self' -> 'yourself'"],
    [/\byour self\b/gi, "yourself", "Corrected spelling: 'your self' -> 'yourself'"],
    [/\bwhat is you goal\b/gi, "what is your goal", "Corrected pronoun: 'you goal' -> 'your goal'"],
    [/\bwhat is you goals\b/gi, "what are your goals", "Corrected grammar: 'what is you goals' -> 'what are your goals'"],
    [/\byou goal\b/gi, "your goal", "Corrected pronoun: 'you goal' -> 'your goal'"],
    [/\byou goals\b/gi, "your goals", "Corrected pronoun: 'you goals' -> 'your goals'"],
    [/\byou experience\b/gi, "your experience", "Corrected pronoun: 'you experience' -> 'your experience'"],
  ];

  for (const [regex, replacement, description] of SPELLING_CORRECTIONS) {
    if (regex.test(corrected)) {
      corrected = corrected.replace(regex, replacement);
      changes.push(description);
    }
  }

  // 2. Subject-Verb Agreement:
  // "what is your goals" -> "what are your goals"
  if (/\bwhat is your (goals|strengths|plans|weaknesses|responsibilities|priorities|expectations|hobbies|achievements)\b/i.test(corrected)) {
    corrected = corrected.replace(/\bwhat is your (goals|strengths|plans|weaknesses|responsibilities|priorities|expectations|hobbies|achievements)\b/gi, "what are your $1");
    changes.push("Subject-verb agreement: 'what is your [plural]' -> 'what are your [plural]'");
  }

  // "how is your skills" -> "how are your skills"
  if (/\bhow is your (skills|qualifications|strengths|credentials)\b/i.test(corrected)) {
    corrected = corrected.replace(/\bhow is your (skills|qualifications|strengths|credentials)\b/gi, "how are your $1");
    changes.push("Subject-verb agreement: 'how is your [plural]' -> 'how are your [plural]'");
  }

  // "what are the difference between" -> "what is the difference between"
  if (/\bwhat are (the|your) (difference|current role|main strength|biggest weakness|primary goal)\b/i.test(corrected)) {
    corrected = corrected.replace(/\bwhat are (the|your) (difference|current role|main strength|biggest weakness|primary goal)\b/gi, "what is $1 $2");
    changes.push("Subject-verb agreement: 'what are [singular]' -> 'what is [singular]'");
  }

  // 3. Adjective vs Noun confusion & Redundant Wh- phrases:
  // "Explain what is the different between frontend and backend development?"
  // -> "Explain the difference between frontend and backend development."
  if (/\bexplain what is the (?:different|difference) between\b/i.test(corrected)) {
    corrected = corrected.replace(/\bexplain what is the (?:different|difference) between\b/gi, "explain the difference between");
    changes.push("Simplified clause: 'explain what is the different between' -> 'explain the difference between'");
  } else if (/\bwhat is the different between\b/i.test(corrected)) {
    corrected = corrected.replace(/\bwhat is the different between\b/gi, "what is the difference between");
    changes.push("Noun-adjective correction: 'different between' -> 'difference between'");
  } else if (/\bthe different between\b/i.test(corrected)) {
    corrected = corrected.replace(/\bthe different between\b/gi, "the difference between");
    changes.push("Noun-adjective correction: 'the different between' -> 'the difference between'");
  }

  // "can you explain what is the difference between" -> "can you explain the difference between"
  if (/\bcan you explain what is the difference between\b/i.test(corrected)) {
    corrected = corrected.replace(/\bcan you explain what is the difference between\b/gi, "can you explain the difference between");
    changes.push("Simplified direct question phrasing");
  }

  // 4. Missing Auxiliary Verbs:
  // "How you handle difficult situation in workplace?" -> "How do you handle difficult situations in the workplace?"
  if (/\bhow you (handle|resolve|manage|deal with|approach|prioritize|tackle|solve|overcome)\b/i.test(corrected)) {
    corrected = corrected.replace(/\bhow you (handle|resolve|manage|deal with|approach|prioritize|tackle|solve|overcome)\b/gi, "how do you $1");
    changes.push("Added missing auxiliary verb: 'how you [verb]' -> 'how do you [verb]'");
  }
  if (/\bwhy you (want|chose|left|decided|applied)\b/i.test(corrected)) {
    corrected = corrected.replace(/\bwhy you (want|chose|left|decided|applied)\b/gi, "why do you $1");
    changes.push("Added missing auxiliary verb: 'why you [verb]' -> 'why do you [verb]'");
  }
  if (/\bwhere you see yourself\b/i.test(corrected)) {
    corrected = corrected.replace(/\bwhere you see yourself\b/gi, "where do you see yourself");
    changes.push("Added missing auxiliary verb: 'where you see' -> 'where do you see'");
  }
  if (/\bhow you would\b/i.test(corrected)) {
    corrected = corrected.replace(/\bhow you would\b/gi, "how would you");
    changes.push("Inversion order: 'how you would' -> 'how would you'");
  }

  // 5. Missing Articles & Workplace Idiomatic Phrasing:
  // "in workplace" -> "in the workplace"
  if (/\bin workplace\b/i.test(corrected)) {
    corrected = corrected.replace(/\bin workplace\b/gi, "in the workplace");
    changes.push("Added missing article: 'in workplace' -> 'in the workplace'");
  }
  // "difficult situation in" -> "difficult situations in"
  if (/\bdifficult situation (?:in|at|with)\b/i.test(corrected) && !/\ba difficult situation\b/i.test(corrected)) {
    corrected = corrected.replace(/\bdifficult situation (in|at|with)\b/gi, "difficult situations $1");
    changes.push("Pluralized noun: 'difficult situation' -> 'difficult situations'");
  }
  // "on team" -> "on a team" / "in team" -> "in a team"
  if (/\b(on|in) team\b/i.test(corrected) && !/\b(on|in) (?:a|the|our|your) team\b/i.test(corrected)) {
    corrected = corrected.replace(/\b(on|in) team\b/gi, "$1 a team");
    changes.push("Added missing article: '$1 team' -> '$1 a team'");
  }
  // "in company" -> "in the company"
  if (/\bin company\b/i.test(corrected) && !/\bin (?:a|the|our|your) company\b/i.test(corrected)) {
    corrected = corrected.replace(/\bin company\b/gi, "in the company");
    changes.push("Added missing article: 'in company' -> 'in the company'");
  }

  // 6. Sentence Capitalization:
  if (/^[a-z]/.test(corrected)) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
    changes.push("Capitalized first letter");
  }

  // 7. Terminal Punctuation:
  corrected = corrected.replace(/[,;]+$/g, "").replace(/\?{2,}/g, "?").replace(/\.{2,}/g, ".");

  const firstWord = corrected.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  const isDirect = DIRECT_QUESTION_STARTERS.includes(firstWord) || HYPOTHETICAL_STARTERS.some((s) => corrected.toLowerCase().startsWith(s));
  const isImperative = IMPERATIVE_PROMPT_STARTERS.includes(firstWord);

  if (isImperative) {
    if (corrected.endsWith("?")) {
      corrected = corrected.slice(0, -1) + ".";
      changes.push("Updated terminal punctuation: imperative prompt concludes with period (.)");
    } else if (!corrected.endsWith(".")) {
      corrected += ".";
      changes.push("Added terminal period (.) to prompt");
    }
  } else if (isDirect) {
    if (corrected.endsWith(".")) {
      corrected = corrected.slice(0, -1) + "?";
      changes.push("Updated terminal punctuation: direct question concludes with question mark (?)");
    } else if (!corrected.endsWith("?")) {
      corrected += "?";
      changes.push("Added terminal question mark (?)");
    }
  } else if (!/[?.!]$/.test(corrected)) {
    corrected += "?";
    changes.push("Added terminal question mark (?)");
  }

  const wasCorrected = corrected !== originalTrimmed;
  return {
    correctedText: corrected,
    wasCorrected,
    changes,
  };
}

/**
 * Validates a question against all deterministic rules and returns the 5 required checks.
 *
 * @param {Object} params
 * @param {string} params.question - The question text
 * @param {string} params.category - Technical, Behavioral, Situational, or HR
 * @param {string} params.difficulty - Easy, Medium, or Hard
 * @param {Array} [params.existingQuestions] - Array of existing question objects for duplicate checking
 * @param {string|number} [params.currentQuestionId] - Exclude self when editing
 * @param {boolean} [params.wasAutoCorrected] - Whether grammar correction was automatically applied
 * @returns {Object} Comprehensive validation result with 5 required indicators
 */
export function validateQuestionSync({
  question,
  category,
  difficulty,
  existingQuestions = [],
  currentQuestionId = null,
  wasAutoCorrected = false,
}) {
  const rawText = typeof question === "string" ? question : "";
  const trimmed = rawText.trim();
  const normalized = normalizeText(trimmed);

  const checks = {
    grammarAndSpelling: { status: "pass", title: "Grammar & Spelling", message: "" },
    structureAndClarity: { status: "pass", title: "Question Structure & Clarity", message: "" },
    categoryRelevance: { status: "pass", title: "Category Relevance", message: "" },
    interviewSuitability: { status: "pass", title: "Interview Suitability", message: "" },
    duplicateDetection: { status: "pass", title: "Duplicate Detection", message: "", matches: [] },
  };

  let suggestedQuestion = null;
  const issues = [];

  // ==========================================
  // 1. Required Field Validation & Basic Checks
  // ==========================================
  if (!trimmed) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: "Question prompt text must not be empty.",
    };
    return buildFinalResult("invalid", 0, "Question prompt is empty.", null, checks, false);
  }

  if (difficulty && !VALID_DIFFICULTIES.includes(difficulty)) {
    checks.structureAndClarity = {
      status: "warn",
      title: "Question Structure & Clarity",
      message: `Difficulty tier "${difficulty}" is outside standard stages (${VALID_DIFFICULTIES.join(", ")}).`,
    };
  }

  // Meaningless / Gibberish / Symbols check
  const letterCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const totalNonSpaceChars = trimmed.replace(/\s/g, "").length;
  const letterRatio = totalNonSpaceChars > 0 ? letterCount / totalNonSpaceChars : 0;

  if (letterRatio < 0.6) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: "Question contains excessive symbols, numbers, or meaningless characters.",
    };
    issues.push("Meaningless character composition");
  }

  // Character limits
  if (trimmed.length < MIN_QUESTION_LENGTH) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: `Question is too short (${trimmed.length} chars). Minimum is ${MIN_QUESTION_LENGTH} characters.`,
    };
    issues.push("Too short");
  } else if (trimmed.length > MAX_QUESTION_LENGTH) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: `Question exceeds the maximum length (${trimmed.length}/${MAX_QUESTION_LENGTH} chars). Keep prompts concise.`,
    };
    issues.push("Too long");
  }

  // Word count
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORD_COUNT) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: `Question contains only ${words.length} words. Please provide a complete prompt with at least ${MIN_WORD_COUNT} words.`,
    };
    issues.push("Word count too low");
  }

  // Repetitive spam check
  if (/(.)\1{4,}/i.test(trimmed)) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: "Question contains repetitive, meaningless letter sequences.",
    };
    issues.push("Repetitive characters");
  }

  // ==========================================
  // 2. Grammar, Spelling & Sentence Structure
  // ==========================================
  const lowerNormalized = normalized.toLowerCase();
  const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
  const isDirectQuestionStarter = DIRECT_QUESTION_STARTERS.includes(firstWord);
  const isHypotheticalStarter = HYPOTHETICAL_STARTERS.some((s) => lowerNormalized.startsWith(s));
  const isImperativeStarter = IMPERATIVE_PROMPT_STARTERS.includes(firstWord);

  // Check for broken word salad:
  // e.g., "Describe challenging project can you?"
  const endsWithInvertedAuxiliary = /\b(can you|could you|would you|what)\?*$/i.test(lowerNormalized);
  const startsWithImperative = IMPERATIVE_PROMPT_STARTERS.some((verb) => lowerNormalized.startsWith(verb));

  if (startsWithImperative && endsWithInvertedAuxiliary) {
    checks.grammarAndSpelling = {
      status: "fail",
      title: "Grammar & Spelling",
      message: "Malformed sentence structure detected (conflicting imperative opening with inverted auxiliary closing).",
    };
    issues.push("Malformed sentence structure");
    const cleaned = normalized.replace(/\s+(can you|could you|would you)\?*$/i, "");
    suggestedQuestion = `Can you ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}?`;
  }

  // Incomplete transitive verb ending (e.g. "How would you handle?")
  const lastTwoWords = words.slice(-2).map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
  const lastWordClean = lastTwoWords[lastTwoWords.length - 1];

  if (TRANSITIVE_VERBS_REQUIRING_OBJECT.includes(lastWordClean) && words.length <= 5) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: `Incomplete question: The verb "${lastWordClean}" requires an object or situation (e.g., "How would you ${lastWordClean} a difficult team conflict?").`,
    };
    issues.push("Incomplete predicate");
    suggestedQuestion = `${normalized.replace(/[?.]+$/, "")} a difficult challenge or workplace conflict?`;
  }

  // Unstructured word salad ending in "what" (e.g. "Programming team database what?")
  if (/\b[a-z]+\s+[a-z]+\s+what\?*$/i.test(lowerNormalized) && !/\b(is|are|does|do|can|could|would)\b/i.test(lowerNormalized)) {
    checks.structureAndClarity = {
      status: "fail",
      title: "Question Structure & Clarity",
      message: "Unstructured question words detected. Please construct a clear, grammatically sound sentence.",
    };
    issues.push("Unstructured word salad");
  }

  // Capitalization & punctuation warnings
  const isFirstLetterCapital = /^[A-Z]/.test(trimmed);
  const endsWithQuestionMark = trimmed.endsWith("?");
  const endsWithPeriod = trimmed.endsWith(".");

  if (!isFirstLetterCapital && checks.grammarAndSpelling.status === "pass") {
    checks.grammarAndSpelling = {
      status: "warn",
      title: "Grammar & Spelling",
      message: "The question should begin with a capital letter.",
    };
  }

  if ((isDirectQuestionStarter || isHypotheticalStarter) && !endsWithQuestionMark && checks.structureAndClarity.status === "pass") {
    checks.structureAndClarity = {
      status: "warn",
      title: "Question Structure & Clarity",
      message: "Direct questions should conclude with a question mark (?).",
    };
  } else if (isImperativeStarter && !endsWithPeriod && !endsWithQuestionMark && checks.structureAndClarity.status === "pass") {
    checks.structureAndClarity = {
      status: "warn",
      title: "Question Structure & Clarity",
      message: "Prompt directive should conclude with proper punctuation.",
    };
  }

  if (checks.grammarAndSpelling.status === "pass") {
    checks.grammarAndSpelling.message = wasAutoCorrected
      ? "Grammar, spelling, and capitalization were automatically verified and corrected."
      : "Grammar, spelling, and sentence syntax are verified and correct.";
  }

  if (checks.structureAndClarity.status === "pass") {
    checks.structureAndClarity.message = `Clear and understandable prompt (${trimmed.length} characters, ${words.length} words).`;
  }

  // ==========================================
  // 3. Category Relevance
  // ==========================================
  const relevantLexicon = CATEGORY_LEXICONS[category] || [];
  const matchedCategoryKeywords = relevantLexicon.filter((keyword) => matchesKeyword(lowerNormalized, keyword));

  let suspectedCategory = null;
  for (const [otherCat, lexicon] of Object.entries(CATEGORY_LEXICONS)) {
    if (otherCat === category) continue;
    const otherMatches = lexicon.filter((k) => matchesKeyword(lowerNormalized, k));
    if (otherMatches.length >= 2 && matchedCategoryKeywords.length === 0) {
      suspectedCategory = otherCat;
      break;
    }
  }

  if (suspectedCategory) {
    checks.categoryRelevance = {
      status: "warn",
      title: "Category Relevance",
      message: `This prompt appears more relevant to the "${suspectedCategory}" track than "${category}". Consider reviewing the assigned category.`,
    };
  } else if (matchedCategoryKeywords.length > 0) {
    checks.categoryRelevance = {
      status: "pass",
      title: "Category Relevance",
      message: `Well aligned with ${category} interview themes (matched keywords: ${matchedCategoryKeywords.slice(0, 3).join(", ")}).`,
    };
  } else {
    checks.categoryRelevance = {
      status: "pass",
      title: "Category Relevance",
      message: `Question accepted under ${category}. Ensure it addresses relevant track competencies.`,
    };
  }

  // ==========================================
  // 4. Interview Suitability & Non-Discrimination
  // ==========================================
  for (const prohibited of PROHIBITED_INQUIRY_PATTERNS) {
    if (prohibited.regex.test(lowerNormalized)) {
      checks.interviewSuitability = {
        status: "fail",
        title: "Interview Suitability",
        message: `Inappropriate Interview Question: ${prohibited.explanation} (${prohibited.topic}).`,
      };
      issues.push(`Prohibited topic: ${prohibited.topic}`);
      break;
    }
  }

  if (PROFANITY_PATTERN.test(lowerNormalized) && checks.interviewSuitability.status !== "fail") {
    checks.interviewSuitability = {
      status: "fail",
      title: "Interview Suitability",
      message: "Inappropriate language: Professional interview questions must not contain profanity or vulgar terms.",
    };
    issues.push("Profanity detected");
  }

  if (INJECTION_PATTERNS.some((p) => p.test(lowerNormalized)) && checks.interviewSuitability.status !== "fail") {
    checks.interviewSuitability = {
      status: "fail",
      title: "Interview Suitability",
      message: "Irrelevant instruction or prompt injection detected.",
    };
    issues.push("Prompt injection");
  }

  if (checks.interviewSuitability.status === "pass") {
    checks.interviewSuitability.message = "Professional, workplace-appropriate, and compliant with employment non-discrimination standards.";
  }

  // ==========================================
  // 5. Duplicate & Similarity Detection
  // ==========================================
  const candidateKeyTokens = extractKeyTokens(normalized);
  const normalizedCharsOnly = normalized.toLowerCase().replace(/[^a-z0-9]/g, "");

  const exactDuplicates = [];
  const similarQuestions = [];

  for (const item of existingQuestions) {
    const itemId = item.id || item.question_id;
    if (currentQuestionId && String(itemId) === String(currentQuestionId)) {
      continue;
    }

    const itemText = item.question || item.title || "";
    const itemNormalizedChars = itemText.toLowerCase().replace(/[^a-z0-9]/g, "");

    // 1. Exact Duplicate
    if (normalizedCharsOnly && normalizedCharsOnly === itemNormalizedChars) {
      exactDuplicates.push({
        id: itemId,
        question: itemText,
        category: item.category || "General",
        similarity: 1.0,
      });
      continue;
    }

    // 2. High Semantic / Token Overlap
    if (candidateKeyTokens.length >= 3) {
      const similarity = calculateTokenSimilarity(normalized, itemText);
      if (similarity >= 0.70) {
        similarQuestions.push({
          id: itemId,
          question: itemText,
          category: item.category || "General",
          similarity: Math.round(similarity * 100),
        });
      }
    }
  }

  if (exactDuplicates.length > 0) {
    checks.duplicateDetection = {
      status: "fail",
      title: "Duplicate Detection",
      message: `Exact duplicate detected: An identical question already exists in the question bank (ID: ${exactDuplicates[0].id}).`,
      matches: exactDuplicates,
    };
    issues.push("Exact duplicate found");
  } else if (similarQuestions.length > 0) {
    checks.duplicateDetection = {
      status: "warn",
      title: "Duplicate Detection",
      message: `Possible near-duplicate: Found ${similarQuestions.length} substantially similar existing question(s). Review to avoid redundant interview prompts.`,
      matches: similarQuestions,
    };
  } else {
    checks.duplicateDetection = {
      status: "pass",
      title: "Duplicate Detection",
      message: "Unique prompt. No duplicate or overly similar questions found in the question bank.",
      matches: [],
    };
  }

  // ==========================================
  // Final Status & Score Compilation
  // ==========================================
  const checkValues = Object.values(checks);
  const hasFailure = checkValues.some((c) => c.status === "fail");
  const hasWarning = checkValues.some((c) => c.status === "warn");

  let status = "valid";
  let score = 100;
  let overallFeedback = wasAutoCorrected
    ? "Question grammar was automatically corrected and passes all validation requirements."
    : "The question passes all grammar, structure, suitability, relevance, and duplication criteria.";

  if (hasFailure) {
    status = "invalid";
    score = Math.max(15, 60 - issues.length * 20);
    overallFeedback = `Validation failed: ${issues.join("; ")}. Please correct the flagged requirements before saving.`;
  } else if (hasWarning) {
    status = "needs_revision";
    score = 80;
    overallFeedback = "The question is understandable but requires minor revisions or attention to warnings before being saved.";
  }

  return buildFinalResult(status, score, overallFeedback, suggestedQuestion, checks, wasAutoCorrected);
}

function buildFinalResult(status, score, overallFeedback, suggestedQuestion, checks, wasAutoCorrected) {
  return {
    status, // "valid" | "needs_revision" | "invalid"
    score,
    overallFeedback,
    suggestedQuestion,
    checks,
    wasAutoCorrected,
  };
}

/**
 * Validates an interview question using the backend Gemini AI Edge Function.
 * Returns the AI-corrected question, individual validation indicators, status, and score.
 * If Gemini is unavailable, returns a structured error object.
 */
export async function validateQuestionWithAiOrRules({
  question,
  category,
  difficulty,
  currentQuestionId = null,
}) {
  const trimmed = typeof question === "string" ? question.trim() : "";
  if (!trimmed) {
    return {
      success: false,
      error: "Please provide the question prompt text before validating.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("validate-question", {
      body: {
        question: trimmed,
        category: category || "Technical",
        difficulty: difficulty || "Medium",
        currentQuestionId,
      },
    });

    if (error) {
      console.error("Supabase edge function error:", error);
      let errorMsg = error.message;

      // Extract detailed server error response body if available from HTTP context
      if (error.context && typeof error.context.json === "function") {
        try {
          const errorBody = await error.context.json();
          if (errorBody?.error) {
            errorMsg = errorBody.error;
          }
        } catch {
          // fallback to error.message
        }
      }

      return {
        success: false,
        error: errorMsg || "Failed to validate question with Gemini. Please check server connection.",
      };
    }

    if (!data?.success || !data?.validation) {
      return {
        success: false,
        error: data?.error || "AI validation could not be completed. Please try again.",
      };
    }

    return {
      success: true,
      ...data.validation,
    };
  } catch (err) {
    console.error("Validation invocation error:", err);
    return {
      success: false,
      error: err.message || "Unable to reach the validation service. Please check network connectivity.",
    };
  }
}
