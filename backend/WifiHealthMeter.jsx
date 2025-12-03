import React from "react";

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function scoreTextColor(score) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-yellow-500";
  return "text-rose-500";
}

function scoreRingColor(score) {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-yellow-500";
  return "stroke-rose-500";
}

function trendArrow(delta, flip = false) {
  // flip=true for metrics where lower is better (ping)
  const effective = flip ? -delta : delta;
  if (effective > 0.5) return "↑";
  if (effective < -0.5) return "↓";
  return "→";
}

function trendColor(delta, flip = false) {
  const effective = flip ? -delta : delta;
  if (effective > 0.5) return "text-emerald-600";
  if (effective < -0.5) return "text-rose-600";
  return "text-slate-500";
}

function prettyDelta(delta, unit = "") {
  if (typeof delta !== "number" || !Number.isFinite(delta)) {
    return `—${unit ? ` ${unit}` : ""}`;
  }
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

// 🔹 new: pull since_last from report if present
function pickSinceLast(report) {
  if (!report) return null;
  return report.since_last || null;
}

export default function WifiHealthMeter({ report }) {
  // NOTE: your report shape here is nested under report.score
  const score = clamp(report?.score?.wifi_health_score ?? 0, 0, 100);
  const explanation = report?.score?.explanation ?? "";
  const trendSummary = report?.score?.trend_summary ?? "";
  const trend = report?.score?.trend ?? {};

  const perf = report?.performance ?? {};
  const diagnosis = report?.diagnosis ?? "";

  // 🔹 new: prefer deltas from since_last if available
  const sinceLast = pickSinceLast(report);

  const downloadDelta =
    sinceLast?.deltaDown != null
      ? sinceLast.deltaDown
      : trend.download_delta_mbps;

  const uploadDelta =
    sinceLast?.deltaUp != null ? sinceLast.deltaUp : trend.upload_delta_mbps;

  const pingDelta =
    sinceLast?.deltaPing != null ? sinceLast.deltaPing : trend.ping_delta_ms;

  // Circular gauge math
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl shadow-sm bg-white border border-slate-100">
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
        {/* Gauge */}
        <div className="relative w-44 h-44">
          <svg className="w-44 h-44 rotate-[-90deg]" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              strokeWidth="12"
              className="stroke-slate-200"
            />
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className={scoreRingColor(score)}
            />
          </svg>

          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-5xl font-bold ${scoreTextColor(score)}`}>
              {score}
            </div>
            <div className="text-xs text-slate-500 tracking-widest uppercase mt-1">
              Wi-Fi Health
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="flex-1 w-full">
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
            Network Health Report
          </h2>

          <p className="mt-2 text-slate-700 leading-relaxed">
            {explanation}
          </p>

          {trendSummary && (
            <p className="mt-3 text-sm text-slate-600">
              {trendSummary}
            </p>
          )}
        </div>
      </div>

      {/* Trend cards (act as your "since last test" view) */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniTrend label="Download" delta={downloadDelta} unit="Mbps" />
        <MiniTrend label="Upload" delta={uploadDelta} unit="Mbps" />
        <MiniTrend label="Ping" delta={pingDelta} unit="ms" flip />
              </div>

      {/* Performance + diagnosis */}
      <div className="mt-7 grid sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
          <div className="text-xs text-slate-500 uppercase tracking-widest">
            Performance
          </div>
          <div className="mt-2 space-y-1 text-slate-800">
            <div>
              Download: <b>{perf.download_mbps ?? "—"} Mbps</b>
            </div>
            <div>
              Upload: <b>{perf.upload_mbps ?? "—"} Mbps</b>
            </div>
            <div>
              Ping: <b>{perf.ping_ms ?? "—"} ms</b>
            </div>
          </div>
          {perf.interpretation && (
            <p className="mt-2 text-sm text-slate-600">
              {perf.interpretation}
            </p>
          )}
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-100">
          <div className="text-xs text-slate-500 uppercase tracking-widest">
            Diagnosis
          </div>
          <p className="mt-2 text-slate-800 leading-relaxed">
            {diagnosis}
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniTrend({ label, delta = 0, unit = "", subtitle = "", flip = false }) {
  const arrow = trendArrow(delta || 0, flip);
  const color = trendColor(delta || 0, flip);

  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className="text-xs text-slate-500 uppercase tracking-wide">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>
        {arrow} {prettyDelta(delta, unit)}
      </div>
      {subtitle && (
        <div className="text-xs text-slate-500 mt-0.5">
          {subtitle}
        </div>
      )}
    </div>
  );
}
