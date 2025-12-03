import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import LandingPage from "./LandingPage";
import CheckHealthHome from "./CheckHealthHome";
import MonitorNetwork from "./MonitorNetwork";
import TroubleshootPage from "./TroubleshootPage";
import UpgradePage from "./UpgradePage";

// Temporary plan flag while we don't have real auth/billing wired up.
// Change this to "pro" or "business" to simulate paid access.
const PLAN = "free";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        {/* Top header */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            {/* Brand / Home button */}
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-slate-900 text-white grid place-items-center font-black">
                W
              </div>
              <div className="font-extrabold tracking-tight text-slate-900">
                Wi-Fi Wizard
              </div>
            </Link>

            {/* Nav Links */}
            <nav className="flex items-center gap-2">
              <Link
                to="/upgrade"
                className="px-3 py-2 rounded-lg text-sm font-semibold
                           text-white bg-slate-900 hover:bg-slate-800 transition"
              >
                Go PRO
              </Link>
            </nav>
          </div>
        </header>

        {/* Main routes */}
        <main className="px-4 sm:px-6 py-6">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/test" element={<CheckHealthHome />} />

            {/* Gated routes: Free → Upgrade, Pro/Business → real pages */}
            <Route
              path="/monitor"
              element={PLAN === "free" ? <UpgradePage /> : <MonitorNetwork />}
            />
            <Route
              path="/troubleshoot"
              element={
                PLAN === "free" ? <UpgradePage /> : <TroubleshootPage />
              }
            />

            <Route path="/upgrade" element={<UpgradePage />} />

            {/* Fallback */}
            <Route
              path="*"
              element={
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <h2 className="text-xl font-bold">Page not found</h2>
                  <p className="mt-2 text-slate-700">
                    Try going back to the home page.
                  </p>
                  <Link
                    to="/"
                    className="inline-block mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold"
                  >
                    Home
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
