import { NextResponse } from "next/server";
import { llmChatCompletion, detectProvider } from "../../../lib/pipeline.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { messages = [], context = "", model } = body;
  const apiKey = req.headers.get("x-api-key")
    || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = detectProvider(apiKey);

  if (provider === "none") {
    return NextResponse.json({
      reply: "No AI API key configured. Add your OpenAI key (sk-…) or Gemini key (AIza…) via the Settings panel (⚙) to enable AI chat. The pipeline runs fully without it.",
      provider: "none",
    });
  }

  const systemContent =
    "You are a catalysis R&D AI copilot for QuantumCatalyst AI, specialised in sustainable chemistry and biogas applications. " +
    "Help scientists understand catalyst discovery results, explain VQE outputs, and suggest experimental strategies. " +
    "Be direct and specific. Prefer bullet points for lists. " +
    (context ? `\n\nCurrent pipeline context:\n${context}` : "");

  const allMessages = [{ role: "system", content: systemContent }, ...messages.slice(-12)];

  try {
    const content = await llmChatCompletion(allMessages, apiKey, model);
    if (!content) return NextResponse.json({ reply: "No response from AI model.", provider: "none" });
    return NextResponse.json({ reply: content, provider });
  } catch (err) {
    return NextResponse.json({ reply: `AI error: ${err.message}`, provider: "error" }, { status: 500 });
  }
}
