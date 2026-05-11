import { useState } from "react";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg:       "#0D1117",
  surface:  "#161B22",
  border:   "#21262D",
  border2:  "#30363D",
  text:     "#E6EDF3",
  muted:    "#8B949E",
  green:    "#3FB950",
  greenDim: "#238636",
  red:      "#F85149",
  amber:    "#D29922",
  blue:     "#58A6FF",
  blueDim:  "#1F6FEB",
  purple:   "#BC8CFF",
  teal:     "#39D353",
  gold:     "#F0C419",
  white:    "#FFFFFF",
};

// ─── Shared primitives ───────────────────────────────────────────────────────
const Card = ({ children, style = {} }: any) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, ...style }}>
    {children}
  </div>
);

const Tag = ({ label, color }: { label: string; color: string }) => (
  <span style={{ background: color + "22", border: `1px solid ${color}66`, color, borderRadius: 4, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>
    {label}
  </span>
);

const Stat = ({ label, value, sub, color, size = 28 }: any) => (
  <div style={{ flex: 1, minWidth: 120 }}>
    <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
    <div style={{ color, fontSize: size, fontWeight: 800, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </div>
);

const Check = ({ ok }: { ok: boolean }) => (
  <span style={{ color: ok ? C.green : C.red, fontSize: 14, fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
);

const SectionTitle = ({ children }: any) => (
  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: C.muted, marginBottom: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
    {children}
  </div>
);

// ─── Horizontal bar chart ────────────────────────────────────────────────────
const BarChart = ({ items }: { items: { label: string; value: number; color: string; sub?: string }[] }) => {
  const max = Math.max(...items.map(i => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.muted }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>${(item.value / 1e6).toFixed(1)}M/yr</span>
          </div>
          <div style={{ background: C.border, borderRadius: 4, height: 12, overflow: "hidden" }}>
            <div style={{ width: `${(item.value / max) * 100}%`, background: item.color, height: "100%", borderRadius: 4, transition: "width 0.8s ease" }} />
          </div>
          {item.sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{item.sub}</div>}
        </div>
      ))}
    </div>
  );
};

// ─── Architecture SVG diagram ─────────────────────────────────────────────────
const ArchDiagram = () => (
  <svg viewBox="0 0 900 520" style={{ width: "100%", borderRadius: 8, background: "#0a0f14" }} fontFamily="'Segoe UI', Arial, sans-serif">
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#58A6FF" />
      </marker>
      <marker id="arrowGreen" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#3FB950" />
      </marker>
      <marker id="arrowGrey" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#8B949E" />
      </marker>
    </defs>

    {/* ── Background bands ── */}
    <rect x="10" y="10" width="185" height="500" rx="8" fill="#1a0d0d" stroke="#c0392b" strokeWidth="1" opacity="0.6" />
    <rect x="205" y="10" width="215" height="500" rx="8" fill="#0d1a2a" stroke="#1F6FEB" strokeWidth="1" opacity="0.6" />
    <rect x="430" y="10" width="215" height="500" rx="8" fill="#0d1a12" stroke="#238636" strokeWidth="1" opacity="0.6" />
    <rect x="655" y="10" width="235" height="500" rx="8" fill="#1a1a0d" stroke="#D29922" strokeWidth="1" opacity="0.6" />

    {/* ── Column headers ── */}
    <text x="102" y="35" textAnchor="middle" fill="#F85149" fontSize="11" fontWeight="700">LEGACY (retiring)</text>
    <text x="312" y="35" textAnchor="middle" fill="#58A6FF" fontSize="11" fontWeight="700">MIGRATION AGENT</text>
    <text x="537" y="35" textAnchor="middle" fill="#3FB950" fontSize="11" fontWeight="700">ETL FRAMEWORK</text>
    <text x="772" y="35" textAnchor="middle" fill="#D29922" fontSize="11" fontWeight="700">INFRASTRUCTURE</text>

    {/* ── Legacy boxes ── */}
    <rect x="25" y="55" width="160" height="60" rx="6" fill="#2a0d0d" stroke="#F85149" strokeWidth="1.5" />
    <text x="105" y="78" textAnchor="middle" fill="#E6EDF3" fontSize="12" fontWeight="600">Informatica</text>
    <text x="105" y="94" textAnchor="middle" fill="#8B949E" fontSize="10">PowerCenter</text>
    <text x="105" y="108" textAnchor="middle" fill="#F85149" fontSize="10">~450 pipelines · $6.9M/yr</text>

    <rect x="25" y="135" width="160" height="60" rx="6" fill="#2a0d0d" stroke="#F85149" strokeWidth="1.5" />
    <text x="105" y="158" textAnchor="middle" fill="#E6EDF3" fontSize="12" fontWeight="600">Azure Data Factory</text>
    <text x="105" y="175" textAnchor="middle" fill="#8B949E" fontSize="10">ADF Pipelines</text>
    <text x="105" y="189" textAnchor="middle" fill="#F85149" fontSize="10">~250 pipelines · $1.1M/yr</text>

    <rect x="25" y="215" width="160" height="42" rx="6" fill="#1a0d0d" stroke="#c0392b" strokeWidth="1" />
    <text x="105" y="234" textAnchor="middle" fill="#F85149" fontSize="10" fontWeight="700">⚠ Informatica support</text>
    <text x="105" y="248" textAnchor="middle" fill="#8B949E" fontSize="10">ended March 2026</text>

    <rect x="25" y="267" width="160" height="42" rx="6" fill="#1a0d0d" stroke="#c0392b" strokeWidth="1" />
    <text x="105" y="286" textAnchor="middle" fill="#F85149" fontSize="10" fontWeight="700">⚠ ADF frozen</text>
    <text x="105" y="300" textAnchor="middle" fill="#8B949E" fontSize="10">moving to Fabric</text>

    {/* ── Agent boxes ── */}
    <rect x="220" y="55" width="185" height="50" rx="6" fill="#0d1a2a" stroke="#58A6FF" strokeWidth="1.5" />
    <text x="312" y="76" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Informatica Parser</text>
    <text x="312" y="92" textAnchor="middle" fill="#8B949E" fontSize="10">XML → Intermediate Representation</text>

    <rect x="220" y="120" width="185" height="50" rx="6" fill="#0d1a2a" stroke="#58A6FF" strokeWidth="1.5" />
    <text x="312" y="141" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">ADF Parser</text>
    <text x="312" y="157" textAnchor="middle" fill="#8B949E" fontSize="10">JSON → Intermediate Representation</text>

    <rect x="220" y="190" width="185" height="50" rx="6" fill="#0d1a2a" stroke="#BC8CFF" strokeWidth="1.5" />
    <text x="312" y="211" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Analyzer Agent</text>
    <text x="312" y="227" textAnchor="middle" fill="#BC8CFF" fontSize="10">AI · complexity · pattern classification</text>

    <rect x="220" y="260" width="185" height="50" rx="6" fill="#0d1a2a" stroke="#BC8CFF" strokeWidth="1.5" />
    <text x="312" y="281" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Translator Agent</text>
    <text x="312" y="297" textAnchor="middle" fill="#BC8CFF" fontSize="10">Rules ≥80% · Claude API fallback</text>

    <rect x="220" y="330" width="185" height="50" rx="6" fill="#0d1a2a" stroke="#58A6FF" strokeWidth="1.5" />
    <text x="312" y="351" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Generator Agent</text>
    <text x="312" y="367" textAnchor="middle" fill="#8B949E" fontSize="10">YAML · DAG · Tests · Docs</text>

    <rect x="220" y="400" width="185" height="50" rx="6" fill="#0d1a2a" stroke="#58A6FF" strokeWidth="1.5" />
    <text x="312" y="421" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Validator + Reviewer</text>
    <text x="312" y="437" textAnchor="middle" fill="#8B949E" fontSize="10">5-tier validation · PR generation</text>

    {/* ── Framework boxes ── */}
    <rect x="445" y="55" width="185" height="50" rx="6" fill="#0d1a12" stroke="#3FB950" strokeWidth="1.5" />
    <text x="537" y="76" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Config Layer</text>
    <text x="537" y="92" textAnchor="middle" fill="#8B949E" fontSize="10">Loader · Validator · Resolver · Policy</text>

    <rect x="445" y="125" width="185" height="50" rx="6" fill="#0d1a12" stroke="#3FB950" strokeWidth="1.5" />
    <text x="537" y="146" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Execution Engine</text>
    <text x="537" y="162" textAnchor="middle" fill="#8B949E" fontSize="10">Plan Builder · Backend Selector</text>

    <rect x="445" y="195" width="85" height="80" rx="6" fill="#0d1a12" stroke="#3FB950" strokeWidth="1.5" />
    <text x="487" y="218" textAnchor="middle" fill="#E6EDF3" fontSize="10" fontWeight="600">Connectors</text>
    <text x="487" y="233" textAnchor="middle" fill="#8B949E" fontSize="9">sqlserver</text>
    <text x="487" y="246" textAnchor="middle" fill="#8B949E" fontSize="9">postgres · oracle</text>
    <text x="487" y="259" textAnchor="middle" fill="#8B949E" fontSize="9">s3 · mainframe</text>
    <text x="487" y="272" textAnchor="middle" fill="#3FB950" fontSize="9">+7 more</text>

    <rect x="545" y="195" width="85" height="80" rx="6" fill="#0d1a12" stroke="#3FB950" strokeWidth="1.5" />
    <text x="587" y="218" textAnchor="middle" fill="#E6EDF3" fontSize="10" fontWeight="600">Transforms</text>
    <text x="587" y="233" textAnchor="middle" fill="#8B949E" fontSize="9">filter · lookup</text>
    <text x="587" y="246" textAnchor="middle" fill="#8B949E" fontSize="9">expression</text>
    <text x="587" y="259" textAnchor="middle" fill="#8B949E" fontSize="9">scd_type_2</text>
    <text x="587" y="272" textAnchor="middle" fill="#3FB950" fontSize="9">+11 more</text>

    <rect x="445" y="295" width="185" height="45" rx="6" fill="#0d1a12" stroke="#39D353" strokeWidth="1" />
    <text x="537" y="315" textAnchor="middle" fill="#E6EDF3" fontSize="10" fontWeight="600">Backends</text>
    <text x="537" y="330" textAnchor="middle" fill="#8B949E" fontSize="9">pandas · Apache Spark · dbt Core</text>

    <rect x="445" y="360" width="185" height="45" rx="6" fill="#0d1a12" stroke="#39D353" strokeWidth="1" />
    <text x="537" y="380" textAnchor="middle" fill="#E6EDF3" fontSize="10" fontWeight="600">Observability</text>
    <text x="537" y="395" textAnchor="middle" fill="#8B949E" fontSize="9">Prometheus · OpenLineage · OTel</text>

    <rect x="445" y="425" width="185" height="45" rx="6" fill="#0d1a12" stroke="#39D353" strokeWidth="1" />
    <text x="537" y="445" textAnchor="middle" fill="#E6EDF3" fontSize="10" fontWeight="600">Security</text>
    <text x="537" y="460" textAnchor="middle" fill="#8B949E" fontSize="9">IRSA · signed images · Secrets Mgr</text>

    {/* ── Infrastructure boxes ── */}
    <rect x="670" y="55" width="205" height="45" rx="6" fill="#1a1a0d" stroke="#D29922" strokeWidth="1.5" />
    <text x="772" y="74" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Apache Airflow (MWAA)</text>
    <text x="772" y="90" textAnchor="middle" fill="#8B949E" fontSize="9">Orchestration · DAG per pipeline</text>

    <rect x="670" y="115" width="205" height="45" rx="6" fill="#1a1a0d" stroke="#D29922" strokeWidth="1.5" />
    <text x="772" y="134" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">AWS EKS</text>
    <text x="772" y="150" textAnchor="middle" fill="#8B949E" fontSize="9">Job pods · Spot fleet · Auto-scaling</text>

    <rect x="670" y="175" width="205" height="45" rx="6" fill="#1a1a0d" stroke="#D29922" strokeWidth="1.5" />
    <text x="772" y="194" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">Amazon ECR</text>
    <text x="772" y="210" textAnchor="middle" fill="#8B949E" fontSize="9">Signed container images · cosign</text>

    <rect x="670" y="235" width="205" height="45" rx="6" fill="#1a1a0d" stroke="#D29922" strokeWidth="1.5" />
    <text x="772" y="254" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">S3</text>
    <text x="772" y="270" textAnchor="middle" fill="#8B949E" fontSize="9">Configs · Logs · Lineage events</text>

    <rect x="670" y="295" width="205" height="45" rx="6" fill="#1a1a0d" stroke="#D29922" strokeWidth="1.5" />
    <text x="772" y="314" textAnchor="middle" fill="#E6EDF3" fontSize="11" fontWeight="600">RDS PostgreSQL</text>
    <text x="772" y="330" textAnchor="middle" fill="#8B949E" fontSize="9">Airflow metadata · Watermarks · Audit</text>

    <rect x="670" y="355" width="205" height="45" rx="6" fill="#1a1a0d" stroke="#58A6FF" strokeWidth="1" />
    <text x="772" y="374" textAnchor="middle" fill="#E6EDF3" fontSize="10" fontWeight="600">GCP / On-Prem K8s</text>
    <text x="772" y="390" textAnchor="middle" fill="#58A6FF" fontSize="9">Same image · Zero framework changes</text>

    <rect x="670" y="415" width="205" height="55" rx="6" fill="#0d1a0d" stroke="#3FB950" strokeWidth="1.5" />
    <text x="772" y="434" textAnchor="middle" fill="#3FB950" fontSize="11" fontWeight="700">$2M/yr steady-state</text>
    <text x="772" y="450" textAnchor="middle" fill="#8B949E" fontSize="9">vs $8M/yr today</text>
    <text x="772" y="464" textAnchor="middle" fill="#3FB950" fontSize="10" fontWeight="600">75% reduction</text>

    {/* ── Arrows: Legacy → Agent ── */}
    <line x1="185" y1="85" x2="218" y2="80" stroke="#58A6FF" strokeWidth="1.5" markerEnd="url(#arrow)" strokeDasharray="4 3" />
    <line x1="185" y1="165" x2="218" y2="145" stroke="#58A6FF" strokeWidth="1.5" markerEnd="url(#arrow)" strokeDasharray="4 3" />

    {/* ── Arrows: Agent → Framework ── */}
    <line x1="405" y1="355" x2="443" y2="80" stroke="#3FB950" strokeWidth="1.5" markerEnd="url(#arrowGreen)" />
    <text x="415" y="340" fill="#3FB950" fontSize="9">YAML</text>

    {/* ── Arrows: Framework → Infra ── */}
    <line x1="630" y1="78" x2="668" y2="78" stroke="#D29922" strokeWidth="1.5" markerEnd="url(#arrow)" />
    <line x1="630" y1="150" x2="668" y2="138" stroke="#D29922" strokeWidth="1.5" markerEnd="url(#arrow)" />
  </svg>
);

// ─── Timeline component ───────────────────────────────────────────────────────
const milestones = [
  { phase: "Phase 0", months: "Weeks 1–4", label: "Inception", desc: "Team, environments, 10 ADRs, charter signed", color: C.muted, icon: "⚙️" },
  { phase: "Phase 1", months: "Months 1–4", label: "Framework MVP", desc: "Core engine · 5 connectors · 10 pilot pipelines running", color: C.blue, icon: "🏗️" },
  { phase: "Phase 2", months: "Months 5–7", label: "AWS Production", desc: "MWAA + EKS live · 30+ pipelines · security hardened", color: C.purple, icon: "☁️" },
  { phase: "Phase 3", months: "Months 6–10", label: "Migration Agent", desc: "Informatica XML → YAML · 100 jobs auto-converted", color: C.gold, icon: "🤖" },
  { phase: "Phase 4", months: "Months 10–13", label: "ADF Agent", desc: "ADF JSON → YAML · 50 ADF pipelines · license retirement begins", color: C.amber, icon: "🔄" },
  { phase: "Phase 5", months: "Months 13–16", label: "Full Migration", desc: "500+ pipelines · Informatica + ADF licenses fully retired", color: C.green, icon: "🚀" },
  { phase: "Phase 6", months: "Months 16–18", label: "Cloud Validation", desc: "Same workloads on GCP + on-prem K8s · BAU handover", color: C.teal, icon: "✅" },
  { phase: "ROI", months: "Month 26", label: "💰 Breakeven", desc: "Cumulative savings exceed total build investment — $6.7M/yr thereafter", color: C.gold, icon: "💰" },
];

const Timeline = () => (
  <div style={{ position: "relative", paddingLeft: 28 }}>
    <div style={{ position: "absolute", left: 9, top: 8, bottom: 8, width: 2, background: C.border2 }} />
    {milestones.map((m, i) => (
      <div key={i} style={{ display: "flex", gap: 14, marginBottom: 18, position: "relative" }}>
        <div style={{ position: "absolute", left: -24, top: 6, width: 14, height: 14, borderRadius: "50%", background: m.color, border: `2px solid ${C.bg}`, zIndex: 1, flexShrink: 0 }} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: m.color, fontWeight: 700, textTransform: "uppercase" }}>{m.months}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{m.icon} {m.label}</span>
            <Tag label={m.phase} color={m.color} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{m.desc}</div>
        </div>
      </div>
    ))}
  </div>
);

// ─── Risk matrix ──────────────────────────────────────────────────────────────
const risks = [
  { risk: "Migration timeline slips", mit: "Phased cutover · parallel run · legacy retained until stable", l: "M", i: "H" },
  { risk: "Build cost overrun 40%", mit: "Breakeven still at Month 34 — within 5-yr window", l: "M", i: "M" },
  { risk: "AI agent accuracy below target", mit: "Deterministic rules first · human gates mandatory", l: "M", i: "M" },
  { risk: "Mainframe complexity underestimated", mit: "Mainframe SME engaged Phase 0 · 2× budget buffer", l: "H", i: "M" },
  { risk: "Stakeholder resistance", mit: "Executive mandate · co-build with domain teams · early wins", l: "H", i: "H" },
  { risk: "Key team member attrition", mit: "Knowledge spread · documentation-first culture", l: "M", i: "H" },
];

const likelihoodColor = (l: string) => l === "H" ? C.red : l === "M" ? C.amber : C.green;

// ─── Go/No-Go criteria ────────────────────────────────────────────────────────
const goCriteria = [
  { criterion: "5-year saving exceeds $10M", threshold: "> $10M", actual: "$17.5M", ok: true },
  { criterion: "Payback within 36 months", threshold: "< 36 mo", actual: "26 months", ok: true },
  { criterion: "Annual run cost below $8M by Year 3", threshold: "< $8M/yr", actual: "$2.1M/yr", ok: true },
  { criterion: "Cloud portability preserved", threshold: "Required", actual: "AWS + GCP + On-prem", ok: true },
  { criterion: "Zero proprietary ETL licensing", threshold: "Required", actual: "$0 licensing", ok: true },
  { criterion: "Enterprise security requirements met", threshold: "Required", actual: "Designed in", ok: true },
  { criterion: "Team assemblable in market", threshold: "Required", actual: "Python/Airflow skills", ok: true },
  { criterion: "Breakeven robust to 50% cost overrun", threshold: "< 48 mo", actual: "Month 34 worst case", ok: true },
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function ExecutivePresentation() {
  const [tab, setTab] = useState<"overview" | "architecture" | "costs" | "timeline" | "decision">("overview");

  const tabs = [
    { id: "overview", label: "Executive Summary" },
    { id: "architecture", label: "Architecture" },
    { id: "costs", label: "Cost & ROI" },
    { id: "timeline", label: "Timeline" },
    { id: "decision", label: "Decision" },
  ] as const;

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Segoe UI', -apple-system, Arial, sans-serif", minHeight: "100vh", paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, #0d1b3e 0%, #0d2a1a 100%)`, borderBottom: `1px solid ${C.border}`, padding: "24px 36px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 2, color: C.muted, marginBottom: 6 }}>Enterprise Data Platform · Program Charter</div>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, color: C.white }}>ETL Modernization Program</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Informatica PowerCenter + Azure Data Factory → Generic ETL Platform on AWS</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Tag label="Recommendation: Proceed" color={C.gold} />
            <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>ROI 69% · Payback Month 26 · 5-yr saving $17.5M</div>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: "flex", gap: 28, marginTop: 20, flexWrap: "wrap" }}>
          <Stat label="5-Year Net Saving" value="$17.5M" sub="vs status quo" color={C.green} />
          <Stat label="Annual Saving (Yr 3+)" value="$6.7M/yr" sub="at steady state" color={C.teal} />
          <Stat label="Build Investment" value="$3.5M" sub="18-month program" color={C.amber} />
          <Stat label="Payback Period" value="26 mo" sub="Month 26 breakeven" color={C.gold} />
          <Stat label="Pipelines Migrated" value="700+" sub="in 14 months" color={C.blue} />
          <Stat label="Cost Reduction" value="75%" sub="$11.5K → $2.9K / pipeline / yr" color={C.purple} />
        </div>
      </div>

      {/* ── Tab nav ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, paddingLeft: 36, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "12px 18px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              color: tab === t.id ? C.blue : C.muted,
              borderBottom: tab === t.id ? `2px solid ${C.blue}` : "2px solid transparent",
              transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px 36px", maxWidth: 1280, margin: "0 auto" }}>

        {/* ══════════════════ OVERVIEW ══════════════════ */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Problem vs Solution */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <SectionTitle>⚠ The Problem Today</SectionTitle>
                {[
                  ["Informatica annual TCO", "$6.9M/yr", C.red],
                  ["ADF annual TCO", "$1.1M/yr", C.amber],
                  ["Combined ETL spend", "$8.0M/yr", C.red],
                  ["Cost per pipeline/yr", "$11,481", C.red],
                  ["ETL team headcount", "19 FTE", C.muted],
                  ["Informatica support", "Ended Mar 2026 ⚠", C.amber],
                  ["ADF development", "Frozen → Fabric ⚠", C.amber],
                ].map(([l, v, c], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c as string }}>{v}</span>
                  </div>
                ))}
              </Card>

              <Card>
                <SectionTitle>✓ The Solution — Generic ETL Platform</SectionTitle>
                {[
                  ["Annual run cost (Year 3+)", "$2.0M/yr", C.green],
                  ["Cost per pipeline/yr", "$2,857", C.green],
                  ["Cost reduction", "75%", C.teal],
                  ["ETL team headcount", "10 FTE (−9 FTE)", C.green],
                  ["FTE savings (×$180K loaded)", "$1.7M/yr", C.teal],
                  ["Vendor license dependency", "$0 — owned IP", C.green],
                  ["Cloud portability", "AWS → GCP → On-prem", C.blue],
                ].map(([l, v, c], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c as string }}>{v}</span>
                  </div>
                ))}
              </Card>
            </div>

            {/* What we're building */}
            <Card>
              <SectionTitle>What We're Building</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                {[
                  { title: "Generic ETL Framework", icon: "⚙️", color: C.teal, desc: "Container-based, YAML-driven runtime. Plugin architecture — new connectors and transforms with zero core changes. Runs on AWS today, GCP or on-prem tomorrow." },
                  { title: "AI Migration Agent", icon: "🤖", color: C.gold, desc: "LangGraph + Claude-powered converter. Transforms Informatica XML and ADF JSON to Framework YAML. ≥85% auto-conversion rate. Compresses 3-year manual migration to 14 months." },
                  { title: "Airflow Orchestration", icon: "✈️", color: C.blue, desc: "Industry-standard, enterprise-approved. Replaces Informatica Workflow Manager. One KubernetesPodOperator task per pipeline. Zero licensing cost." },
                  { title: "Cloud-Agnostic by Design", icon: "☁️", color: C.green, desc: "YAML configs and container images are 100% portable. Only thin cloud glue changes between AWS, GCP, and on-prem. Full cloud migration effort < 4 months." },
                ].map((item, i) => (
                  <div key={i} style={{ borderLeft: `3px solid ${item.color}`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 6 }}>{item.icon} {item.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Strategic value */}
            <Card>
              <SectionTitle>Strategic Value Beyond Cost</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                {[
                  ["🏆", "Platform Ownership", "Enterprise controls the roadmap, codebase, and IP. No vendor holds leverage at renewal."],
                  ["🌐", "Cloud Portability", "GCP migration in < 4 months if cloud strategy changes. No re-architecture ever needed."],
                  ["👥", "Talent Availability", "Python + Airflow skills 10× more available than Informatica specialists. Lower hiring cost."],
                  ["⏩", "Delivery Speed", "New pipeline in < 3 business days vs 2–4 weeks. Removes a key bottleneck on business agility."],
                  ["🔮", "AI-Ready Platform", "Designed for AI-assisted pipeline authoring from Day 1. Easy to extend with Copilot-style features."],
                  ["⚡", "Forced Migration Anyway", "Informatica support ended. ADF is being frozen. Migration is inevitable — do it on our terms."],
                ].map(([icon, title, desc], i) => (
                  <div key={i} style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════ ARCHITECTURE ══════════════════ */}
        {tab === "architecture" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <SectionTitle>End-to-End Platform Architecture</SectionTitle>
              <ArchDiagram />
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <SectionTitle>Framework — Execution Flow</SectionTitle>
                {[
                  ["1. Trigger", "Airflow fires KubernetesPodOperator on schedule"],
                  ["2. Pod Launch", "EKS pulls signed container image from ECR"],
                  ["3. Config Load", "etl-runner downloads YAML from S3; validates schema"],
                  ["4. Resolve", "Secrets Manager → credentials; Watermark DB → last run"],
                  ["5. Plan Build", "Engine builds DAG of source → transform → sink nodes"],
                  ["6. Execute", "pandas (≤10M rows) or Spark (>10M rows) runs the plan"],
                  ["7. Validate", "Row counts, nulls, uniqueness checks pass"],
                  ["8. Commit", "Watermark updated; OpenLineage events emitted"],
                ].map(([step, desc], i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, minWidth: 80 }}>{step}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{desc}</span>
                  </div>
                ))}
              </Card>

              <Card>
                <SectionTitle>Migration Agent — Conversion Flow</SectionTitle>
                {[
                  ["1. Ingest", "Pull Informatica XML / ADF JSON via pmrep or REST API"],
                  ["2. Parse", "Source-specific parser → Canonical Intermediate Representation"],
                  ["3. Analyze", "AI scores complexity 1–5; classifies pattern; sets routing"],
                  ["4. Translate", "Rules handle ≥80% of expressions; Claude API for remainder"],
                  ["5. Generate", "Deterministic: YAML + Airflow DAG + unit tests + SME docs"],
                  ["6. Validate", "5 tiers: syntactic → schema → unit → sample-run → shadow"],
                  ["7. Review PR", "GitHub PR auto-generated; confidence score attached"],
                  ["8. Gate", "Human approval at 5 defined gates before production cutover"],
                ].map(([step, desc], i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 80 }}>{step}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{desc}</span>
                  </div>
                ))}
              </Card>
            </div>

            <Card>
              <SectionTitle>Cloud Portability — What Changes vs. What Doesn't</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "100% Portable — Zero Changes", color: C.green, items: ["YAML Job Configs (jobs/*.yaml)", "Container Image (etl-runner:v1.x.x)", "Framework Python Code", "dbt Models and Tests"] },
                  { label: "~90% Portable — Minor Config", color: C.amber, items: ["Airflow DAG Files", "→ change registry URL only", "→ change IAM annotation only", "CI/CD workflows (registry swap)"] },
                  { label: "Cloud-Specific Thin Layer", color: C.muted, items: ["MWAA → Composer / self-managed", "EKS → GKE → OpenShift", "ECR → Artifact Registry → Harbor", "Secrets Manager → Secret Mgr → Vault"] },
                ].map((col, i) => (
                  <div key={i} style={{ borderTop: `3px solid ${col.color}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: col.color, marginBottom: 10, textTransform: "uppercase" }}>{col.label}</div>
                    {col.items.map((item, j) => (
                      <div key={j} style={{ fontSize: 11, color: C.muted, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>• {item}</div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: "10px 14px", background: C.bg, borderRadius: 6, fontSize: 11, color: C.muted }}>
                <span style={{ color: C.green, fontWeight: 700 }}>Full cloud migration effort if needed: </span>
                YAML/code changes = 0 hours · Image re-tag = 8 hours · DAG updates = 40–80 hours · New cloud infra = 4–8 weeks · Testing = 4–8 weeks · <strong style={{ color: C.text }}>Total: 3–4 months, not years.</strong>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════ COSTS ══════════════════ */}
        {tab === "costs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Card>
              <SectionTitle>Steady-State Annual Cost Comparison</SectionTitle>
              <BarChart items={[
                { label: "Status Quo (Informatica + ADF)", value: 8036810, color: C.red, sub: "$6.9M license + $1.1M ADF + $2.8M people" },
                { label: "Custom ETL — On-Premise", value: 2335000, color: C.amber, sub: "$325K infra + $1.98M people (11 FTE)" },
                { label: "Custom ETL — AWS (Recommended)", value: 2000000, color: C.green, sub: "$150K AWS infra + $1.8M people (10 FTE)" },
              ]} />
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <SectionTitle>Build Investment (18 Months)</SectionTitle>
                {[
                  ["Engineering team (8.5 FTE × 18 mo)", "$2,565,000"],
                  ["AWS dev/test infrastructure", "$48,600"],
                  ["AI / LLM token costs (agent)", "$75,000"],
                  ["External consulting + mainframe SME", "$200,000"],
                  ["Training + software tooling", "$175,000"],
                  ["Contingency (15%)", "$450,000"],
                ].map(([l, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{l}</span>
                    <span style={{ fontSize: 11, color: C.text }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Total Build Investment</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.amber }}>$3,513,600</span>
                </div>
              </Card>

              <Card>
                <SectionTitle>5-Year Total Cost Comparison</SectionTitle>
                {[
                  { yr: "Year 1", sq: 8.0, aws: 11.4, note: "build peak + full license" },
                  { yr: "Year 2", sq: 8.3, aws: 7.2, note: "50% license retired" },
                  { yr: "Year 3", sq: 8.5, aws: 2.1, note: "fully retired ✓" },
                  { yr: "Year 4", sq: 8.8, aws: 2.2, note: "" },
                  { yr: "Year 5", sq: 9.0, aws: 2.3, note: "" },
                ].map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{row.yr}</span>
                    <div>
                      <div style={{ height: 10, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 2 }}>
                        <div style={{ width: `${(row.sq / 12) * 100}%`, background: C.red, height: "100%" }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.red }}>${row.sq.toFixed(1)}M</span>
                    </div>
                    <div>
                      <div style={{ height: 10, background: C.border, borderRadius: 3, overflow: "hidden", marginBottom: 2 }}>
                        <div style={{ width: `${(row.aws / 12) * 100}%`, background: C.green, height: "100%" }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.green }}>${row.aws.toFixed(1)}M</span>
                      {row.note && <span style={{ fontSize: 9, color: C.muted, marginLeft: 4 }}>{row.note}</span>}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "8px 0" }}>
                  <span style={{ fontSize: 11, color: C.red }}>Status Quo 5-yr: $42.7M</span>
                  <span style={{ fontSize: 11, color: C.green }}>Custom AWS 5-yr: $25.2M</span>
                </div>
                <div style={{ textAlign: "center", padding: "10px", background: C.bg, borderRadius: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.green }}>Net Saving: $17.5M  (69% ROI)</span>
                </div>
              </Card>
            </div>

            <Card>
              <SectionTitle>Cost Per Pipeline Per Year</SectionTitle>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { label: "Informatica", value: "$15,356", index: "100%", color: C.red },
                  { label: "ADF", value: "$4,507", index: "29%", color: C.amber },
                  { label: "Custom ETL — AWS", value: "$2,857", index: "19%", color: C.green, highlight: true },
                  { label: "Custom ETL — On-Prem", value: "$3,336", index: "22%", color: C.teal },
                ].map((item, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 150, padding: 16, background: item.highlight ? item.color + "11" : C.bg, border: `1px solid ${item.highlight ? item.color : C.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>per pipeline / year</div>
                    <div style={{ fontSize: 10, color: item.color, marginTop: 4 }}>{item.index} of Informatica cost</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════ TIMELINE ══════════════════ */}
        {tab === "timeline" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Card style={{ gridColumn: "1 / -1" }}>
              <SectionTitle>18-Month Program Roadmap</SectionTitle>
              {/* Gantt-style bar */}
              <div style={{ marginBottom: 20 }}>
                {[
                  { label: "Phase 0 — Inception", start: 0, end: 4, color: C.muted },
                  { label: "Phase 1 — Framework MVP", start: 4, end: 18, color: C.blue },
                  { label: "Phase 2 — AWS Production", start: 18, end: 30, color: C.purple },
                  { label: "Phase 3 — Informatica Agent", start: 22, end: 42, color: C.gold },
                  { label: "Phase 4 — ADF Agent", start: 42, end: 55, color: C.amber },
                  { label: "Phase 5 — Full Migration", start: 55, end: 67, color: C.green },
                  { label: "Phase 6 — Cloud Validation", start: 67, end: 76, color: C.teal },
                ].map((bar, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: C.muted, width: 200, flexShrink: 0 }}>{bar.label}</span>
                    <div style={{ flex: 1, position: "relative", height: 18, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: `${bar.start / 76 * 100}%`, width: `${(bar.end - bar.start) / 76 * 100}%`, background: bar.color, height: "100%", borderRadius: 4, opacity: 0.85 }} />
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", marginLeft: 210, marginTop: 4 }}>
                  {["M0", "M2", "M4", "M6", "M8", "M10", "M12", "M14", "M16", "M18"].map((m, i) => (
                    <span key={i} style={{ flex: 1, fontSize: 9, color: C.muted }}>{m}</span>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle>Milestone Detail</SectionTitle>
              <Timeline />
            </Card>

            <Card>
              <SectionTitle>Key Success Metrics at 18 Months</SectionTitle>
              {[
                ["Pipelines migrated", "500+", C.green],
                ["Legacy licenses retired", "100% of scope", C.green],
                ["P0 pipeline reliability", "99.9% monthly", C.blue],
                ["P1 pipeline reliability", "99.5% monthly", C.blue],
                ["New pipeline delivery", "< 3 business days", C.teal],
                ["Cloud portability validated", "AWS + GCP + On-prem K8s", C.teal],
                ["Annual license savings confirmed", "$5M+ / yr", C.gold],
                ["Team handed to BAU", "Yes — operational", C.green],
                ["Auto-conversion rate (simple)", "≥ 85%", C.purple],
                ["Shadow-run reconciliation pass", "≥ 98%", C.purple],
              ].map(([l, v, c], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{l}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c as string }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ══════════════════ DECISION ══════════════════ */}
        {tab === "decision" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Go/No-go */}
            <Card>
              <SectionTitle>Go / No-Go Criteria — All Met</SectionTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Criterion", "Threshold", "Actual Result", "Status"].map((h, i) => (
                      <th key={i} style={{ fontSize: 10, color: C.muted, textAlign: i === 3 ? "center" : "left", padding: "6px 10px", borderBottom: `2px solid ${C.border}`, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {goCriteria.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? C.bg : "transparent" }}>
                      <td style={{ padding: "7px 10px", fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}` }}>{row.criterion}</td>
                      <td style={{ padding: "7px 10px", fontSize: 11, color: C.text, borderBottom: `1px solid ${C.border}` }}>{row.threshold}</td>
                      <td style={{ padding: "7px 10px", fontSize: 11, fontWeight: 700, color: C.green, borderBottom: `1px solid ${C.border}` }}>{row.actual}</td>
                      <td style={{ padding: "7px 10px", textAlign: "center", borderBottom: `1px solid ${C.border}` }}><Check ok={row.ok} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Risks */}
              <Card>
                <SectionTitle>Risk Register — Top 6</SectionTitle>
                {risks.map((r, i) => (
                  <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>⚠ {r.risk}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Tag label={`L:${r.l}`} color={likelihoodColor(r.l)} />
                        <Tag label={`I:${r.i}`} color={likelihoodColor(r.i)} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{r.mit}</div>
                  </div>
                ))}
              </Card>

              {/* Alternatives */}
              <Card>
                <SectionTitle>Why Not the Alternatives?</SectionTitle>
                {[
                  { opt: "Stay on Informatica", verdict: "No", reason: "Forced IDMC upgrade 2026 · no cloud portability · talent scarcity · $42.7M over 5 years" },
                  { opt: "Adopt Apache SeaTunnel", verdict: "No", reason: "Supply chain concerns · Java-centric · no enterprise governance · no migration agent" },
                  { opt: "Migrate to Informatica IDMC", verdict: "No", reason: "Pays migration cost without getting platform ownership · still vendor-locked" },
                  { opt: "AWS Glue / Step Functions", verdict: "No", reason: "Hard AWS lock-in · violates cloud portability requirement · no Informatica agent" },
                  { opt: "Airbyte OSS", verdict: "Partial", reason: "EL only — no transformation capability · can't replace Informatica · complementary for simple ingestion" },
                  { opt: "Generic ETL Framework (proposed)", verdict: "Yes", reason: "Cloud-agnostic · enterprise-owned IP · migration agent included · $17.5M 5-yr saving" },
                ].map((alt, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <Tag label={alt.verdict} color={alt.verdict === "Yes" ? C.green : alt.verdict === "Partial" ? C.amber : C.red} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 2 }}>{alt.opt}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{alt.reason}</div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            {/* Immediate actions */}
            <Card style={{ background: `linear-gradient(135deg, #0d1b3e, #0d2a1a)`, border: `1px solid ${C.blue}44` }}>
              <SectionTitle>Immediate Actions Requested — Next 30 Days</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {[
                  { n: "1", action: "Secure program funding ($3.5M build authorization)", color: C.gold },
                  { n: "2", action: "Begin Informatica renewal negotiation — use migration as leverage before Q3 window", color: C.amber },
                  { n: "3", action: "Identify internal team candidates (8.5 FTE — internal moves take 4–6 weeks)", color: C.teal },
                  { n: "4", action: "Provision AWS dev account + ECR + EKS sandbox + MWAA dev environment", color: C.blue },
                  { n: "5", action: "Select 10 pilot pipelines across complexity tiers for Phase 1 validation", color: C.green },
                  { n: "6", action: "Convene Architecture Review Board — approve 10 founding ADRs", color: C.purple },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: item.color, color: C.bg, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.n}</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{item.action}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, padding: "12px 16px", background: C.green + "18", border: `1px solid ${C.green}44`, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.green, marginBottom: 4 }}>RECOMMENDATION: PROCEED</div>
                <div style={{ fontSize: 11, color: C.muted }}>All financial go-criteria met · External forcing functions make inaction costly · Every month of delay foregoes ~$560K in savings</div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: "12px 36px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 10, color: C.muted }}>All figures estimated from published pricing, industry benchmarks, and modelled assumptions. 2026 pricing.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Tag label="ROI 69%" color={C.green} />
          <Tag label="Payback Month 26" color={C.teal} />
          <Tag label="$17.5M 5-yr Saving" color={C.gold} />
        </div>
      </div>
    </div>
  );
}
