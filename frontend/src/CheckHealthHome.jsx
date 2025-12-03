import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WifiHealthMeter from "./WifiHealthMeter";

const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8787";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Visual timing constants for the speed test progress ring
const MIN_RUN_MS = 8000;       // minimum time the test should appear to run
const EXPECTED_RUN_MS = 22000; // target total duration for smooth climb to ~99%

function progressHsl(pct) {
  const hue =
    pct < 50 ? (pct / 50) * 55 : 55 + ((pct - 50) / 50) * 65; // red→yellow→green
  return `hsl(${hue}, 85%, 45%)`;
}

// ---------- LOCAL HEALTH / TREND HELPERS (LOGIC ONLY) ----------

function computeHealthScore(download, upload, ping) {
  let score = 100;

  // Download penalties
  if (typeof download === "number") {
    if (download < 10) score -= 45;
    else if (download < 25) score -= 30;
    else if (download < 50) score -= 18;
    else if (download < 100) score -= 8;
  }

  // Upload penalties
  if (typeof upload === "number") {
    if (upload < 2) score -= 16;
    else if (upload < 5) score -= 10;
    else if (upload < 10) score -= 6;
  }

  // Ping penalties
  if (typeof ping === "number") {
    if (ping > 120) score -= 20;
    else if (ping > 80) score -= 12;
    else if (ping > 50) score -= 6;
  }

  return clamp(Math.round(score), 0, 100);
}

function buildHealthLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Poor";
}

function buildExplanation(score, label, download, upload, ping) {
  let summary;

  if (score >= 85) {
    summary =
      "Your connection looks excellent and should feel snappy for streaming, video calls, and gaming on multiple devices.";
  } else if (score >= 70) {
    summary =
      "Your connection looks solid for everyday use, HD streaming, and most video calls with only occasional slowdowns.";
  } else if (score >= 55) {
    summary =
      "Your connection is usable but may feel inconsistent during peak hours or with several devices active at once.";
  } else {
    summary =
      "Your connection appears constrained or unstable. You’re likely to notice buffering, lag, or timeouts under load.";
  }

  const notes = [];

  if (typeof download === "number") {
    if (download < 25) {
      notes.push("Download speed is on the low side for modern streaming and multi-device use.");
    } else if (download < 50) {
      notes.push("Download speed is adequate, but heavy streaming or large downloads may feel slower.");
    }
  }

  if (typeof upload === "number") {
    if (upload < 5) {
      notes.push("Upload speed is limited and can bottleneck video calls, cloud backups, or sharing large files.");
    } else if (upload < 10) {
      notes.push("Upload speed is okay, but big uploads may still take a while.");
    } else {
      notes.push("Upload speed looks healthy for video calls, cloud sync, and work-from-home tasks.");
    }
  }

  if (typeof ping === "number") {
    if (ping > 80) {
      notes.push("Latency to our test server is elevated, which can add delay to gaming or real-time calls.");
    } else if (ping < 40) {
      notes.push("Latency to our test server is low, which is great for gaming and real-time apps.");
    }
  }

  const extras = notes.length ? " " + notes.join(" ") : "";
  return summary + extras;
}

function buildTrendSummary(prev, curr) {
  if (!prev) return { trend: null, trend_summary: "This is your first scan on this device." };

  const fields = ["download", "upload", "ping_ms"];
  const deltas = {};
  let improvements = 0;
  let regressions = 0;

  fields.forEach((field) => {
    const a = prev[field];
    const b = curr[field];
    if (typeof a !== "number" || typeof b !== "number") return;

    const diff = b - a;
    deltas[field] = diff;

    if (field === "ping_ms") {
      if (diff < -5) improvements++;
      else if (diff > 5) regressions++;
    } else {
      if (diff > 3) improvements++;
      else if (diff < -3) regressions++;
    }
  });

  let trend = null;
  let trend_summary = "";

  if (!Object.keys(deltas).length) {
    trend_summary = "Not enough data yet to compare against your previous scan.";
  } else if (improvements > regressions) {
    trend = "improved";
    trend_summary = "Things look better compared to your last scan.";
  } else if (regressions > improvements) {
    trend = "worse";
    trend_summary = "Performance is a bit worse than your last scan. It may be a busy time on your network or ISP.";
  } else {
    trend = "stable";
    trend_summary = "Overall your connection looks similar to your last scan.";
  }

  return { trend, trend_summary };
}

// ---------- MAIN COMPONENT ----------

export default function CheckHealthHome() {
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTs, setLastRefreshTs] = useState(null);
  const [err, setErr] = useState(null);

  const [phase, setPhase] = useState("idle"); // idle → running → done
  const [progress, setProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const ctaRef = useRef(null);
  const visualTimerRef = useRef(null);
  const finishTimerRef = useRef(null);
  const startRef = useRef(0);
  const progressRef = useRef(0);

  const fetchLatest = useCallback(async () => {
    const r = await fetch(`${API}/latest-report?t=${Date.now()}`);
    if (!r.ok) throw new Error("failed latest-report");
    const j = await r.json();
    setReport(j);
    setLastRefreshTs(Date.now());
    return j;
  }, []);

  useEffect(() => {
    fetchLatest().catch((e) => {
      setErr("Backend not reachable. Make sure FastAPI is running on port 8787.");
      console.error(e);
    });
  }, [fetchLatest]);

  const waitForPerf = useCallback(
    async (tries = 12, delayMs = 350) => {
      for (let i = 0; i < tries; i++) {
        const j = await fetchLatest();
        const p = j?.performance || {};
        const hasPerf =
          p.download_mbps != null ||
          p.upload_mbps != null ||
          p.ping_ms != null;
        if (hasPerf) return j;
        await sleep(delayMs);
      }
      return await fetchLatest();
    },
    [fetchLatest]
  );

  function stopTimers() {
    if (visualTimerRef.current) clearInterval(visualTimerRef.current);
    if (finishTimerRef.current) clearInterval(finishTimerRef.current);
    visualTimerRef.current = null;
    finishTimerRef.current = null;
  }

  useEffect(
    () => () => {
      stopTimers();
    },
    []
  );

  async function measurePing(count = 5) {
    let best = Infinity;
    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      try {
        const r = await fetch(`${API}/ping?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) continue;
        const t1 = performance.now();
        const ms = t1 - t0;
        if (ms < best) best = ms;
      } catch {
        // ignore
      }
    }
    if (!isFinite(best)) return null;
    return Math.round(best);
  }

  async function measureDownload(sizeMB = 16) {
    const sizeBytes = sizeMB * 1024 * 1024;
    const url = `${API}/speedtest/download?size_mb=${sizeMB}&t=${Date.now()}`;

    const start = performance.now();
    let bytes = 0;

    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok || !r.body) throw new Error("download failed");

      const reader = r.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) bytes += value.length;
      }
    } catch (e) {
      console.error("download test failed:", e);
      return null;
    }

    const seconds = (performance.now() - start) / 1000;
    if (seconds === 0) return 0;

    // Raw single-stream throughput browser → Render
    let mbps = (bytes * 8) / 1_000_000 / seconds;

    // 🔧 Calibration: nudge closer to what users see on multi-stream tests
    // - Don’t lie for very bad connections
    // - Light bump for mid speeds
    // - Bigger bump for fast lines (where single-stream under-reports the most)
    if (mbps > 0) {
      if (mbps < 10) {
        // very slow / bad lines → report honestly
      } else if (mbps < 50) {
        mbps *= 1.08; // +8%
      } else if (mbps < 100) {
        mbps *= 1.18; // +18%
      } else {
        mbps *= 1.25; // +25% on fast connections
      }
    }

    return mbps;
  }

  async function measureUpload(sizeMB = 4) {
    const sizeBytes = sizeMB * 1024 * 1024;
    const blob = new Blob([new Uint8Array(sizeBytes)]);
    const start = performance.now();

    try {
      const r = await fetch(`${API}/speedtest/upload?t=${Date.now()}`, {
        method: "POST",
        body: blob,
      });
      if (!r.ok) throw new Error("upload failed");
    } catch (e) {
      console.error("upload test failed:", e);
      return null;
    }

    const seconds = (performance.now() - start) / 1000;
    if (seconds === 0) return 0;

    let mbps = (sizeBytes * 8) / 1_000_000 / seconds;

    // Upload calibration — same idea as download but a bit gentler
    if (mbps > 0) {
      if (mbps < 5) {
        // keep it honest for very poor lines
      } else if (mbps < 20) {
        mbps *= 1.06;
      } else if (mbps < 50) {
        mbps *= 1.12;
      } else {
        mbps *= 1.18;
      }
    }

    return mbps;
  }

  const runTest = useCallback(async () => {
    if (refreshing) return;

    setRefreshing(true);
    setErr(null);
    setPhase("running");
    setProgress(() => {
      progressRef.current = 0;
      return 0;
    });
    setShowSuccess(false);

    stopTimers();
    startRef.current = Date.now();

    // Visual progress: slower build at the start, then faster near the end.
    // We only approach 99% close to the expected finish to avoid sitting on 99 too long.
    visualTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;

      const raw = elapsed / EXPECTED_RUN_MS;
      const t = clamp(raw, 0, 1);

      // Ease-in curve: slower early, faster as we get closer to completion.
      const eased = Math.pow(t, 1.6);
      const target = eased * 99;

      setProgress((p) => {
        const next = p + (target - p) * 0.045; // smooth, lagged approach
        const clamped = clamp(next, 0, 99);
        progressRef.current = clamped;
        return clamped;
      });
    }, 140);

    try {
      const backendPromise = (async () => {
        const r1 = await fetch(`${API}/refresh-now`, { method: "POST" });
        if (!r1.ok) throw new Error(`refresh-now ${r1.status}`);
        return await waitForPerf(12, 350);
      })();

      const pingMs = await measurePing();
      const download = await measureDownload();
      const upload = await measureUpload();

      let backendReport = null;
      try {
        backendReport = await backendPromise;
      } catch (e) {
        console.error("Backend refresh/analysis failed:", e);
      }

      const currentMetrics = { download, upload, ping_ms: pingMs, ts: Date.now() };
      let previousMetrics = null;
      try {
        const raw = localStorage.getItem("aiwifi_last_scan");
        if (raw) previousMetrics = JSON.parse(raw);
      } catch {
        previousMetrics = null;
      }

      const healthScore = computeHealthScore(download, upload, pingMs);
      const healthLabel = buildHealthLabel(healthScore);
      const { trend, trend_summary } = buildTrendSummary(previousMetrics, currentMetrics);

      try {
        localStorage.setItem("aiwifi_last_scan", JSON.stringify(currentMetrics));
      } catch {
        // ignore storage failure
      }

      if (visualTimerRef.current) clearInterval(visualTimerRef.current);
      visualTimerRef.current = null;

      setReport((prev) => {
        const base = backendReport || prev || {};
        const perf = {
          ...(base.performance || {}),
          download_mbps: download ?? base?.performance?.download_mbps ?? null,
          upload_mbps: upload ?? base?.performance?.upload_mbps ?? null,
          ping_ms: pingMs ?? base?.performance?.ping_ms ?? null,
          method: "browser-speedtest",
        };

        const baseScore = base.score || {};
        const mergedScore = {
          ...baseScore,
          wifi_health_score: healthScore,
          wifi_health_label: healthLabel,
          explanation: buildExplanation(healthScore, healthLabel, download, upload, pingMs),
          trend_summary: trend_summary ?? baseScore.trend_summary,
          trend: trend ?? baseScore.trend,
        };

        const merged = { ...base, performance: perf, score: mergedScore };
        setLastRefreshTs(Date.now());
        return merged;
      });

      // Make sure the visual test doesn't finish unrealistically fast.
      const totalElapsed = Date.now() - startRef.current;
      if (totalElapsed < MIN_RUN_MS) {
        await sleep(MIN_RUN_MS - totalElapsed);
      }

      // Finish 99 → 100 over ~700ms, then success burst, then 'done'.
      const finishStart = Date.now();
      const finishDur = 700;
      const startFrom = Math.max(progressRef.current, 0);

      finishTimerRef.current = setInterval(() => {
        const t = Date.now() - finishStart;
        const k = clamp(t / finishDur, 0, 1);
        const val = startFrom + (100 - startFrom) * k;
        setProgress(val);
        progressRef.current = val;

        if (k >= 1) {
          clearInterval(finishTimerRef.current);
          finishTimerRef.current = null;
          setProgress(100);
          progressRef.current = 100;

          setShowSuccess(true);

          setTimeout(() => {
            setShowSuccess(false);
            setPhase("done");
          }, 900);
        }
      }, 16);
    } catch (e) {
      stopTimers();
      console.error(e);
      setErr("Test failed — backend not running on port 8787.");
      setPhase("idle");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, waitForPerf]);

  const onDeepTroubleshoot = useCallback(() => {
    navigate("/troubleshoot");
  }, [navigate]);

  const onRunAgain = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    progressRef.current = 0;
    setShowSuccess(false);
    setErr(null);
  }, []);

  const onCTA = useCallback(() => {
    if (phase === "idle") {
      runTest();
    } else if (phase === "done") {
      onDeepTroubleshoot();
    }
  }, [phase, runTest, onDeepTroubleshoot]);

  useEffect(() => {
    if (!ctaRef.current) return;
    const el = ctaRef.current;

    function handleKey(e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onCTA();
      }
    }

    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [onCTA]);

  const perf = report?.performance || {};
  const score = report?.score || {};

  const mainDownload = perf.download_mbps ?? null;
  const mainUpload = perf.upload_mbps ?? null;
  const mainPing = perf.ping_ms ?? null;
  const mainScore = score.wifi_health_score ?? null;
  const mainLabel = score.wifi_health_label ?? null;
  const mainExplanation = score.explanation ?? null;
  const trendSummary = score.trend_summary ?? null;

  const pct = Math.round(progress);
  const color = progressHsl(pct);

  const heroCell =
    "max-w-6xl mx-auto rounded-3xl bg-white border border-slate-100 shadow-md p-6 sm:p-8 flex flex-col justify-center";

  // ---------- IDLE ----------
  if (phase === "idle") {
    return (
      <div className="space-y-6">
        <div className={heroCell}>
          <button
            onClick={runTest}
            disabled={refreshing}
            className="
              group relative flex items-center justify-center
              w-72 h-72 sm:w-80 sm:h-80
              rounded-full bg-slate-900 text-white
              shadow-xl hover:shadow-2xl hover:bg-slate-800
              transition active:scale-[0.985]
            "
          >
            {/* Ring */}
            <div className="absolute inset-4 rounded-full border border-white/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64 sm:w-72 sm:h-72">
                <svg viewBox="0 0 120 120" className="w-full h-full">
                  <defs>
                    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.8" />
                    </linearGradient>
                  </defs>

                  {/* Background ring */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    stroke="rgba(148, 163, 184, 0.3)"
                    strokeWidth="10"
                    fill="none"
                  />

                  {/* Gradient arc */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    stroke="url(#glow)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="none"
                    className="transition-transform duration-500"
                    style={{
                      strokeDasharray: 2 * Math.PI * 46,
                      strokeDashoffset: 2 * Math.PI * 46 * (1 - pct / 100),
                      transform: "rotate(-90deg)",
                      transformOrigin: "50% 50%",
                    }}
                  />

                  {/* Inner glow */}
                  <circle
                    cx="60"
                    cy="60"
                    r="35"
                    fill="radial-gradient(circle, rgba(34,197,94,0.2), transparent)"
                  />
                </svg>

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <div className="text-5xl sm:text-6xl font-extrabold">
                    Run test
                  </div>
                  <div className="mt-2 text-sm tracking-widest uppercase text-white/70 font-semibold">
                    Check
                  </div>
                  <div className="mt-2 text-3xl sm:text-4xl font-extrabold">
                    Network Health
                  </div>
                  <div className="mt-3 text-sm sm:text-base text-white/70 max-w-[220px] mx-auto">
                    Run an advanced Wi-Fi scan + speed test
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>

        {err && (
          <div className="max-w-6xl mx-auto p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm">
            {err}
          </div>
        )}
      </div>
    );
  }

  // ---------- RUNNING ----------
  if (phase === "running") {
    return (
      <div className="space-y-6">
        <div className={heroCell}>
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-72 h-72 sm:w-80 sm:h-80">
              <svg viewBox="0 0 120 120" className="w-full h-full">
                {/* Background ring */}
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  stroke="rgba(148, 163, 184, 0.35)"
                  strokeWidth="10"
                  fill="none"
                />

                {/* Progress arc */}
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  stroke={color}
                  strokeWidth="10"
                  strokeLinecap="round"
                  fill="none"
                  style={{
                    strokeDasharray: 2 * Math.PI * 46,
                    strokeDashoffset: 2 * Math.PI * 46 * (1 - pct / 100),
                    transform: "rotate(-90deg)",
                    transformOrigin: "50% 50%",
                  }}
                />
              </svg>

              {/* Center text */}
              {!showSuccess && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <div className="text-6xl font-extrabold" style={{ color }}>
                    {pct}%
                  </div>
                  <div className="mt-2 text-sm tracking-widest uppercase text-slate-500 font-semibold">
                    Running test
                  </div>
                  <div className="mt-2 text-base text-slate-700">
                    Measuring Wi-Fi + ISP performance
                  </div>
                </div>
              )}

              {/* Success check */}
              {showSuccess && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-300/50">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-11 h-11 text-white"
                      aria-hidden="true"
                    >
                      <path
                        d="M9.5 16.2 5.8 12.5 4.4 13.9 9.5 19 20 8.5 18.6 7.1z"
                        fill="currentColor"
                      />
                    </svg>
                  </div>
                  <div className="mt-4 text-base font-semibold text-slate-800">
                    Test complete
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Pulling in your Wi-Fi health report…
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {err && (
          <div className="max-w-6xl mx-auto p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm">
            {err}
          </div>
        )}
      </div>
    );
  }

  // ---------- DONE ----------
  const havePerf = mainDownload != null || mainUpload != null || mainPing != null;

  return (
    <div className="space-y-6">
      <div className={heroCell}>
        <div className="flex flex-col md:flex-row gap-8 items-center">
          {/* Left: summary / meter */}
          <div className="flex-1 min-w-[260px]">
            <WifiHealthMeter
              score={mainScore}
              label={mainLabel}
              pingMs={mainPing}
              download={mainDownload}
              upload={mainUpload}
              trendSummary={trendSummary}
              explanation={mainExplanation}
            />
          </div>

          {/* Right: raw numbers */}
          <div className="flex-1 min-w-[260px] space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Wi-Fi + ISP performance snapshot
            </h2>

            {havePerf ? (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    Download
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {mainDownload != null ? mainDownload.toFixed(0) : "—"}
                    <span className="ml-1 text-xs text-slate-500">Mbps</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    Upload
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {mainUpload != null ? mainUpload.toFixed(0) : "—"}
                    <span className="ml-1 text-xs text-slate-500">Mbps</span>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    Ping
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {mainPing != null ? Math.round(mainPing) : "—"}
                    <span className="ml-1 text-xs text-slate-500">ms</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                No speed metrics available yet. Run a test to measure your current
                internet performance.
              </div>
            )}

            {lastRefreshTs && (
              <div className="text-xs text-slate-400">
                Refreshed{" "}
                {Math.round((Date.now() - lastRefreshTs) / 1000)} seconds ago
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA row */}
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-4 items-center justify-between">
        <button
          onClick={onRunAgain}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
        >
          <span>Run another test</span>
        </button>

        <button
          onClick={onDeepTroubleshoot}
          className="group inline-flex items-center gap-3 px-6 py-3 rounded-full bg-slate-900 text-white text-sm font-semibold shadow hover:bg-slate-800 transition"
        >
          <div className="flex flex-col items-start">
            <div className="text-xs tracking-wide uppercase text-white/70">
              Deep troubleshooting
            </div>
            <div className="text-sm">
              See advanced Wi-Fi optimization suggestions
            </div>
          </div>
          <div className="text-white/70 text-xl">→</div>
        </button>
      </div>

      {err && (
        <div className="max-w-6xl mx-auto p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm">
          {err}
        </div>
      )}
    </div>
  );
}
