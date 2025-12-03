import React, { useEffect, useRef, useState } from "react";

/**
 * Professional tech-support chat UI that hits POST /chat
 * Falls back if backend/OpenAI isn't running.
 * ✅ Bulletproof against backend returning objects.
 * ✅ DOES NOT auto-scroll on initial mount.
 * ✅ Auto-scrolls only after new messages are added.
 */
export default function ChatTroubleshooter({
  apiBase,
  profile,
  latestReport,
  disableAutoScroll = false, // optional override if you ever want it off
}) {
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        "Hi — I’m your Wi-Fi support assistant. I’ll review your diagnostic and help you fix this step-by-step. What issue are you seeing right now?",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef(null);
  const didMountRef = useRef(false);

  // Safely render ANY value as text
  const safeText = (val) => {
    if (val == null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) return val.map(safeText).filter(Boolean).join("\n");
    if (typeof val === "object") {
      const parts = [];
      if (val.explanation) parts.push(val.explanation);
      if (val.trend_summary) parts.push(val.trend_summary);
      if (val.trend) parts.push(val.trend);
      if (parts.length) return parts.join("\n\n");
      return JSON.stringify(val, null, 2);
    }
    return String(val);
  };

  // ✅ FIX: skip auto-scroll on FIRST render
  useEffect(() => {
    if (disableAutoScroll) return;

    if (!didMountRef.current) {
      didMountRef.current = true;
      return; // <-- prevents initial jump-to-bottom
    }

    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, disableAutoScroll]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);

    // add user message immediately
    setMessages((m) => [...m, { role: "user", content: text }]);

    try {
      const r = await fetch(`${apiBase}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          profile,
          latestReport,
          history: messages.slice(-10).map((msg) => ({
            role: msg.role,
            content: safeText(msg.content),
          })),
        }),
      });

      if (!r.ok) throw new Error("chat not ok");
      const j = await r.json();

      const replyText =
        safeText(j.reply) ||
        "Thanks — I didn’t receive a clear reply. Can you rephrase that for me?";

      setMessages((m) => [...m, { role: "assistant", content: replyText }]);
    } catch (e) {
      const fallback = localHeuristic(text, profile, latestReport);
      setMessages((m) => [...m, { role: "assistant", content: fallback }]);
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content:
          "No problem — let’s start fresh. Please describe the main Wi-Fi issue you’re trying to fix.",
      },
    ]);
  };

  return (
    <div className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-4">
      <div className="flex items-center justify-between px-1">
        <div className="font-semibold text-slate-900">Support chat</div>
        <button
          onClick={clearChat}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          Reset
        </button>
      </div>

      <div className="mt-3 h-[360px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap shadow-sm
                ${
                  msg.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-900 border border-slate-100"
                }`}
            >
              {safeText(msg.content)}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl px-3 py-2 text-sm text-slate-500 flex items-center gap-2">
              <TypingDots />
              <span>Working on that…</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Describe the problem (slow speeds, drops, dead zones, etc.)"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />

        <button
          onClick={send}
          disabled={sending}
          className={`px-4 py-2 rounded-xl font-semibold transition
            ${
              sending
                ? "bg-slate-100 text-slate-400"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
        >
          Send
        </button>
      </div>

      <div className="mt-2 text-[11px] text-slate-500 px-1">
        I’ll use your diagnostic results and setup details to guide the fix.
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}

function localHeuristic(text, profile, latestReport) {
  const t = text.toLowerCase();
  const fixes = latestReport?.fixes || [];

  if (t.includes("slow")) {
    return (
      "Understood — slow speeds.\n\n" +
      "First, does this affect all devices or only one specific device?\n\n" +
      "While you check: if you’re close to the router, confirm you’re on 5GHz/6GHz (not 2.4GHz). " +
      (profile?.routerAge === "5y+"
        ? "Also, a 5+ year router can cap modern plans."
        : "")
    );
  }

  if (t.includes("drop") || t.includes("disconnect")) {
    return (
      "Thanks — disconnects usually point to interference or unstable routing.\n\n" +
      "Do the drops happen randomly, or mostly at certain times (evenings, storms, heavy usage)?"
    );
  }

  if (t.includes("buffer") || t.includes("lag")) {
    return (
      "Got it — streaming/gaming lag.\n\n" +
      "When it happens, are you near the router or farther away / behind multiple walls?"
    );
  }

  if (fixes.length) {
    const top = fixes
      .slice(0, 3)
      .map((f) => (typeof f === "string" ? f : f.recommendation || f.action));
    return (
      "Based on your diagnostic, start here:\n• " +
      top.join("\n• ") +
      "\n\nTell me which one you want to do first and I’ll guide you."
    );
  }

  return (
    "No problem. Let’s narrow this down.\n\n" +
    "1) Is the issue on all devices or just one?\n" +
    "2) Roughly how far from the router are you when it happens?\n\n" +
    "Answer those and we’ll go to the next step."
  );
}
