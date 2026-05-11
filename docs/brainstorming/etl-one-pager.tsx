import { useState } from "react";

const fmt = (n) => `$${(n / 1e6).toFixed(1)}M`;
const fmtK = (n) => `$${(n / 1e3).toFixed(0)}K`;

const colors = {
  red: "#C0392B",
  amber: "#E67E22",
  green: "#27AE60",
  blue: "#1A5276",
  lightBlue: "#2E86C1",
  darkBg: "#0D1B2A",
  cardBg: "#1B2A3B",
  border: "#2C3E50",
  text: "#ECF0F1",
  muted: "#95A5A6",
  gold: "#F1C40F",
  teal: "#1ABC9C",
};

const StatusBadge = ({ label, color }) => (
  <span style={{
    background: color + "22",
    border: `1px solid ${color}`,
    color: color,
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
  }}>{label}</span>
);

const KPI = ({ label, value, sub, color, big }) => (
  <div style={{
    background: colors.cardBg,
    border: `1px solid ${color}44`,
    borderTop: `3px solid ${color}`,
    borderRadius: 8,
    padding: "14px 16px",
    flex: 1,
    minWidth: 0,
  }}>
    <div style={{ color: colors.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
    <div style={{ color, fontSize: big ? 28 : 22, fontWeight: 800, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </div>
);

const Row = ({ label, values, highlight, bold }) => (
  <tr style={{ background: highlight ? colors.blue + "22" : "transparent" }}>
    <td style={{ padding: "7px 10px", color: bold ? colors.text : colors.muted, fontSize: 12, fontWeight: bold ? 700 : 400, borderBottom: `1px solid ${colors.border}` }}>{label}</td>
    {values.map((v, i) => (
      <td key={i} style={{ padding: "7px 10px", textAlign: "right", fontSize: 12, fontWeight: bold ? 700 : 400, color: typeof v === "object" ? v.color : colors.text, borderBottom: `1px solid ${colors.border}` }}>
        {typeof v === "object" ? v.label : v}
      </td>
    ))}
  </tr>
);

const BarComparison = ({ items }) => {
  const max = Math.max(...items.map(i => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: colors.muted }}>{item.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{fmt(item.value)}/yr</span>
          </div>
          <div style={{ background: colors.border, borderRadius: 4, height: 10, overflow: "hidden" }}>
            <div style={{ width: `${(item.value / max) * 100}%`, background: item.color, height: "100%", borderRadius: 4, transition: "width 0.6s ease" }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const Check = ({ ok }) => (
  <span style={{ color: ok ? colors.green : colors.red, fontWeight: 700, fontSize: 13 }}>{ok ? "✓" : "✗"}</span>
);

export default function OnePager() {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "costs", label: "Cost Detail" },
    { id: "timeline", label: "Timeline & ROI" },
    { id: "decision", label: "Decision" },
  ];

  return (
    <div style={{
      background: colors.darkBg,
      color: colors.text,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      minHeight: "100vh",
      padding: "0 0 40px 0",
    }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.blue} 0%, ${colors.lightBlue} 100%)`,
        padding: "20px 28px 16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>Executive Summary</div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>ETL Modernization Program</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Informatica + ADF → Custom Open Source Platform on AWS</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <StatusBadge label="RECOMMENDED: PROCEED" color={colors.gold} />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>Payback: Month 26 · ROI: 69%</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${colors.border}`, background: colors.cardBg, padding: "0 28px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "12px 16px", fontSize: 12, fontWeight: 600,
            color: activeTab === t.id ? colors.teal : colors.muted,
            borderBottom: activeTab === t.id ? `2px solid ${colors.teal}` : "2px solid transparent",
            transition: "all 0.2s",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "20px 28px" }}>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div>
            {/* KPIs */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <KPI label="5-Year Saving" value="$17.5M" sub="vs status quo" color={colors.green} big />
              <KPI label="Annual Saving (Steady State)" value="$6.7M" sub="from Year 3 onward" color={colors.teal} big />
              <KPI label="Build Investment" value="$3.5M" sub="18-month program" color={colors.amber} big />
              <KPI label="Payback Period" value="26 mo" sub="Month 26 breakeven" color={colors.gold} big />
            </div>

            {/* The Problem */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.red, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>⚠ The Problem Today</div>
                {[
                  ["Informatica annual cost", "$6.9M/yr", colors.red],
                  ["ADF annual cost", "$1.1M/yr", colors.amber],
                  ["Combined ETL spend", "$8.0M/yr", colors.red],
                  ["Per pipeline per year", "$11,481", colors.red],
                  ["ETL team headcount", "19 FTE", colors.muted],
                  ["Informatica support ending", "Mar 2026 ⚠", colors.amber],
                  ["ADF development frozen", "Fabric-only ⚠", colors.amber],
                ].map(([label, value, color], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ fontSize: 12, color: colors.muted }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>✓ The Solution (Custom ETL on AWS)</div>
                {[
                  ["Annual run cost (Year 3+)", "$2.1M/yr", colors.green],
                  ["Per pipeline per year", "$2,857", colors.green],
                  ["Cost reduction vs today", "75%", colors.teal],
                  ["ETL team headcount", "10 FTE", colors.green],
                  ["FTE savings (×$180K loaded)", "$1.7M/yr", colors.teal],
                  ["Cloud portability", "AWS → GCP → On-prem", colors.teal],
                  ["Vendor license dependency", "$0 — owned IP", colors.green],
                ].map(([label, value, color], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ fontSize: 12, color: colors.muted }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* What We're Building */}
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>What We're Building</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { title: "Custom ETL Framework", desc: "Container-based, YAML-driven runtime. Inspired by Apache SeaTunnel's design — built in-house. Runs on AWS today, GCP/on-prem tomorrow with zero re-architecture.", color: colors.teal },
                  { title: "AI Migration Agent", desc: "LangGraph + Claude-powered tool converts Informatica XML and ADF JSON to Framework YAML automatically. Compresses 3-year manual migration to 14 months.", color: colors.gold },
                  { title: "Airflow Orchestration (MWAA)", desc: "Industry-standard, enterprise-approved. Replaces Informatica Workflow Manager and cron scheduling. Zero licensing cost.", color: colors.lightBlue },
                  { title: "Cloud-Agnostic by Design", desc: "Container images + YAML configs are 100% portable. Only thin cloud-specific glue changes between AWS, GCP, and on-prem. Migration effort <4 months if needed.", color: colors.green },
                ].map((item, i) => (
                  <div key={i} style={{ borderLeft: `3px solid ${item.color}`, paddingLeft: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COSTS TAB */}
        {activeTab === "costs" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

              {/* Current State Breakdown */}
              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.red, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Current State — Annual TCO</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 10, color: colors.muted, textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${colors.border}` }}>Category</th>
                      <th style={{ fontSize: 10, color: colors.muted, textAlign: "right", padding: "4px 8px", borderBottom: `1px solid ${colors.border}` }}>Informatica</th>
                      <th style={{ fontSize: 10, color: colors.muted, textAlign: "right", padding: "4px 8px", borderBottom: `1px solid ${colors.border}` }}>ADF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["License / consumption", "$4,500,000", "$348,810"],
                      ["Infrastructure", "$340,000", "$58,000"],
                      ["People", "$2,070,000", "$720,000"],
                      ["Total", "$6,910,000", "$1,126,810"],
                    ].map(([label, inf, adf], i) => (
                      <tr key={i} style={{ background: i === 3 ? colors.red + "22" : "transparent" }}>
                        <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: i === 3 ? 700 : 400, color: i === 3 ? colors.text : colors.muted, borderBottom: `1px solid ${colors.border}` }}>{label}</td>
                        <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: i === 3 ? 700 : 400, textAlign: "right", color: i === 3 ? colors.red : colors.text, borderBottom: `1px solid ${colors.border}` }}>{inf}</td>
                        <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: i === 3 ? 700 : 400, textAlign: "right", color: i === 3 ? colors.amber : colors.text, borderBottom: `1px solid ${colors.border}` }}>{adf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, padding: "8px 10px", background: colors.red + "11", borderRadius: 6, fontSize: 12, fontWeight: 700, color: colors.red, display: "flex", justifyContent: "space-between" }}>
                  <span>Combined Annual TCO</span>
                  <span>$8,036,810</span>
                </div>
              </div>

              {/* Custom ETL Breakdown */}
              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.green, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Custom ETL — Build + Run</div>
                <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>One-time build (18 months)</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
                  <tbody>
                    {[
                      ["Engineering team (8.5 FTE)", "$2,565,000"],
                      ["AWS dev/test infrastructure", "$48,600"],
                      ["AI / LLM token costs", "$75,000"],
                      ["External consulting + tooling", "$375,000"],
                      ["Contingency (15%)", "$450,000"],
                      ["Total Build Investment", "$3,513,600"],
                    ].map(([label, val], i) => (
                      <tr key={i} style={{ background: i === 5 ? colors.green + "22" : "transparent" }}>
                        <td style={{ padding: "5px 8px", fontSize: 12, color: i === 5 ? colors.text : colors.muted, fontWeight: i === 5 ? 700 : 400, borderBottom: `1px solid ${colors.border}` }}>{label}</td>
                        <td style={{ padding: "5px 8px", fontSize: 12, textAlign: "right", color: i === 5 ? colors.green : colors.text, fontWeight: i === 5 ? 700 : 400, borderBottom: `1px solid ${colors.border}` }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>Annual run cost (steady state, Year 3+)</div>
                {[
                  ["AWS infrastructure (MWAA + EKS)", "$150,000"],
                  ["People (10 FTE)", "$1,800,000"],
                  ["Tooling / software", "$50,000"],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ fontSize: 12, color: colors.muted }}>{label}</span>
                    <span style={{ fontSize: 12, color: colors.text }}>{val}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, padding: "8px 10px", background: colors.green + "11", borderRadius: 6, fontSize: 12, fontWeight: 700, color: colors.green, display: "flex", justifyContent: "space-between" }}>
                  <span>Annual Run Total</span>
                  <span>$2,000,000</span>
                </div>
              </div>
            </div>

            {/* Annual cost bar chart */}
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Steady-State Annual Cost Comparison</div>
              <BarComparison items={[
                { label: "Status Quo (Informatica + ADF)", value: 8036810, color: colors.red },
                { label: "Custom ETL — On-Premise", value: 2335000, color: colors.amber },
                { label: "Custom ETL — AWS (Recommended)", value: 2000000, color: colors.green },
              ]} />
            </div>

            {/* Per pipeline */}
            <div style={{ display: "flex", gap: 12 }}>
              <KPI label="Informatica per pipeline / year" value="$15,356" color={colors.red} />
              <KPI label="ADF per pipeline / year" value="$4,507" color={colors.amber} />
              <KPI label="Custom ETL AWS per pipeline / year" value="$2,857" sub="81% less than Informatica" color={colors.green} />
              <KPI label="Custom ETL On-Prem per pipeline / year" value="$3,336" sub="78% less than Informatica" color={colors.teal} />
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === "timeline" && (
          <div>
            {/* 5-year table */}
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>5-Year Cost Comparison ($USD)</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Year", "Status Quo", "Custom AWS", "Custom On-Prem", "AWS Saving (Cumulative)"].map((h, i) => (
                      <th key={i} style={{ fontSize: 10, color: colors.muted, textAlign: i === 0 ? "left" : "right", padding: "6px 10px", borderBottom: `2px solid ${colors.border}`, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Year 1", 8036810, 11379210, 11594310, -3342400, false],
                    ["Year 2", 8277914, 7189605, 7548405, -2254091, false],
                    ["Year 3", 8526252, 2100000, 2335000, 4172161, true],
                    ["Year 4", 8782040, 2205000, 2585000, 10749201, false],
                    ["Year 5", 9045501, 2315000, 2335000, 17479702, false],
                    ["Total", 42668517, 25188815, 26397715, 17479702, true],
                  ].map(([yr, sq, aws, onp, sav, bold], i) => (
                    <tr key={i} style={{ background: bold ? colors.green + "11" : i % 2 === 0 ? colors.border + "33" : "transparent" }}>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: bold ? 700 : 400, color: bold ? colors.text : colors.muted, borderBottom: `1px solid ${colors.border}` }}>{yr}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: bold ? 700 : 400, textAlign: "right", color: bold ? colors.red : colors.text, borderBottom: `1px solid ${colors.border}` }}>{fmt(sq)}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: bold ? 700 : 400, textAlign: "right", color: bold ? colors.green : colors.text, borderBottom: `1px solid ${colors.border}` }}>{fmt(aws)}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: bold ? 700 : 400, textAlign: "right", color: bold ? colors.teal : colors.text, borderBottom: `1px solid ${colors.border}` }}>{fmt(onp)}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: bold ? 700 : 400, textAlign: "right", color: sav < 0 ? colors.red : colors.green, borderBottom: `1px solid ${colors.border}` }}>{sav < 0 ? `-${fmt(Math.abs(sav))}` : fmt(sav)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Milestone timeline */}
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Program Milestones</div>
              <div style={{ position: "relative", paddingLeft: 24 }}>
                <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 2, background: colors.border }} />
                {[
                  { month: "Month 1–4", label: "Framework MVP", desc: "Core engine, 5 connectors, pilot pipelines running on dev", color: colors.teal, status: "Phase 1" },
                  { month: "Month 5–7", label: "AWS Production", desc: "MWAA + EKS live, 30+ pipelines in production, security hardened", color: colors.lightBlue, status: "Phase 2" },
                  { month: "Month 6–10", label: "Migration Agent", desc: "AI-powered Informatica XML → YAML conversion. 100 jobs auto-converted", color: colors.gold, status: "Phase 3" },
                  { month: "Month 10–13", label: "ADF Agent", desc: "ADF JSON → YAML. 50 ADF pipelines converted. License retirement begins", color: colors.amber, status: "Phase 4" },
                  { month: "Month 13–16", label: "Full Scale Migration", desc: "500+ pipelines migrated. Informatica + ADF licenses retired", color: colors.green, status: "Phase 5" },
                  { month: "Month 26", label: "💰 Breakeven", desc: "Cumulative savings exceed total build investment", color: colors.gold, status: "ROI" },
                ].map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 14, position: "relative" }}>
                    <div style={{ position: "absolute", left: -20, top: 4, width: 12, height: 12, borderRadius: "50%", background: m.color, border: `2px solid ${colors.darkBg}`, zIndex: 1 }} />
                    <div style={{ marginLeft: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: m.color, fontWeight: 700, textTransform: "uppercase" }}>{m.month}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: colors.text }}>{m.label}</span>
                        <StatusBadge label={m.status} color={m.color} />
                      </div>
                      <div style={{ fontSize: 11, color: colors.muted }}>{m.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ROI metrics */}
            <div style={{ display: "flex", gap: 12 }}>
              <KPI label="Total Investment" value="$3.5M" sub="18-month build" color={colors.amber} />
              <KPI label="5-Year Saving" value="$17.5M" sub="vs status quo" color={colors.green} />
              <KPI label="ROI (5 Year)" value="69%" sub="net of all costs" color={colors.teal} />
              <KPI label="Annual Saving (Yr 3+)" value="$6.7M" sub="compounding benefit" color={colors.gold} />
            </div>
          </div>
        )}

        {/* DECISION TAB */}
        {activeTab === "decision" && (
          <div>
            {/* Go criteria */}
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Go / No-Go Criteria — All Met</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Criterion", "Threshold", "Actual", "Status"].map((h, i) => (
                      <th key={i} style={{ fontSize: 10, color: colors.muted, textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${colors.border}`, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["5-year saving exceeds $10M", "> $10M", "$17.5M", true],
                    ["Payback within 36 months", "< 36 months", "26 months", true],
                    ["Annual run cost below current by Year 3", "< $8M", "$2.1M", true],
                    ["Cloud portability preserved", "Required", "AWS + GCP + On-prem", true],
                    ["No proprietary tool dependencies", "Required", "$0 licensing", true],
                    ["Enterprise security requirements met", "Required", "Designed in", true],
                    ["Team assemblable in talent market", "Required", "Python / Airflow skills", true],
                    ["Breakeven robust to 50% cost overrun", "< 48 months", "Month 34 (worst case)", true],
                  ].map(([crit, thresh, actual, ok], i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? colors.border + "22" : "transparent" }}>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: colors.muted, borderBottom: `1px solid ${colors.border}` }}>{crit}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: colors.text, borderBottom: `1px solid ${colors.border}` }}>{thresh}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, color: colors.green, fontWeight: 700, borderBottom: `1px solid ${colors.border}` }}>{actual}</td>
                      <td style={{ padding: "7px 10px", fontSize: 12, borderBottom: `1px solid ${colors.border}` }}><Check ok={ok} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Risk summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.amber, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top Risks & Mitigations</div>
                {[
                  ["Migration timeline slips", "Phased cutover; parallel run period; legacy retained until stable"],
                  ["Build cost overrun 40%", "Breakeven still at Month 34 — within 5-yr window"],
                  ["AI agent accuracy below target", "Deterministic rules first; human review gates mandatory"],
                  ["Mainframe complexity", "Specialist engaged Phase 1; 2× budget allocated"],
                  ["Team ramp / attrition", "Knowledge distributed; documentation-first culture"],
                ].map(([risk, mit], i) => (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.amber, marginBottom: 3 }}>⚠ {risk}</div>
                    <div style={{ fontSize: 11, color: colors.muted }}>{mit}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.teal, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Strategic Value Beyond Cost</div>
                {[
                  ["Cloud portability", "GCP migration <4 months if needed. No re-architecture."],
                  ["Vendor independence", "$0 proprietary licensing. No renewal negotiations. No lock-in."],
                  ["Talent pool", "Python + Airflow skills 10× more available than Informatica specialists."],
                  ["Future AI integration", "Platform designed for AI-assisted pipeline authoring from Day 1."],
                  ["Informatica deadline pressure", "PowerCenter standard support ends Mar 2026. Migration is forced — do it on our terms."],
                ].map(([benefit, desc], i) => (
                  <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: colors.teal, marginBottom: 3 }}>✓ {benefit}</div>
                    <div style={{ fontSize: 11, color: colors.muted }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Immediate actions */}
            <div style={{ background: `linear-gradient(135deg, ${colors.blue}44, ${colors.teal}22)`, border: `1px solid ${colors.teal}44`, borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.teal, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Immediate Actions Requested — Next 30 Days</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["1", "Sponsor program approval and funding authorization ($3.5M build)", colors.gold],
                  ["2", "Initiate team assembly — 8.5 FTE (internal + external requisitions)", colors.teal],
                  ["3", "Provision AWS dev account + ECR + EKS sandbox + MWAA dev", colors.lightBlue],
                  ["4", "Select 10 pilot pipelines across complexity tiers for Phase 1", colors.green],
                  ["5", "Begin Informatica renewal negotiation — use migration as leverage", colors.amber],
                  ["6", "Architecture Review Board kickoff — approve founding ADRs", colors.teal],
                ].map(([num, action, color], i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: color, color: colors.darkBg, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{num}</div>
                    <div style={{ fontSize: 11, color: colors.muted, lineHeight: 1.4 }}>{action}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 28px 0", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: colors.muted }}>All figures estimated from published pricing, industry benchmarks, and modeled assumptions. Validated against Informatica, ADF, and AWS pricing sources 2025/2026.</div>
        <StatusBadge label="RECOMMENDATION: PROCEED" color={colors.green} />
      </div>
    </div>
  );
}
