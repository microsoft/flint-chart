// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Gallery generator for Kaplan–Meier survival curves.
 *
 * KM is a scientific chart type the generic grammar does not otherwise cover: a
 * stepped survival-probability curve per group, with right-censored observations
 * marked and (optionally) confidence bands. Each row is a subject with a survival
 * `time`, an `event` indicator (1 = event occurred, 0 = right-censored) and a
 * grouping arm. CanvasXpress estimates the curves natively.
 *
 * Encodings: x = time, event = censoring indicator (a domain channel), color =
 * group (the arm). The data is synthetic but deterministic (a small seeded RNG),
 * so the gallery baseline is stable.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';

/** Tiny deterministic LCG so the synthetic cohorts never drift between runs. */
function makeRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

/**
 * Build a synthetic cohort. Each arm draws survival times from an exponential
 * with its own rate (lower rate = longer survival); a fixed fraction are
 * right-censored before their event.
 */
function cohort(
    arms: Array<{ group: string; median: number; n: number }>,
    seed: number,
): Array<{ subject: string; time: number; event: number; group: string }> {
    const rng = makeRng(seed);
    const rows: Array<{ subject: string; time: number; event: number; group: string }> = [];
    let id = 1;
    for (const arm of arms) {
        const rate = Math.log(2) / arm.median; // exponential median → rate
        for (let i = 0; i < arm.n; i++) {
            const eventTime = -Math.log(1 - rng()) / rate;
            const censorTime = -Math.log(1 - rng()) / (rate * 0.6); // later, lighter censoring
            const observed = Math.min(eventTime, censorTime);
            rows.push({
                subject: 'S' + id++,
                time: Math.max(1, Math.round(observed)),
                event: eventTime <= censorTime ? 1 : 0,
                group: arm.group,
            });
        }
    }
    return rows;
}

const SURVIVAL_META = {
    subject: { type: Type.String, semanticType: 'Category' as const, levels: [] },
    time: { type: Type.Number, semanticType: 'Duration' as const, levels: [] },
    event: { type: Type.Number, semanticType: 'Count' as const, levels: [] },
    group: { type: Type.String, semanticType: 'Category' as const, levels: [] },
};

const SURVIVAL_FIELDS = [makeField('subject'), makeField('time'), makeField('event'), makeField('group')];
const SURVIVAL_ENCODING = {
    x: makeEncodingItem('time'),
    event: makeEncodingItem('event'),
    color: makeEncodingItem('group'),
};

export function genKaplanMeierTests(): TestCase[] {
    return [
        {
            title: 'Overall survival by treatment arm',
            description:
                'A two-arm trial: stepped Kaplan–Meier survival curves for a treatment '
                + 'and a control cohort, with right-censored subjects marked by ticks. '
                + 'The treatment arm has the longer median survival. Each row is a '
                + 'subject with a survival time, an event/censor indicator, and an arm.',
            tags: ['kaplan-meier', 'survival', 'scientific', 'biostatistics', 'gallery'],
            chartType: 'Kaplan-Meier',
            data: cohort(
                [
                    { group: 'Control', median: 18, n: 80 },
                    { group: 'Treatment', median: 34, n: 80 },
                ],
                20240517,
            ),
            fields: SURVIVAL_FIELDS,
            metadata: SURVIVAL_META,
            encodingMap: SURVIVAL_ENCODING,
        },
        {
            title: 'Survival by disease stage (3 groups)',
            description:
                'Three Kaplan–Meier curves stratified by stage. Earlier stages survive '
                + 'longer, so the curves fan out; censoring ticks sit along each step '
                + 'function where follow-up ended without an event.',
            tags: ['kaplan-meier', 'survival', 'scientific', 'biostatistics', 'strata', 'gallery'],
            chartType: 'Kaplan-Meier',
            data: cohort(
                [
                    { group: 'Stage I', median: 48, n: 60 },
                    { group: 'Stage II', median: 28, n: 60 },
                    { group: 'Stage III', median: 14, n: 60 },
                ],
                74073,
            ),
            fields: SURVIVAL_FIELDS,
            metadata: SURVIVAL_META,
            encodingMap: SURVIVAL_ENCODING,
        },
    ];
}
