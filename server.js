const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Functional app — served at /app (all relative asset/API paths still resolve correctly)
app.use("/app", express.static(path.join(__dirname, "public")));

// Marketing page — Next.js static export served at /
// Built by `npm run build` into the `out/` directory
const outDir = path.join(__dirname, "out");
if (fs.existsSync(outDir)) {
  app.use(express.static(outDir));
}

// Root fallback: redirect to /app if no Next.js build exists yet
app.get("/", (req, res) => {
  if (fs.existsSync(path.join(outDir, "index.html"))) {
    res.sendFile(path.join(outDir, "index.html"));
  } else {
    res.redirect("/app");
  }
});

const catalystDbPath = path.join(__dirname, "data", "catalysts.json");
const experimentLogPath = path.join(__dirname, "data", "experiment_logs.json");

const defaultFeedbackModel = {
  activityBias: 0,
  selectivityBias: 0,
  stabilityBias: 0,
  roundsTrained: 0
};

let feedbackModel = { ...defaultFeedbackModel };

const reactionTemplates = {
  "ethanol-to-jet": {
    name: "Ethanol to Jet Fuel",
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

function openAiChatCompletion(messages, overrideApiKey, overrideModel) {
  const apiKey = overrideApiKey || process.env.OPENAI_API_KEY;
  const model = overrideModel || process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    return Promise.resolve(null);
  }

  const body = JSON.stringify({
    model,
    temperature: 0.2,
    messages
  });

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
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`LLM request failed (${res.statusCode}): ${data}`));
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.message?.content || "";
            return resolve(content);
          } catch (err) {
            return reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
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
  const key = overrideApiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    return fallback;
  }

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

    const prompt = [
      {
        role: "system",
        content:
          "You are a catalysis R&D copilot. Return strict JSON with keys: summary (string), plan (array of 3 short strings), caveats (array of 3 short strings), useCaseRationale (array of 2-4 short strings)."
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

    const content = await openAiChatCompletion(prompt, overrideApiKey, overrideModel);
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    return {
      provider: "openai",
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
    return { ...c, scores };
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

app.get("/api/reactions", (req, res) => {
  res.json(
    Object.entries(reactionTemplates).map(([id, value]) => ({
      id,
      name: value.name
    }))
  );
});

app.post("/api/pipeline/run", async (req, res) => {
  const { reactionKey, useCase = "", apiKey, model } = req.body;
  if (!reactionKey || !reactionTemplates[reactionKey]) {
    return res.status(400).json({ error: "Invalid reactionKey" });
  }

  const clientKey = req.headers["x-api-key"] || apiKey;
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

app.post("/api/feedback", (req, res) => {
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

  const logs = readJson(experimentLogPath, []);
  logs.push({
    timestamp: new Date().toISOString(),
    reactionKey,
    candidateId,
    measuredYield,
    measuredSelectivity,
    measuredStability,
    predictionBeforeFeedback: predicted.scores
  });
  writeJson(experimentLogPath, logs);

  return res.json({
    message: "Feedback ingested and lightweight model updated.",
    feedbackModel
  });
});

app.get("/api/feedback/logs", (req, res) => {
  const logs = readJson(experimentLogPath, []);
  res.json(logs.slice(-20).reverse());
});

app.post("/api/chat", async (req, res) => {
  const { messages = [], context = "", model } = req.body;
  const apiKey = req.headers["x-api-key"] || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.json({
      reply: "No OpenAI API key configured. Add your key via the Settings panel (⚙) to enable AI chat. The pipeline still runs fully without it — AI chat and enhanced insights require a key.",
      provider: "none"
    });
  }

  const systemContent =
    "You are a catalysis R&D AI copilot for QuantumCatalyst AI. " +
    "You help scientists understand catalyst discovery results, explain quantum simulation outputs (VQE, ground-state energies, energy barriers), " +
    "suggest experimental strategies, interpret molecular properties, and provide concise, technically accurate guidance. " +
    "Be direct and specific. Prefer bullet points for lists. " +
    (context ? `\n\nCurrent pipeline context:\n${context}` : "");

  const allMessages = [
    { role: "system", content: systemContent },
    ...messages.slice(-12)
  ];

  try {
    const content = await openAiChatCompletion(allMessages, apiKey, model);
    if (!content) return res.json({ reply: "No response from AI model.", provider: "none" });
    return res.json({ reply: content, provider: "openai" });
  } catch (err) {
    return res.status(500).json({ reply: `AI error: ${err.message}`, provider: "error" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

function startServerWithPortRetry(initialPort, maxAttempts = 10) {
  if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  }
  if (!fs.existsSync(experimentLogPath)) {
    writeJson(experimentLogPath, []);
  }

  let currentPort = Number(initialPort);
  let attempts = 0;

  function tryListen() {
    const server = app
      .listen(currentPort, () => {
        console.log(`QuantumCatalyst AI prototype running at http://localhost:${currentPort}`);
      })
      .on("error", (err) => {
        if (err.code === "EADDRINUSE" && attempts < maxAttempts) {
          attempts += 1;
          currentPort += 1;
          console.log(`Port in use. Retrying on ${currentPort}...`);
          return tryListen();
        }
        throw err;
      });

    return server;
  }

  return tryListen();
}

startServerWithPortRetry(PORT);
