import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WifiHealthMeter from "./WifiHealthMeter";

const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8787";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function progressHsl(pct) {
  const hue =
    pct < 50 ? (pct / 50) * 55 : 55 + ((pct - 50) / 50) * 65; // red→yellow→green
  return `hsl(${hue}, 85%, 45%)`;
}

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

  // wait until performance fields exist (poll after refresh)
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

  // -------- BROWSER SPEEDTEST HELPERS (no UI changes) --------

  async function measureDownload(sizeMB = 8) {
    const url = `${API}/speedtest/download?size_mb=${sizeMB}&cacheBust=${Date.now()}`;
    const start = performance.now();

    const res = await fetch(url);
    const reader = res.body?.getReader
      ? res.body.getReader()
      : null;

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
      // Fallback for environments without streaming support
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    }

    const seconds = (performance.now() - start) / 1000;
    if (seconds === 0) return 0;
    const mbps = (bytes * 8) / 1_000_000 / seconds; // megabits/sec
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

  async function measurePing(rounds = 5) {
    let total = 0;
    let successCount = 0;

    for (let i = 0; i < rounds; i++) {
      const start = performance.now();
      try {
        const r = await fetch(`${API}/health?ts=${Date.now()}`);
        if (!r.ok) continue;
        total += performance.now() - start;
        successCount += 1;
      } catch {
        // ignore failed ping
      }
    }

    if (successCount === 0) {
      return null;
    }
    return total / successCount;
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

    // Visual progress ramps honestly to ~99% while backend + browser tests run
    visualTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;

      // Slower overall climb so it matches a "real" test more closely.
      const expectedMs = 22000; // 22s soft expectation
      const raw = elapsed / expectedMs;

      // Clamp a normalized 0–1 progress
      const t = clamp(raw, 0, 1);

      // Ease-out curve
      const eased = 1 - Math.pow(1 - t, 2);

      // Map eased 0–1 → 0–99
      const target = eased * 99;

      setProgress((p) => {
        const next = p + (target - p) * 0.045;
        const clamped = clamp(next, 0, 99);
        progressRef.current = clamped;
        return clamped;
      });
    }, 140);

    try {
      // Kick off backend refresh + AI/analysis in parallel
      const backendPromise = (async () => {
        const r1 = await fetch(`${API}/refresh-now`, { method: "POST" });
        if (!r1.ok) throw new Error(`refresh-now ${r1.status}`);

        // This still lets backend do its thing (AI overview, history, etc.)
        // We will ignore its speed numbers and overwrite them with browser ones.
        return await waitForPerf(12, 350);
      })();

      // Browser-based measurements (user’s real connection)
      const pingMs = await measurePing();
      const download = await measureDownload();
      const upload = await measureUpload();

      let backendReport = null;
      try {
        backendReport = await backendPromise;
      } catch (e) {
        console.error("Backend refresh/analysis failed:", e);
      }

      // Stop visual loop at this point; we’ll run the “finish to 100%” segment.
      if (visualTimerRef.current) clearInterval(visualTimerRef.current);
      visualTimerRef.current = null;

      // Merge: keep backend AI + history + scores, override speed test numbers
      setReport((prev) => {
        const base = backendReport || prev || {};
        const perf = {
          ...(base.performance || {}),
          download_mbps: download ?? base?.performance?.download_mbps ?? null,
          upload_mbps: upload ?? base?.performance?.upload_mbps ?? null,
          ping_ms: pingMs ?? base?.performance?.ping_ms ?? null,
          method: "browser-speedtest",
        };
        const merged = { ...base, performance: perf };
        setLastRefreshTs(Date.now());
        return merged;
      });

      // finish to 100 over ~700ms, then burst, then swap to done
      const finishStart = Date.now();
      const finishDur = 700;
      const startFrom = Math.max(progressRef.current, 0); // wherever we actually are

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

  // sizes
  const heroCell =
    "w-full max-w-6xl mx-auto min-h-[78vh] rounded-3xl bg-white border border-slate-100 shadow-md p-10 sm:p-14 flex flex-col items-center justify-center";
  const doneCell =
    "w-full max-w-6xl mx-auto rounded-3xl bg-white border border-slate-100 shadow-md p-6 sm:p-8 flex flex-col justify-center";

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
      pct < 8 ? "Initializing scan…" :
      pct < 35 ? "Scanning Wi-Fi environment…" :
      pct < 65 ? "Running speed tests…" :
      pct < 88 ? "Analyzing stability & congestion…" :
      pct < 100 ? "Finalizing report…" :
      "Complete";

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

            {/* ✅ Gloss sweep overlay (always active) */}
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
                <div className="mt-2 text-base text-slate-700">
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

        <style>{`
          /* --- Gloss Sweep (always active) --- */
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

          /* --- Success Burst --- */
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

      {/* CTA buttons */}
      <div
        ref={ctaRef}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-6xl mx-auto"
      >
        <button
          onClick={() => navigate("/monitor")}
          className="
            group w-full rounded-2xl border border-slate-300 bg-white
            px-5 py-5 shadow-sm hover:shadow-md hover:border-slate-400
            transition flex items-center gap-4 text-left
          "
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <span className="text-xl">📡</span>
          </div>
          <div className="flex-1">
            <div className="text-lg font-extrabold text-slate-900">
              Live Monitor
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Track stability and real-time Wi-Fi metrics.
            </div>
          </div>
          <div className="text-slate-400 text-xl">→</div>
        </button>

        <button
          onClick={() => navigate("/troubleshoot")}
          className="
            group w-full rounded-2xl border border-slate-900 bg-slate-900 text-white
            px-5 py-5 shadow-sm hover:shadow-md hover:bg-slate-800
            transition flex items-center gap-4 text-left
          "
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
            <span className="text-xl">🛠️</span>
          </div>
          <div className="flex-1">
            <div className="text-lg font-extrabold">Fix My Wi-Fi</div>
            <div className="mt-1 text-sm text-white/80">
              Step-by-step diagnosis & guided fixes.
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
