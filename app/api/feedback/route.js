import { NextResponse } from "next/server";
import { applyFeedback, feedbackModel } from "../../../lib/pipeline.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { reactionKey, candidateId, measuredYield, measuredSelectivity, measuredStability } = body;

  if (!reactionKey || !candidateId) {
    return NextResponse.json({ error: "reactionKey and candidateId are required" }, { status: 400 });
  }

  const result = applyFeedback({ reactionKey, candidateId, measuredYield, measuredSelectivity, measuredStability });
  if (!result) {
    return NextResponse.json({ error: "Candidate not found for reaction" }, { status: 404 });
  }

  return NextResponse.json({
    message: "Feedback ingested and lightweight model updated.",
    feedbackModel: result.feedbackModel,
  });
}
