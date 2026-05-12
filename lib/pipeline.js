import https from "https";
import fs from "fs";
import path from "path";

// ── Paths ────────────────────────────────────────────────────
const DATA_DIR          = path.join(process.cwd(), "data");
const catalystDbPath    = path.join(DATA_DIR, "catalysts.json");
const experimentLogPath = path.join(DATA_DIR, "experiment_logs.json");

// ── Mutable model state (module-level; resets on cold start) ─
export let feedbackModel = {
  activityBias: 0,
  selectivityBias: 0,
  stabilityBias: 0,
  roundsTrained: 0,
};

// ── Reaction templates ───────────────────────────────────────
export const reactionTemplates = {
  "ethanol-to-jet": {
    name: "Ethanol to Jet Fuel",
    category: "sustainable-fuels",
    desiredDescriptors: { activationEnergy: 0.35, adsorptionStrength: 0.72, electronCorrelation: 0.8 },
    syntheticBioHints: {
      pathway: "Ethanol -> Acetyl-CoA -> Fatty alcohol elongation -> Jet-range hydrocarbons",
      fluxRisk: "Medium at acetate overflow node",
      suggestedEdits: ["upregulate adhE", "downregulate pta", "tune fadR"],
    },
  },
  "co2-to-methanol": {
    name: "CO2 to Methanol",
    category: "carbon-conversion",
    desiredDescriptors: { activationEnergy: 0.28, adsorptionStrength: 0.67, electronCorrelation: 0.88 },
    syntheticBioHints: {
      pathway: "CO2 fixation -> Formaldehyde -> Methanol",
      fluxRisk: "High at reducing equivalent supply",
      suggestedEdits: ["boost NADH regeneration", "optimize fdh expression"],
    },
  },
  "syngas-to-ethanol": {
    name: "Syngas to Ethanol",
    category: "sustainable-fuels",
    desiredDescriptors: { activationEnergy: 0.32, adsorptionStrength: 0.64, electronCorrelation: 0.76 },
    syntheticBioHints: {
      pathway: "CO/H2 -> Acetyl intermediates -> Ethanol",
      fluxRisk: "Medium at carbon monoxide dehydrogenase step",
      suggestedEdits: ["raise CODH activity", "balance redox via transhydrogenase"],
    },
  },
  "biogas-upgrading": {
    name: "Biogas Upgrading → Biomethane",
    category: "biogas",
    desiredDescriptors: { activationEnergy: 0.22, adsorptionStrength: 0.78, electronCorrelation: 0.71 },
    syntheticBioHints: {
      pathway: "Raw Biogas (CH4 55–65% + CO2 35–45% + H2S traces) -> CO2/H2S adsorption -> Pipeline-quality Biomethane (>97% CH4)",
      fluxRisk: "High at H2S poisoning of amine scrubbers; moderate at CO2 slip above 3%",
      suggestedEdits: [
        "optimize pressure-swing adsorption cycle time for CO2 selectivity",
        "add ZnO guard bed upstream to protect amine solvents from H2S",
        "tune regeneration temperature of solid sorbent to 120–140 °C",
        "evaluate MOF-based membranes for CO2/CH4 separation at ambient pressure",
      ],
    },
  },
  "waste-to-biogas": {
    name: "Organic Waste → Biogas",
    category: "biogas",
    desiredDescriptors: { activationEnergy: 0.26, adsorptionStrength: 0.58, electronCorrelation: 0.68 },
    syntheticBioHints: {
      pathway: "Lignocellulosic / Agri Waste -> Hydrolysis -> Acidogenesis -> Acetogenesis -> Methanogenesis (CH4 + CO2)",
      fluxRisk: "High at hydrolysis of lignocellulose; volatile fatty acid accumulation inhibits methanogens above 4 g/L",
      suggestedEdits: [
        "pre-treat feedstock with cellulase enzymes to improve hydrolysis rate",
        "maintain C/N ratio 20–30 to prevent ammonia inhibition",
        "add trace metal micronutrients (Co, Ni, Fe, Mo) for methanogen health",
        "operate two-stage CSTR to decouple acidogenesis from methanogenesis",
      ],
    },
  },
  "biomethane-to-hydrogen": {
    name: "Biomethane → Green Hydrogen",
    category: "biogas",
    desiredDescriptors: { activationEnergy: 0.38, adsorptionStrength: 0.66, electronCorrelation: 0.84 },
    syntheticBioHints: {
      pathway: "Biomethane + H2O -> Steam Methane Reforming -> H2 + CO2 (with CCS for carbon-negative H2)",
      fluxRisk: "High at Ni catalyst coking above 700 °C; moderate at CO2 recycling loop efficiency",
      suggestedEdits: [
        "promote Ni catalyst with CeO2 to suppress coke formation",
        "use autothermal reforming at 850 °C to improve energy efficiency",
        "integrate PSA unit downstream for 99.97% H2 purity",
        "capture CO2 byproduct for compressed biogas carbon credit",
      ],
    },
  },
  "biogas-co2-utilization": {
    name: "Biogas CO₂ → Synthetic Methane",
    category: "biogas",
    desiredDescriptors: { activationEnergy: 0.24, adsorptionStrength: 0.71, electronCorrelation: 0.86 },
    syntheticBioHints: {
      pathway: "Captured CO2 from Biogas Upgrading + Renewable H2 -> Sabatier Reaction -> Synthetic CH4 (Power-to-Gas)",
      fluxRisk: "Medium at H2 supply intermittency; thermal runaway risk in fixed-bed Sabatier reactor above 350 °C",
      suggestedEdits: [
        "use structured Ni/Al2O3 monolith catalyst for better heat management",
        "integrate electrolyser output directly into Sabatier feed for real-time load balancing",
        "monitor CO slip and adjust GHSV for >99% CO2 conversion",
        "pair with biogas plant CO2 capture stream for closed carbon loop",
      ],
    },
  },
};

// ── Math helpers ─────────────────────────────────────────────
export function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
export function clamp01(v) { return Math.max(0, Math.min(1, v)); }
export function clampSigned(v, min = -0.5, max = 0.5) { return Math.max(min, Math.min(max, v)); }

export function deterministicNoise(seedString) {
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  return ((hash % 1000) + 1000) % 1000 / 1000;
}

// ── Provider detection ────────────────────────────────────────
export function detectProvider(apiKey) {
  if (!apiKey) return "none";
  if (apiKey.startsWith("AIza")) return "gemini";
  return "openai";
}

export function resolveModel(provider, overrideModel) {
  if (provider === "gemini") {
    return overrideModel && overrideModel.startsWith("gemini")
      ? overrideModel
      : (process.env.GEMINI_MODEL || "gemini-1.5-flash");
  }
  return overrideModel || process.env.OPENAI_MODEL || "gpt-4o-mini";
}

// ── LLM calls ────────────────────────────────────────────────
function openAiChatCompletion(messages, apiKey, model) {
  const body = JSON.stringify({ model, temperature: 0.2, messages });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Authorization: `Bearer ${apiKey}` },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`OpenAI ${res.statusCode}: ${data}`));
          try { resolve(JSON.parse(data).choices?.[0]?.message?.content || ""); } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function geminiChatCompletion(messages, apiKey, model) {
  const systemMsg = messages.find((m) => m.role === "system");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const requestBody = { contents, generationConfig: { temperature: 0.2 } };
  if (systemMsg) requestBody.system_instruction = { parts: [{ text: systemMsg.content }] };
  const bodyStr = JSON.stringify(requestBody);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Gemini ${res.statusCode}: ${data}`));
          try { resolve(JSON.parse(data).candidates?.[0]?.content?.parts?.[0]?.text || ""); } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

export function llmChatCompletion(messages, apiKey, overrideModel) {
  const provider = detectProvider(apiKey);
  if (provider === "none") return Promise.resolve(null);
  const model = resolveModel(provider, overrideModel);
  return provider === "gemini"
    ? geminiChatCompletion(messages, apiKey, model)
    : openAiChatCompletion(messages, apiKey, model);
}

// ── Use-case logic ────────────────────────────────────────────
export function parseUseCase(useCaseText = "") {
  const lower = String(useCaseText).toLowerCase();
  return {
    isCostSensitive: lower.includes("cost") || lower.includes("cheap") || lower.includes("budget"),
    needsStability: lower.includes("stability") || lower.includes("lifetime") || lower.includes("durability"),
    needsSelectivity: lower.includes("selectivity") || lower.includes("purity"),
    needsFastPilot: lower.includes("pilot") || lower.includes("fast") || lower.includes("quick"),
    wantsNovelty: lower.includes("novel") || lower.includes("new") || lower.includes("innovative"),
  };
}

export function scoreForUseCase(candidate, useCaseProfile) {
  let modifier = 0;
  if (useCaseProfile.isCostSensitive && candidate.source === "database") modifier += 0.06;
  if (useCaseProfile.needsStability) modifier += 0.12 * candidate.scores.stability;
  if (useCaseProfile.needsSelectivity) modifier += 0.12 * candidate.scores.selectivity;
  if (useCaseProfile.needsFastPilot && candidate.source === "database") modifier += 0.04;
  if (useCaseProfile.wantsNovelty) modifier += 0.08 * (candidate.noveltyScore || 0.5);
  return candidate.scores.total + modifier;
}

export function buildManualUseCaseDecision(candidates, useCaseText = "") {
  const useCaseProfile = parseUseCase(useCaseText);
  const sorted = [...candidates]
    .map((c) => ({ candidate: c, useCaseScore: scoreForUseCase(c, useCaseProfile) }))
    .sort((a, b) => b.useCaseScore - a.useCaseScore);

  const chosen = sorted[0]?.candidate || candidates[0];
  const reasons = [];
  if (useCaseProfile.isCostSensitive) reasons.push("favored known catalysts for lower deployment risk and cost");
  if (useCaseProfile.needsStability) reasons.push("increased weight on predicted stability");
  if (useCaseProfile.needsSelectivity) reasons.push("increased weight on selectivity for product purity");
  if (useCaseProfile.needsFastPilot) reasons.push("favored candidates easier to pilot quickly");
  if (useCaseProfile.wantsNovelty) reasons.push("rewarded novelty to explore breakthrough designs");
  if (!reasons.length) reasons.push("used balanced default objective across activity/selectivity/stability");
  return { useCaseScore: sorted[0]?.useCaseScore || chosen.scores.total, chosenCandidate: chosen, reasons };
}

// ── AI insights ───────────────────────────────────────────────
export function buildFallbackAiInsights(pipelineResult, useCaseText, decision) {
  const top = pipelineResult.topRecommendation;
  const list = pipelineResult.candidates.slice(0, 3).map((c) => `${c.id} (${c.family}, total ${(c.scores.total * 100).toFixed(1)}%)`);
  return {
    provider: "manual-fallback",
    summary: `For ${pipelineResult.reaction.name}, the highest baseline performer is ${top.id}. For your use-case, we recommend ${decision.chosenCandidate.id} based on weighted constraints.`,
    plan: [
      `Prioritize bench screening for: ${list.join(", ")}.`,
      "Track deactivation trend after 24h and 72h to validate stability assumptions.",
      "Feed measured yield/selectivity/stability into the feedback loop after each run.",
    ],
    caveats: [
      "Scores are predictive and should be treated as ranking signals, not absolute yields.",
      "VQE module is an abstraction layer and should be calibrated with real quantum/classical benchmarks.",
      "Use at least one baseline industrial catalyst in each batch for calibration.",
    ],
    useCaseRationale: decision.reasons,
  };
}

export async function buildAiInsights(pipelineResult, useCaseText, decision, overrideApiKey, overrideModel) {
  const fallback = buildFallbackAiInsights(pipelineResult, useCaseText, decision);
  const key = overrideApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = detectProvider(key);
  if (provider === "none") return fallback;

  try {
    const topCandidates = pipelineResult.candidates.slice(0, 3).map((c) => ({
      id: c.id, family: c.family, source: c.source,
      activity: +c.scores.activity.toFixed(3), selectivity: +c.scores.selectivity.toFixed(3),
      stability: +c.scores.stability.toFixed(3), total: +c.scores.total.toFixed(3),
    }));
    const messages = [
      { role: "system", content: "You are a catalysis R&D copilot. Return strict JSON with keys: summary (string), plan (array of 3 short strings), caveats (array of 3 short strings), useCaseRationale (array of 2-4 short strings). No text outside the JSON object." },
      { role: "user", content: JSON.stringify({ reaction: pipelineResult.reaction.name, useCase: useCaseText || "balanced optimization", topCandidates, chosenForUseCase: decision.chosenCandidate.id }) },
    ];
    const content = await llmChatCompletion(messages, key, overrideModel);
    if (!content) return fallback;
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      provider,
      summary: parsed.summary || fallback.summary,
      plan: Array.isArray(parsed.plan) ? parsed.plan.slice(0, 3) : fallback.plan,
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats.slice(0, 3) : fallback.caveats,
      useCaseRationale: Array.isArray(parsed.useCaseRationale) ? parsed.useCaseRationale : fallback.useCaseRationale,
    };
  } catch { return fallback; }
}

// ── Database helpers ──────────────────────────────────────────
function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}
export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}
export function getExperimentLogs() { return readJson(experimentLogPath, []); }
export function appendExperimentLog(entry) {
  const logs = getExperimentLogs();
  logs.push(entry);
  try { writeJson(experimentLogPath, logs); } catch { /* /tmp on serverless */ }
}

// ── Core pipeline ─────────────────────────────────────────────
function getKnownCatalysts(reactionKey) {
  return readJson(catalystDbPath, []).filter((c) => c.supportedReactions.includes(reactionKey));
}

function runVqeLikeEnergyProfile(catalyst, reactionKey) {
  const reactionTarget = reactionTemplates[reactionKey].desiredDescriptors;
  const seed = `${catalyst.id}-${reactionKey}`;
  const noise = deterministicNoise(seed);
  const activationDelta = Math.abs(catalyst.descriptors.activationEnergy - reactionTarget.activationEnergy);
  const adsorptionDelta = Math.abs(catalyst.descriptors.adsorptionStrength - reactionTarget.adsorptionStrength);
  const correlationDelta = Math.abs(catalyst.descriptors.electronCorrelation - reactionTarget.electronCorrelation);
  const rawGroundEnergy = 1.2 - (1.8 * activationDelta + adsorptionDelta + 1.4 * correlationDelta) + (noise - 0.5) * 0.12;
  return {
    groundStateEnergy: clamp01(sigmoid(rawGroundEnergy)),
    barriers: {
      cCFormation: clamp01(1 - activationDelta + (noise - 0.5) * 0.06),
      hydrogenTransfer: clamp01(1 - adsorptionDelta + (noise - 0.5) * 0.04),
      oxygenRemoval: clamp01(1 - correlationDelta + (noise - 0.5) * 0.05),
    },
    confidence: clamp01(0.62 + 0.34 * (1 - Math.abs(noise - 0.5))),
  };
}

function generateNovelCatalysts(topCatalysts, reactionKey, count = 6) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const parent = topCatalysts[i % topCatalysts.length];
    const seed = deterministicNoise(`${parent.id}-${reactionKey}-gen-${i}`);
    const drift = (seed - 0.5) * 0.14;
    out.push({
      id: `GEN-${reactionKey}-${i + 1}`,
      name: `${parent.family} Alloy Variant ${i + 1}`,
      family: parent.family,
      noveltyScore: clamp01(0.68 + seed * 0.29),
      source: "generative",
      descriptors: {
        activationEnergy: clamp01(parent.descriptors.activationEnergy - 0.06 + drift),
        adsorptionStrength: clamp01(parent.descriptors.adsorptionStrength + 0.03 - drift / 2),
        electronCorrelation: clamp01(parent.descriptors.electronCorrelation + 0.04 + drift / 3),
      },
      smiles: parent.smiles,
      xyz: parent.xyz,
    });
  }
  return out;
}

function scoreCandidate(candidate, reactionKey, vqeProfile) {
  const reactionTarget = reactionTemplates[reactionKey].desiredDescriptors;
  const d = candidate.descriptors;
  const alignment = 1 - (
    Math.abs(d.activationEnergy - reactionTarget.activationEnergy) +
    Math.abs(d.adsorptionStrength - reactionTarget.adsorptionStrength) +
    Math.abs(d.electronCorrelation - reactionTarget.electronCorrelation)
  ) / 3;
  const { activityBias: aB, selectivityBias: sB, stabilityBias: stB } = feedbackModel;
  const activity   = clamp01(0.45 * alignment + 0.4 * vqeProfile.groundStateEnergy + 0.15 * vqeProfile.barriers.cCFormation + aB);
  const selectivity= clamp01(0.5 * alignment + 0.25 * vqeProfile.barriers.hydrogenTransfer + 0.25 * vqeProfile.confidence + sB);
  const stability  = clamp01(0.35 * vqeProfile.groundStateEnergy + 0.35 * vqeProfile.barriers.oxygenRemoval + 0.3 * vqeProfile.confidence + stB);
  return { activity, selectivity, stability, total: clamp01(0.45 * activity + 0.3 * selectivity + 0.25 * stability) };
}

export function pipelineRun(reactionKey) {
  const knownCatalysts = getKnownCatalysts(reactionKey);
  const withVqe = knownCatalysts
    .map((c) => ({ ...c, vqe: runVqeLikeEnergyProfile(c, reactionKey), source: "database" }))
    .sort((a, b) => b.vqe.groundStateEnergy - a.vqe.groundStateEnergy)
    .slice(0, 4);

  const generated = generateNovelCatalysts(withVqe, reactionKey, 6)
    .map((c) => ({ ...c, vqe: runVqeLikeEnergyProfile(c, reactionKey) }));

  const allCandidates = [...withVqe, ...generated]
    .map((c) => ({ ...c, scores: scoreCandidate(c, reactionKey, c.vqe) }))
    .sort((a, b) => b.scores.total - a.scores.total);

  return {
    reaction: reactionTemplates[reactionKey],
    feedbackModel,
    candidates: allCandidates,
    topRecommendation: allCandidates[0],
    syntheticBio: reactionTemplates[reactionKey].syntheticBioHints,
  };
}

export function applyFeedback({ reactionKey, candidateId, measuredYield, measuredSelectivity, measuredStability }) {
  const result = pipelineRun(reactionKey);
  const predicted = result.candidates.find((c) => c.id === candidateId);
  if (!predicted) return null;

  const lr = 0.08;
  feedbackModel = {
    activityBias:    clampSigned(feedbackModel.activityBias    + lr * (measuredYield        - predicted.scores.activity)),
    selectivityBias: clampSigned(feedbackModel.selectivityBias + lr * (measuredSelectivity  - predicted.scores.selectivity)),
    stabilityBias:   clampSigned(feedbackModel.stabilityBias   + lr * (measuredStability    - predicted.scores.stability)),
    roundsTrained:   feedbackModel.roundsTrained + 1,
  };

  appendExperimentLog({
    timestamp: new Date().toISOString(),
    reactionKey, candidateId,
    measuredYield, measuredSelectivity, measuredStability,
    predictionBeforeFeedback: predicted.scores,
  });

  return { feedbackModel, predictionBeforeFeedback: predicted.scores };
}
