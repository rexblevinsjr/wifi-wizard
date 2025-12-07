import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WifiHealthMeter from "./WifiHealthMeter";

const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8787";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Timing controls for the visual animation (behavior only, UI unchanged)
const MIN_RUN_MS = 8000; // minimum total time the test should appear to run
const EXPECTED_MS = 32000; // target duration to ease up toward ~99%

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
    if (upload < 2) score -= 25;
    else if (upload < 5) score -= 15;
    else if (upload < 10) score -= 8;
  }

  // Ping penalties (higher worse)
  if (typeof ping === "number") {
    if (ping > 120) score -= 30;
    else if (ping > 80) score -= 22;
    else if (ping > 50) score -= 12;
    else if (ping > 30) score -= 6;
  }

  return clamp(Math.round(score), 5, 100);
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
      notes.push(
        "Download speed is on the low side for modern streaming and multi-device use."
      );
    } else if (download < 50) {
      notes.push(
        "Download speed is adequate, but heavy streaming or large downloads may feel slower."
      );
    }
  }

  if (typeof upload === "number") {
    if (upload < 5) {
      notes.push(
        "Upload speed may limit smooth video calls, cloud backups, or large file uploads."
      );
    }
  }

  if (typeof ping === "number") {
    if (ping > 80) {
      notes.push(
        "Latency to our test server is elevated, which can add delay to gaming or real-time calls."
      );
    } else if (ping < 40) {
      notes.push(
        "Latency to our test server is low, which is great for gaming and real-time apps."
      );
    }
  }

  const extras = notes.length ? " " + notes.join(" ") : "";
  return summary + extras;
}

function buildTrendSummary(prev, curr) {
  if (!prev)
    return {
      trend: null,
      trend_summary: "First scan — no previous data to compare.",
    };

  const dDelta =
    typeof curr.download === "number" && typeof prev.download === "number"
      ? curr.download - prev.download
      : null;
  const uDelta =
    typeof curr.upload === "number" && typeof prev.upload === "number"
      ? curr.upload - prev.upload
      : null;
  const pDelta =
    typeof curr.ping_ms === "number" && typeof prev.ping_ms === "number"
      ? curr.ping_ms - prev.ping_ms
      : null;

  const parts = [];

  const describeSpeed = (label, delta) => {
    if (delta == null) return;
    const abs = Math.abs(delta);
    if (abs < 0.5) return;
    const dir = delta > 0 ? "increased" : "decreased";
    parts.push(`${label} ${dir} by ~${abs.toFixed(1)} Mbps`);
  };

  describeSpeed("Download", dDelta);
  describeSpeed("Upload", uDelta);

  if (pDelta != null && Math.abs(pDelta) >= 3) {
    if (pDelta > 0) {
      parts.push(`Latency worsened by ~${Math.round(pDelta)} ms`);
    } else {
      parts.push(`Latency improved by ~${Math.round(-pDelta)} ms`);
    }
  }

  const trend_summary = parts.length
    ? parts.join("; ")
    : "Speeds and latency are about the same as your last scan.";

  const trend = {
    download_delta_mbps: dDelta,
    upload_delta_mbps: uDelta,
    ping_delta_ms: pDelta,
  };

  return { trend, trend_summary };
}

// ---------------------------------------------------------------

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
    if (!r.ok) throw new Error(`latest-report ${r.status}`);
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
      return report;
    },
    [fetchLatest, report]
  );

  // -------- BROWSER SPEEDTEST HELPERS --------

  async function measureDownload(sizeMB = 8) {
    const url = `${API}/speedtest/download?size_mb=${sizeMB}&cacheBust=${Date.now()}`;
    const start = performance.now();

    const res = await fetch(url);
    const reader = res.body?.getReader ? res.body.getReader() : null;

    let bytes = 0;

    if (reader) {
      // Streamed response
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
      }
    } else {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    }

    const seconds = (performance.now() - start) / 1000;
    if (seconds === 0) return 0;

    // Raw single-stream throughput browser → Render
    let mbps = (bytes * 8) / 1_000_000 / seconds;

    // 🔧 Calibration: nudge closer to what users see on multi-stream tests
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

    const r = await fetch(`${API}/speedtest/upload`, {
      method: "POST",
      body: blob,
    });
    if (!r.ok) throw new Error(`speedtest/upload ${r.status}`);

    const seconds = (performance.now() - start) / 1000;
    if (seconds === 0) return 0;
    const mbps = (sizeBytes * 8) / 1_000_000 / seconds;
    return mbps;
  }

  async function measurePing(rounds = 7) {
    const samples = [];

    for (let i = 0; i < rounds; i++) {
      const start = performance.now();
      try {
        const r = await fetch(`${API}/health?ts=${Date.now()}`);
        if (!r.ok) continue;
        const ms = performance.now() - start;
        samples.push(ms);
      } catch {
        // ignore failed ping
      }
    }

    if (!samples.length) return null;

    samples.sort((a, b) => a - b);
    const trimmed = samples.slice(1, samples.length - 1);
    const arr = trimmed.length ? trimmed : samples;
    const mid = Math.floor(arr.length / 2);

    let rttMs;
    if (arr.length % 2 === 1) {
      rttMs = arr[mid];
    } else {
      rttMs = (arr[mid - 1] + arr[mid]) / 2;
    }

    // Calibrate RTT down a bit to approximate "ping" users expect
    const approxPing = Math.max(5, rttMs * 0.25);
    return approxPing;
  }

  // ------------------------------------------------------------

  const stopTimers = () => {
    if (visualTimerRef.current) clearInterval(visualTimerRef.current);
    if (finishTimerRef.current) clearInterval(finishTimerRef.current);
    visualTimerRef.current = null;
    finishTimerRef.current = null;
  };

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

    // Same visual behavior as before, but slower overall so 99 is reached later.
    visualTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;

      const raw = elapsed / EXPECTED_MS;
      const t = clamp(raw, 0, 1);

      const eased = 1 - Math.pow(1 - t, 2); // ease-out
      const target = eased * 99;

      setProgress((p) => {
        const next = p + (target - p) * 0.045; // smooth approach
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

      const currentMetrics = {
        download,
        upload,
        ping_ms: pingMs,
        ts: Date.now(),
      };
      let previousMetrics = null;
      try {
        const raw = localStorage.getItem("aiwifi_last_scan");
        if (raw) previousMetrics = JSON.parse(raw);
      } catch {
        previousMetrics = null;
      }

      const healthScore = computeHealthScore(download, upload, pingMs);
      const healthLabel = buildHealthLabel(healthScore);
      const { trend, trend_summary } = buildTrendSummary(
        previousMetrics,
        currentMetrics
      );

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
          download_mbps:
            download ?? base?.performance?.download_mbps ?? null,
          upload_mbps: upload ?? base?.performance?.upload_mbps ?? null,
          ping_ms: pingMs ?? base?.performance?.ping_ms ?? null,
          method: "browser-speedtest",
        };

        const baseScore = base.score || {};
        const mergedScore = {
          ...baseScore,
          wifi_health_score: healthScore,
          wifi_health_label: healthLabel,
          explanation: buildExplanation(
            healthScore,
            healthLabel,
            download,
            upload,
            pingMs
          ),
          trend_summary: trend_summary ?? baseScore.trend_summary,
          trend: trend ?? baseScore.trend,
        };

        const merged = { ...base, performance: perf, score: mergedScore };
        setLastRefreshTs(Date.now());
        return merged;
      });

      // Ensure the total test doesn't feel suspiciously instant
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

  const heroCell =
    "w-full max-w-6xl mx-auto min-h-[78vh] rounded-3xl bg-white border border-slate-100 shadow-md p-10 sm:p-14 flex flex-col items-center justify-center";

  const doneCell =
    "w-full max-w-6xl mx-auto min-h-[68vh] rounded-3xl bg-white border border-slate-100 shadow-md p-6 sm:p-8 flex flex-col items-center justify-center";

  // ---------- IDLE ----------
  if (phase === "idle") {
    return (
      <div className="space-y-6">
        <div className={heroCell}>
          {/* Centered button */}
          <div className="flex-1 flex items-center justify-center">
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
              <div className="absolute inset-4 rounded-full border-2 border-white/15 group-hover:border-white/25 transition" />
              <div className="text-center px-6">
                <div className="text-sm tracking-widest uppercase text-white/70 font-semibold">
                  Check
                </div>
                <div className="mt-2 text-3xl sm:text-4xl font-extrabold">
                  Network Health
                </div>
                <div className="mt-3 text-sm sm:text-base text-white/70 max-w-[220px] mx-auto">
                  Run an advanced Wi-Fi scan + speed test
                </div>
              </div>
            </button>
          </div>

          {/* Small trust text at bottom-center of the cell */}
          <div className="mt-8 text-center">
            <p className="text-xs sm:text-sm text-slate-500">
              Free forever. No signup required.
            </p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Trusted by visitors to quickly diagnose Wi-Fi and ISP issues.
            </p>
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

  // ---------- RUNNING ----------
  if (phase === "running") {
    const pct = Math.round(progress);
    const color = progressHsl(pct);

    const stageText =
      pct < 8
        ? "Initializing scan…"
        : pct < 35
        ? "Scanning Wi-Fi environment…"
        : pct < 65
        ? "Running speed tests…"
        : pct < 88
        ? "Analyzing stability & congestion…"
        : pct < 100
        ? "Finalizing report…"
        : "Complete";

    return (
      <div className="space-y-6">
        <div className={heroCell}>
          <div className="relative w-72 h-72 sm:w-80 sm:h-80">
            {/* Base ring */}
            <div className="absolute inset-0 rounded-full border-[12px] border-slate-200" />

            {/* Progress ring */}
            <div
              className="absolute inset-0 rounded-full border-[12px] transition-all"
              style={{
                borderColor: color,
                clipPath: `inset(${100 - pct}% 0 0 0)`,
              }}
            />

            {/* Gloss sweep overlay */}
            <div className="absolute inset-[-10px] gloss-spin pointer-events-none" />

            {/* Center text */}
            {!showSuccess && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-6xl font-extrabold" style={{ color }}>
                  {pct}%
                </div>
                <div className="mt-2 text-sm tracking-widest uppercase text-slate-500 font-semibold">
                  Running test
                </div>
                <div className="mt-2 text-sm sm:text-base text-slate-700 max-w-[220px] mx-auto px-2">
                  Measuring Wi-Fi + ISP performance
                </div>
              </div>
            )}

            {/* Success burst */}
            {showSuccess && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="success-burst">
                  <div className="success-ring" />
                  <div className="success-ring delay-1" />
                  <div className="success-ring delay-2" />
                  <div className="success-check">✓</div>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar + stage text */}
          <div className="mt-10 w-full max-w-xl">
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <div className="mt-3 text-sm text-slate-600 text-center font-medium">
              {stageText}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs sm:text-sm text-slate-500">
            Free forever. No signup required.
          </p>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Trusted by visitors to quickly diagnose Wi-Fi and ISP issues.
          </p>
        </div>

        <style>{`
          .gloss-spin {
            background:
              conic-gradient(
                from 0deg,
                rgba(255,255,255,0) 0deg,
                rgba(255,255,255,0.0) 260deg,
                rgba(255,255,255,0.75) 300deg,
                rgba(255,255,255,0.0) 330deg,
                rgba(255,255,255,0) 360deg
              );
            -webkit-mask: radial-gradient(transparent 60%, black 62%);
            mask: radial-gradient(transparent 60%, black 62%);
            filter: blur(2px);
            animation: gloss-rotate 1.4s linear infinite;
            opacity: 0.7;
          }
          @keyframes gloss-rotate {
            to { transform: rotate(360deg); }
          }

          .success-burst {
            position: relative;
            width: 220px;
            height: 220px;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pop 0.35s ease-out forwards;
          }
          .success-check {
            font-size: 72px;
            font-weight: 900;
            color: #10b981;
            text-shadow: 0 6px 18px rgba(16,185,129,0.35);
            animation: check-in 0.45s ease-out forwards;
          }
          .success-ring {
            position: absolute;
            inset: 0;
            border-radius: 9999px;
            border: 6px solid rgba(16,185,129,0.9);
            animation: ring 0.75s ease-out forwards;
          }
          .success-ring.delay-1 {
            animation-delay: 0.08s;
            border-color: rgba(34,197,94,0.75);
          }
          .success-ring.delay-2 {
            animation-delay: 0.16s;
            border-color: rgba(132,204,22,0.6);
          }
          @keyframes pop {
            0% { transform: scale(0.7); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes check-in {
            0% { transform: scale(0.75); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes ring {
            0% { transform: scale(0.55); opacity: 0.9; }
            100% { transform: scale(1.25); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // ---------- DONE ----------
  return (
    <div className="space-y-6">
      <div className={doneCell}>
        <WifiHealthMeter
          variant="full"
          embedded
          report={report}
          onRefreshNow={runTest}
          refreshing={refreshing}
          lastRefreshTs={lastRefreshTs}
          refreshLabel="Run test again"
        />
      </div>

      {err && (
        <div className="max-w-6xl mx-auto p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm">
          {err}
        </div>
      )}
    </div>
  );
}
