import json, statistics as st, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
out = []
for lang in ("js", "py"):
    for n in (1000, 5000, 10000):
        g = {lab: [r for r in rows if r["lang"] == lang and r["N"] == n and r["label"] == lab] for lab in ("baseline", "change")}
        dig = {lab: {r["digest"] for r in g[lab]} for lab in g}
        mem = "medianAllocBytes" if lang == "js" else "tracemallocPeakBytes"
        if not g["baseline"] or not g["change"]:
            continue
        line = {lab: (st.median(r["medianMs"] for r in g[lab]), [round(r["medianMs"], 3) for r in sorted(g[lab], key=lambda r: r["round"])],
                      st.median(r[mem] for r in g[lab]), max(r["maxRssKiB"] for r in g[lab])) for lab in g}
        b, c = line["baseline"], line["change"]
        out.append(f"{lang} N={n:>5} outputs_identical={dig['baseline'] == dig['change'] and len(dig['baseline']) == 1} "
                   f"orderedLen={g['change'][0]['orderedLen']} kept={g['change'][0]['kept']} | "
                   f"baseline median {b[0]:.3f}ms rounds {b[1]} | change median {c[0]:.3f}ms rounds {c[1]} | "
                   f"speedup {b[0]/c[0]:.1f}x | {mem} {b[2]}→{c[2]} | maxRSS KiB {b[3]}→{c[3]}")
print("\n".join(out))
