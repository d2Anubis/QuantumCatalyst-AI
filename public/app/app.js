/* ────────────────────────────────────────────────────────────
   QuantumCatalyst AI — App Logic
   ──────────────────────────────────────────────────────────── */

// ── State ───────────────────────────────────────────────────
const state = {
  currentReactionKey: null,
  currentCandidates: [],
  viewer: null,
  viewerStyle: "stick",
  chatOpen: false,
  chatMessages: [],
  chatTyping: false,
  pipelineContext: null,
  settings: {
    apiKey: "",
    model: "gpt-4o-mini",
    autoRunChat: false,
  },
};

// ── Reaction conditions lookup ────────────────────────────────
const REACTION_CONDITIONS = {
  "ethanol-to-jet":         { temp: "280 °C",    pressure: "3.2 bar",   feedstock: "Bioethanol (95% EtOH)" },
  "co2-to-methanol":        { temp: "240 °C",    pressure: "50 bar",    feedstock: "CO₂ / H₂ (3:1 ratio)" },
  "syngas-to-ethanol":      { temp: "300 °C",    pressure: "60 bar",    feedstock: "CO / H₂ Syngas" },
  "biogas-upgrading":       { temp: "25–40 °C",  pressure: "5–10 bar",  feedstock: "Raw Biogas (CH₄ 60%, CO₂ 38%, H₂S 2%)" },
  "waste-to-biogas":        { temp: "35–37 °C",  pressure: "1 atm",     feedstock: "Organic Waste / Agri Residue" },
  "biomethane-to-hydrogen": { temp: "800–900 °C",pressure: "20–30 bar", feedstock: "Biomethane (97% CH₄)" },
  "biogas-co2-utilization": { temp: "280–350 °C",pressure: "5–20 bar",  feedstock: "CO₂ + Renewable H₂ (4:1)" },
};

const PIPE_STEPS = ["Input", "Retrieval", "VQE Sim", "Generative", "Ranking", "Feedback"];
const PIPE_LOGS  = [
  "Loading reaction parameters…",
  "Querying catalyst database…",
  "Running VQE energy profiles…",
  "Generating novel candidates…",
  "Computing Pareto ranking…",
  "Updating feedback model…",
];

// ── Confidence / Feasibility helpers ─────────────────────────
const CONFIDENCE_META = {
  high:   { label: "High",     cls: "conf-high",   title: "VQE prediction reliability ≥ 82% — use with confidence" },
  medium: { label: "Medium",   cls: "conf-medium",  title: "VQE prediction reliability 70–81% — validate key metrics" },
  low:    { label: "Low",      cls: "conf-low",    title: "VQE prediction reliability < 70% — experimental screening recommended" },
};
const FEASIBILITY_META = {
  high:   { label: "Readily synth.", cls: "feas-high",   title: "Known precursors, established synthesis route" },
  medium: { label: "Moderate",       cls: "feas-medium",  title: "Novel variant of known family — synthesis feasible with lab effort" },
  low:    { label: "Complex",        cls: "feas-low",    title: "Highly novel — significant synthesis development required" },
};

// ── DOM refs ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const reactionSelect   = $("reactionSelect");

const useCaseInput     = $("useCaseInput");
const runBtn           = $("runBtn");
const runMeta          = $("runMeta");
const topRecommendation= $("topRecommendation");
const candidateRows    = $("candidateRows");
const bioHints         = $("bioHints");
const useCaseDecision  = $("useCaseDecision");
const kpiCandidate     = $("kpiCandidate");
const kpiActivity      = $("kpiActivity");
const kpiSelectivity   = $("kpiSelectivity");
const kpiStability     = $("kpiStability");
const feedbackForm     = $("feedbackForm");
const feedbackMsg      = $("feedbackMsg");
const feedbackLogs     = $("feedbackLogs");
const modelIntelligence= $("modelIntelligence");
const memoryRounds     = $("memoryRounds");
const biasActivity     = $("biasActivity");
const biasSelectivity  = $("biasSelectivity");
const biasStability    = $("biasStability");
const statusBadge      = $("statusBadge");
const statusText       = statusBadge.querySelector(".status-text");
const chatPanel        = $("chatPanel");
const chatMessages     = $("chatMessages");
const chatInput        = $("chatInput");
const chatSendBtn      = $("chatSendBtn");
const chatFloatingBtn  = $("chatFloatingBtn");
const chatCloseBtn     = $("chatCloseBtn");
const chatToggleBtn    = $("chatToggleBtn");
const chatProviderBadge= $("chatProviderBadge");
const chatSubtitle     = $("chatSubtitle");
const chatBadge        = $("chatBadge");
const chatKeyWarning   = $("chatKeyWarning");
const viewerOverlay    = $("viewerOverlay");
const settingsModal    = $("settingsModal");
const settingsBtn      = $("settingsBtn");
const settingsCloseBtn = $("settingsCloseBtn");
const cancelSettingsBtn= $("cancelSettingsBtn");
const saveSettingsBtn  = $("saveSettingsBtn");
const apiKeyInput      = $("apiKeyInput");
const modelSelect      = $("modelSelect");
const autoRunChat      = $("autoRunChat");
const toggleApiKey     = $("toggleApiKey");
const candidateCount   = $("candidateCount");
const logCount         = $("logCount");
const exportBtn        = $("exportBtn");
const condTemp         = $("condTemp");
const condPressure     = $("condPressure");
const condFeedstock    = $("condFeedstock");
const pipeProgressFill = $("pipeProgressFill");
const pipeLogLine      = $("pipeLogLine");
const aiInsightsInline = $("aiInsightsInline");
const aiInlineSummary  = $("aiInlineSummary");
const aiInlinePlan     = $("aiInlinePlan");
const aiInlineProvider = $("aiInlineProvider");

// ── Reaction conditions ───────────────────────────────────────
function updateConditions(reactionKey) {
  const cond = REACTION_CONDITIONS[reactionKey];
  if (!cond) return;
  condTemp.textContent      = cond.temp;
  condPressure.textContent  = cond.pressure;
  condFeedstock.textContent = cond.feedstock;
}

// ── Pipeline tracker ──────────────────────────────────────────
let _pipeTimer = null;

function resetPipeTracker() {
  for (let i = 0; i < 6; i++) {
    const step = $(`pstep-${i}`);
    if (step) { step.classList.remove("active", "done"); }
    const conn = $(`pconn-${i}`);
    if (conn) conn.classList.remove("done");
  }
  pipeProgressFill.style.width = "0%";
  pipeLogLine.textContent = "Starting…";
}

function animatePipeTracker(onDone) {
  resetPipeTracker();
  let step = 0;
  const stepDuration = 320;

  function advance() {
    // Mark previous step done, connector done
    if (step > 0) {
      $(`pstep-${step - 1}`)?.classList.replace("active", "done");
      $(`pconn-${step - 1}`)?.classList.add("done");
    }
    if (step >= 6) {
      // All done
      pipeProgressFill.style.width = "100%";
      pipeLogLine.textContent = "Complete ✓";
      onDone?.();
      return;
    }
    // Activate current step
    $(`pstep-${step}`)?.classList.add("active");
    pipeLogLine.textContent = PIPE_LOGS[step] || "";
    pipeProgressFill.style.width = `${Math.round(((step + 1) / 6) * 100)}%`;
    step++;
    _pipeTimer = setTimeout(advance, stepDuration);
  }

  advance();
}

function stopPipeTracker() {
  clearTimeout(_pipeTimer);
}

// ── Inline AI insights ────────────────────────────────────────
function renderAiInsightsInline(insights) {
  if (!insights || !insights.summary) { aiInsightsInline.hidden = true; return; }
  aiInlineSummary.textContent = insights.summary;
  aiInlinePlan.innerHTML = (insights.plan || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("");
  aiInlineProvider.textContent = insights.provider === "manual-fallback" ? "fallback" : (insights.provider || "offline");
  aiInlineProvider.className = `provider-badge ${insights.provider === "openai" ? "openai" : insights.provider === "gemini" ? "gemini" : "offline"}`;
  aiInsightsInline.hidden = false;
}

// ── Utilities ────────────────────────────────────────────────
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  $("toastContainer").appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("visible")));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function setStatus(type, text) {
  statusBadge.className = `status-badge status-${type}`;
  statusText.textContent = text;
}

function setRunning(running) {
  runBtn.disabled = running;
  runBtn.innerHTML = running
    ? `<svg class="btn-run-icon spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Running…`
    : `<svg class="btn-run-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>Run Discovery`;
  if (running) setStatus("running", "Running pipeline…");
}

// Inline CSS for spinner (minimal)
if (!document.getElementById("_spin_style")) {
  const s = document.createElement("style");
  s.id = "_spin_style";
  s.textContent = `@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 0.9s linear infinite}`;
  document.head.appendChild(s);
}

// ── Provider helpers ─────────────────────────────────────────
function detectProviderFromKey(key) {
  if (!key) return "none";
  if (key.startsWith("AIza")) return "gemini";
  return "openai";
}

const OPENAI_MODELS = [
  { value: "gpt-4o-mini",   label: "GPT-4o mini — fast, economical" },
  { value: "gpt-4o",        label: "GPT-4o — most capable" },
  { value: "gpt-4-turbo",   label: "GPT-4 Turbo" },
];
function getDefaultModel(provider) {
  return provider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini";
}

// ── Settings ─────────────────────────────────────────────────
/** Retired Gemini ids removed from generateContent — migrate saved browser settings */
const GEMINI_MODEL_ALIASES = {
  "gemini-1.5-flash": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-2.0-flash-lite": "gemini-2.5-flash-lite"
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("qcai_settings") || "{}");
    state.settings = { ...state.settings, ...saved };
    const m = state.settings.model;
    const next = GEMINI_MODEL_ALIASES[m];
    if (next) {
      state.settings.model = next;
      persistSettings();
    }
  } catch {}
  updateChatKeyWarning();
  syncProviderUI();
}

function persistSettings() {
  localStorage.setItem("qcai_settings", JSON.stringify(state.settings));
}

function syncProviderUI() {
  const provider = detectProviderFromKey(state.settings.apiKey);
  const isGemini = provider === "gemini";
  document.getElementById("tabOpenAI")?.classList.toggle("provider-tab-active", !isGemini);
  document.getElementById("tabGemini")?.classList.toggle("provider-tab-active", isGemini);
  const label = document.getElementById("apiKeyLabel");
  const hint = document.getElementById("apiKeyHint");
  if (label) label.textContent = isGemini ? "Google Gemini API Key" : "OpenAI API Key";
  if (hint) hint.innerHTML = isGemini
    ? "Stored in your browser only. Paste your <strong>Google Gemini</strong> key (starts with <code>AIza</code>). Get one at <a href='https://aistudio.google.com/apikey' target='_blank' style='color:var(--cyan)'>aistudio.google.com</a>."
    : "Stored in your browser only. Paste your <strong>OpenAI</strong> key (starts with <code>sk-</code>).";
  const apiKeyInput = document.getElementById("apiKeyInput");
  if (apiKeyInput) apiKeyInput.placeholder = isGemini ? "AIza…" : "sk-…";
}

function openSettings() {
  const provider = detectProviderFromKey(state.settings.apiKey);
  apiKeyInput.value = state.settings.apiKey || "";
  modelSelect.value = state.settings.model || getDefaultModel(provider);
  autoRunChat.checked = state.settings.autoRunChat || false;
  syncProviderUI();
  settingsModal.hidden = false;
}

function closeSettings() {
  settingsModal.hidden = true;
}

function saveSettings() {
  state.settings.apiKey = apiKeyInput.value.trim();
  state.settings.model = modelSelect.value;
  state.settings.autoRunChat = autoRunChat.checked;
  persistSettings();
  closeSettings();
  updateChatKeyWarning();
  updateChatProviderBadge();
  syncProviderUI();
  showToast("Settings saved", "success");
}

function updateChatKeyWarning() {
  chatKeyWarning.hidden = !!state.settings.apiKey;
}

function updateChatProviderBadge() {
  const provider = detectProviderFromKey(state.settings.apiKey);
  if (provider !== "none") {
    chatProviderBadge.textContent = provider;
    chatProviderBadge.className = `provider-badge ${provider}`;
  } else {
    chatProviderBadge.textContent = "offline";
    chatProviderBadge.className = "provider-badge offline";
  }
}

// Provider tab click handlers (wired after DOM load)
function initProviderTabs() {
  document.querySelectorAll(".provider-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const isGemini = tab.dataset.provider === "gemini";
      document.querySelectorAll(".provider-tab").forEach((t) => t.classList.remove("provider-tab-active"));
      tab.classList.add("provider-tab-active");
      // Update placeholder and hint
      const apiKeyInput = document.getElementById("apiKeyInput");
      const label = document.getElementById("apiKeyLabel");
      const hint = document.getElementById("apiKeyHint");
      if (apiKeyInput) apiKeyInput.placeholder = isGemini ? "AIza…" : "sk-…";
      if (label) label.textContent = isGemini ? "Google Gemini API Key" : "OpenAI API Key";
      if (hint) hint.innerHTML = isGemini
        ? "Stored in your browser only. Paste your <strong>Google Gemini</strong> key (starts with <code>AIza</code>). Get one at <a href='https://aistudio.google.com/apikey' target='_blank' style='color:var(--cyan)'>aistudio.google.com</a>."
        : "Stored in your browser only. Paste your <strong>OpenAI</strong> key (starts with <code>sk-</code>).";
      // Suggest a default model for selected provider
      const suggestedModel = getDefaultModel(tab.dataset.provider);
      if (modelSelect && (!modelSelect.value || detectProviderFromKey(apiKeyInput?.value || "") !== tab.dataset.provider)) {
        modelSelect.value = suggestedModel;
      }
    });
  });
}

settingsBtn.addEventListener("click", openSettings);
settingsCloseBtn.addEventListener("click", closeSettings);
cancelSettingsBtn.addEventListener("click", closeSettings);
saveSettingsBtn.addEventListener("click", saveSettings);
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeSettings(); });

toggleApiKey.addEventListener("click", () => {
  const isPassword = apiKeyInput.type === "password";
  apiKeyInput.type = isPassword ? "text" : "password";
  toggleApiKey.title = isPassword ? "Hide key" : "Show key";
});

// ── 3D Viewer ─────────────────────────────────────────────────
function initViewer() {
  const viewerEl = document.getElementById("viewer");
  state.viewer = $3Dmol.createViewer(viewerEl, { backgroundColor: "#020b14" });
  state.viewer.addModel("3\nplaceholder\nC 0 0 0\nH 1 0 0\nH -1 0 0", "xyz");
  applyViewerStyle(state.viewerStyle);
  state.viewer.zoomTo();
  state.viewer.render();
  requestAnimationFrame(() => { if (state.viewer) state.viewer.resize(); });
}

function applyViewerStyle(style) {
  if (!state.viewer) return;
  if (style === "sphere") {
    state.viewer.setStyle({}, { sphere: { scale: 0.38, colorscheme: "Jmol" } });
  } else {
    state.viewer.setStyle({}, { stick: { radius: 0.18, colorscheme: "Jmol" }, sphere: { scale: 0.28, colorscheme: "Jmol" } });
  }
  state.viewer.render();
}

function setViewerStyle(style) {
  state.viewerStyle = style;
  document.querySelectorAll(".viewer-style-btns .btn-xs").forEach((btn) => {
    btn.classList.toggle("btn-xs-active", btn.dataset.style === style);
  });
  applyViewerStyle(style);
}

function renderModel(xyz) {
  if (!state.viewer) return;
  state.viewer.clear();
  state.viewer.addModel(xyz, "xyz");
  applyViewerStyle(state.viewerStyle);
  state.viewer.zoomTo();
  state.viewer.render();
  viewerOverlay.classList.add("hidden");
  setTimeout(() => { if (state.viewer) state.viewer.resize(); }, 50);
}

window.setViewerStyle = setViewerStyle;

window.addEventListener("resize", () => { if (state.viewer) state.viewer.resize(); });

// ── API helpers ───────────────────────────────────────────────
async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    const t = text.trim();
    const looksHtml = t.startsWith("<!DOCTYPE") || t.startsWith("<html") || t.includes('"__next"');
    if (looksHtml) {
      throw new Error(
        `API error (${res.status}): expected JSON but got an HTML page (often a 404). ` +
          "On Vercel, /api must be deployed as serverless functions—see api/ in the repo."
      );
    }
    throw new Error(text.slice(0, 240) || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Load reactions ────────────────────────────────────────────
async function loadReactions() {
  const reactions = await fetchJson("/api/reactions");
  reactionSelect.innerHTML = "";

  // Group reactions by category
  const groups = {
    "biogas":            { label: "Biogas & Biomethane", reactions: [] },
    "sustainable-fuels": { label: "Sustainable Fuels", reactions: [] },
    "carbon-conversion": { label: "Carbon Conversion", reactions: [] },
    "general":           { label: "Other", reactions: [] },
  };

  reactions.forEach((r) => {
    const cat = r.category || "general";
    if (!groups[cat]) groups[cat] = { label: cat, reactions: [] };
    groups[cat].reactions.push(r);
  });

  Object.values(groups).forEach((group) => {
    if (!group.reactions.length) return;
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.reactions.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      optgroup.appendChild(opt);
    });
    reactionSelect.appendChild(optgroup);
  });

  // Default to first biogas reaction
  const biogasFirst = reactions.find((r) => r.category === "biogas");
  state.currentReactionKey = biogasFirst?.id || reactions[0]?.id || null;
  if (state.currentReactionKey) {
    reactionSelect.value = state.currentReactionKey;
    updateConditions(state.currentReactionKey);
  }

  // Update conditions live when reaction changes
  reactionSelect.addEventListener("change", () => {
    updateConditions(reactionSelect.value);
    aiInsightsInline.hidden = true;
    resetPipeTracker();
    pipeLogLine.textContent = "Awaiting run…";
  });
}

// ── Render helpers ────────────────────────────────────────────
function renderTopRecommendation(candidate) {
  if (!candidate) { topRecommendation.innerHTML = `<span class="empty-state">No recommendation available.</span>`; return; }

  kpiCandidate.textContent  = candidate.id;
  kpiActivity.textContent   = pct(candidate.scores.activity);
  kpiSelectivity.textContent= pct(candidate.scores.selectivity);
  kpiStability.textContent  = pct(candidate.scores.stability);

  topRecommendation.innerHTML = `
    <p style="margin-bottom:8px"><strong>${candidate.name}</strong></p>
    <p style="margin-bottom:10px">
      <span class="pill">${candidate.id}</span>
      <span class="pill">${candidate.family}</span>
    </p>
    <p style="font-size:12.5px;color:var(--text-muted);margin-bottom:12px">${candidate.source} source</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px">
      ${[
        ["Activity",    candidate.scores.activity,    "var(--cyan)"],
        ["Selectivity", candidate.scores.selectivity, "var(--violet)"],
        ["Stability",   candidate.scores.stability,   "var(--emerald)"],
      ].map(([label, val, color]) => `
        <div style="border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:8px;text-align:center">
          <p style="color:var(--text-muted);margin-bottom:4px">${label}</p>
          <p style="font-weight:700;color:${color};font-size:14px">${pct(val)}</p>
        </div>`).join("")}
    </div>
    <div style="margin-top:12px;padding:10px;border:1px solid rgba(34,211,238,0.15);border-radius:8px;background:rgba(34,211,238,0.04)">
      <span style="font-size:12px;color:var(--cyan);font-weight:600">Composite Score</span>
      <span style="float:right;font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text)">${pct(candidate.scores.total)}</span>
    </div>
  `;
}

function renderBioHints(data) {
  if (!data) { bioHints.innerHTML = `<span class="empty-state">No pathway data.</span>`; return; }
  bioHints.innerHTML = `
    <div style="margin-bottom:10px">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px">Metabolic Pathway</p>
      <p style="font-size:13px;line-height:1.55;color:var(--text-soft)">${data.pathway}</p>
    </div>
    <div style="margin-bottom:10px">
      <p style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px">Flux Risk</p>
      <p style="font-size:13px;color:var(--text-soft)">${data.fluxRisk}</p>
    </div>
    <div>
      <p style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Suggested Edits</p>
      <ul style="padding-left:16px;font-size:12.5px;color:var(--text-soft);display:flex;flex-direction:column;gap:4px">
        ${data.suggestedEdits.map((e) => `<li>${e}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderCandidates(candidates) {
  state.currentCandidates = candidates;
  candidateCount.textContent = `${candidates.length} candidates`;

  if (!candidates.length) {
    candidateRows.innerHTML = `<tr><td colspan="10" class="table-empty">No candidates found</td></tr>`;
    return;
  }

  candidateRows.innerHTML = candidates.map((c, i) => {
    const conf = CONFIDENCE_META[c.confidenceTier] || CONFIDENCE_META.medium;
    const feas = FEASIBILITY_META[c.feasibilityTier] || FEASIBILITY_META.medium;
    return `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:12.5px;color:var(--text)">${c.id}</span></td>
      <td style="color:var(--text);font-weight:500">${c.name}</td>
      <td><span class="source-chip source-${c.source}">${c.source}</span></td>
      <td><span class="tier-badge ${conf.cls}" title="${conf.title}">${conf.label}</span></td>
      <td><span class="tier-badge ${feas.cls}" title="${feas.title}">${feas.label}</span></td>
      <td>
        <div class="score-bar">
          <div class="score-bar-track"><div class="score-bar-fill" style="width:${c.scores.activity*100}%;background:linear-gradient(90deg,var(--blue),var(--cyan))"></div></div>
          <span class="score-text">${pct(c.scores.activity)}</span>
        </div>
      </td>
      <td>
        <div class="score-bar">
          <div class="score-bar-track"><div class="score-bar-fill" style="width:${c.scores.selectivity*100}%;background:linear-gradient(90deg,var(--violet),#a78bfa)"></div></div>
          <span class="score-text">${pct(c.scores.selectivity)}</span>
        </div>
      </td>
      <td>
        <div class="score-bar">
          <div class="score-bar-track"><div class="score-bar-fill" style="width:${c.scores.stability*100}%;background:linear-gradient(90deg,var(--emerald),#34d399)"></div></div>
          <span class="score-text">${pct(c.scores.stability)}</span>
        </div>
      </td>
      <td><span class="total-score">${pct(c.scores.total)}</span>${i === 0 ? ' <span style="font-size:10px;background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.25);color:var(--cyan);padding:1px 6px;border-radius:99px;margin-left:4px">Top</span>' : ""}</td>
      <td class="action-cell">
        <button class="btn-view" data-id="${c.id}">Load 3D</button>
        <button class="btn-why" data-id="${c.id}" title="AI Hypothesis: explain this candidate's performance">Why?</button>
      </td>
    </tr>`;
  }).join("");

  document.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const candidate = state.currentCandidates.find((c) => c.id === btn.dataset.id);
      if (candidate) {
        $("candidateId").value = candidate.id;
        renderModel(candidate.xyz);
        showToast(`Loaded ${candidate.id} in 3D viewer`, "info");
        document.getElementById("studio").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  document.querySelectorAll(".btn-why").forEach((btn) => {
    btn.addEventListener("click", () => explainCandidate(btn.dataset.id));
  });
}

function explainCandidate(candidateId) {
  const c = state.currentCandidates.find((x) => x.id === candidateId);
  if (!c) return;
  const reactionName = reactionSelect.options[reactionSelect.selectedIndex]?.text || state.currentReactionKey;
  const conf = CONFIDENCE_META[c.confidenceTier] || CONFIDENCE_META.medium;
  const feas = FEASIBILITY_META[c.feasibilityTier] || FEASIBILITY_META.medium;
  const prompt =
    `Explain the scientific reasoning behind ${c.id} (${c.name}, ${c.family} family) for the reaction: ${reactionName}.\n` +
    `Scores — Activity: ${pct(c.scores.activity)}, Selectivity: ${pct(c.scores.selectivity)}, Stability: ${pct(c.scores.stability)}, Total: ${pct(c.scores.total)}.\n` +
    `VQE prediction confidence: ${conf.label}. Synthesis feasibility: ${feas.label}.\n\n` +
    `Please answer: (1) What structural or chemical factors most likely drive its strongest metric? ` +
    `(2) What is the likely cause of its weakest metric, and what experimental modification would address it? ` +
    `(3) What is the most important thing to monitor in the first 72 hours of bench testing?`;
  if (!state.chatOpen) toggleChat(true);
  setTimeout(() => sendChatMessage(prompt), 80);
  showToast(`Opening AI hypothesis for ${candidateId}`, "info");
}

function renderUseCaseDecision(decision) {
  if (!decision) { useCaseDecision.innerHTML = ""; return; }
  useCaseDecision.innerHTML = `
    <div style="margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--text-muted)">Use-case recommendation</span>
    </div>
    <p style="font-size:13px;color:var(--text);font-weight:600;margin-bottom:6px">${decision.chosenCandidateId}</p>
    ${decision.useCase ? `<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-style:italic">"${decision.useCase}"</p>` : ""}
    <ul style="font-size:12.5px;color:var(--text-soft);padding-left:16px;display:flex;flex-direction:column;gap:4px">
      ${decision.reasons.map((r) => `<li>${r}</li>`).join("")}
    </ul>
  `;
}

// ── Pipeline ─────────────────────────────────────────────────
async function runPipeline() {
  state.currentReactionKey = reactionSelect.value;
  updateConditions(state.currentReactionKey);

  // Start tracker animation (it runs in parallel with the API call)
  animatePipeTracker();

  const result = await fetchJson("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify({
      reactionKey: state.currentReactionKey,
      useCase: useCaseInput.value.trim(),
      apiKey: state.settings.apiKey || undefined,
      model: state.settings.model || undefined,
    }),
  });

  stopPipeTracker();
  // Force all steps to done state
  for (let i = 0; i < 6; i++) {
    const s = $(`pstep-${i}`);
    s?.classList.remove("active");
    s?.classList.add("done");
    $(`pconn-${i}`)?.classList.add("done");
  }
  pipeProgressFill.style.width = "100%";
  pipeLogLine.textContent = "Complete ✓";

  const time = new Date(result.generatedAt).toLocaleTimeString();
  runMeta.textContent = `Run at ${time} · ${result.candidates?.length ?? 0} candidates · ${result.feedbackModel.roundsTrained} feedback rounds · AI: ${result.aiInsights.provider}`;

  renderTopRecommendation(result.topRecommendation);
  renderBioHints(result.syntheticBio);
  renderUseCaseDecision(result.useCaseDecision);
  renderCandidates(result.candidates);
  renderModel(result.topRecommendation.xyz);
  renderAiInsightsInline(result.aiInsights);
  renderMemoryPanel(result.feedbackModel);

  // Build context string for AI chat
  const top3 = (result.candidates || []).slice(0, 3)
    .map((c) => `${c.id} (${c.family}, activity ${pct(c.scores.activity)}, selectivity ${pct(c.scores.selectivity)}, stability ${pct(c.scores.stability)}, total ${pct(c.scores.total)})`)
    .join("; ");
  state.pipelineContext = `Reaction: ${result.reaction.name}. Top 3 candidates: ${top3}. Recommended for use-case: ${result.useCaseDecision?.chosenCandidateId || "n/a"}.`;

  // Update provider badge based on what the pipeline actually used
  if (result.aiInsights.provider && result.aiInsights.provider !== "manual-fallback") {
    chatProviderBadge.textContent = result.aiInsights.provider;
    chatProviderBadge.className = `provider-badge ${result.aiInsights.provider}`;
  }

  if (state.settings.autoRunChat && state.settings.apiKey && result.aiInsights.summary) {
    appendChatMessage("assistant", result.aiInsights.summary);
    if (!state.chatOpen) {
      chatBadge.hidden = false;
    }
  }

  if (state.viewer) state.viewer.resize();
  setStatus("done", "Complete");
  return result;
}

// ── Run button ────────────────────────────────────────────────
runBtn.addEventListener("click", async () => {
  setRunning(true);
  runMeta.textContent = "Running quantum simulation…";
  try {
    await runPipeline();
    showToast("Pipeline complete", "success");
  } catch (err) {
    stopPipeTracker();
    pipeLogLine.textContent = `Error: ${err.message}`;
    pipeProgressFill.style.background = "var(--red)";
    runMeta.textContent = `Error: ${err.message}`;
    setStatus("error", "Error");
    showToast(`Pipeline failed: ${err.message}`, "error");
  } finally {
    setRunning(false);
  }
});

// ── Feedback ──────────────────────────────────────────────────
async function refreshLogs() {
  const logs = await fetchJson("/api/feedback/logs");
  logCount.textContent = `${logs.length} runs`;
  if (!logs.length) {
    feedbackLogs.innerHTML = `<li class="log-empty">No experiments logged yet</li>`;
    return;
  }
  feedbackLogs.innerHTML = logs.slice(0, 10).map((log) => `
    <li>
      <span style="color:var(--text-muted)">${new Date(log.timestamp).toLocaleDateString()}</span>
      <span style="color:var(--cyan);font-weight:600;margin:0 6px">${log.candidateId}</span>
      Y:${pct(log.measuredYield)} · S:${pct(log.measuredSelectivity)} · St:${pct(log.measuredStability)}
    </li>
  `).join("");
}

function formatBias(value) {
  const pctVal = (value * 100).toFixed(1);
  if (value > 0.001)  return { text: `+${pctVal}%`, cls: "bias-positive" };
  if (value < -0.001) return { text: `${pctVal}%`,  cls: "bias-negative" };
  return { text: `±0.0%`, cls: "bias-neutral" };
}

function renderMemoryPanel(fm) {
  if (!fm || fm.roundsTrained === 0) return;
  modelIntelligence.hidden = false;
  memoryRounds.textContent = fm.roundsTrained;

  const bA = formatBias(fm.activityBias);
  const bS = formatBias(fm.selectivityBias);
  const bSt = formatBias(fm.stabilityBias);

  biasActivity.textContent    = bA.text;
  biasActivity.className      = `bias-value ${bA.cls}`;
  biasSelectivity.textContent = bS.text;
  biasSelectivity.className   = `bias-value ${bS.cls}`;
  biasStability.textContent   = bSt.text;
  biasStability.className     = `bias-value ${bSt.cls}`;
}

function renderPredictionDelta(delta) {
  if (!delta) return "";
  const fmt = (d) => {
    const v = (d * 100).toFixed(1);
    return d >= 0 ? `<span class="delta-pos">+${v}%</span>` : `<span class="delta-neg">${v}%</span>`;
  };
  return `
    <div class="delta-table">
      <div class="delta-row">
        <span class="delta-label">Activity</span>
        <span class="delta-predicted">${(delta.activity.predicted * 100).toFixed(1)}%</span>
        <span class="delta-arrow">→</span>
        <span class="delta-measured">${(delta.activity.measured * 100).toFixed(1)}%</span>
        <span class="delta-diff">${fmt(delta.activity.delta)}</span>
      </div>
      <div class="delta-row">
        <span class="delta-label">Selectivity</span>
        <span class="delta-predicted">${(delta.selectivity.predicted * 100).toFixed(1)}%</span>
        <span class="delta-arrow">→</span>
        <span class="delta-measured">${(delta.selectivity.measured * 100).toFixed(1)}%</span>
        <span class="delta-diff">${fmt(delta.selectivity.delta)}</span>
      </div>
      <div class="delta-row">
        <span class="delta-label">Stability</span>
        <span class="delta-predicted">${(delta.stability.predicted * 100).toFixed(1)}%</span>
        <span class="delta-arrow">→</span>
        <span class="delta-measured">${(delta.stability.measured * 100).toFixed(1)}%</span>
        <span class="delta-diff">${fmt(delta.stability.delta)}</span>
      </div>
    </div>`;
}

feedbackForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  feedbackMsg.textContent = "Submitting…";
  feedbackMsg.className = "feedback-msg";
  try {
    const payload = {
      reactionKey: state.currentReactionKey,
      candidateId: $("candidateId").value.trim(),
      measuredYield: Number($("yield").value),
      measuredSelectivity: Number($("selectivity").value),
      measuredStability: Number($("stability").value),
    };
    const result = await fetchJson("/api/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    feedbackMsg.innerHTML = `
      <span class="feedback-success-line">Feedback ingested · Model updated · ${result.feedbackModel.roundsTrained} training rounds</span>
      <span class="feedback-delta-label">Prediction vs measured:</span>
      ${renderPredictionDelta(result.predictionDelta)}
    `;
    feedbackMsg.className = "feedback-msg success";
    renderMemoryPanel(result.feedbackModel);
    showToast("Feedback submitted — model updated", "success");
    await runPipeline();
    await refreshLogs();
  } catch (err) {
    feedbackMsg.textContent = `Error: ${err.message}`;
    feedbackMsg.className = "feedback-msg error";
    showToast(`Feedback error: ${err.message}`, "error");
  }
});

// ── CSV Export ────────────────────────────────────────────────
exportBtn.addEventListener("click", () => {
  if (!state.currentCandidates.length) {
    showToast("Run the pipeline first to generate candidates", "error");
    return;
  }
  const headers = ["ID", "Name", "Family", "Source", "Activity", "Selectivity", "Stability", "Total Score"];
  const rows = state.currentCandidates.map((c) => [
    c.id, c.name, c.family, c.source,
    c.scores.activity.toFixed(4), c.scores.selectivity.toFixed(4),
    c.scores.stability.toFixed(4), c.scores.total.toFixed(4),
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qcai_candidates_${state.currentReactionKey}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV exported", "success");
});

// ── AI Chat ───────────────────────────────────────────────────
function toggleChat(open) {
  state.chatOpen = open;
  chatPanel.classList.toggle("open", open);
  chatPanel.setAttribute("aria-hidden", String(!open));
  chatFloatingBtn.classList.toggle("hidden", open);
  if (open) {
    chatBadge.hidden = true;
    setTimeout(() => chatInput.focus(), 320);
  }
}

chatToggleBtn.addEventListener("click", () => toggleChat(!state.chatOpen));
chatFloatingBtn.addEventListener("click", () => toggleChat(true));
chatCloseBtn.addEventListener("click", () => toggleChat(false));

function appendChatMessage(role, text) {
  const isFirst = chatMessages.querySelector(".chat-welcome");
  if (isFirst) isFirst.remove();

  const wrapper = document.createElement("div");
  wrapper.className = `chat-msg ${role}`;
  wrapper.innerHTML = `
    <div class="chat-msg-avatar">${role === "assistant" ? "AI" : "You"}</div>
    <div class="chat-msg-bubble">${escapeHtml(text).replace(/\n/g, "<br>")}</div>
  `;
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (role === "assistant") {
    state.chatMessages.push({ role: "assistant", content: text });
    chatSubtitle.textContent = "Response ready";
    updateChatProviderBadge();
  } else {
    state.chatMessages.push({ role: "user", content: text });
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showTypingIndicator() {
  const el = document.createElement("div");
  el.className = "chat-msg assistant";
  el.id = "_typing";
  el.innerHTML = `
    <div class="chat-msg-avatar">AI</div>
    <div class="chat-typing"><span></span><span></span><span></span></div>
  `;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById("_typing");
  if (el) el.remove();
}

async function sendChatMessage(text) {
  if (!text.trim() || state.chatTyping) return;

  appendChatMessage("user", text);
  chatInput.value = "";
  chatInput.style.height = "auto";

  state.chatTyping = true;
  chatSendBtn.disabled = true;
  chatSubtitle.textContent = "Thinking…";
  showTypingIndicator();

  try {
    const headers = { "Content-Type": "application/json" };
    if (state.settings.apiKey) headers["X-Api-Key"] = state.settings.apiKey;

    const body = JSON.stringify({
      messages: state.chatMessages.slice(-12),
      context: state.pipelineContext || "No pipeline run yet.",
      model: state.settings.model,
    });

    const res = await fetch("/api/chat", { method: "POST", headers, body });
    const data = await res.json();

    removeTypingIndicator();
    appendChatMessage("assistant", data.reply || "No response.");

    if (data.provider && data.provider !== "none" && data.provider !== "error") {
      chatProviderBadge.textContent = data.provider;
      chatProviderBadge.className = `provider-badge ${data.provider}`;
    }
  } catch (err) {
    removeTypingIndicator();
    appendChatMessage("assistant", `Sorry, I encountered an error: ${err.message}`);
    chatProviderBadge.textContent = "error";
    chatProviderBadge.className = "provider-badge error";
  } finally {
    state.chatTyping = false;
    chatSendBtn.disabled = false;
    chatSubtitle.textContent = "Ready to assist";
  }
}

window.sendSuggestion = (text) => {
  if (!state.chatOpen) toggleChat(true);
  setTimeout(() => sendChatMessage(text), 80);
};

chatSendBtn.addEventListener("click", () => sendChatMessage(chatInput.value));

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage(chatInput.value);
  }
});

// Auto-resize textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

// ── Init ─────────────────────────────────────────────────────
async function init() {
  loadSettings();
  initProviderTabs();
  updateChatProviderBadge();
  initViewer();

  try {
    await loadReactions();
    setRunning(true);
    runMeta.textContent = "Running initial pipeline…";
    await runPipeline();
    await refreshLogs();
    showToast("Pipeline initialized", "success");
  } catch (err) {
    runMeta.textContent = `Initialization failed: ${err.message}`;
    setStatus("error", "Error");
    showToast("Could not connect to server. Is it running on port 4000?", "error");
  } finally {
    setRunning(false);
  }
}

init();
