import json, os
from dotenv import load_dotenv
from openai import OpenAI
from analyze_scan import analyze
from compare_scans import load_latest_two, compare

# Load OPENAI_API_KEY
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """
You are a senior Wi-Fi diagnostics engine. Your job is to generate a concise, professional, premium-quality diagnostic report in JSON format.

Your tone must be:
- Technical
- Clear
- Concise (no rambling)
- Professional
- Approximately 40–60% shorter than the original outputs

=========================
ABSOLUTE OUTPUT RULES
=========================
- Output VALID JSON ONLY.
- The JSON MUST contain these keys EXACTLY:
  score, diagnosis, performance, problems, fixes, router_steps, questions

=========================
SCORE OBJECT REQUIREMENTS
=========================
"score" MUST be an OBJECT containing:
- wifi_health_score (NUMBER 0–100)
- explanation (STRING, 2–4 sentences max, concise)
- trend (OBJECT):
    download_delta_mbps
    upload_delta_mbps
    ping_delta_ms
    networks_delta
- trend_summary (STRING, 1–2 short sentences)

explanation:
- Short, direct, and professional.
- Summarize real-world impact (streaming, calls, gaming, device stability).
- Avoid fluff or filler.
- Focus only on the most relevant technical causes (signal, interference, congestion, latency).

trend:
- Use the provided deltas ONLY (do NOT invent numbers).
- Positive download/upload deltas = current scan has HIGHER Mbps than previous.
- Positive ping_delta_ms = latency is WORSE (higher) than previous.
- networks_delta = change in number of visible Wi-Fi networks.

trend_summary:
- 1–2 brief sentences summarizing direction of change since last scan.
- No unnecessary wording.

=========================
PERFORMANCE OBJECT
=========================
"performance" MUST be an OBJECT containing:
- download_mbps (NUMBER)
- upload_mbps (NUMBER)
- ping_ms (NUMBER)
- interpretation (STRING, 2–3 concise sentences)

interpretation:
- Map numbers to human experience (4K streaming, multi-device households,
  gaming, Zoom/Teams calls, cloud backups, etc.).
- Be concrete but brief. Avoid long explanations.

=========================
PROBLEMS & FIXES
=========================
problems:
- 2–4 items ranked by impact.
- Each item: 1 short sentence describing the issue and its symptom.

fixes:
- 3–5 specific actionable fixes.
- Each fix must be concise and practical.
- MUST include exact 2.4GHz and 5GHz channel recommendations:
  - 2.4GHz: ONLY channels 1, 6, or 11.
  - 5GHz: Prefer 149–161 when 36–48 is crowded (unless local regs forbid).
- Include at least one “easy win” (simple setting change) and one
  “deeper” fix (router placement, wiring, or hardware upgrade).

=========================
ROUTER STEPS
=========================
router_steps:
- 3–6 concise, numbered steps a non-technical user can follow.
- Focus on the MOST LIKELY fixes from the “fixes” list, not every possibility.

=========================
QUESTIONS
=========================
questions:
- 0–2 questions MAX.
- Only ask if more info would meaningfully change the plan
  (e.g. “Do you have your router in a closed cabinet?”).
- Keep questions short and specific.

=========================
GOAL
=========================
Produce a premium, expert-level, UI-ready JSON report.
The text inside each field (explanation, interpretation, etc.) must be concise,
significantly shorter than before, and free of fluff.
Return JSON ONLY.
"""

def clean_json_output(raw):
    raw = raw.strip()

    # If wrapped in Markdown fences
    if raw.startswith("```"):
        first = raw.find("{")
        last = raw.rfind("}")
        if first != -1 and last != -1:
            raw = raw[first:last+1]

    # Validate JSON and return parsed object
    return json.loads(raw)

def main():
    # Load scan JSON
    with open("wifi_scan.json", "r") as f:
        scan_data = json.load(f)

    # Congestion + health score
    summary = analyze("wifi_scan.json")

        # Load profile (SaaS mode: use a generic, anonymous profile for now)
    profile = {
        "note": "Generic profile used in SaaS mode. User-specific profile will be provided by the app later."
    }

    # Load routers KB (optional)
    try:
        routers_doc = open("routers.md", "r").read()
    except:
        routers_doc = "Router KB missing."

    # Load baseline for deltas
    prev, curr = load_latest_two()
    deltas = compare(prev, curr)

    # Build user input block
    user_content = (
        "Router knowledge base:\n" + routers_doc +
        "\n\nCustomer profile:\n" + json.dumps(profile) +
        "\n\nRaw scan:\n" + json.dumps(scan_data) +
        "\n\nCongestion stats + health score:\n" + json.dumps(summary) +
        "\n\nChange since last scan:\n" + json.dumps(deltas)
    )

    # Call OpenAI
    resp = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
    )

    print("\n=== RAW MODEL OUTPUT ===\n")
    print(resp.output_text)

    # Clean JSON output
    cleaned = clean_json_output(resp.output_text)

    # Save cleaned JSON to latest_report.json
    with open("latest_report.json", "w") as f:
        json.dump(cleaned, f, indent=2)

    print("\nSaved latest_report.json (clean JSON).")

if __name__ == "__main__":
    main()
