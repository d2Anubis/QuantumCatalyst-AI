import { NextResponse } from "next/server";
import {
  reactionTemplates,
  pipelineRun,
  buildManualUseCaseDecision,
  buildAiInsights,
  detectProvider,
} from "../../../../lib/pipeline.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { reactionKey, useCase = "", apiKey, model } = body;

  if (!reactionKey || !reactionTemplates[reactionKey]) {
    return NextResponse.json({ error: "Invalid reactionKey" }, { status: 400 });
  }

  const clientKey = req.headers.get("x-api-key") || apiKey
    || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;

  const result   = pipelineRun(reactionKey);
  const decision = buildManualUseCaseDecision(result.candidates, useCase);
  const aiInsights = await buildAiInsights(result, useCase, decision, clientKey, model);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    aiInsights,
    useCaseDecision: {
      useCase,
      chosenCandidateId: decision.chosenCandidate.id,
      reasons: decision.reasons,
    },
    ...result,
  });
}
