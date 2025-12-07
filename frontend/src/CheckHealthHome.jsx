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

function formatMbps(x) {
  if (x == null || isNaN(x)) return "—";
  return `${x.toFixed(1)} Mbps`;
}

function formatMs(x) {
  if (x == null || isNaN(x)) return "—";
  return `${x.toFixed(0)} ms`;
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
      "Your connection looks solid overall and should be fine for most streaming, browsing, and video calls.";
  } else if (score >= 55) {
    summary =
      "Your connection is usable but may struggle with heavier activities like HD streaming, gaming, or multiple users at once.";
  } else {
    summary =
      "Your connection is underperforming and likely feels slow or inconsistent, especially under load or with multiple devices.";
  }

  const notes = [];

  if (download != null) {
    if (download < 10) {
      notes.push(
        "Download speed is very low and may cause long buffering, slow downloads, and page load delays."
      );
    } else if (download < 50) {
      notes.push(
        "Download speed is modest and may struggle with higher-quality streaming or many devices."
      );
    } else {
      notes.push(
        "Download speed looks strong for most everyday tasks, streaming, and downloads."
      );
    }
  }

  if (upload != null) {
    if (upload < 5) {
      notes.push(
        "Upload speed is limited, which can hurt video calls, cloud backups, and sending large files."
      );
    } else if (upload < 15) {
      notes.push(
        "Upload speed is adequate for most calls and light content sharing."
      );
    } else {
      notes.push(
        "Upload speed looks strong for video calls, cloud sync, and content creation."
      );
    }
  }

  if (ping != null) {
    if (ping > 80) {
      notes.push(
        "Latency to our test server is high, which can make online games and calls feel laggy."
      );
    } else if (ping > 40) {
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
  if (!prev) {
    return "This is your first scan, so we’ll track changes from here.";
  }

  const delta = curr - prev;
  if (Math.abs(delta) < 3) {
    return "Your Wi-Fi health is about the same as your last scan.";
  }
  if (delta > 0) {
    return "Your Wi-Fi health looks improved compared to your last scan.";
  }
  return "Your Wi-Fi health has dropped since your last scan and may feel less stable.";
}

const heroCell =
  "relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 sm:p-8 flex flex-col items-center shadow-[0_18px_45px_rgba(15,23,42,0.12)]";

export default function CheckHealthHome() {
  const navigate = useNavigate();

  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const [stageText, setStageText] = useState("Ready when you are.");
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);

  const [results, setResults] = useState(null);
  const [prevScore, setPrevScore] = useState(null);
  const [lastRefreshTs, setLastRefreshTs] = useState(null);

  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchLastResult() {
      try {
        const res = await fetch(`${API}/last-result`);
        if (!res.ok) return;

        const data = await res.json();
        if (cancelled || !data) return;

        if (data.wifi_health_score != null) {
          setPrevScore(data.wifi_health_score);
        }

        if (data.created_at) {
          setLastRefreshTs(data.created_at);
        }
      } catch (e) {
        // ignore
      }
    }

    fetchLastResult();
    return () => {
      cancelled = true;
    };
  }, []);

  const runTest = useCallback(async () => {
    if (refreshing) return;
    setErr(null);
    setRefreshing(true);
    setShowSuccess(false);

    progressRef.current = 0;
    setProgress(0);

    setStageText("Checking connection, latency, and routing...");
    const startedAt = Date.now();
    let running = true;

    (async () => {
      while (running) {
        const elapsed = Date.now() - startedAt;

        const base = Math.min(elapsed / EXPECTED_MS, 1);
        const eased = base < 0.7 ? base * 0.85 : 0.85 + (base - 0.7) * 0.25;

        const target =
          base >= 1
            ? 99
            : Math.min(99, 5 + eased * 90 + Math.sin(elapsed / 800) * 2);

        const clamped = clamp(target, progressRef.current, 99);

        setProgress((p) => {
          progressRef.current = clamped;
          return clamped;
        });

        if (elapsed > MIN_RUN_MS && progressRef.current > 70) {
          setStageText("Measuring download speeds and stability...");
        }
        if (elapsed > MIN_RUN_MS + 4000 && progressRef.current > 85) {
          setStageText("Measuring upload, jitter, and consistency...");
        }
        if (elapsed > MIN_RUN_MS + 9000 && progressRef.current > 92) {
          setStageText("Wrapping up your Wi-Fi + ISP health analysis...");
        }

        await sleep(220);
      }
    })();

    try {
      const res = await fetch(`${API}/run-test`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Test failed — backend not running on port 8787.`);
      }

      const data = await res.json();

      const now = Date.now();
      const elapsed = now - startedAt;
      const remaining = Math.max(MIN_RUN_MS - elapsed, 0);

      if (remaining > 0) {
        await sleep(remaining);
      }

      running = false;

      setProgress(() => {
        progressRef.current = 100;
        return 100;
      });

      setStageText("Done! Finalizing your results...");
      await sleep(800);

      const {
        download_mbps,
        upload_mbps,
        ping_ms,
        score,
        created_at,
        prev_score: serverPrev,
      } = data;

      const finalScore = score != null ? score : 0;
      const label = buildHealthLabel(finalScore);
      const explanation = buildExplanation(
        finalScore,
        label,
        download_mbps,
        upload_mbps,
        ping_ms
      );
      const trend_summary = buildTrendSummary(
        serverPrev ?? prevScore,
        finalScore
      );

      const resultPayload = {
        download_mbps,
        upload_mbps,
        ping_ms,
        wifi_health_score: finalScore,
        wifi_health_label: label,
        explanation,
        trend_summary,
        created_at,
      };

      setResults(resultPayload);
      setPrevScore(finalScore);
      if (created_at) setLastRefreshTs(created_at);

      setShowSuccess(true);
      await sleep(1500);
      setStageText("Tap below to see your full Wi-Fi health report.");
    } catch (e) {
      running = false;
      setErr(
        e?.message ||
          "Something went wrong running the test. Please try again in a moment."
      );
      setStageText("The test did not complete. Please try again.");
      setProgress(() => {
        progressRef.current = 0;
        return 0;
      });
    } finally {
      running = false;
      setRefreshing(false);
    }
  }, [refreshing, prevScore]);

  const handleViewDetails = useCallback(() => {
    navigate("/troubleshoot", { state: { results } });
  }, [navigate, results]);

  const pct = Math.round(progress);
  const color = progressHsl(pct);

  const hasResult = !!results;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
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
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-sky-500/20 via-emerald-400/10 to-sky-500/30 blur-3xl opacity-80" />

              <div className="relative w-60 h-60 sm:w-64 sm:h-64 rounded-full bg-slate-950 shadow-inner flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 radial-fade pointer-events-none" />

                {/* Outer static ring */}
                <div className="absolute inset-2 rounded-full border-[10px] border-slate-800" />

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
            </button>
          </div>

          {/* Progress bar + stage text below the centered circle */}
          <div className="mt-4 w-full max-w-xl">
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

          {/* Trust text inside the cell, same position as idle */}
          <div className="mt-8 text-center">
            <p className="text-xs sm:text-sm text-slate-500">
              We run short, focused tests against our own measurement servers to
              estimate real-world Wi-Fi + ISP performance. Results may differ
              slightly from other tools, but the goal is to help you understand
              how your network actually feels.
            </p>
          </div>
        </div>

        {/* Results + Wi-Fi health meter (unchanged layout) */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)] items-start">
          <div className="rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 sm:p-8 shadow-[0_14px_35px_rgba(15,23,42,0.10)] space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                  Speed & latency snapshot
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Instant view of your current connection performance.
                </p>
              </div>
              <button
                onClick={runTest}
                disabled={refreshing}
                className="text-xs sm:text-sm font-medium text-sky-600 hover:text-sky-700 disabled:opacity-50"
              >
                {refreshing ? "Running test…" : "Run test again"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-6">
              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  Download
                </div>
                <div className="text-lg sm:text-2xl font-semibold text-slate-900">
                  {hasResult
                    ? formatMbps(results.download_mbps)
                    : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  How quickly you can pull data from the internet (streaming,
                  browsing, downloads).
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  Upload
                </div>
                <div className="text-lg sm:text-2xl font-semibold text-slate-900">
                  {hasResult
                    ? formatMbps(results.upload_mbps)
                    : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  How quickly you can send data out (video calls, cloud
                  backups, content uploads).
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  Ping
                </div>
                <div className="text-lg sm:text-2xl font-semibold text-slate-900">
                  {hasResult
                    ? formatMs(results.ping_ms)
                    : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  How long it takes your data to reach our test server and come
                  back (responsiveness).
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleViewDetails}
                disabled={!hasResult}
                className="inline-flex items-center px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-medium shadow hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                View full Wi-Fi health report
              </button>
            </div>
          </div>

          <WifiHealthMeter
            results={results}
            prevScore={prevScore}
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
    </div>
  );
}
