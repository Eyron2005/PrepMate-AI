import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CATEGORY_ALIASES: Record<string, "Technical" | "Behavioral" | "Situational" | "HR"> = {
  technical: "Technical",
  "technical questions": "Technical",
  behavioral: "Behavioral",
  "behavioral questions": "Behavioral",
  situational: "Situational",
  "situational questions": "Situational",
  hr: "HR",
  "hr questions": "HR",
};

const CATEGORY_DISPLAY_LABELS: Record<"Technical" | "Behavioral" | "Situational" | "HR", string> = {
  Technical: "Technical Questions",
  Behavioral: "Behavioral Questions",
  Situational: "Situational Questions",
  HR: "HR Questions",
};

function normalizeCategory(raw: unknown): "Technical" | "Behavioral" | "Situational" | "HR" | "" {
  if (typeof raw !== "string") return "";
  return CATEGORY_ALIASES[raw.trim().toLowerCase()] || "";
}

function limitToTwoSentences(raw: unknown): string {
  const cleaned = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!cleaned) return "";

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const sentences = Array.from(segmenter.segment(cleaned), (part) => part.segment.trim()).filter(Boolean);
    if (sentences.length > 0) {
      return sentences.slice(0, 2).join(" ");
    }
  }

  const fallback = cleaned.match(/[^.!?]+(?:[.!?]+|$)/g) || [cleaned];
  return fallback.map((s) => s.trim()).filter(Boolean).slice(0, 2).join(" ");
}

// Prohibited inquiry patterns under labor and employment non-discrimination laws
const PROHIBITED_INQUIRIES = [
  {
    topic: "Age / Year of Birth",
    regex: /\b(how old are you|what is your age|date of birth|year (did you|of) graduat(e|ion)|when were you born|when do you plan to retire)\b/i,
    explanation: "Inquiries regarding an applicant's age or retirement timeline violate employment non-discrimination regulations.",
  },
  {
    topic: "Marital Status / Family Planning",
    regex: /\b(are you married|marital status|do you have (kids|children)|planning (to have|a) (baby|family|children)|are you pregnant|childcare arrangements|your (husband|wife|spouse))\b/i,
    explanation: "Questions concerning marital status or family planning are prohibited under labor regulations.",
  },
  {
    topic: "Religion / Religious Practice",
    regex: /\b(what is your religion|what church|do you believe in god|religious (beliefs|practices|holidays)|what faith|do you attend church|do you pray)\b/i,
    explanation: "Inquiries into an applicant's religious beliefs or affiliations are strictly prohibited.",
  },
  {
    topic: "Race / National Origin",
    regex: /\b(what (is your )?race|what (is your )?ethnicity|skin color|what country are you originally from|where are your parents from|are you a native speaker)\b/i,
    explanation: "Questions regarding race, skin color, or national origin are illegal in hiring interviews.",
  },
  {
    topic: "Disability / Medical History",
    regex: /\b(do you have (a )?disabilit(y|ies)|medical (history|conditions|issues)|health problems|mental illness|prescription drugs|how many sick days did you take)\b/i,
    explanation: "Direct questions regarding disabilities or personal medical history violate employment protection laws.",
  },
  {
    topic: "Sexual Orientation / Gender Identity",
    regex: /\b(sexual orientation|are you (gay|lesbian|straight|bisexual|transgender)|gender identity)\b/i,
    explanation: "Inquiries into sexual orientation or gender identity are prohibited in professional employment interviews.",
  },
  {
    topic: "Political Affiliation",
    regex: /\b(who did you vote for|political (party|affiliation|views|beliefs)|are you (democrat|republican))\b/i,
    explanation: "Political affiliation questions are inappropriate and prohibited in hiring evaluations.",
  },
];

// Token similarity calculation (Jaccard similarity on normalized word sets)
function calculateTokenSimilarity(text1: string, text2: string): number {
  const tokenize = (s: string) => {
    return new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  };
  const set1 = tokenize(text1);
  const set2 = tokenize(text2);
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }
  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function callAiJson({
  geminiKey,
  openAiKey,
  configuredModel,
  configuredOpenAiModel,
  prompt,
}: {
  geminiKey?: string;
  openAiKey?: string;
  configuredModel: string;
  configuredOpenAiModel: string;
  prompt: string;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const candidateModels = [
    configuredModel,
    "gemini-3-flash-preview",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let rawAiText = "";
  let lastErrorText = "";
  let lastStatus = 500;

  if (geminiKey) {
    for (const model of candidateModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      try {
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
          signal: AbortSignal.timeout(18000),
        });

        if (res.ok) {
          const aiData = await res.json();
          const candidate = aiData?.candidates?.[0];
          const partWithText = candidate?.content?.parts?.find(
            (p: { text?: string; thought?: boolean }) => typeof p.text === "string" && !p.thought
          ) || candidate?.content?.parts?.find(
            (p: { text?: string }) => typeof p.text === "string"
          );
          rawAiText = partWithText?.text || "";
          if (rawAiText) break;
          lastErrorText = "Gemini did not return candidate JSON text.";
          continue;
        }

        lastStatus = res.status;
        lastErrorText = await res.text();
        console.warn(`Gemini API model ${model} returned status ${res.status}:`, lastErrorText);

        if (res.status === 401 || res.status === 403) {
          break;
        }
      } catch (fetchErr) {
        lastErrorText = (fetchErr as Error).message || String(fetchErr);
        console.warn(`Gemini API model ${model} fetch exception:`, lastErrorText);
      }
    }
  }

  if (!rawAiText && openAiKey) {
    try {
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: configuredOpenAiModel,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
          temperature: 0.25,
        }),
        signal: AbortSignal.timeout(18000),
      });

      if (openAiRes.ok) {
        const openAiData = await openAiRes.json();
        rawAiText = openAiData?.choices?.[0]?.message?.content || "";
      } else {
        lastStatus = openAiRes.status;
        lastErrorText = await openAiRes.text();
        console.warn(`OpenAI fallback returned status ${openAiRes.status}:`, lastErrorText);
      }
    } catch (openAiErr) {
      lastErrorText = (openAiErr as Error).message || String(openAiErr);
      console.warn("OpenAI fallback fetch exception:", lastErrorText);
    }
  }

  if (!rawAiText) {
    let readableDetail = "";
    try {
      const parsedErr = JSON.parse(lastErrorText);
      if (parsedErr?.error?.message) {
        readableDetail = String(parsedErr.error.message);
      }
    } catch {
      readableDetail = lastErrorText;
    }

    if (geminiKey) readableDetail = readableDetail.split(geminiKey).join("[REDACTED]");
    if (openAiKey) readableDetail = readableDetail.split(openAiKey).join("[REDACTED]");

    if (lastStatus === 429) {
      return {
        ok: false,
        error: readableDetail || "AI API daily or rate limit reached. Please wait a few moments and retry.",
      };
    }
    if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) {
      return {
        ok: false,
        error: readableDetail || `AI API authentication or permission error (${lastStatus}). Please verify AI credentials in Supabase secrets.`,
      };
    }
    return {
      ok: false,
      error: `AI service returned status ${lastStatus}. ${readableDetail || "Unable to complete AI processing at this time."}`,
    };
  }

  try {
    return { ok: true, data: JSON.parse(rawAiText) };
  } catch {
    try {
      const cleaned = rawAiText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      return { ok: true, data: JSON.parse(cleaned) };
    } catch {
      return {
        ok: false,
        error: "AI service returned malformed JSON. Please retry.",
      };
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return respond(405, { success: false, error: "Method not allowed. Use POST." });
  }

  const authorization = request.headers.get("Authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = request.headers.get("apikey");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(200, { success: false, error: "Supabase environment is not properly configured." });
  }

  try {
    // 1. Verify user authentication or project client authorization
    let isAuthenticated = false;

    if (apiKey && (apiKey === anonKey || apiKey.startsWith("sb_publishable_") || apiKey.startsWith("eyJ"))) {
      isAuthenticated = true;
    }

    if (!isAuthenticated && bearerToken) {
      if (bearerToken === anonKey || bearerToken.startsWith("sb_publishable_")) {
        isAuthenticated = true;
      } else {
        const authClient = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: userResult, error: authError } = await authClient.auth.getUser(bearerToken);
        if (!authError && userResult?.user) {
          isAuthenticated = true;
        }
      }
    }

    if (!isAuthenticated) {
      return respond(200, { success: false, error: "Authentication is required to validate questions. Please sign in again." });
    }

    // 2. Parse & validate request body
    const payload = await request.json().catch(() => ({}));
    const mode = payload.mode === "regenerate_ideal_answer" ? "regenerate_ideal_answer" : "validate";
    const questionText = typeof payload.question === "string" ? payload.question.trim() : "";
    const category = normalizeCategory(payload.category);
    const jobRoleRaw = typeof payload.jobRole === "string" ? payload.jobRole.trim() : "";
    const effectiveJobRole = jobRoleRaw || "General / Entry-Level Candidate";
    const selectedDifficulty = typeof payload.selectedDifficulty === "string"
      ? payload.selectedDifficulty.trim()
      : typeof payload.difficulty === "string"
        ? payload.difficulty.trim()
        : "";
    const currentQuestionId = payload.currentQuestionId || null;

    if (!category) {
      return respond(200, {
        success: false,
        error: "Please select a supported Category (HR Questions, Technical Questions, Behavioral Questions, or Situational Questions).",
      });
    }

    if (!questionText) {
      return respond(200, {
        success: false,
        error: "Question prompt text must not be empty.",
      });
    }

    if (questionText.length < 10) {
      return respond(200, {
        success: false,
        error: "Question prompt text is too short to be an interview question (minimum 10 characters).",
      });
    }

    if (questionText.length > 500) {
      return respond(200, {
        success: false,
        error: "Question prompt text must not exceed 500 characters.",
      });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    const configuredModel = Deno.env.get("GEMINI_MODEL") || "gemini-3-flash-preview";
    const configuredOpenAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

    if (!geminiKey && !openAiKey) {
      return respond(200, {
        success: false,
        error: "Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in Supabase Edge Function secrets.",
      });
    }

    const categoryLabel = CATEGORY_DISPLAY_LABELS[category];

    if (mode === "regenerate_ideal_answer") {
      const regenPrompt = `You are an expert career coach and mock interviewer preparing concise Answer Guides for college students and job candidates.
Generate an Answer Guide (learning reference) for this interview question:
- Interview Question: "${questionText}"
- Category: "${categoryLabel}" (${category})
- Target Job Role: "${effectiveJobRole}"
- Difficulty Level: "${selectedDifficulty || "Medium"}"

Guidelines for idealAnswer (Answer Guide):
- Write strictly 1 to 2 short, clear sentences (never 3 or more sentences, no bullet points).
- Concisely guide the candidate on key concepts, structure (e.g., STAR for Behavioral/Situational, core concepts for Technical, role fit/examples for HR), and expectations tailored to "${effectiveJobRole}" and Difficulty "${selectedDifficulty || "Medium"}".
- Keep it practical and easy to scan as a learning study guide.

Output MUST be strict JSON:
{
  "idealAnswer": "Your 1-2 sentence Answer Guide here"
}`;

      const regenAi = await callAiJson({
        geminiKey,
        openAiKey,
        configuredModel,
        configuredOpenAiModel,
        prompt: regenPrompt,
      });

      if (!regenAi.ok) {
        return respond(200, { success: false, error: regenAi.error });
      }

      const generatedAnswer = limitToTwoSentences(regenAi.data?.idealAnswer);
      if (!generatedAnswer) {
        return respond(200, {
          success: false,
          error: "AI failed to generate a non-empty Answer Guide. Please retry.",
        });
      }

      return respond(200, {
        success: true,
        idealAnswer: generatedAnswer,
        category,
        jobRole: effectiveJobRole,
      });
    }

    // 3. Database Duplicate Detection
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: existingQuestions, error: dbError } = await adminClient
      .from("questions")
      .select("id, question, category, difficulty");

    if (dbError) {
      console.warn("Could not retrieve existing questions for duplicate check:", dbError);
    }

    const normalizedLower = questionText.toLowerCase().replace(/[^a-z0-9]/g, "");
    let exactMatch: { id: string | number; question: string } | null = null;
    let highSimilarityMatch: { id: string | number; question: string; similarity: number } | null = null;

    for (const q of existingQuestions || []) {
      if (currentQuestionId && String(q.id) === String(currentQuestionId)) continue;
      const otherNorm = (q.question || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (otherNorm === normalizedLower) {
        exactMatch = q;
        break;
      }
      const similarity = calculateTokenSimilarity(questionText, q.question || "");
      if (similarity >= 0.80 && (!highSimilarityMatch || similarity > highSimilarityMatch.similarity)) {
        highSimilarityMatch = { id: q.id, question: q.question, similarity };
      }
    }

    // 4. Hard safety check: Employment non-discrimination compliance
    let prohibitedViolation: { topic: string; explanation: string } | null = null;
    for (const pattern of PROHIBITED_INQUIRIES) {
      if (pattern.regex.test(questionText)) {
        prohibitedViolation = pattern;
        break;
      }
    }

    const difficultyDirective = selectedDifficulty
      ? `The administrator selected difficulty level "${selectedDifficulty}". Still classify the true difficulty under the guidelines, and tailor the Answer Guide to "${selectedDifficulty}" expectations for "${effectiveJobRole}".`
      : `Classify the difficulty tier ("EASY", "MEDIUM", or "HARD") and tailor the Answer Guide to that classified difficulty level for "${effectiveJobRole}".`;

    const prompt = `You are an expert HR and technical interviewer evaluating candidate mock interview prompts and preparing concise Answer Guide references.
Analyze the following interview question:
Input Question: "${questionText}"
Selected Category: "${categoryLabel}" (${category})
Target Job Role: "${effectiveJobRole}"
${difficultyDirective}

Instructions:
1. Grammar & Spelling Correction:
   - Produce real grammatical corrections for grammar mistakes, pronoun errors (e.g. "what is you goal" -> "What is your goal?", "tell me about you self" -> "Tell me about yourself.", "why you want to work here" -> "Why do you want to work here?", "what are your strength and weakness" -> "What are your strengths and weaknesses?"), subject-verb disagreement, capitalization, punctuation, and awkward sentence structure.
   - Do NOT merely add punctuation or quotes if there are grammatical errors.
   - If the input is already grammatically sound, keep it unchanged and set wasCorrected to false.
   - Strictly preserve original meaning and technical concepts. Do NOT add new requirements or questions.

2. Validation Checks:
   Evaluate the question against four criteria. For each, assign status ("pass" or "fail") and a concise explanation:
   a. "grammarAndSpelling": Pass if grammatically correct or successfully auto-corrected. Fail if nonsensical, incoherent, or severely corrupted.
   b. "structureAndClarity": Pass if the question clearly communicates what the candidate is expected to answer. Fail if incomplete, overly vague, or confusing.
   c. "categoryRelevance": Pass if the question aligns with the selected category:
      - HR: Background, career goals, work ethic, company fit, strengths, weaknesses, compensation, teamwork.
      - Behavioral: Past experiences, challenges overcome, conflict resolution, STAR method scenarios.
      - Situational: Hypothetical workplace dilemmas, prioritization, ethics, problem-solving.
      - Technical: Programming, architecture, system design, databases, networking, testing, algorithms, technical tools.
      Fail if completely unrelated to the selected category.
   d. "interviewSuitability": Pass if professional and workplace-appropriate.
      Fail if it contains discriminatory questions prohibited under employment law or inappropriate/offensive content.

3. Difficulty Classification (based strictly on these guidelines):
   Analyze the question across ALL FOUR assessment criteria, considering the selected interview category ("${category}") and the expected competency of a fourth-year college student preparing for an internship or OJT (${effectiveJobRole}):
   a. "knowledge_required": Determine the amount and depth of knowledge needed to answer.
   b. "cognitive_complexity": Determine the level of thinking, reasoning, analysis, and evaluation required.
   c. "problem_solving": Determine the complexity of the problem or situation presented.
   d. "experience_required": Determine the level of practical or professional experience expected.

   Assign "suggestedDifficulty" strictly as "EASY", "MEDIUM", or "HARD":
   - "EASY": Requires basic knowledge, simple explanations, fundamental understanding, or straightforward factual responses.
   - "MEDIUM": Requires applied knowledge, logical reasoning, analysis, practical examples, or moderate problem-solving.
   - "HARD": Requires advanced knowledge, critical thinking, complex problem-solving, evaluating alternatives, justifying decisions, strategic decision-making, or developing solutions.

   Important Classification Rules:
   - Do NOT determine difficulty solely based on question length. A short question can still be HARD.
   - Consider the expected answer, not just the wording.
   - Do NOT automatically classify Technical questions as HARD.
   - Do NOT classify questions based on keywords alone; evaluate the actual cognitive demand and expected response.
   - Apply the same classification standards consistently across HR, Behavioral, Situational, and Technical questions.

4. Answer Guide Generation (REQUIRED):
   Generate a crisp, practical Answer Guide in the "idealAnswer" field for the corrected question, tailored specifically to:
   - Category: "${categoryLabel}"
   - Target Job Role: "${effectiveJobRole}"
   - Difficulty Level: "${selectedDifficulty || "the classified suggestedDifficulty"}"
   Guidelines:
   - Write strictly 1 to 2 concise sentences (never 3 or more sentences, no bullet lists) serving as an Answer Guide learning reference for students in PrepMate AI.
   - Guide the student clearly on key points to include (core technical concepts/example for Technical; STAR framework & outcome for Behavioral/Situational; self-awareness, role alignment & example for HR).
   - Must always be non-empty whenever the question is not invalid.

5. Overall Validation Status & Score:
   - status: "valid" | "needs_revision" | "invalid"
   - score: 0 to 100

Output MUST be strict JSON in this exact structure:
{
  "correctedQuestion": "Corrected sentence here",
  "wasCorrected": true,
  "changes": ["List of changes made"],
  "status": "valid",
  "score": 95,
  "suggestedDifficulty": "MEDIUM",
  "difficultyAssessment": {
    "knowledge_required": "Short explanation of depth/amount of knowledge required.",
    "cognitive_complexity": "Short explanation of reasoning/analysis/evaluation required.",
    "problem_solving": "Short explanation of problem or situation complexity.",
    "experience_required": "Short explanation of practical/OJT experience expected."
  },
  "difficultyReason": "1-2 concise sentences explaining why this question is EASY, MEDIUM, or HARD under the four criteria.",
  "idealAnswer": "Strictly 1-2 concise sentences providing a tailored Answer Guide learning reference for this question, category, job role, and difficulty.",
  "overallFeedback": "Concise summary of validation findings",
  "checks": {
    "grammarAndSpelling": { "status": "pass", "message": "Explanation" },
    "structureAndClarity": { "status": "pass", "message": "Explanation" },
    "categoryRelevance": { "status": "pass", "message": "Explanation" },
    "interviewSuitability": { "status": "pass", "message": "Explanation" }
  }
}`;

    const aiResponse = await callAiJson({
      geminiKey,
      openAiKey,
      configuredModel,
      configuredOpenAiModel,
      prompt,
    });

    if (!aiResponse.ok) {
      return respond(200, {
        success: false,
        error: aiResponse.error,
      });
    }

    const parsed = aiResponse.data as {
      correctedQuestion?: string;
      wasCorrected?: boolean;
      changes?: string[];
      status?: "valid" | "needs_revision" | "invalid";
      score?: number;
      suggestedDifficulty?: string;
      difficultyReason?: string;
      idealAnswer?: string;
      difficultyAssessment?: {
        knowledge_required?: string;
        cognitive_complexity?: string;
        problem_solving?: string;
        experience_required?: string;
      };
      overallFeedback?: string;
      checks?: {
        grammarAndSpelling?: { status: "pass" | "fail"; message: string };
        structureAndClarity?: { status: "pass" | "fail"; message: string };
        categoryRelevance?: { status: "pass" | "fail"; message: string };
        interviewSuitability?: { status: "pass" | "fail"; message: string };
      };
    };

    const DIFFICULTY_MAP: Record<string, { tier: "Easy" | "Medium" | "Hard"; code: "EASY" | "MEDIUM" | "HARD" }> = {
      easy: { tier: "Easy", code: "EASY" },
      medium: { tier: "Medium", code: "MEDIUM" },
      hard: { tier: "Hard", code: "HARD" },
    };
    const rawDiff = typeof parsed.suggestedDifficulty === "string" ? parsed.suggestedDifficulty.trim().toLowerCase() : "";
    const normalizedDiff = DIFFICULTY_MAP[rawDiff] || null;
    const difficultyReason = typeof parsed.difficultyReason === "string" ? parsed.difficultyReason.trim() : "";
    const rawAssess = parsed.difficultyAssessment;
    const difficultyAssessment =
      rawAssess && typeof rawAssess === "object"
        ? {
            knowledge_required: typeof rawAssess.knowledge_required === "string" ? rawAssess.knowledge_required.trim() : "",
            cognitive_complexity: typeof rawAssess.cognitive_complexity === "string" ? rawAssess.cognitive_complexity.trim() : "",
            problem_solving: typeof rawAssess.problem_solving === "string" ? rawAssess.problem_solving.trim() : "",
            experience_required: typeof rawAssess.experience_required === "string" ? rawAssess.experience_required.trim() : "",
          }
        : null;

    if (
      !normalizedDiff ||
      !difficultyReason ||
      !difficultyAssessment ||
      !difficultyAssessment.knowledge_required ||
      !difficultyAssessment.cognitive_complexity ||
      !difficultyAssessment.problem_solving ||
      !difficultyAssessment.experience_required
    ) {
      return respond(200, {
        success: false,
        error: "AI difficulty classification returned an incomplete or invalid evaluation. Please retry.",
      });
    }

    const suggestedDifficulty = normalizedDiff.tier;

    // Build final duplicate detection check
    let duplicateCheckStatus: "pass" | "fail" | "warn" = "pass";
    let duplicateCheckMessage = "No duplicate or conflicting question found in the database.";
    const duplicateMatches: Array<{ id: string | number; question: string }> = [];

    if (exactMatch) {
      duplicateCheckStatus = "fail";
      duplicateCheckMessage = `Exact duplicate detected: An identical question already exists in the question bank (ID: ${exactMatch.id}).`;
      duplicateMatches.push(exactMatch);
    } else if (highSimilarityMatch) {
      duplicateCheckStatus = "fail";
      duplicateCheckMessage = `Highly similar question detected: "${highSimilarityMatch.question}" (ID: ${highSimilarityMatch.id}).`;
      duplicateMatches.push(highSimilarityMatch);
    }

    const interviewSuitabilityCheck = prohibitedViolation
      ? {
          status: "fail" as const,
          title: "Interview Suitability",
          message: `Prohibited inquiry detected: ${prohibitedViolation.explanation}`,
        }
      : {
          status: parsed.checks?.interviewSuitability?.status === "fail" ? ("fail" as const) : ("pass" as const),
          title: "Interview Suitability",
          message: parsed.checks?.interviewSuitability?.message || "Professional and workplace-appropriate.",
        };

    let finalStatus: "valid" | "needs_revision" | "invalid" = parsed.status || "valid";
    let finalScore = typeof parsed.score === "number" ? parsed.score : 90;
    let finalFeedback = parsed.overallFeedback || "Validation complete.";

    if (exactMatch || highSimilarityMatch) {
      finalStatus = "invalid";
      finalScore = Math.min(finalScore, 20);
      finalFeedback = `Cannot save question: ${duplicateCheckMessage}`;
    } else if (prohibitedViolation || interviewSuitabilityCheck.status === "fail") {
      finalStatus = "invalid";
      finalScore = Math.min(finalScore, 10);
      finalFeedback = "This question touches on prohibited personal inquiry topics not allowed in employment interviews.";
    } else if (parsed.checks?.categoryRelevance?.status === "fail") {
      finalStatus = "invalid";
      finalScore = Math.min(finalScore, 30);
      finalFeedback = `Question does not match the selected ${categoryLabel} track. Please revise or change category.`;
    }

    const generatedIdealAnswer = limitToTwoSentences(parsed.idealAnswer);
    if (finalStatus !== "invalid" && !generatedIdealAnswer) {
      return respond(200, {
        success: false,
        error: "AI did not generate an Answer Guide for this question. Please retry.",
      });
    }

    const correctedText = parsed.correctedQuestion?.trim() || questionText;
    const wasCorrected = Boolean(
      parsed.wasCorrected ?? (correctedText.toLowerCase() !== questionText.toLowerCase())
    );

    return respond(200, {
      success: true,
      validation: {
        originalQuestion: questionText,
        correctedText,
        wasCorrected,
        changes: parsed.changes || [],
        status: finalStatus,
        score: finalScore,
        category,
        jobRole: effectiveJobRole,
        suggestedDifficulty,
        suggestedDifficultyCode: normalizedDiff.code,
        difficultyReason,
        difficultyAssessment,
        idealAnswer: generatedIdealAnswer,
        overallFeedback: finalFeedback,
        suggestedQuestion: wasCorrected && correctedText !== questionText ? correctedText : null,
        checks: {
          grammarAndSpelling: {
            status: parsed.checks?.grammarAndSpelling?.status === "fail" ? "fail" : "pass",
            title: "Grammar & Spelling",
            message: parsed.checks?.grammarAndSpelling?.message || (wasCorrected ? "Grammar and spelling automatically corrected." : "Grammar and spelling verified."),
          },
          structureAndClarity: {
            status: parsed.checks?.structureAndClarity?.status === "fail" ? "fail" : "pass",
            title: "Question Structure & Clarity",
            message: parsed.checks?.structureAndClarity?.message || "Clear question structure and communicate expectations.",
          },
          categoryRelevance: {
            status: parsed.checks?.categoryRelevance?.status === "fail" ? "fail" : "pass",
            title: "Category Relevance",
            message: parsed.checks?.categoryRelevance?.message || `Relevant to ${categoryLabel}.`,
          },
          interviewSuitability: interviewSuitabilityCheck,
          duplicateDetection: {
            status: duplicateCheckStatus,
            title: "Duplicate Detection",
            message: duplicateCheckMessage,
            matches: duplicateMatches,
          },
        },
      },
    });
  } catch (error) {
    console.error("Backend question validation error:", error);
    return respond(200, {
      success: false,
      error: (error as Error).message || "Internal server error while validating question.",
    });
  }
});
