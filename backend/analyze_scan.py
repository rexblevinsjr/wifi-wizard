import json, re
from collections import Counter, defaultdict

def parse_channel(ch_str):
    # examples: "11 (2GHz, 20MHz)" or "36 (5GHz, 80MHz)"
    m = re.match(r"(\d+)", str(ch_str))
    return int(m.group(1)) if m else None

def band_from_channel(ch):
    if ch is None: 
        return None
    if 1 <= ch <= 14: 
        return "2.4"
    return "5"

def analyze(scan_path="wifi_scan.json"):
    data = json.load(open(scan_path))
    nets = data.get("networks", [])

    by_band = defaultdict(list)
    chan_counts_24 = Counter()
    chan_counts_5 = Counter()

    for n in nets:
        ch = parse_channel(n.get("channel"))
        band = band_from_channel(ch)
        if not band:
            continue
        by_band[band].append({**n, "ch_num": ch})
        if band == "2.4":
            chan_counts_24[ch] += 1
        else:
            chan_counts_5[ch] += 1

    # group 5GHz into common blocks
    blocks_5 = {
        "36-48": 0,
        "52-64(DFS)": 0,
        "100-144(DFS)": 0,
        "149-161": 0,
        "165": 0
    }
    for ch, c in chan_counts_5.items():
        if 36 <= ch <= 48:
            blocks_5["36-48"] += c
        elif 52 <= ch <= 64:
            blocks_5["52-64(DFS)"] += c
        elif 100 <= ch <= 144:
            blocks_5["100-144(DFS)"] += c
        elif 149 <= ch <= 161:
            blocks_5["149-161"] += c
        elif ch == 165:
            blocks_5["165"] += c

    summary = {
        "total_networks": len(nets),
        "band_counts": {k: len(v) for k, v in by_band.items()},
        "2.4_channel_counts": dict(chan_counts_24),
        "5_channel_counts": dict(chan_counts_5),
        "5_block_counts": blocks_5,
        "speedtest": data.get("speedtest", {})
    }

    # --- Health score (simple MVP version) ---
    score = 100

    # congestion penalties
    c24 = sum(chan_counts_24.values())
    c5  = sum(chan_counts_5.values())

    if c24 >= 6:
        score -= 20
    elif c24 >= 3:
        score -= 10

    if c5 >= 8:
        score -= 15
    elif c5 >= 4:
        score -= 8

    # speed penalties
    sp = summary.get("speedtest", {})
    down = sp.get("download_mbps", 0) or 0
    up = sp.get("upload_mbps", 0) or 0
    ping = sp.get("ping_ms", 0) or 0

    if down < 50:
        score -= 15
    if up < 10:
        score -= 10
    if ping > 50:
        score -= 10

    score = max(0, min(100, score))
    summary["wifi_health_score"] = score

    return summary

if __name__ == "__main__":
    print(json.dumps(analyze(), indent=2))
