// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Style references — the hand-authored look-and-feel targets.
 *
 * Each entry is a set of manual Vega-Lite specs written to establish what a
 * house should look like before (or alongside) a ThemeSpec preset that has to
 * reproduce it. They are NOT theme-pipeline output: that is the point. A
 * preset is judged against them by eye.
 *
 * The specs themselves stay in their own files — they are long, hand-tuned,
 * and each is a design document in its own right. This registry only says
 * which references exist and what each one is arguing for, so the page that
 * shows them needs no per-house code.
 */

import { SWISS_CASES } from './swiss-lab-data';
import { CARTOON_CASES } from './cartoon-lab-data';

/** One mockup: a spec plus what it is meant to demonstrate. */
export interface StyleReferenceCase {
    id: string;
    title: string;
    note: string;
    spec: any;
}

export interface StyleReference {
    /** URL segment and switcher key. */
    id: string;
    label: string;
    /** What the reference is arguing for, and how far the preset got. */
    blurb: string;
    /** Where the look comes from, so a reader can check the source. */
    refs: string;
    cases: StyleReferenceCase[];
}

export const STYLE_REFERENCES: StyleReference[] = [
    {
        id: 'swiss',
        label: 'Swiss',
        blurb:
            'The International Typographic Style — a visible modular grid, flush-left Helvetica '
            + 'title block, warm paper with a single signal-red accent, and hard corners. Written '
            + 'to establish the target before the swiss preset was grounded.',
        refs: 'swissted.com · Poster House "The Swiss Grid" · Müller-Brockmann · Vignelli subway map · Aicher \'72 palette.',
        cases: SWISS_CASES,
    },
    {
        id: 'cartoon',
        label: 'Cartoon',
        blurb:
            'A playful, xkcd-flavoured look — a rounded comic face, a bright crayon palette on warm '
            + 'paper, fat dark "sticker" outlines on rounded marks, and big bordered dots. The '
            + 'cartoon preset now owns the reusable levers; emoji markers stay hand-authored, '
            + 'deliberately outside the theme spec.',
        refs: 'xkcd.com · "Humor Sans" / xkcd Script · Comic Neue · modern flat-cartoon infographics.',
        cases: CARTOON_CASES,
    },
];

export const DEFAULT_STYLE_REFERENCE = STYLE_REFERENCES[0].id;

export const findStyleReference = (id: string | undefined): StyleReference =>
    STYLE_REFERENCES.find((r) => r.id === id) ?? STYLE_REFERENCES[0];
