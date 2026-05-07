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

// ── Settings ─────────────────────────────────────────────────
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("qcai_settings") || "{}");
    state.settings = { ...state.settings, ...saved };
  } catch {}
  updateChatKeyWarning();
}

function persistSettings() {
  localStorage.setItem("qcai_settings", JSON.stringify(state.settings));
}

function openSettings() {
  apiKeyInput.value = state.settings.apiKey || "";
  modelSelect.value = state.settings.model || "gpt-4o-mini";
  autoRunChat.checked = state.settings.autoRunChat || false;
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
  showToast("Settings saved", "success");
  if (state.settings.apiKey) {
    chatProviderBadge.textContent = "openai";
    chatProviderBadge.className = "provider-badge openai";
  }
}

function updateChatKeyWarning() {
  chatKeyWarning.hidden = !!state.settings.apiKey;
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
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Load reactions ────────────────────────────────────────────
async function loadReactions() {
  const reactions = await fetchJson("/api/reactions");
  reactionSelect.innerHTML = "";
  reactions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    reactionSelect.appendChild(opt);
  });
  state.currentReactionKey = reactions[0]?.id || null;
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
    candidateRows.innerHTML = `<tr><td colspan="8" class="table-empty">No candidates found</td></tr>`;
    return;
  }

  candidateRows.innerHTML = candidates.map((c, i) => `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:12.5px;color:var(--text)">${c.id}</span></td>
      <td style="color:var(--text);font-weight:500">${c.name}</td>
      <td><span class="source-chip source-${c.source}">${c.source}</span></td>
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
      <td><button class="btn-view" data-id="${c.id}">Load 3D</button></td>
    </tr>
  `).join("");

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
  const result = await fetchJson("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify({
      reactionKey: state.currentReactionKey,
      useCase: useCaseInput.value.trim(),
      apiKey: state.settings.apiKey || undefined,
      model: state.settings.model || undefined,
    }),
  });

  const time = new Date(result.generatedAt).toLocaleTimeString();
  runMeta.textContent = `Run at ${time} · ${result.candidates?.length ?? 0} candidates · ${result.feedbackModel.roundsTrained} feedback rounds · AI: ${result.aiInsights.provider}`;

  renderTopRecommendation(result.topRecommendation);
  renderBioHints(result.syntheticBio);
  renderUseCaseDecision(result.useCaseDecision);
  renderCandidates(result.candidates);
  renderModel(result.topRecommendation.xyz);

  // Build context string for AI chat
  const top3 = (result.candidates || []).slice(0, 3)
    .map((c) => `${c.id} (${c.family}, activity ${pct(c.scores.activity)}, selectivity ${pct(c.scores.selectivity)}, stability ${pct(c.scores.stability)}, total ${pct(c.scores.total)})`)
    .join("; ");
  state.pipelineContext = `Reaction: ${result.reaction.name}. Top 3 candidates: ${top3}. Recommended for use-case: ${result.useCaseDecision?.chosenCandidateId || "n/a"}.`;

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
    feedbackMsg.textContent = `Feedback ingested · ${result.feedbackModel.roundsTrained} total training rounds`;
    feedbackMsg.className = "feedback-msg success";
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
    chatProviderBadge.textContent = state.settings.apiKey ? "openai" : "offline";
    chatProviderBadge.className = `provider-badge ${state.settings.apiKey ? "openai" : "offline"}`;
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

    if (data.provider === "openai") {
      chatProviderBadge.textContent = "openai";
      chatProviderBadge.className = "provider-badge openai";
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
