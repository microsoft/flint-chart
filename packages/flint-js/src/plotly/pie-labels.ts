// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** Per-slice Plotly templates: wrap only when name + percentage needs the room. */
export function pieCategoryPercentTemplates(
    labels: any[],
    figureWidth: number,
    fontSize = 11,
): string[] {
    const inlineBudgetPx = Math.min(120, Math.max(72, figureWidth * 0.22));
    return labels.map((label) => {
        // Six characters conservatively budgets percentages such as "12.4%".
        const combinedPx = (String(label).length + 1 + 6) * fontSize * 0.55;
        return combinedPx <= inlineBudgetPx
            ? '%{label} %{percent}'
            : '%{label}<br>%{percent}';
    });
}
