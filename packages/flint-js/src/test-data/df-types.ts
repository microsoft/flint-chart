// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vendored types for test-data / gallery fixtures.
 *
 * These come from the original repo, where TestCase originally lived.
 * They're scoped to test-data only — the public library (core/, vegalite/, …)
 * does not depend on these types.
 *
 * Keep this file small and free of DF-only logic. If a type drifts in DF,
 * update it here independently.
 */

import { channels } from '../core/types';

// ---- Type (DF data type enum) ---------------------------------------------

export enum Type {
    String = 'string',
    Boolean = 'boolean',
    Integer = 'integer',
    Number = 'number',
    Date = 'date',
    DateTime = 'datetime',
    Time = 'time',
    Duration = 'duration',
    Auto = 'auto',
}

// ---- Channel + Encoding (DF UI encoding shelf shape) -----------------------

export type Channel = typeof channels[number];

export type FieldSource = 'custom' | 'original';

export interface FieldItem {
    id: string;
    name: string;
    source: FieldSource;
    tableRef: string;
}

export type AggrOp = 'count' | 'sum' | 'average';

export interface EncodingItem {
    fieldID?: string;
    dtype?: 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
    aggregate?: AggrOp;
    sortOrder?: 'ascending' | 'descending';
    sortBy?: string;
    scheme?: string;
}
