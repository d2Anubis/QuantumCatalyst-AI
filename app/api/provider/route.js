import { NextResponse } from "next/server";
import { detectProvider } from "../../../lib/pipeline.js";

export function GET(req) {
  const key = req.headers.get("x-api-key")
    || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  return NextResponse.json({ provider: detectProvider(key), hasKey: !!key });
}
