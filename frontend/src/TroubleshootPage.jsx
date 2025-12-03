import React, { useCallback, useEffect, useMemo, useState } from "react";
import ChatTroubleshooter from "./ChatTroubleshooter";

const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8787";

const ISSUE_OPTIONS = [
  { key: "slow", label: "Slow speeds" },
  { key: "drops", label: "Drops / disconnects" },
  { key: "buffering", label: "Streaming / gaming lag" },
  { key: "deadzone", label: "Weak signal / dead zones" },
  { key: "devices", label: "Some devices can't connect" },
  { key: "other", label: "Something else" },
];

const PRESET_ISPS = [
  "Xfinity / Comcast",
  "Verizon Fios",
  "AT&T Fiber / DSL",
  "Spectrum",
  "Cox",
  "Frontier",
  "T-Mobile Home Internet",
  "Starlink",
  "Other / Not sure",
];

const RUN_TIPS = [
  "Tip: run this test while connected to the Wi-Fi you want fixed.",
  "Routers work best high up and in the center of your home.",
  "If speeds drop only at night, congestion or interference is likely.",
  "Microwaves, baby monitors, and Bluetooth can cause 2.4GHz noise.",
  "Mesh nodes should have strong signal between them — not at the edge.",
  "Walls, mirrors, and metal appliances can crush Wi-Fi range.",
  "If one device is slow, it may be stuck on 2.4GHz.",
  "If your router is 5+ years old, it may bottleneck modern plans.",
];

// ✅ never returns an object
function getScore(report) {
  if (!report) return null;

  let raw =
    report.score ??
    report.wifi_health_score ??
    report.health_score ??
    report.overall_score ??
    report.healthScore ??
    null;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    raw =
      raw.wifi_health_score ??
      raw.score ??
      raw.health_score ??
      raw.overall_score ??
      null;
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function scoreToStatus(score) {
  if (score == null) return { label: "Unknown", tone: "slate" };
  if (score >= 85) return { label: "Excellent", tone: "emerald" };
  if (score >= 70) return { label: "Good", tone: "green" };
  if (score >= 50) return { label: "Fair", tone: "amber" };
  return { label: "Poor", tone: "rose" };
}

/** Safely turn any value into JSX-friendly text */
function renderValue(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(v => renderValue(v)).join("\n");
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

/** Special handling for your summary object shape */
function normalizeSummary(report) {
  const raw =
    report?.summary ||
    report?.ai_summary ||
    report?.analysis ||
    report?.notes ||
    report?.wifi_health_score ||
    "";

  if (raw == null) return "";

  if (typeof raw === "object" && !Array.isArray(raw)) {
    const parts = [];
    if (raw.explanation) parts.push(raw.explanation);
    if (raw.trend_summary) parts.push(raw.trend_summary);
    if (parts.length) return parts.join("\n\n");
    return renderValue(raw);
  }

  return renderValue(raw);
}

export default function TroubleshootPage() {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("prefight"); // prefight | running | results
  const [lastRunTs, setLastRunTs] = useState(null);
  const [err, setErr] = useState(null);
  const [tipIndex, setTipIndex] = useState(0);

  const [profile, setProfile] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("wifiProfile")) || {
          isp: "",
          routerModel: "",
          routerAge: "",
          mainDevice: "",
          issueKeys: [],
          notes: "",
        }
      );
    } catch {
      return {
        isp: "",
        routerModel: "",
        routerAge: "",
        mainDevice: "",
        issueKeys: [],
        notes: "",
      };
    }
  });

  const saveProfile = (next) => {
    setProfile(next);
    try {
      localStorage.setItem("wifiProfile", JSON.stringify(next));
    } catch {}
  };

  const fetchLatest = useCallback(async () => {
    const r = await fetch(`${API}/latest-report`);
    if (!r.ok) throw new Error(`latest-report ${r.status}`);
    const j = await r.json();
    setReport(j);
  }, []);

  useEffect(() => {
    fetchLatest().catch((e) => {
      console.error(e);
      setErr("Backend not reachable on port 8787. Start agent_server.py.");
    });
  }, [fetchLatest]);

  const runTroubleshoot = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setErr(null);
    setPhase("running");
    try {
      const r = await fetch(`${API}/troubleshoot-now`);
      if (!r.ok) throw new Error(`troubleshoot-now ${r.status}`);
      await fetchLatest();
      setLastRunTs(Date.now());
      setPhase("results");
    } catch (e) {
      console.error(e);
      setErr("Troubleshoot failed — backend not running on port 8787.");
      setPhase("prefight");
    } finally {
      setRunning(false);
    }
  }, [fetchLatest, running]);

  // rotate tips while running
  useEffect(() => {
    if (phase !== "running") return;
    setTipIndex(0);
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % RUN_TIPS.length);
    }, 5500);
    return () => clearInterval(id);
  }, [phase]);

  // ✅ stay at top when results load (prevents chat auto-scroll)
  useEffect(() => {
    if (phase === "results") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [phase]);

  const selectedIssues = useMemo(
    () => ISSUE_OPTIONS.filter((o) => profile.issueKeys.includes(o.key)),
    [profile.issueKeys]
  );

  const readinessScore = useMemo(() => {
    let s = 0;
    if (profile.isp) s += 1;
    if (profile.routerModel) s += 1;
    if (profile.issueKeys?.length) s += 1;
    return s;
  }, [profile]);

  const problems = report?.problems || [];
  const fixes = report?.fixes || [];
  const summary = normalizeSummary(report);

  const perf = report?.perf || report?.performance || {};
  const speeds = perf?.speeds || perf?.speedtest || perf;

  const score = getScore(report);
  const status = scoreToStatus(score);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Fix My Wi-Fi</h1>
          {phase === "prefight" && (
            <p className="text-sm text-slate-600 mt-1">
              Answer a few quick questions, then we’ll run a deep diagnostic.
            </p>
          )}
        </div>

        {lastRunTs && phase === "results" && (
          <div className="text-xs text-slate-500">
            Last run: {new Date(lastRunTs).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Pre-flight wizard */}
      {phase === "prefight" && (
        <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-6">
          <div className="flex justify-between">
            <div className="font-semibold text-slate-900">Quick setup</div>
            <div className="text-xs text-slate-500">{readinessScore}/3 complete</div>
          </div>

          {/* ISP */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Internet provider (ISP)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_ISPS.map((isp) => (
                <button
                  key={isp}
                  onClick={() => saveProfile({ ...profile, isp })}
                  className={`px-3 py-2 rounded-xl border text-sm text-left transition
                    ${profile.isp === isp
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 hover:border-slate-400 bg-white"}`}
                >
                  {isp}
                </button>
              ))}
            </div>
            <input
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
              placeholder="Or type your ISP"
              value={profile.isp || ""}
              onChange={(e) => saveProfile({ ...profile, isp: e.target.value })}
            />
          </div>

          {/* Router model + age */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">Router model</label>
              <input
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
                value={profile.routerModel || ""}
                onChange={(e) => saveProfile({ ...profile, routerModel: e.target.value })}
                placeholder="e.g. Netgear Nighthawk"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800">Router age</label>
              <select
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                value={profile.routerAge || ""}
                onChange={(e) => saveProfile({ ...profile, routerAge: e.target.value })}
              >
                <option value="">Not sure</option>
                <option value="<1y">Less than 1 year</option>
                <option value="1-3y">1–3 years</option>
                <option value="3-5y">3–5 years</option>
                <option value="5y+">5+ years</option>
              </select>
            </div>
          </div>

          {/* Main device */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Main device</label>
            <input
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
              value={profile.mainDevice || ""}
              onChange={(e) => saveProfile({ ...profile, mainDevice: e.target.value })}
              placeholder="iPhone 14, PS5, Work Laptop…"
            />
          </div>

          {/* Issues */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">What’s happening?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ISSUE_OPTIONS.map((opt) => {
                const active = profile.issueKeys.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between text-sm transition
                      ${active
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-400 bg-white"}`}
                    onClick={() => {
                      const issueKeys = active
                        ? profile.issueKeys.filter((k) => k !== opt.key)
                        : [...profile.issueKeys, opt.key];
                      saveProfile({ ...profile, issueKeys });
                    }}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-xs ${active ? "text-slate-900" : "text-slate-400"}`}>
                      {active ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Anything else?</label>
            <textarea
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
              rows={3}
              value={profile.notes || ""}
              onChange={(e) => saveProfile({ ...profile, notes: e.target.value })}
              placeholder="Example: started after power outage…"
            />
          </div>

          {/* Start button */}
          <button
            onClick={runTroubleshoot}
            disabled={running}
            className={`w-full px-4 py-3 mt-2 rounded-xl font-semibold transition
              ${running
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-slate-900 text-white hover:bg-slate-800"}`}
          >
            {running ? "Starting..." : "Start deep dive"}
          </button>
        </div>
      )}

      {/* Running state */}
      {phase === "running" && (
        <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-8">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 shrink-0">
              <div className="absolute inset-0 rounded-full bg-slate-900/10 animate-ping" />
              <div className="absolute inset-1 rounded-full border-4 border-slate-900 border-t-transparent animate-spin" />
            </div>

            <div className="flex-1">
              <div className="text-lg font-bold text-slate-900">
                Running deep diagnostic…
              </div>
              <div className="text-sm text-slate-600 mt-1">
                This takes a moment.
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 relative overflow-hidden">
            <div className="absolute inset-0 opacity-40 bg-gradient-to-r from-transparent via-white to-transparent animate-[shine_5.5s_linear_infinite]" />
            <div className="relative font-medium">{RUN_TIPS[tipIndex]}</div>

            <style>{`
              @keyframes shine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* Results */}
      {phase === "results" && (
        <div className="space-y-6">
          {/* Summary + Big Health Score (kept) */}
          <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-slate-500">
                  Diagnostic Results
                </div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">
                  Here’s what’s really going on
                </div>

                {summary && (
                  <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">
                    {summary}
                  </div>
                )}
              </div>

              <div className="shrink-0 text-center">
                <div
                  className={`text-5xl font-extrabold leading-none ${
                    status.tone === "emerald" ? "text-emerald-600" :
                    status.tone === "green" ? "text-green-600" :
                    status.tone === "amber" ? "text-amber-600" :
                    status.tone === "rose" ? "text-rose-600" :
                    "text-slate-700"
                  }`}
                >
                  {score ?? "—"}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-600">
                  Health Score
                </div>
                <div
                  className={`mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                    status.tone === "emerald" ? "bg-emerald-50 text-emerald-700" :
                    status.tone === "green" ? "bg-green-50 text-green-700" :
                    status.tone === "amber" ? "bg-amber-50 text-amber-700" :
                    status.tone === "rose" ? "bg-rose-50 text-rose-700" :
                    "bg-slate-100 text-slate-700"
                  }`}
                >
                  {status.label}
                </div>
              </div>
            </div>

            {(speeds?.download || speeds?.upload || speeds?.ping) && (
              <div className="mt-5 grid grid-cols-3 gap-3">
                <PerfTile label="Download" value={speeds.download} unit="Mbps" />
                <PerfTile label="Upload" value={speeds.upload} unit="Mbps" />
                <PerfTile label="Ping" value={speeds.ping} unit="ms" />
              </div>
            )}
          </div>

          {/* Findings + Fix plan */}
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
              <div className="text-sm font-semibold text-slate-900 mb-2">
                What we found
              </div>

              {problems.length === 0 ? (
                <div className="text-sm text-slate-600">
                  No major problems detected right now.
                </div>
              ) : (
                <ul className="space-y-2">
                  {problems.map((p, i) => {
                    const text =
                      typeof p === "string"
                        ? p
                        : p.description || p.issue || p.title || renderValue(p);

                    const sev =
                      typeof p === "object" && p
                        ? p.severity || p.level || p.priority
                        : null;

                    return (
                      <li key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm text-slate-800 whitespace-pre-wrap">{text}</div>
                          {sev && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-900 text-white font-semibold">
                              {String(sev).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
              <div className="text-sm font-semibold text-slate-900 mb-2">
                Fix plan (in order)
              </div>

              {fixes.length === 0 ? (
                <div className="text-sm text-slate-600">
                  No fixes recommended yet. Run diagnostic again in a minute.
                </div>
              ) : (
                <ol className="space-y-2 list-decimal pl-5 text-sm text-slate-800">
                  {fixes.map((f, i) => {
                    const text =
                      typeof f === "string"
                        ? f
                        : f.recommendation || f.action || f.title || renderValue(f);

                    return (
                      <li key={i} className="pl-1 whitespace-pre-wrap">
                        {text}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          {/* Deep dive details */}
          <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-900">
              Deep dive details
            </div>

            <details className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Environment & interference
              </summary>
              <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {renderValue(
                  report?.environment ||
                    report?.interference ||
                    report?.rf_notes ||
                    "No extra interference notes detected."
                )}
              </div>
            </details>

            <details className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Network performance breakdown
              </summary>
              <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                {renderValue(
                  report?.performance_notes ||
                    report?.perf_notes ||
                    perf ||
                    "No breakdown provided."
                )}
              </div>
            </details>

            <details className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                Raw diagnostic output
              </summary>
              <pre className="mt-2 text-xs text-slate-700 overflow-x-auto">
                {JSON.stringify(report, null, 2)}
              </pre>
            </details>
          </div>

          {/* AI Chat */}
          <ChatTroubleshooter apiBase={API} profile={profile} latestReport={report} />

          {/* Your setup + Run again button */}
          <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-900">Your setup</div>
              <button
                onClick={() => setPhase("prefight")}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900"
              >
                Edit answers
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <InfoRow label="ISP" value={profile.isp || "Not provided"} />
              <InfoRow label="Router model" value={profile.routerModel || "Not provided"} />
              <InfoRow label="Router age" value={profile.routerAge || "Not sure"} />
              <InfoRow label="Main device" value={profile.mainDevice || "Not provided"} />
            </div>

            {selectedIssues.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedIssues.map((i) => (
                  <span
                    key={i.key}
                    className="px-2 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold"
                  >
                    {i.label}
                  </span>
                ))}
              </div>
            )}

            {profile.notes && (
              <div className="mt-3 text-sm text-slate-700">
                <span className="font-medium">Notes:</span> {profile.notes}
              </div>
            )}

            <button
              onClick={runTroubleshoot}
              disabled={running}
              className={`w-full px-4 py-3 mt-5 rounded-xl font-semibold border transition
                ${
                  running
                    ? "bg-slate-100 text-slate-400 border-slate-150 cursor-not-allowed"
                    : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                }`}
            >
              {running ? "Running deep diagnostic..." : "Run deep diagnostic again"}
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="max-w-3xl mx-auto bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm">
          {err}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
      <div className="text-slate-600">{label}</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function PerfTile({ label, value, unit }) {
  if (value == null || value === "") return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-extrabold text-slate-900">
        {value}
        {unit ? (
          <span className="text-xs font-semibold text-slate-600 ml-1">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}
