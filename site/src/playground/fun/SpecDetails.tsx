import { useState } from 'react';

/** A chart's spec, folded away under its summary until asked for, with a button to copy it. */
export function SpecDetails({ text, summary = 'Chart spec, opening on the first chapter (its notes and overlays in `updates`)' }: { text: string; summary?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (event: React.MouseEvent) => {
    // The button sits in the summary: copying does not fold or unfold the spec.
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <details className="odyssey-lab-spec story-spec">
      <summary>
        <span>{summary}</span>
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </summary>
      <pre>{text}</pre>
    </details>
  );
}
