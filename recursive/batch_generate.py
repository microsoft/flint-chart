#!/usr/bin/env python3
"""
Batch call script: generates model responses for all pending questions.
This script generates prompts and saves them. The actual model calls
are done from the parent agent using the task tool.

Usage:
  python3 recursive/batch_generate.py --round 0 --model gpt-5.5
  
This will:
  1. Create prompts for all questions
  2. Print a manifest of pending items for the agent to process
"""
import json
import sys
from pathlib import Path

REPO = Path("/home/chenwang/flint-chart")
sys.path.insert(0, str(REPO / "recursive"))
from evaluate import load_skill, load_dataset, load_questions, build_prompt, RESULTS_DIR

def generate_prompts(model_name, round_num):
    skill_text = load_skill()
    questions = load_questions()
    
    round_dir = RESULTS_DIR / f"round_{round_num:02d}" / model_name
    round_dir.mkdir(parents=True, exist_ok=True)
    
    pending = []
    
    for q in questions:
        qid = q["id"]
        response_file = round_dir / f"{qid}_response.txt"
        
        if response_file.exists():
            continue
        
        dataset = load_dataset(q["dataset"])
        prompt = build_prompt(skill_text, dataset, q["question"])
        
        prompt_file = round_dir / f"{qid}_prompt.txt"
        prompt_file.write_text(prompt)
        
        pending.append({
            "id": qid,
            "dataset": q["dataset"],
            "question": q["question"],
            "prompt_file": str(prompt_file),
            "response_file": str(response_file),
        })
    
    print(f"Pending: {len(pending)} / {len(questions)}")
    
    # Save manifest
    manifest_file = round_dir / "manifest.json"
    with open(manifest_file, "w") as f:
        json.dump(pending, f, indent=2)
    
    return pending


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gpt-5.5")
    parser.add_argument("--round", type=int, default=0)
    args = parser.parse_args()
    
    pending = generate_prompts(args.model, args.round)
    if pending:
        print(f"\nManifest saved to: {RESULTS_DIR}/round_{args.round:02d}/{args.model}/manifest.json")
