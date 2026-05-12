import { NextResponse } from "next/server";
import { getExperimentLogs } from "../../../../lib/pipeline.js";

export function GET() {
  const logs = getExperimentLogs();
  return NextResponse.json(logs.slice(-20).reverse());
}
