import React, { useState } from "react";
import CheckHealthHome from "./CheckHealthHome";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  const saveEmail = (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;

    try {
      const list = JSON.parse(localStorage.getItem("early_access_emails") || "[]");
      if (!list.includes(v)) list.push(v);
      localStorage.setItem("early_access_emails", JSON.stringify(list));
    } catch {}

    setSaved(true);
    setEmail("");
  };

  return (
    <div className="space-y-8">

      {/* TOP SECTION: main scan */}
      <section className="relative">
        <CheckHealthHome />
      </section>

      {/* PRO coming soon + email capture */}
      <section className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

          {/* Left side */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Wi-Fi Wizard PRO coming soon
            </h1>

            <p className="mt-2 text-slate-700 text-sm sm:text-base">
              PRO will unlock continuous live monitoring, outage reports, health tracking, and guided network fixes.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                Live graphs
              </div>
              <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                Auto speed tests
              </div>
              <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                Network health alerts
              </div>
              <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                Virtual tech support
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="rounded-2xl border border-slate-200 p-5 bg-slate-50">
            <div className="text-sm font-semibold text-slate-900">
              Get early access
            </div>

            <div className="text-xs text-slate-600 mt-1">
              Drop your email and I’ll notify you when Wi-Fi Wizard PRO goes live
              with monitoring, outage tracking, and guided fixes.
            </div>

            <form onSubmit={saveEmail} className="mt-3 flex gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm outline-none
                           focus:ring-2 focus:ring-slate-900/10"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-sm font-semibold
                           hover:bg-slate-100 transition"
              >
                Notify me
              </button>
            </form>

            {saved && (
              <div className="mt-2 text-xs text-emerald-700 font-semibold">
                Saved. Thanks!
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
