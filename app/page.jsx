"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, OrbitControls, Points, PointMaterial } from "@react-three/drei";
import { ArrowRight, Zap, Database, Atom, Layers, BarChart2, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Data ──────────────────────────────────────────────────────

const NAV_LINKS = ["Platform", "Science", "Applications", "Pricing", "Documentation"];

const PIPELINE_STEPS = [
  {
    id: "input",
    icon: Database,
    title: "Reaction Input",
    text: "Configure feedstock, targets, constraints, and operating window. Supports Ethanol→Jet, CO₂→Methanol, Syngas→Ethanol, and custom reactions.",
  },
  {
    id: "retrieval",
    icon: Layers,
    title: "Database Retrieval",
    text: "Neural retrieval fuses Open Catalyst Project, BRENDA, and proprietary catalyst memory into a context graph for simulation.",
  },
  {
    id: "quantum",
    icon: Atom,
    title: "Quantum Simulation",
    text: "VQE circuits evaluate transition-metal energy landscapes with higher electron-correlation fidelity than classical approximations.",
  },
  {
    id: "generation",
    icon: Zap,
    title: "Generative Design",
    text: "Diffusion-driven molecular generation explores latent catalyst spaces under activity, stability, and cost constraints.",
  },
  {
    id: "ranking",
    icon: BarChart2,
    title: "Multi-objective Ranking",
    text: "Pareto-optimal ranking across yield, selectivity, thermal stability, catalyst lifetime, and economic feasibility.",
  },
  {
    id: "feedback",
    icon: RefreshCw,
    title: "Experimental Feedback",
    text: "Every experiment updates uncertainty maps and retrains the model — compounding predictive accuracy round after round.",
  },
];

const APPLICATIONS = [
  { label: "Sustainable Aviation Fuel", color: "cyan" },
  { label: "CO₂ Conversion",            color: "violet" },
  { label: "Green Hydrogen",             color: "cyan" },
  { label: "Biofuels",                   color: "emerald" },
  { label: "Synthetic Biology",          color: "violet" },
  { label: "Carbon Capture",             color: "emerald" },
  { label: "Petrochemical Optimization", color: "cyan" },
  { label: "Battery Materials",          color: "violet" },
];

const PRICING = [
  {
    name: "Research",
    price: "Free",
    sub: "For academic & exploratory use",
    features: ["3 reaction templates", "Manual-fallback AI insights", "Up to 50 pipeline runs/month", "3D molecule viewer", "CSV export"],
    cta: "Start Free",
    variant: "outline",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$490",
    sub: "per month — billed annually",
    features: ["Unlimited reactions", "GPT-4o AI Copilot (your key)", "Generative catalyst design", "Feedback-loop model updates", "Priority API access", "Email support"],
    cta: "Start Free Trial",
    variant: "default",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    sub: "For labs, pilots & industry",
    features: ["Custom reaction templates", "On-prem / private cloud deploy", "HPC integration", "LIMS & ELN connectors", "SLA + dedicated support", "IP governance layer"],
    cta: "Book Demo",
    variant: "outline",
    highlight: false,
  },
];

// ── 3D Canvas ─────────────────────────────────────────────────

function QuantumParticles() {
  const [sphere] = useState(() => {
    const pts = new Float32Array(2400 * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = (Math.random() - 0.5) * 9;
    return pts;
  });
  return (
    <Points positions={sphere} stride={3}>
      <PointMaterial transparent color="#22D3EE" size={0.013} sizeAttenuation depthWrite={false} />
    </Points>
  );
}

function CatalystLattice() {
  const groupRef = useRef(null);
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.x += 0.001;
      groupRef.current.rotation.y += 0.0032;
    }
  });
  return (
    <group ref={groupRef}>
      <Float speed={2.2} floatIntensity={1.1}>
        <Icosahedron args={[1.2, 1]}>
          <meshStandardMaterial wireframe color="#3B82F6" emissive="#22D3EE" emissiveIntensity={0.32} />
        </Icosahedron>
      </Float>
      <Float speed={1.4} floatIntensity={0.8}>
        <Icosahedron args={[0.62, 1]} position={[1.3, -0.65, -0.9]}>
          <meshStandardMaterial wireframe color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={0.32} />
        </Icosahedron>
      </Float>
      <Float speed={1.8} floatIntensity={0.6}>
        <Icosahedron args={[0.38, 1]} position={[-1.1, 0.8, 0.5]}>
          <meshStandardMaterial wireframe color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.25} />
        </Icosahedron>
      </Float>
    </group>
  );
}

function QuantumCanvas() {
  return (
    <div className="absolute inset-0 z-0 opacity-65">
      <Canvas camera={{ position: [0, 0, 4.2], fov: 50 }}>
        <ambientLight intensity={0.25} />
        <pointLight position={[2, 2, 2]} intensity={2} color="#22D3EE" />
        <pointLight position={[-2, -1.5, -1]} intensity={1.5} color="#8B5CF6" />
        <QuantumParticles />
        <CatalystLattice />
        <OrbitControls autoRotate autoRotateSpeed={0.5} enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function Home() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "/app";
  const [activeStep, setActiveStep] = useState(2);
  const [progress, setProgress] = useState(14);
  const [logIndex, setLogIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const logs = useMemo(() => [
    "Initializing VQE runtime…",
    "Computing orbital energies…",
    "Optimizing Hamiltonian…",
    "Convergence reached — ΔE < 10⁻⁶ eV",
    "Ranking by Pareto frontier…",
    "Pushing candidates to lab queue…",
  ], []);

  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => (p >= 97 ? 16 : p + 4));
      setLogIndex((i) => (i + 1) % logs.length);
    }, 2200);
    return () => clearInterval(t);
  }, [logs.length]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const init = async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      gsap.utils.toArray(".reveal").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 32, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.85, ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 87%" } },
        );
      });
    };
    init();
  }, []);

  const colorMap = { cyan: "border-cyan-300/30 bg-cyan-300/[0.07]", violet: "border-violet-300/30 bg-violet-300/[0.07]", emerald: "border-emerald-300/30 bg-emerald-300/[0.07]" };

  return (
    <div className="relative overflow-hidden">

      {/* Background grid + aurora */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-grid bg-[size:52px_52px] opacity-[0.06]" />
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="aurora absolute -left-32 top-0 h-[40rem] w-[40rem]" />
        <div className="aurora absolute bottom-10 right-0 h-[28rem] w-[28rem] opacity-60" />
      </div>

      {/* ── Sticky Navbar ──────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "border-b border-white/[0.08] bg-[#050816]/90 backdrop-blur-xl" : "bg-transparent"
        }`}
      >
        <div className="section-shell !py-0 flex h-16 items-center justify-between gap-6">
          <a href="#" className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M12 7L17 10V16L12 19L7 16V10L12 7Z" fill="#22d3ee" fillOpacity="0.15" stroke="#22d3ee" strokeWidth="1"/>
            </svg>
            <span className="font-display text-[15px] font-semibold text-slate-100">
              QuantumCatalyst <span className="heading-gradient">AI</span>
            </span>
          </a>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="rounded-lg px-3 py-1.5 text-[13.5px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={appUrl}
              className="hidden rounded-lg border border-white/15 bg-white/[0.04] px-4 py-1.5 text-[13px] font-medium text-slate-300 transition-all hover:border-cyan-300/40 hover:bg-cyan-300/[0.07] hover:text-cyan-100 sm:block"
            >
              Open App
            </a>
            <Button
              size="sm"
              onClick={() => window.open(appUrl, "_blank")}
            >
              Launch Platform
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative min-h-screen overflow-hidden pt-16">
        <QuantumCanvas />
        <div className="section-shell relative grid min-h-screen items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="reveal space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              The operating system for catalyst discovery
            </p>
            <h1 className="font-display text-[52px] font-semibold leading-[1.1] tracking-tight text-slate-100 md:text-[68px]">
              Designing the Catalysts That{" "}
              <span className="heading-gradient">Power the Future</span>
            </h1>
            <p className="max-w-xl text-[17px] leading-relaxed text-slate-400">
              QuantumCatalyst AI combines quantum chemistry, generative AI, and continuous experimental learning to
              discover breakthrough catalysts for sustainable fuels, carbon conversion, and synthetic biology.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => window.open(appUrl, "_blank")}>
                Launch Platform
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("platform")?.scrollIntoView({ behavior: "smooth" })}>
                See How It Works
              </Button>
              <Button size="lg" variant="ghost" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
                View Pricing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              {[["10×", "Faster screening"], ["37%", "Error reduction vs DFT"], ["12,438", "Catalysts simulated"]].map(([val, label]) => (
                <div key={label}>
                  <p className="font-display text-2xl font-bold text-white">{val}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Floating console card */}
          <motion.div
            className="reveal glass-card relative overflow-hidden border-cyan-300/20 p-6"
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Quantum Discovery Console</p>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
                <p className="text-[11px] text-slate-500 mb-1">Reaction Input</p>
                <p className="font-medium text-slate-200">Ethanol → Jet Fuel · 280 °C · 3.2 bar</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] text-slate-500 mb-2">VQE Simulation Log</p>
                <div className="rounded-lg border border-cyan-300/15 bg-slate-950/80 p-3 font-mono text-[11px]">
                  <p className="text-emerald-400">{logs[logIndex]}</p>
                  <p className="text-slate-600 mt-1">wavefunction collapse error: 0.041%</p>
                  <p className="text-slate-600">branch: hybrid-vqe-anneal</p>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Pipeline progress</span>
                    <span className="font-mono font-medium text-cyan-300">{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.08]">
                    <motion.div
                      className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-violet-500"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] text-slate-500 mb-2">AI-generated candidates</p>
                <div className="grid grid-cols-3 gap-2">
                  {["QC-410", "QC-712", "QC-981", "QC-553", "QC-204", "QC-117"].map((item) => (
                    <div key={item} className="rounded-lg border border-cyan-300/15 bg-cyan-400/[0.04] p-2.5 text-center text-[11px] font-mono text-cyan-200">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                {[["Activity", "92%", "text-cyan-300"], ["Selectivity", "89%", "text-violet-300"], ["Stability", "87%", "text-emerald-300"]].map(([l, v, c]) => (
                  <div key={l} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-2">
                    <p className="text-slate-500 mb-0.5">{l}</p>
                    <p className={`font-semibold ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Platform / How it Works ─────────────────────────── */}
      <section id="platform" className="section-shell reveal space-y-10">
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">How it works</p>
          <h2 className="font-display text-4xl font-semibold text-white">A Six-Step Discovery Pipeline</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.id}
                whileHover={{ y: -4, scale: 1.01 }}
                className={`glass-card cursor-default p-5 transition-all ${
                  activeStep === i ? "border-cyan-300/45 shadow-glow" : ""
                }`}
                onMouseEnter={() => setActiveStep(i)}
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/[0.08]">
                    <Icon size={16} className="text-cyan-300" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cyan-200">Step {i + 1}</span>
                </div>
                <p className="mb-2 text-[14px] font-semibold text-slate-100">{step.title}</p>
                <p className="text-[13px] leading-relaxed text-slate-400">{step.text}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Quantum highlight */}
        <div className="glass-card border-violet-300/20 p-6">
          <div className="grid gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">Quantum Simulation Engine</p>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-300">
                Classical DFT approximates electron correlations — introducing errors that matter most in
                transition-metal catalysts. QuantumCatalyst AI uses VQE circuits to compute ground-state energies
                with significantly higher fidelity.
              </p>
              <p className="mt-2 font-mono text-[13px] text-cyan-300">
                E = ⟨ψ(θ)|Ĥ|ψ(θ)⟩ → min<sub>θ</sub> E(θ)
              </p>
            </div>
            <div className="flex flex-col gap-3 text-[13px] min-w-max">
              {[["37%", "Error reduction vs DFT"], ["+42%", "Transition-metal fidelity"], ["28", "Active qubits"]].map(([val, label]) => (
                <div key={label} className="rounded-xl border border-white/[0.08] bg-black/25 px-5 py-3 text-center">
                  <p className="font-display text-xl font-bold text-white">{val}</p>
                  <p className="text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Applications ───────────────────────────────────── */}
      <section id="applications" className="section-shell reveal">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Industry applications</p>
        <h2 className="mb-8 font-display text-4xl font-semibold text-white">Built for Every Sustainable Chemistry Challenge</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {APPLICATIONS.map((app) => (
            <motion.article
              key={app.label}
              whileHover={{ y: -5, scale: 1.01 }}
              className={`glass-card group relative overflow-hidden rounded-xl border p-5 ${colorMap[app.color]}`}
            >
              <div className="absolute inset-0 translate-y-full bg-gradient-to-t from-white/[0.03] to-transparent transition-transform duration-400 group-hover:translate-y-0" />
              <p className="relative z-10 text-[14px] font-semibold text-slate-100">{app.label}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {/* ── Case Study ──────────────────────────────────────── */}
      <section className="section-shell reveal">
        <div className="glass-card p-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Case study</p>
          <h3 className="font-display text-3xl font-semibold text-white">India's First Ethanol-to-Jet Fuel Catalyst Platform</h3>
          <div className="mt-6 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4 text-[14px] text-slate-300">
              <p>
                <span className="font-semibold text-white">Problem:</span> Catalyst bottleneck blocking SAF scale-up.
                Conventional screening takes 6–18 months per lead.
              </p>
              <p>
                <span className="font-semibold text-white">Workflow:</span> Database retrieval → VQE quantum simulation →
                generative optimization → ranked candidates in minutes.
              </p>
              <p>
                <span className="font-semibold text-white">Outcome:</span> Dramatically faster screening with
                higher-confidence pilot candidates, and a feedback loop that improves every run.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["10×", "Faster screening",     "border-cyan-300/30 bg-cyan-300/[0.08]",    "text-cyan-100"],
                ["Minutes", "Instead of weeks", "border-violet-300/30 bg-violet-300/[0.08]","text-violet-100"],
                ["12,438", "Candidates simulated","border-emerald-300/30 bg-emerald-300/[0.08]","text-emerald-100"],
                ["Continuous", "Learning loop",  "border-blue-300/30 bg-blue-300/[0.08]",   "text-blue-100"],
              ].map(([val, label, border, textColor]) => (
                <div key={label} className={`rounded-xl border p-4 text-center ${border}`}>
                  <p className={`font-display text-2xl font-bold ${textColor}`}>{val}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Enterprise Architecture ─────────────────────────── */}
      <section id="science" className="section-shell reveal">
        <div className="glass-card p-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Architecture</p>
          <h3 className="mb-6 font-display text-3xl font-semibold text-white">Enterprise-Grade Infrastructure</h3>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Frontend & API", "Next.js + REST", "border-cyan-300/20"],
              ["AI Orchestration", "GPT-4o + custom agents", "border-violet-300/20"],
              ["Quantum Layer", "VQE / hybrid-anneal", "border-blue-300/20"],
              ["HPC Integration", "GPU + distributed queues", "border-cyan-300/20"],
              ["Scientific DBs", "OCP, BRENDA, CSD", "border-emerald-300/20"],
              ["Feedback Loop", "Bayesian updates", "border-violet-300/20"],
              ["Governance & IP", "Audit logs + RBAC", "border-blue-300/20"],
              ["Classical Fallback", "High-fidelity DFT mode", "border-emerald-300/20"],
            ].map(([title, sub, border]) => (
              <div key={title} className={`rounded-xl border bg-black/25 p-4 ${border}`}>
                <p className="text-[13.5px] font-semibold text-slate-100">{title}</p>
                <p className="mt-1 text-[12px] text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4 text-[13px] text-slate-300">
            <span className="font-semibold text-emerald-200">Reliability: </span>
            Quantum compute unavailable → automatic fallback to high-fidelity DFT mode with confidence-aware routing, cached catalyst embeddings, and graceful degradation.
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="section-shell reveal">
        <div className="text-center mb-10">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Pricing</p>
          <h2 className="font-display text-4xl font-semibold text-white">Start discovering today</h2>
          <p className="mt-3 text-slate-400 mx-auto max-w-lg text-[15px]">
            From academic research to industrial deployment — a plan for every scale.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {PRICING.map((plan) => (
            <motion.div
              key={plan.name}
              whileHover={{ y: -4 }}
              className={`glass-card relative flex flex-col p-7 ${
                plan.highlight
                  ? "border-cyan-300/40 shadow-glow"
                  : ""
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full border border-cyan-300/40 bg-[#050816] px-4 py-1 text-[11px] font-semibold text-cyan-200 shadow-glow">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-6">
                <p className="text-[13px] font-semibold text-slate-400 mb-1">{plan.name}</p>
                <p className="font-display text-[38px] font-bold text-white leading-none">{plan.price}</p>
                <p className="mt-1 text-[12px] text-slate-500">{plan.sub}</p>
              </div>
              <ul className="space-y-3 flex-1 mb-7">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-slate-300">
                    <Check size={14} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant={plan.variant} className="w-full" onClick={() => window.open(appUrl, "_blank")}>
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Trust ───────────────────────────────────────────── */}
      <section className="section-shell reveal">
        <div className="glass-card p-8">
          <h3 className="font-display text-3xl font-semibold text-white mb-6">Trust & Scientific Credibility</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Scientific Advisory", "Experts from quantum chemistry, catalysis, and industrial process design."],
              ["Validation Metrics", "Cross-validated against benchmark catalyst datasets and published lab evidence."],
              ["Reproducible Results", "Every run is logged with full provenance — reaction, parameters, and feedback history."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-white/[0.08] bg-black/20 p-5">
                <p className="text-[13px] font-semibold text-cyan-200 mb-2">{title}</p>
                <p className="text-[13px] text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="section-shell reveal pb-32 pt-24 text-center">
        <div className="aurora mx-auto mb-6 h-24 w-64 opacity-50" />
        <h2 className="font-display text-[52px] font-semibold text-white leading-tight">
          Build the Future of<br />Sustainable Chemistry
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[16px] text-slate-400 leading-relaxed">
          From carbon conversion to synthetic fuels, QuantumCatalyst AI accelerates catalyst discovery at quantum scale.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => window.open(appUrl, "_blank")}>
            Launch Platform Free
          </Button>
          <Button size="lg" variant="outline" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
            View Pricing
          </Button>
          <Button size="lg" variant="ghost" onClick={() => (window.location.href = "mailto:demo@quantumcatalyst.ai")}>
            Book a Demo <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.07] py-10">
        <div className="section-shell !py-0">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L21.196 7V17L12 22L2.804 17V7L12 2Z" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              <span className="text-[14px] font-semibold text-slate-300">QuantumCatalyst AI</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-500">v1.0 Research Preview</span>
            </div>
            <nav className="flex flex-wrap gap-5 text-[13px] text-slate-500">
              {["Product", "Research", "Documentation", "API", "Careers", "Contact", "GitHub"].map((item) => (
                <a key={item} href="#" className="transition-colors hover:text-slate-300">{item}</a>
              ))}
            </nav>
            <p className="w-full text-center text-[12px] text-slate-600 md:w-auto md:text-right">
              © 2026 QuantumCatalyst AI. Built for sustainable chemistry.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
