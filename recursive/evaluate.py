#!/usr/bin/env python3
"""
Evaluation harness for flint-chart agent skill testing.

Sends SKILL.md + dataset + question to a model, parses the ChartAssemblyInput,
runs it through assembleVegaLite, renders, and grades the output.
"""
import json
import subprocess
import os
import sys
import time
from pathlib import Path

REPO = Path("/home/chenwang/flint-chart")
DATASETS_DIR = REPO / "recursive" / "datasets"
QUESTIONS_FILE = REPO / "recursive" / "questions" / "questions.json"
RESULTS_DIR = REPO / "recursive" / "results"
RENDERED_DIR = REPO / "recursive" / "rendered"
SKILL_FILE = REPO / "agent-skills" / "SKILL.md"
NODE = "/home/chenwang/node-v20.18.0-linux-x64/bin/node"

# Assemble script — runs assembleVegaLite on a ChartAssemblyInput JSON
ASSEMBLE_SCRIPT = REPO / "recursive" / "_assemble.mjs"


def load_skill():
    return SKILL_FILE.read_text()


def load_dataset(name):
    fp = DATASETS_DIR / f"{name}.json"
    with open(fp) as f:
        return json.load(f)


def load_questions():
    with open(QUESTIONS_FILE) as f:
        return json.load(f)


def build_prompt(skill_text, dataset_obj, question):
    """Build the prompt for the model."""
    meta = dataset_obj["meta"]
    # Show first 5 rows as sample
    sample = dataset_obj["data"][:5]
    columns = meta["columns"]

    return f"""You are a data visualization assistant. Use the flint-chart library to create charts.

{skill_text}

---

## Dataset

**Name:** {meta['name']}
**Description:** {meta['description']}
**Columns:** {json.dumps(columns)}
**Sample rows (first 5 of {meta['num_rows']}):**
```json
{json.dumps(sample, indent=2)}
```

## Task

{question}

## Instructions

Return ONLY a valid JSON `ChartAssemblyInput` object. Do not include any explanation, markdown, or code fences — just the raw JSON object.

The `data.values` field should reference the full dataset (use a placeholder `[]` — I will inject the real data). Focus on getting the `chart_spec` and `semantic_types` right.
"""


def parse_flint_spec(response_text):
    """Extract JSON from model response."""
    text = response_text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Find first and last ``` lines
        start = 1
        end = len(lines) - 1
        if lines[0].startswith("```"):
            start = 1
        for i in range(len(lines) - 1, 0, -1):
            if lines[i].strip() == "```":
                end = i
                break
        text = "\n".join(lines[start:end])

    try:
        return json.loads(text), None
    except json.JSONDecodeError as e:
        # Try to find JSON object in the text
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end]), None
            except json.JSONDecodeError as e2:
                return None, f"JSON parse error: {e2}"
        return None, f"No JSON found: {e}"


def assemble_spec(flint_input, dataset_data):
    """Run assembleVegaLite via Node.js subprocess."""
    # Inject real data
    flint_input = dict(flint_input)
    flint_input["data"] = {"values": dataset_data}

    input_json = json.dumps(flint_input)
    try:
        result = subprocess.run(
            [NODE.replace("/node", "/npx"), "tsx", str(ASSEMBLE_SCRIPT)],
            input=input_json,
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(REPO),
            env={**os.environ, "PATH": f"{Path(NODE).parent}:{os.environ.get('PATH','')}"},
        )
        if result.returncode == 0:
            return json.loads(result.stdout), None
        else:
            return None, f"Assembly error: {result.stderr.strip()}"
    except Exception as e:
        return None, f"Assembly exception: {e}"


def grade_result(question_obj, flint_input, vl_spec, assembly_error):
    """Grade a single result."""
    grades = {}
    
    # 1. Valid JSON parse?
    grades["valid_json"] = flint_input is not None
    
    if not flint_input:
        grades["valid_spec"] = False
        grades["correct_chart_type"] = False
        grades["has_semantic_types"] = False
        grades["has_encodings"] = False
        grades["assembly_success"] = False
        grades["score"] = 0
        return grades
    
    # 2. Has required fields?
    cs = flint_input.get("chart_spec", {})
    grades["has_chart_type"] = "chartType" in cs
    grades["has_encodings"] = bool(cs.get("encodings"))
    grades["has_semantic_types"] = bool(flint_input.get("semantic_types"))
    
    # 3. Correct chart type?
    expected = question_obj["expected_chart_type"]
    actual = cs.get("chartType", "")
    grades["correct_chart_type"] = actual.lower() == expected.lower()
    grades["actual_chart_type"] = actual
    
    # 4. Assembly success?
    grades["assembly_success"] = vl_spec is not None and assembly_error is None
    grades["assembly_error"] = assembly_error
    
    # 5. Score (0-5)
    score = 0
    if grades["valid_json"]: score += 1
    if grades["has_semantic_types"]: score += 1
    if grades["has_encodings"]: score += 1
    if grades["correct_chart_type"]: score += 1
    if grades["assembly_success"]: score += 1
    grades["score"] = score
    
    return grades


def render_vl_spec(vl_spec, output_path):
    """Render a Vega-Lite spec to PNG using vl-convert."""
    try:
        import vl_convert as vlc
        png = vlc.vegalite_to_png(json.dumps(vl_spec), scale=2)
        with open(output_path, "wb") as f:
            f.write(png)
        return True, None
    except Exception as e:
        return False, str(e)


def run_evaluation(model_name, round_num, question_ids=None):
    """Run evaluation for a specific model and round."""
    skill_text = load_skill()
    questions = load_questions()
    
    if question_ids:
        questions = [q for q in questions if q["id"] in question_ids]
    
    round_dir = RESULTS_DIR / f"round_{round_num:02d}" / model_name
    round_dir.mkdir(parents=True, exist_ok=True)
    render_dir = RENDERED_DIR / f"round_{round_num:02d}" / model_name
    render_dir.mkdir(parents=True, exist_ok=True)
    
    results = []
    
    for q in questions:
        qid = q["id"]
        print(f"  [{model_name}] {qid}: {q['question'][:60]}...", end=" ", flush=True)
        
        dataset = load_dataset(q["dataset"])
        prompt = build_prompt(skill_text, dataset, q["question"])
        
        # Save prompt for debugging
        (round_dir / f"{qid}_prompt.txt").write_text(prompt)
        
        # Call model (placeholder — will be filled by the caller)
        response_file = round_dir / f"{qid}_response.txt"
        spec_file = round_dir / f"{qid}_flint_input.json"
        vl_file = round_dir / f"{qid}_vl_spec.json"
        grade_file = round_dir / f"{qid}_grade.json"
        
        result = {
            "question_id": qid,
            "dataset": q["dataset"],
            "question": q["question"],
            "expected_chart_type": q["expected_chart_type"],
            "model": model_name,
            "round": round_num,
        }
        
        # Check if response already exists (for resuming)
        if response_file.exists():
            response_text = response_file.read_text()
        else:
            result["status"] = "pending"
            results.append(result)
            print("⏳ pending")
            continue
        
        # Parse
        flint_input, parse_error = parse_flint_spec(response_text)
        if flint_input:
            with open(spec_file, "w") as f:
                json.dump(flint_input, f, indent=2)
        
        # Assemble
        vl_spec = None
        assembly_error = parse_error
        if flint_input:
            vl_spec, assembly_error = assemble_spec(flint_input, dataset["data"])
            if vl_spec:
                with open(vl_file, "w") as f:
                    json.dump(vl_spec, f, indent=2)
        
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
        with open(grade_file, "w") as f:
            json.dump(grades, f, indent=2)
        
        result.update(grades)
        result["status"] = "done"
        results.append(result)
        
        emoji = "✅" if grades["score"] >= 4 else "⚠️" if grades["score"] >= 2 else "❌"
        print(f"{emoji} score={grades['score']}/5")
    
    # Save summary
    summary_file = round_dir / "summary.json"
    with open(summary_file, "w") as f:
        json.dump(results, f, indent=2)
    
    # Print summary
    done = [r for r in results if r.get("status") == "done"]
    if done:
        avg_score = sum(r["score"] for r in done) / len(done)
        assembly_rate = sum(1 for r in done if r.get("assembly_success")) / len(done)
        chart_type_rate = sum(1 for r in done if r.get("correct_chart_type")) / len(done)
        print(f"\n  Summary ({model_name}, round {round_num}):")
        print(f"    Completed: {len(done)}/{len(results)}")
        print(f"    Avg score: {avg_score:.1f}/5")
        print(f"    Assembly rate: {assembly_rate:.0%}")
        print(f"    Chart type accuracy: {chart_type_rate:.0%}")
    
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-5.5")
    parser.add_argument("--round", type=int, default=0)
    parser.add_argument("--questions", nargs="*", help="Specific question IDs")
    args = parser.parse_args()
    
    run_evaluation(args.model, args.round, args.questions)
