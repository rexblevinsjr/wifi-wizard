import React, { useState } from "react";
import WifiHealthMeter from "./WifiHealthMeter";
import ScoreTrendChart from "./ScoreTrendChart";
import PerfTrendChart from "./PerfTrendChart";
import OutageCharts from "./OutageCharts";

export default function PaidDashboard({
  latestReport,
  historySeries,
  historyDaily,
  onRefreshNow,
  onTroubleshootNow,
  status
}) {
  const [showTroubleshootDetails, setShowTroubleshootDetails] = useState(false);

  // Optional chat UI (local-only for now)
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Ask me anything about your Wi-Fi after troubleshooting." }
  ]);

  const scoreSeries = historySeries?.score_series || [];
  const perfSeries = historySeries?.perf_series || [];
  const outageEvents = historySeries?.outage_events || [];
  const daily = historyDaily?.daily || [];
  const lastDaily = daily.length ? daily[daily.length - 1] : null;

  const handleTroubleshoot = async () => {
    setShowTroubleshootDetails(true);
    await onTroubleshootNow?.();
  };

  const detailedDiagnosis = latestReport?.diagnosis;
  const problems = latestReport?.problems || [];
  const fixes = latestReport?.fixes || [];

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    const newMsgs = [
      ...messages,
      { role: "user", content: chatInput.trim() },
      {
        role: "assistant",
        content:
          "(Chat wiring coming next) — for now this is placeholder UI. We'll connect it to your agent endpoint."
      }
    ];
    setMessages(newMsgs);
    setChatInput("");
  };

  return (
    <div className="space-y-6">
      {/* Header + CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Wi-Fi Dashboard</div>
          <div className="text-sm text-slate-500">
            Live health + performance monitoring.
          </div>
        </div>

        <button
          onClick={handleTroubleshoot}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:opacity-90 transition"
        >
          {status === "loading" ? "Troubleshooting…" : "Troubleshoot now"}
        </button>
      </div>

      {/* MAIN HEALTH CELL */}
      <WifiHealthMeter report={latestReport} onRefreshNow={onRefreshNow} />

      {/* DAILY SNAPSHOT (separate section) */}
      <div className="p-4 rounded-xl bg-white border border-slate-100">
        <div className="text-sm font-semibold text-slate-900 mb-1">
          Daily Snapshot
        </div>
        {!lastDaily ? (
          <div className="text-slate-500 text-sm">
            Not enough history yet. Let the agent run longer.
          </div>
        ) : (
          <div className="grid sm:grid-cols-4 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">Avg score</div>
              <div className="text-lg font-semibold text-slate-900">
                {lastDaily.avg_wifi_health_score ?? "—"}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">Outage minutes</div>
              <div className="text-lg font-semibold text-slate-900">
                {lastDaily.outage_minutes ?? 0}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">Best hour</div>
              <div className="text-lg font-semibold text-slate-900">
                {lastDaily.best_hour ?? "—"}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="text-xs text-slate-500">Worst hour</div>
              <div className="text-lg font-semibold text-slate-900">
                {lastDaily.worst_hour ?? "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CHARTS */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ScoreTrendChart data={scoreSeries} />
        <PerfTrendChart data={perfSeries} />
      </div>

      <OutageCharts daily={daily} events={outageEvents} />

      {/* TROUBLESHOOT DETAILS — only after button click */}
      {showTroubleshootDetails && (
        <div className="p-4 rounded-xl bg-white border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Troubleshoot Results
            </div>
            <button
              onClick={() => setShowChat(v => !v)}
              className="text-sm font-semibold text-slate-900 underline underline-offset-4"
            >
              {showChat ? "Hide chat" : "Chat with agent"}
            </button>
          </div>

          {detailedDiagnosis && (
            <div className="text-sm text-slate-700">
              {typeof detailedDiagnosis === "string"
                ? detailedDiagnosis
                : JSON.stringify(detailedDiagnosis)}
            </div>
          )}

          {!!problems.length && (
            <>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Problems
              </div>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {problems.map((p, i) => (
                  <li key={i}>
                    {typeof p === "string"
                      ? p
                      : (p.description || p.issue || JSON.stringify(p))}
                  </li>
                ))}
              </ul>
            </>
          )}

          {!!fixes.length && (
            <>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Fixes
              </div>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {fixes.map((f, i) => (
                  <li key={i}>
                    {typeof f === "string"
                      ? f
                      : (f.reason || f.recommendation || JSON.stringify(f))}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* OPTIONAL CHAT PANEL (placeholder now) */}
          {showChat && (
            <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="space-y-2 max-h-64 overflow-auto pr-1 text-sm">
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                    <span
                      className={
                        m.role === "user"
                          ? "inline-block bg-slate-900 text-white px-3 py-2 rounded-xl"
                          : "inline-block bg-white border border-slate-200 px-3 py-2 rounded-xl"
                      }
                    >
                      {m.content}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about your Wi-Fi…"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
                />
                <button
                  onClick={sendMessage}
                  className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
