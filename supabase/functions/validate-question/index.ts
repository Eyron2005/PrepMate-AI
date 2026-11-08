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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return respond(405, { success: false, error: "Method not allowed. Use POST." });
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || request.headers.get("apikey");
  if (!token) {
    return respond(401, { success: false, error: "Authentication is required to validate questions." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond(500, { success: false, error: "Supabase environment is not properly configured." });
  }

  try {
    // 1. Verify user authentication or anon client authorization
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let isAuthenticated = false;
    if (token === anonKey) {
      isAuthenticated = true;
    } else {
      const { data: userResult, error: authError } = await authClient.auth.getUser(token);
      if (!authError && userResult?.user) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated) {
      return respond(401, { success: false, error: "Your session is invalid or has expired. Please sign in again." });
    }

    // 2. Parse request body
    const payload = await request.json().catch(() => ({}));
    const questionText = typeof payload.question === "string" ? payload.question.trim() : "";
    const category = payload.category || "Technical";
    const difficulty = payload.difficulty || "Medium";
    const currentQuestionId = payload.currentQuestionId || null;

    if (!questionText) {
      return respond(400, {
        success: false,
        error: "Question prompt text must not be empty.",
      });
    }

    if (questionText.length < 10) {
      return respond(400, {
        success: false,
        error: "Question prompt text is too short to be an interview question (minimum 10 characters).",
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

    // 5. Configurable Gemini AI Integration
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";

    if (!geminiKey) {
      return respond(500, {
        success: false,
        error: "GEMINI_API_KEY environment variable is not configured on the server. Please set it in Supabase secrets.",
      });
    }

    const prompt = `You are an expert HR and technical interviewer reviewing a candidate mock interview prompt.
Analyze the following interview question:
Input Question: "${questionText}"
Selected Category: "${category}"
Selected Difficulty: "${difficulty}"

Instructions:
1. Grammar & Spelling Correction:
   - Produce real grammatical corrections for grammar mistakes, pronoun errors (e.g. "what is you goal" -> "What is your goal?", "tell me about you self" -> "Tell me about yourself.", "why you want to work here" -> "Why do you want to work here?", "what are your strength and weakness" -> "What are your strengths and weaknesses?", "what is your goals" -> "What are your goals?"), subject-verb disagreement, capitalization, punctuation, and awkward sentence structure.
   - Do NOT merely add punctuation or quotes if there are grammatical errors.
   - If the input is already grammatically sound, keep it unchanged and set wasCorrected to false.
   - Strictly preserve original meaning, technical concepts, and difficulty level. Do NOT add new requirements or questions.

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
      Fail if it contains discriminatory questions prohibited under employment law (inquiries into age, birth year, retirement date, race, ethnicity, religion, marital status, pregnancy, family planning, sexual orientation, disability, medical history, political affiliation) or inappropriate/offensive content.

3. Overall Status:
   - "valid": Passes all criteria without critical issues.
   - "needs_revision": Understandable but has quality warnings or minor relevance concerns.
   - "invalid": Fails interview suitability (e.g. discriminatory question), incoherent, or completely fails category relevance.

4. Score:
   - Overall quality score from 0 to 100.

Output MUST be strict JSON in this exact structure:
{
  "correctedQuestion": "Corrected sentence here",
  "wasCorrected": true,
  "changes": ["List of changes made"],
  "status": "valid",
  "score": 95,
  "overallFeedback": "Concise summary of validation findings",
  "checks": {
    "grammarAndSpelling": { "status": "pass", "message": "Explanation" },
    "structureAndClarity": { "status": "pass", "message": "Explanation" },
    "categoryRelevance": { "status": "pass", "message": "Explanation" },
    "interviewSuitability": { "status": "pass", "message": "Explanation" }
  }
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

    let aiResponse: Response | null = null;
    let lastErrorText = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });

        if (res.ok) {
          aiResponse = res;
          break;
        }

        lastErrorText = await res.text();
        console.warn(`Gemini API attempt ${attempt} returned status ${res.status}:`, lastErrorText);

        // If rate limited or service unavailable / overloaded, back off and retry
        if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 800));
          continue;
        }

        aiResponse = res;
        break;
      } catch (fetchErr) {
        lastErrorText = (fetchErr as Error).message || String(fetchErr);
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 800));
          continue;
        }
      }
    }

    if (!aiResponse || !aiResponse.ok) {
      if (aiResponse?.status === 429) {
        return respond(429, {
          success: false,
          error: "Gemini API rate limit exceeded. Please wait a few moments and try again.",
        });
      }
      if (aiResponse?.status === 400 || aiResponse?.status === 403) {
        return respond(502, {
          success: false,
          error: `Gemini API authentication or configuration error (${aiResponse.status}). Please verify the GEMINI_API_KEY and GEMINI_MODEL (${geminiModel}).`,
        });
      }
      return respond(502, {
        success: false,
        error: `Gemini AI service returned status ${aiResponse?.status || 500}. ${lastErrorText || "Unable to complete validation."}`,
      });
    }

    const aiData = await aiResponse.json();
    const candidate = aiData?.candidates?.[0];
    const partWithText = candidate?.content?.parts?.find(
      (p: { text?: string; thought?: boolean }) => typeof p.text === "string" && !p.thought
    ) || candidate?.content?.parts?.find(
      (p: { text?: string }) => typeof p.text === "string"
    );

    const rawAiText = partWithText?.text;
    if (!rawAiText) {
      return respond(502, {
        success: false,
        error: "Gemini did not return a valid candidate response. Please try again.",
      });
    }

    let parsed: {
      correctedQuestion?: string;
      wasCorrected?: boolean;
      changes?: string[];
      status?: "valid" | "needs_revision" | "invalid";
      score?: number;
      overallFeedback?: string;
      checks?: {
        grammarAndSpelling?: { status: "pass" | "fail"; message: string };
        structureAndClarity?: { status: "pass" | "fail"; message: string };
        categoryRelevance?: { status: "pass" | "fail"; message: string };
        interviewSuitability?: { status: "pass" | "fail"; message: string };
      };
    };

    try {
      parsed = JSON.parse(rawAiText);
    } catch {
      const cleaned = rawAiText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    }

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

    // Enforce prohibited violation if detected deterministically
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

    // Determine final status and score
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
      finalFeedback = `Question does not match the selected ${category} category track. Please revise or change category.`;
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
            message: parsed.checks?.categoryRelevance?.message || `Relevant to ${category}.`,
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
    return respond(500, {
      success: false,
      error: (error as Error).message || "Internal server error while validating question.",
    });
  }
});
