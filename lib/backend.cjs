"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

/** Project root — works for Express cwd and Vercel function cwd */
const ROOT = process.cwd();
const catalystDbPath = path.join(ROOT, "data", "catalysts.json");
const experimentLogPath = process.env.VERCEL ? path.join(os.tmpdir(), "qcai_experiment_logs.json") : path.join(ROOT, "data", "experiment_logs.json");

function ensureExperimentLogFile() {
  if (!process.env.VERCEL) {
    const dataDir = path.join(ROOT, "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(experimentLogPath)) {
    fs.writeFileSync(experimentLogPath, "[]");
  }
}
const defaultFeedbackModel = {
  activityBias: 0,
  selectivityBias: 0,
  stabilityBias: 0,
  roundsTrained: 0
};

let feedbackModel = { ...defaultFeedbackModel };
let biasHistory = [];

const reactionTemplates = {
  "ethanol-to-jet": {
    name: "Ethanol to Jet Fuel",
    category: "sustainable-fuels",
    desiredDescriptors: {
      activationEnergy: 0.35,
      adsorptionStrength: 0.72,
      electronCorrelation: 0.8
    },
    syntheticBioHints: {
      pathway: "Ethanol -> Acetyl-CoA -> Fatty alcohol elongation -> Jet-range hydrocarbons",
      fluxRisk: "Medium at acetate overflow node",
      suggestedEdits: ["upregulate adhE", "downregulate pta", "tune fadR"]
    }
  },
  "co2-to-methanol": {
    name: "CO2 to Methanol",
    category: "carbon-conversion",
    desiredDescriptors: {
      activationEnergy: 0.28,
      adsorptionStrength: 0.67,
      electronCorrelation: 0.88
    },
    syntheticBioHints: {
      pathway: "CO2 fixation -> Formaldehyde -> Methanol",
      fluxRisk: "High at reducing equivalent supply",
      suggestedEdits: ["boost NADH regeneration", "optimize fdh expression"]
    }
  },
  "syngas-to-ethanol": {
    name: "Syngas to Ethanol",
    category: "sustainable-fuels",
    desiredDescriptors: {
      activationEnergy: 0.32,
      adsorptionStrength: 0.64,
      electronCorrelation: 0.76
    },
    syntheticBioHints: {
      pathway: "CO/H2 -> Acetyl intermediates -> Ethanol",
      fluxRisk: "Medium at carbon monoxide dehydrogenase step",
      suggestedEdits: ["raise CODH activity", "balance redox via transhydrogenase"]
    }
  },
  // ── Biogas / biomethane pathway reactions ─────────────────────
  "biogas-upgrading": {
    name: "Biogas Upgrading → Biomethane",
    category: "biogas",
    desiredDescriptors: {
      activationEnergy: 0.22,
      adsorptionStrength: 0.78,
      electronCorrelation: 0.71
    },
    syntheticBioHints: {
      pathway: "Raw Biogas (CH4 55–65% + CO2 35–45% + H2S traces) -> CO2/H2S adsorption -> Pipeline-quality Biomethane (>97% CH4)",
      fluxRisk: "High at H2S poisoning of amine scrubbers; moderate at CO2 slip above 3%",
      suggestedEdits: [
        "optimize pressure-swing adsorption cycle time for CO2 selectivity",
        "add ZnO guard bed upstream to protect amine solvents from H2S",
        "tune regeneration temperature of solid sorbent to 120–140 °C",
        "evaluate MOF-based membranes for CO2/CH4 separation at ambient pressure"
      ]
    }
  },
  "waste-to-biogas": {
    name: "Organic Waste → Biogas",
    category: "biogas",
    desiredDescriptors: {
      activationEnergy: 0.26,
      adsorptionStrength: 0.58,
      electronCorrelation: 0.68
    },
    syntheticBioHints: {
      pathway: "Lignocellulosic / Agri Waste -> Hydrolysis -> Acidogenesis -> Acetogenesis -> Methanogenesis (CH4 + CO2)",
      fluxRisk: "High at hydrolysis of lignocellulose; volatile fatty acid accumulation inhibits methanogens above 4 g/L",
      suggestedEdits: [
        "pre-treat feedstock with cellulase enzymes to improve hydrolysis rate",
        "maintain C/N ratio 20–30 to prevent ammonia inhibition",
        "add trace metal micronutrients (Co, Ni, Fe, Mo) for methanogen health",
        "operate two-stage CSTR to decouple acidogenesis from methanogenesis"
      ]
    }
  },
  "biomethane-to-hydrogen": {
    name: "Biomethane → Green Hydrogen",
    category: "biogas",
    desiredDescriptors: {
      activationEnergy: 0.38,
      adsorptionStrength: 0.66,
      electronCorrelation: 0.84
    },
    syntheticBioHints: {
      pathway: "Biomethane + H2O -> Steam Methane Reforming -> H2 + CO2 (with CCS for carbon-negative H2)",
      fluxRisk: "High at Ni catalyst coking above 700 °C; moderate at CO2 recycling loop efficiency",
      suggestedEdits: [
        "promote Ni catalyst with CeO2 to suppress coke formation",
        "use autothermal reforming at 850 °C to improve energy efficiency",
        "integrate PSA unit downstream for 99.97% H2 purity",
        "capture CO2 byproduct for compressed biogas carbon-credit accounting"
      ]
    }
  },
  "biogas-co2-utilization": {
    name: "Biogas CO₂ → Synthetic Methane",
    category: "biogas",
    desiredDescriptors: {
      activationEnergy: 0.24,
      adsorptionStrength: 0.71,
      electronCorrelation: 0.86
    },
    syntheticBioHints: {
      pathway: "Captured CO2 from Biogas Upgrading + Renewable H2 -> Sabatier Reaction -> Synthetic CH4 (Power-to-Gas)",
      fluxRisk: "Medium at H2 supply intermittency; thermal runaway risk in fixed-bed Sabatier reactor above 350 °C",
      suggestedEdits: [
        "use structured Ni/Al2O3 monolith catalyst for better heat management",
        "integrate electrolyser output directly into Sabatier feed for real-time load balancing",
        "monitor CO slip and adjust GHSV for >99% CO2 conversion",
        "pair with biogas-upgrading CO2 capture stream for closed carbon loop"
      ]
    }
  }
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function clampSigned(v, min = -0.5, max = 0.5) {
  return Math.max(min, Math.min(max, v));
}

function getConfidenceTier(confidence) {
  if (confidence >= 0.82) return "high";
  if (confidence >= 0.70) return "medium";
  return "low";
}

function getFeasibilityTier(candidate) {
  if (candidate.source === "database") return "high";
  if ((candidate.noveltyScore || 0) >= 0.88) return "low";
  return "medium";
}

function deterministicNoise(seedString) {
  let hash = 0;
  for (let i = 0; i < seedString.length; i += 1) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  return ((hash % 1000) + 1000) % 1000 / 1000;
}

function parseUseCase(useCaseText = "") {
  const lower = String(useCaseText).toLowerCase();
  return {
    isCostSensitive: lower.includes("cost") || lower.includes("cheap") || lower.includes("budget"),
    needsStability: lower.includes("stability") || lower.includes("lifetime") || lower.includes("durability"),
    needsSelectivity: lower.includes("selectivity") || lower.includes("purity"),
    needsFastPilot: lower.includes("pilot") || lower.includes("fast") || lower.includes("quick") || lower.includes("timeline"),
    wantsNovelty: lower.includes("novel") || lower.includes("new") || lower.includes("innovative")
  };
}

function scoreForUseCase(candidate, useCaseProfile) {
  const base = candidate.scores.total;
  let modifier = 0;

  if (useCaseProfile.isCostSensitive && candidate.source === "database") {
    modifier += 0.06;
  }
  if (useCaseProfile.needsStability) {
    modifier += 0.12 * candidate.scores.stability;
  }
  if (useCaseProfile.needsSelectivity) {
    modifier += 0.12 * candidate.scores.selectivity;
  }
  if (useCaseProfile.needsFastPilot && candidate.source === "database") {
    modifier += 0.04;
  }
  if (useCaseProfile.wantsNovelty) {
    modifier += 0.08 * (candidate.noveltyScore || 0.5);
  }

  return base + modifier;
}

function buildManualUseCaseDecision(candidates, useCaseText = "") {
  const useCaseProfile = parseUseCase(useCaseText);
  const sorted = [...candidates]
    .map((candidate) => ({
      candidate,
      useCaseScore: scoreForUseCase(candidate, useCaseProfile)
    }))
    .sort((a, b) => b.useCaseScore - a.useCaseScore);

  const chosen = sorted[0]?.candidate || candidates[0];
  const reasons = [];
  if (useCaseProfile.isCostSensitive) reasons.push("favored known catalysts for lower deployment risk and cost");
  if (useCaseProfile.needsStability) reasons.push("increased weight on predicted stability");
  if (useCaseProfile.needsSelectivity) reasons.push("increased weight on selectivity for product purity");
  if (useCaseProfile.needsFastPilot) reasons.push("favored candidates easier to pilot quickly");
  if (useCaseProfile.wantsNovelty) reasons.push("rewarded novelty to explore breakthrough designs");
  if (reasons.length === 0) reasons.push("used balanced default objective across activity/selectivity/stability");

  return {
    useCaseScore: sorted[0]?.useCaseScore || chosen.scores.total,
    chosenCandidate: chosen,
    reasons
  };
}

// ── Provider detection ────────────────────────────────────────
function detectProvider(apiKey) {
  if (!apiKey) return "none";
  if (apiKey.startsWith("AIza")) return "gemini";
  return "openai";
}

// Google retires shorthand ids (e.g. gemini-1.5-flash) on newer API surfaces — map to stable 2.5.
const GEMINI_MODEL_ALIASES = {
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite"
};

function resolveModel(provider, overrideModel) {
  if (provider === "gemini") {
    let m =
      overrideModel && overrideModel.startsWith("gemini")
        ? overrideModel
        : (process.env.GEMINI_MODEL || "gemini-2.5-flash");
    return GEMINI_MODEL_ALIASES[m] || m;
  }
  return overrideModel || process.env.OPENAI_MODEL || "gpt-4o-mini";
}

// ── OpenAI completion ─────────────────────────────────────────
function openAiChatCompletion(messages, apiKey, model) {
  const body = JSON.stringify({ model, temperature: 0.2, messages });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${apiKey}`
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`OpenAI request failed (${res.statusCode}): ${data}`));
          }
          try {
            const parsed = JSON.parse(data);
            return resolve(parsed.choices?.[0]?.message?.content || "");
          } catch (err) { return reject(err); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Gemini completion ─────────────────────────────────────────
function geminiChatCompletion(messages, apiKey, model) {
  // Split system message from conversation
  const systemMsg = messages.find((m) => m.role === "system");
  const convoMsgs = messages.filter((m) => m.role !== "system");

  // Map OpenAI roles → Gemini roles
  const contents = convoMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const requestBody = {
    contents,
    generationConfig: { temperature: 0.2 }
  };

  if (systemMsg) {
    requestBody.system_instruction = { parts: [{ text: systemMsg.content }] };
  }

  const bodyStr = JSON.stringify(requestBody);
  const path = `/v1beta/models/${model}:generateContent?key=${apiKey}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Gemini request failed (${res.statusCode}): ${data}`));
          }
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            return resolve(text);
          } catch (err) { return reject(err); }
        });
      }
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Unified LLM call (OpenAI or Gemini) ──────────────────────
function llmChatCompletion(messages, apiKey, overrideModel) {
  const provider = detectProvider(apiKey);
  if (provider === "none") return Promise.resolve(null);
  const model = resolveModel(provider, overrideModel);
  if (provider === "gemini") return geminiChatCompletion(messages, apiKey, model);
  return openAiChatCompletion(messages, apiKey, model);
}

function buildFallbackAiInsights(pipelineResult, useCaseText, decision) {
  const top = pipelineResult.topRecommendation;
  const list = pipelineResult.candidates.slice(0, 3).map((c) => `${c.id} (${c.family}, total ${(c.scores.total * 100).toFixed(1)}%)`);
  return {
    provider: "manual-fallback",
    summary: `For ${pipelineResult.reaction.name}, the highest baseline performer is ${top.id}. For your use-case, we recommend ${decision.chosenCandidate.id} based on weighted constraints.`,
    plan: [
      `Prioritize bench screening for: ${list.join(", ")}.`,
      `Track deactivation trend after 24h and 72h to validate stability assumptions.`,
      "Feed measured yield/selectivity/stability into the feedback loop after each run."
    ],
    caveats: [
      "Scores are predictive and should be treated as ranking signals, not absolute yields.",
      "VQE module is an abstraction layer and should be calibrated with real quantum/classical benchmarks.",
      "Use at least one baseline industrial catalyst in each batch for calibration."
    ],
    useCaseRationale: decision.reasons
  };
}

async function buildAiInsights(pipelineResult, useCaseText, decision, overrideApiKey, overrideModel) {
  const fallback = buildFallbackAiInsights(pipelineResult, useCaseText, decision);
  const key = overrideApiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = detectProvider(key);
  if (provider === "none") return fallback;

  try {
    const topCandidates = pipelineResult.candidates.slice(0, 3).map((c) => ({
      id: c.id,
      family: c.family,
      source: c.source,
      activity: Number(c.scores.activity.toFixed(3)),
      selectivity: Number(c.scores.selectivity.toFixed(3)),
      stability: Number(c.scores.stability.toFixed(3)),
      total: Number(c.scores.total.toFixed(3))
    }));

    const messages = [
      {
        role: "system",
        content:
          "You are a catalysis R&D copilot. Return strict JSON with keys: summary (string), plan (array of 3 short strings), caveats (array of 3 short strings), useCaseRationale (array of 2-4 short strings). Do not include any text outside the JSON object."
      },
      {
        role: "user",
        content: JSON.stringify({
          reaction: pipelineResult.reaction.name,
          useCase: useCaseText || "No explicit use-case provided. Use balanced optimization.",
          topCandidates,
          chosenForUseCase: decision.chosenCandidate.id
        })
      }
    ];

    const content = await llmChatCompletion(messages, key, overrideModel);
    if (!content) return fallback;

    // Strip potential markdown code fences that some models add
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      provider,
      summary: parsed.summary || fallback.summary,
      plan: Array.isArray(parsed.plan) ? parsed.plan.slice(0, 3) : fallback.plan,
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats.slice(0, 3) : fallback.caveats,
      useCaseRationale: Array.isArray(parsed.useCaseRationale) ? parsed.useCaseRationale : fallback.useCaseRationale
    };
  } catch {
    return fallback;
  }
}

function getKnownCatalysts(reactionKey) {
  const db = readJson(catalystDbPath, []);
  return db.filter((c) => c.supportedReactions.includes(reactionKey));
}

function runVqeLikeEnergyProfile(catalyst, reactionKey) {
  const reactionTarget = reactionTemplates[reactionKey].desiredDescriptors;
  const seed = `${catalyst.id}-${reactionKey}`;
  const noise = deterministicNoise(seed);

  const activationDelta = Math.abs(catalyst.descriptors.activationEnergy - reactionTarget.activationEnergy);
  const adsorptionDelta = Math.abs(catalyst.descriptors.adsorptionStrength - reactionTarget.adsorptionStrength);
  const correlationDelta = Math.abs(catalyst.descriptors.electronCorrelation - reactionTarget.electronCorrelation);

  const rawGroundEnergy = 1.2 - (1.8 * activationDelta + adsorptionDelta + 1.4 * correlationDelta) + (noise - 0.5) * 0.12;
  const normalizedGroundEnergy = clamp01(sigmoid(rawGroundEnergy));

  return {
    groundStateEnergy: normalizedGroundEnergy,
    barriers: {
      cCFormation: clamp01(1 - activationDelta + (noise - 0.5) * 0.06),
      hydrogenTransfer: clamp01(1 - adsorptionDelta + (noise - 0.5) * 0.04),
      oxygenRemoval: clamp01(1 - correlationDelta + (noise - 0.5) * 0.05)
    },
    confidence: clamp01(0.62 + 0.34 * (1 - Math.abs(noise - 0.5)))
  };
}

function generateNovelCatalysts(topCatalysts, reactionKey, count = 6) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
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
        electronCorrelation: clamp01(parent.descriptors.electronCorrelation + 0.04 + drift / 3)
      },
      smiles: parent.smiles,
      xyz: parent.xyz
    });
  }
  return out;
}

function scoreCandidate(candidate, reactionKey, vqeProfile) {
  const reactionTarget = reactionTemplates[reactionKey].desiredDescriptors;
  const d = candidate.descriptors;

  const alignment =
    1 -
    (Math.abs(d.activationEnergy - reactionTarget.activationEnergy) +
      Math.abs(d.adsorptionStrength - reactionTarget.adsorptionStrength) +
      Math.abs(d.electronCorrelation - reactionTarget.electronCorrelation)) /
      3;

  const activity = clamp01(0.45 * alignment + 0.4 * vqeProfile.groundStateEnergy + 0.15 * vqeProfile.barriers.cCFormation + feedbackModel.activityBias);
  const selectivity = clamp01(0.5 * alignment + 0.25 * vqeProfile.barriers.hydrogenTransfer + 0.25 * vqeProfile.confidence + feedbackModel.selectivityBias);
  const stability = clamp01(0.35 * vqeProfile.groundStateEnergy + 0.35 * vqeProfile.barriers.oxygenRemoval + 0.3 * vqeProfile.confidence + feedbackModel.stabilityBias);

  const total = clamp01(0.45 * activity + 0.3 * selectivity + 0.25 * stability);
  return { activity, selectivity, stability, total };
}

function pipelineRun(reactionKey) {
  const knownCatalysts = getKnownCatalysts(reactionKey);
  const withVqe = knownCatalysts.map((c) => ({ ...c, vqe: runVqeLikeEnergyProfile(c, reactionKey), source: "database" }));
  const topKnown = withVqe.sort((a, b) => b.vqe.groundStateEnergy - a.vqe.groundStateEnergy).slice(0, 4);

  const generated = generateNovelCatalysts(topKnown, reactionKey, 6).map((c) => ({
    ...c,
    vqe: runVqeLikeEnergyProfile(c, reactionKey)
  }));

  const allCandidates = [...topKnown, ...generated].map((c) => {
    const scores = scoreCandidate(c, reactionKey, c.vqe);
    return {
      ...c,
      scores,
      confidenceTier: getConfidenceTier(c.vqe.confidence),
      vqeConfidence: c.vqe.confidence,
      feasibilityTier: getFeasibilityTier(c)
    };
  });

  allCandidates.sort((a, b) => b.scores.total - a.scores.total);

  return {
    reaction: reactionTemplates[reactionKey],
    feedbackModel,
    candidates: allCandidates,
    topRecommendation: allCandidates[0],
    syntheticBio: reactionTemplates[reactionKey].syntheticBioHints
  };
}

function createApiRouter(express) {
  ensureExperimentLogFile();
  const router = express.Router();

router.get("/reactions", (req, res) => {
  res.json(
    Object.entries(reactionTemplates).map(([id, value]) => ({
      id,
      name: value.name,
      category: value.category || "general"
    }))
  );
});

router.get("/provider", (req, res) => {
  const key = req.headers["x-api-key"] || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  res.json({ provider: detectProvider(key), hasKey: !!key });
});

router.post("/pipeline/run", async (req, res) => {
  const { reactionKey, useCase = "", apiKey, model } = req.body;
  if (!reactionKey || !reactionTemplates[reactionKey]) {
    return res.status(400).json({ error: "Invalid reactionKey" });
  }

  const clientKey = req.headers["x-api-key"] || apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const clientModel = model;

  const result = pipelineRun(reactionKey);
  const decision = buildManualUseCaseDecision(result.candidates, useCase);
  const aiInsights = await buildAiInsights(result, useCase, decision, clientKey, clientModel);

  return res.json({
    generatedAt: new Date().toISOString(),
    aiInsights,
    useCaseDecision: {
      useCase,
      chosenCandidateId: decision.chosenCandidate.id,
      reasons: decision.reasons
    },
    ...result
  });
});

router.post("/feedback", (req, res) => {
  const { reactionKey, candidateId, measuredYield, measuredSelectivity, measuredStability } = req.body;
  if (!reactionKey || !candidateId) {
    return res.status(400).json({ error: "reactionKey and candidateId are required" });
  }

  const predicted = pipelineRun(reactionKey).candidates.find((c) => c.id === candidateId);
  if (!predicted) {
    return res.status(404).json({ error: "Candidate not found for reaction" });
  }

  const deltaYield = measuredYield - predicted.scores.activity;
  const deltaSelectivity = measuredSelectivity - predicted.scores.selectivity;
  const deltaStability = measuredStability - predicted.scores.stability;

  const learningRate = 0.08;
  feedbackModel = {
    activityBias: clampSigned(feedbackModel.activityBias + learningRate * deltaYield),
    selectivityBias: clampSigned(feedbackModel.selectivityBias + learningRate * deltaSelectivity),
    stabilityBias: clampSigned(feedbackModel.stabilityBias + learningRate * deltaStability),
    roundsTrained: feedbackModel.roundsTrained + 1
  };

  biasHistory.push({
    round: feedbackModel.roundsTrained,
    timestamp: new Date().toISOString(),
    candidateId,
    activityBias: feedbackModel.activityBias,
    selectivityBias: feedbackModel.selectivityBias,
    stabilityBias: feedbackModel.stabilityBias
  });
  if (biasHistory.length > 50) biasHistory.shift();

  const predictionDelta = {
    activity: {
      predicted: predicted.scores.activity,
      measured: measuredYield,
      delta: deltaYield
    },
    selectivity: {
      predicted: predicted.scores.selectivity,
      measured: measuredSelectivity,
      delta: deltaSelectivity
    },
    stability: {
      predicted: predicted.scores.stability,
      measured: measuredStability,
      delta: deltaStability
    }
  };

  const logs = readJson(experimentLogPath, []);
  logs.push({
    timestamp: new Date().toISOString(),
    reactionKey,
    candidateId,
    measuredYield,
    measuredSelectivity,
    measuredStability,
    predictionBeforeFeedback: predicted.scores,
    predictionDelta
  });
  writeJson(experimentLogPath, logs);

  return res.json({
    message: "Feedback ingested and lightweight model updated.",
    feedbackModel,
    predictionDelta,
    biasHistory: biasHistory.slice(-5)
  });
});

router.get("/feedback/logs", (req, res) => {
  const logs = readJson(experimentLogPath, []);
  res.json(logs.slice(-20).reverse());
});

router.post("/chat", async (req, res) => {
  const { messages = [], context = "", model } = req.body;
  const apiKey = req.headers["x-api-key"] || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const provider = detectProvider(apiKey);

  if (provider === "none") {
    return res.json({
      reply: "No AI API key configured. Add your OpenAI key (sk-…) or Google Gemini key (AIza…) via the Settings panel (⚙) to enable AI chat. The pipeline runs fully without it.",
      provider: "none"
    });
  }

  const systemContent =
    "You are a catalysis R&D AI copilot for QuantumCatalyst AI, specialised in sustainable chemistry, biogas, and renewable energy applications. " +
    "You help scientists understand catalyst discovery results, explain quantum simulation outputs (VQE, ground-state energies, energy barriers), " +
    "suggest experimental strategies for biogas upgrading, biomethane production, CO2 conversion, and green hydrogen pathways, " +
    "interpret molecular properties, and provide concise, technically accurate guidance. " +
    "Be direct and specific. Prefer bullet points for lists. " +
    (context ? `\n\nCurrent pipeline context:\n${context}` : "");

  const allMessages = [
    { role: "system", content: systemContent },
    ...messages.slice(-12)
  ];

  try {
    const content = await llmChatCompletion(allMessages, apiKey, model);
    if (!content) return res.json({ reply: "No response from AI model.", provider: "none" });
    return res.json({ reply: content, provider });
  } catch (err) {
    return res.status(500).json({ reply: `AI error: ${err.message}`, provider: "error" });
  }
});

router.get("/memory", (req, res) => {
  const logs = readJson(experimentLogPath, []);
  res.json({
    feedbackModel,
    biasHistory: biasHistory.slice(-10),
    totalExperiments: feedbackModel.roundsTrained,
    recentLogs: logs.slice(-5).reverse()
  });
});

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

  return router;
}

module.exports = { createApiRouter, ensureExperimentLogFile };
