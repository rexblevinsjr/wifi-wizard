import React, { useMemo } from "react";

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

function safeText(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(safeText).filter(Boolean).join("\n");
  if (typeof val === "object") {
    const parts = [];
    if (val.explanation) parts.push(val.explanation);
    if (val.trend_summary) parts.push(val.trend_summary);
    if (val.trend) parts.push(JSON.stringify(val.trend));
    if (parts.length) return parts.join("\n\n");
    return JSON.stringify(val, null, 2);
  }
  return String(val);
}

function toNumOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildTrendSummary(trend) {
  if (!trend || typeof trend !== "object") return "";

  const d = toNumOrNull(trend.download_delta_mbps);
  const u = toNumOrNull(trend.upload_delta_mbps);
  const p = toNumOrNull(trend.ping_delta_ms);

  const parts = [];

  const describe = (label, val) => {
    if (val == null) return;
    const abs = Math.abs(val);
    if (abs < 0.2) {
      parts.push(label + " stayed about the same");
    } else if (val > 0) {
      parts.push(label + " improved");
    } else {
      parts.push(label + " decreased");
    }
  };

  if (d != null) describe("download", d);
  if (u != null) describe("upload", u);

  if (p != null) {
    const abs = Math.abs(p);
    if (abs < 1) {
      parts.push("ping stayed about the same");
    } else if (p > 0) {
      parts.push("ping worsened (latency increased)");
    } else {
      parts.push("ping improved (latency decreased)");
    }
  }

  if (!parts.length) return "";
  return "Since last scan: " + parts.join(", ") + ".";
}

function extractScore(report) {
  if (!report || typeof report !== "object") return 0;

  const raw =
    report?.score?.wifi_health_score ??
    report?.score?.overall ??
    report?.score?.value ??
    report?.score?.score ??
    report?.score?.health ??
    report?.wifi_health_score ??
    report?.health_score ??
    report?.overall_score ??
    report?.score ??
    0;

  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, 0, 100) : 0;
}

function extractPerf(report) {
  const perf =
    report?.performance ||
    report?.perf ||
    report?.speedtest ||
    report?.metrics ||
    report?.results ||
    null;

  if (!perf || typeof perf !== "object") {
    return { download: null, upload: null, ping: null };
  }

  const hasPerfKeys =
    "download_mbps" in perf ||
    "upload_mbps" in perf ||
    "ping_ms" in perf ||
    "download" in perf ||
    "upload" in perf ||
    "ping" in perf ||
    "latency" in perf;

  if (!hasPerfKeys) return { download: null, upload: null, ping: null };

  return {
    download: toNumOrNull(
      perf.download_mbps ?? perf.download ?? perf.down ?? perf.down_mbps
    ),
    upload: toNumOrNull(
      perf.upload_mbps ?? perf.upload ?? perf.up ?? perf.up_mbps
    ),
    ping: toNumOrNull(perf.ping_ms ?? perf.ping ?? perf.latency),
  };
}

/**
 * Format "Refreshed just now", "Refreshed 2 minutes ago", etc.
 */
function formatRelativeRefresh(ts, prefix = "Refreshed") {
  if (!ts) return "";

  const now = Date.now();
  const diffMs = Math.max(0, now - ts);
  const diffSec = Math.floor(diffMs / 1000);

  // < 60 seconds → "Refreshed just now"
  if (diffSec < 60) {
    return `${prefix} just now`;
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${prefix} ${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return `${prefix} ${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  }

  const diffDay = Math.floor(diffHr / 24);
  return `${prefix} ${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

export default function WifiHealthMeter({
  report,
  onRefreshNow,
  refreshing = false,
  lastRefreshTs = null,
  variant = "full", // "full" | "compact"
  refreshLabel = "Refresh",
  embedded = false,

  // monitor options
  hidePerfTiles = false,
  passiveIntervalMs = null,
}) {
  const score = useMemo(() => extractScore(report), [report]);
  const { download, upload, ping } = useMemo(
    () => extractPerf(report),
    [report]
  );

  const explanation =
    safeText(report?.score?.explanation) ||
    safeText(report?.performance?.interpretation) ||
    "Moderate network quality. Congestion or interference may impact stability.";

  const rawTrend = report?.score?.trend ?? null;
  const trendSummary =
    rawTrend && typeof rawTrend === "object"
      ? buildTrendSummary(rawTrend)
      : safeText(report?.score?.trend_summary ?? "");

  const statusText =
    score >= 71 ? "Stable" : score >= 41 ? "Somewhat unstable" : "Unstable";

  const statusColor =
    statusText === "Stable"
      ? "text-emerald-500"
      : statusText === "Somewhat unstable"
      ? "text-amber-500"
      : "text-rose-500";

  const shouldNudge = score < 45;

  const Wrapper = ({ children }) =>
    embedded ? (
      <div className="w-full">{children}</div>
    ) : (
      <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
        {children}
      </div>
    );

  const compactCentered = variant === "compact" && hidePerfTiles;

  const pct = clamp(score, 0, 100);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const ringColor = scoreRingColor(score);
  const textColor = scoreTextColor(score);

  return (
    <Wrapper>
      {/* Header row (only shown when onRefreshNow exists; full/home use) */}
      {onRefreshNow && (
        <div className="flex items-center justify-between gap-4 mb-4">
          {/* Right-side status block, just left of the button */}
          <div className="flex flex-col items-end">
            {/* "NETWORK STATUS Stable" on one line */}
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Network Status
              </span>
              <span className={`text-sm font-semibold ${statusColor}`}>
                {statusText}
              </span>
            </div>

            {lastRefreshTs && (
              <div className="mt-0.5 text-xs text-slate-500 w-full text-center">
                {formatRelativeRefresh(lastRefreshTs)}
              </div>
            )}
          </div>

          <button
            onClick={onRefreshNow}
            disabled={refreshing}
            className={`px-4 py-2.5 rounded-xl text-sm sm:text-base font-semibold border transition
              ${
                refreshing
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-wait"
                  : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800 hover:border-slate-800"
              }`}
          >
            {refreshing ? "Running…" : refreshLabel}
          </button>
        </div>
      )}

      {/* Body */}
      <div
        className={
          compactCentered
            ? "flex flex-col items-center text-center gap-4 min-h-[260px]"
            : "flex flex-col md:flex-row gap-6 items-start"
        }
      >
        {/* Ring – original geometry/placement */}
        <div className="relative w-44 h-44 shrink-0">
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
              className={ringColor}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-5xl font-bold ${textColor}`}>
              {pct.toFixed(0)}
            </div>
            <div className="text-xs text-slate-500 tracking-widest uppercase mt-1">
              Wi-Fi Health
            </div>
          </div>
        </div>

        {/* Right column: explanation + trend + tiles */}
        <div className="flex-1 flex flex-col">
          {/* Explanation + trend + nudge now flow from the top */}
          <div className="flex flex-col">
            <p className="text-base sm:text-lg text-slate-800 whitespace-pre-wrap text-center">
              {explanation}
            </p>

            {trendSummary && (
              <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap text-center">
                {trendSummary}
              </p>
            )}

            {shouldNudge && (
              <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 p-2 rounded-lg">
                Health is low. Hit <b>Fix My Wi-Fi</b> for deeper analysis and
                fixes.
              </div>
            )}
          </div>

          {/* Speed tiles pushed lower, under the centered text */}
          {!hidePerfTiles && (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SpeedTile label="Download" value={download} unit="Mbps" icon="↓" />
              <SpeedTile label="Upload" value={upload} unit="Mbps" icon="↑" />
              <SpeedTile label="Ping" value={ping} unit="ms" icon="↔" />
            </div>
          )}

          {/* Passive text for compact/monitor variant */}
          {variant === "compact" && passiveIntervalMs && (
            <div className="mt-4 text-[11px] text-slate-500 text-center md:text-left">
              Passively updating every {Math.round(passiveIntervalMs / 1000)}s
              {lastRefreshTs
                ? ` • ${formatRelativeRefresh(lastRefreshTs, "Last update")}`
                : ""}
            </div>
          )}
        </div>
      </div>
    </Wrapper>
  );
}

function SpeedTile({ label, value, unit, icon }) {
  const safe = Number.isFinite(Number(value)) ? Number(value).toFixed(1) : null;

  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
      <div className="text-xs text-slate-500 uppercase tracking-wide">
        {label}
      </div>
      {/* Left: value, Right: big arrow centered in its track */}
      <div className="mt-1 text-lg font-semibold text-slate-900 grid grid-cols-[3fr,2fr] items-center">
        <div>
          {safe ?? "—"}{" "}
          <span className="text-xs font-normal text-slate-500">{unit}</span>
        </div>
        {icon && (
          <div className="flex items-center justify-center">
            <span className="text-3xl leading-none text-slate-400">
              {icon}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
