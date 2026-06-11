#!/usr/bin/env python3
"""
Grade and render all responses for a given round and model.
Run after model responses are collected.

Usage:
  python3 recursive/grade_round.py --round 0 --model gpt-5.5
  python3 recursive/grade_round.py --round 0  # grade all models
"""
import json
import subprocess
import os
import sys
from pathlib import Path
from collections import Counter

REPO = Path("/home/chenwang/flint-chart")
RESULTS_DIR = REPO / "recursive" / "results"
RENDERED_DIR = REPO / "recursive" / "rendered"
TO_INSPECT_DIR = REPO / "recursive" / "results" / "to_inspect"
POOR_DATA_DIR = REPO / "recursive" / "results" / "poor_data"
NODE_BIN = Path("/home/chenwang/node-v20.18.0-linux-x64/bin")
ASSEMBLE_SCRIPT = REPO / "recursive" / "_assemble.mjs"

sys.path.insert(0, str(REPO / "recursive"))
from evaluate import load_questions, load_dataset, parse_flint_spec, grade_result


def assemble_spec(flint_input, dataset_data):
    """Run assembleVegaLite via npx tsx subprocess."""
    fi = dict(flint_input)
    fi["data"] = {"values": dataset_data}
    input_json = json.dumps(fi)
    
    env = {**os.environ, "PATH": f"{NODE_BIN}:{os.environ.get('PATH', '')}"}
    try:
        result = subprocess.run(
            [str(NODE_BIN / "npx"), "tsx", str(ASSEMBLE_SCRIPT)],
            input=input_json, capture_output=True, text=True,
            timeout=15, cwd=str(REPO), env=env,
        )
        if result.returncode == 0:
            return json.loads(result.stdout), None
        else:
            return None, result.stderr.strip()[:200]
    except Exception as e:
        return None, str(e)[:200]


def render_vl_spec(vl_spec, output_path):
    """Render Vega-Lite spec to PNG."""
    try:
        import vl_convert as vlc
        png = vlc.vegalite_to_png(json.dumps(vl_spec), scale=2)
        with open(output_path, "wb") as f:
            f.write(png)
        return True, None
    except Exception as e:
        return False, str(e)[:200]


def grade_round(round_num, model_name):
    """Grade all responses for a model in a round."""
    questions = load_questions()
    round_dir = RESULTS_DIR / f"round_{round_num:02d}" / model_name
    render_dir = RENDERED_DIR / f"round_{round_num:02d}" / model_name
    render_dir.mkdir(parents=True, exist_ok=True)
    
    results = []
    errors_by_type = Counter()
    
    for q in questions:
        qid = q["id"]
        response_file = round_dir / f"{qid}_response.txt"
        
        if not response_file.exists():
            print(f"  [{qid}] ⏳ no response")
            results.append({"question_id": qid, "status": "missing", "score": 0})
            continue
        
        response_text = response_file.read_text()
        
        # Parse
        flint_input, parse_error = parse_flint_spec(response_text)
        if flint_input:
            (round_dir / f"{qid}_flint_input.json").write_text(json.dumps(flint_input, indent=2))
        
        # Assemble
        vl_spec = None
        assembly_error = parse_error
        if flint_input:
            dataset = load_dataset(q["dataset"])
            vl_spec, assembly_error = assemble_spec(flint_input, dataset["data"])
            if vl_spec:
                (round_dir / f"{qid}_vl_spec.json").write_text(json.dumps(vl_spec, indent=2))
        
        # Render
        render_success = False
        if vl_spec:
            png_path = render_dir / f"{qid}.png"
            render_success, render_error = render_vl_spec(vl_spec, png_path)
            if not render_success:
                assembly_error = (assembly_error or "") + f" Render: {render_error}"
        
        # Grade
        grades = grade_result(q, flint_input, vl_spec, assembly_error)
        grades["render_success"] = render_success
        grades["question_id"] = qid
        grades["dataset"] = q["dataset"]
        grades["question"] = q["question"]
        grades["expected_chart_type"] = q["expected_chart_type"]
        
        (round_dir / f"{qid}_grade.json").write_text(json.dumps(grades, indent=2))
        
        results.append(grades)
        
        # Track error types
        if assembly_error:
            # Categorize errors
            err = assembly_error.lower()
            if "unsupported chart type" in err or "unknown chart" in err:
                errors_by_type["unsupported_chart_type"] += 1
            elif "json parse" in err or "no json" in err:
                errors_by_type["json_parse"] += 1
            elif "field" in err and ("not found" in err or "undefined" in err):
                errors_by_type["field_not_found"] += 1
            elif "render" in err:
                errors_by_type["render_error"] += 1
            else:
                errors_by_type["other"] += 1
        
        emoji = "✅" if grades["score"] >= 4 else "⚠️" if grades["score"] >= 2 else "❌"
        ct_match = "✓" if grades.get("correct_chart_type") else "✗"
        asm = "✓" if grades.get("assembly_success") else "✗"
        print(f"  [{qid}] {emoji} score={grades['score']}/5 chart={ct_match} asm={asm} | {q['question'][:50]}")
    
    # Summary
    done = [r for r in results if r.get("score") is not None and r.get("status") != "missing"]
    missing = [r for r in results if r.get("status") == "missing"]
    
    if done:
        avg_score = sum(r["score"] for r in done) / len(done)
        perfect = sum(1 for r in done if r["score"] == 5)
        assembly_rate = sum(1 for r in done if r.get("assembly_success")) / len(done)
        chart_type_rate = sum(1 for r in done if r.get("correct_chart_type")) / len(done)
        render_rate = sum(1 for r in done if r.get("render_success")) / len(done)
        semantic_rate = sum(1 for r in done if r.get("has_semantic_types")) / len(done)
        
        summary = {
            "model": model_name,
            "round": round_num,
            "total_questions": len(questions),
            "completed": len(done),
            "missing": len(missing),
            "avg_score": round(avg_score, 2),
            "perfect_score_5": perfect,
            "assembly_rate": round(assembly_rate, 3),
            "chart_type_accuracy": round(chart_type_rate, 3),
            "render_rate": round(render_rate, 3),
            "semantic_types_rate": round(semantic_rate, 3),
            "error_types": dict(errors_by_type),
            "failed_questions": [
                {"id": r["question_id"], "score": r["score"], 
                 "error": r.get("assembly_error", "")[:100],
                 "actual_chart": r.get("actual_chart_type", ""),
                 "expected_chart": r.get("expected_chart_type", "")}
                for r in done if r["score"] < 4
            ],
        }
        
        (round_dir / "summary.json").write_text(json.dumps(summary, indent=2))
        
        print(f"\n{'='*60}")
        print(f"  {model_name} Round {round_num} Summary")
        print(f"{'='*60}")
        print(f"  Completed:        {len(done)}/{len(questions)}")
        print(f"  Avg Score:        {avg_score:.2f}/5")
        print(f"  Perfect (5/5):    {perfect}/{len(done)}")
        print(f"  Assembly Rate:    {assembly_rate:.0%}")
        print(f"  Chart Type Acc:   {chart_type_rate:.0%}")
        print(f"  Render Rate:      {render_rate:.0%}")
        print(f"  Semantic Types:   {semantic_rate:.0%}")
        if errors_by_type:
            print(f"  Error Types:      {dict(errors_by_type)}")
        print(f"{'='*60}")
        
        return summary
    
    return None


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=None)
    parser.add_argument("--round", type=int, default=0)
    args = parser.parse_args()
    
    if args.model:
        grade_round(args.round, args.model)
    else:
        # Grade all models in this round
        round_dir = RESULTS_DIR / f"round_{args.round:02d}"
        if round_dir.exists():
            for model_dir in sorted(round_dir.iterdir()):
                if model_dir.is_dir() and not model_dir.name.startswith(("to_", "poor_")):
                    print(f"\n▶ Grading {model_dir.name}...")
                    grade_round(args.round, model_dir.name)
