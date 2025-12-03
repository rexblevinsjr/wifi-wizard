import React, { useState } from "react";
import { Link } from "react-router-dom";

const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8787";

export default function UpgradePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error

  async function handleJoinEarlyAccess(e) {
    e.preventDefault();
    if (!email || status === "submitting") return;

    setStatus("submitting");
    try {
      const res = await fetch(`${API}/early-access/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          source: "upgrade_page",
        }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      setStatus("success");
      setEmail("");
    } catch (err) {
      console.error("Early access signup failed:", err);
      setStatus("error");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-3xl bg-white border border-slate-100 shadow-sm">
      <div className="text-sm space-y-4">
        <h1 className="text-2xl font-extrabold text-slate-900">
          Unlock Monitor + Troubleshoot
        </h1>

        <p className="text-slate-700">
          Upgrade to Pro and get access to live monitoring, deeper performance
          analytics, and a virtual network technician that helps diagnose and
          resolve issues fast. Early Access pricing is locked in permanently for
          all subscribers who join before launch.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="font-semibold text-slate-900">PRO Monthly</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              $7.99
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Early Access · Lifetime price lock

            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="font-semibold text-slate-900">PRO Yearly</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              $79
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Early Access · 2 months free · Lifetime price lock
            </div>
          </div>
        </div>

        {/* Early Access signup form */}
        <form onSubmit={handleJoinEarlyAccess} className="space-y-2 mt-2">
          <label className="block text-xs font-semibold text-slate-700">
            Join the Early Access list
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
            <button
              type="submit"
              disabled={!email || status === "submitting"}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {status === "submitting" ? "Joining..." : "Join Early Access"}
            </button>
          </div>

          {status === "success" && (
            <p className="text-xs text-emerald-600">
              You’re on the list! We’ll email you when Pro goes live.
            </p>
          )}
          {status === "error" && (
            <p className="text-xs text-rose-600">
              Something went wrong. Please try again in a moment.
            </p>
          )}
        </form>

        <p className="text-xs text-slate-500 mt-4 leading-relaxed">
  Payments are not enabled yet. Early Access subscribers will keep this
  discounted pricing permanently when billing goes live.
</p>

        <Link
          to="/"
          className="inline-block text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          Back to free test
        </Link>
      </div>
    </div>
  );
}
