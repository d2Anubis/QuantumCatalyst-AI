import { NextResponse } from "next/server";
import { reactionTemplates } from "../../../lib/pipeline.js";

export function GET() {
  const reactions = Object.entries(reactionTemplates).map(([id, v]) => ({
    id,
    name: v.name,
    category: v.category || "general",
  }));
  return NextResponse.json(reactions);
}
