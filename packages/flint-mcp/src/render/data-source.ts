// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChartAssemblyInput } from 'flint-chart';

/** Maximum local data file size accepted by the MCP server. */
export const MAX_DATA_FILE_BYTES = 10 * 1024 * 1024;

export interface DataSourceOptions {
  /**
   * When true, local `data.url` file references are rejected; only inline
   * `data.values` are accepted. By default the server trusts the host and reads
   * any local file the agent references.
   */
  disableFileReference?: boolean;
  /** File-size guard for local data references. */
  maxDataFileBytes?: number;
  /** Row-count guard after loading inline or referenced data. */
  maxDataRows?: number;
  /**
   * Base directory for resolving relative `data.url` paths. Defaults to the
   * current working directory. The CLI passes the input file's directory so a
   * hand-edited `chart.json` can reference `./data.csv` next to it.
   */
  cwd?: string;
}

/**
 * Resolve an input data reference for local MCP rendering.
 *
 * Inline rows pass through unchanged. Remote URLs stay blocked. Local
 * `data.url` references are read into inline rows unless
 * {@link DataSourceOptions.disableFileReference} is set, in which case they are
 * rejected. By default the server trusts the host: any local file the agent can
 * name is read (relative paths resolve against the working directory), since the
 * host already governs the agent's file access.
 */
export function resolveDataSource(
  input: ChartAssemblyInput,
  options: DataSourceOptions = {},
): ChartAssemblyInput {
  const data = (input as any).data;
  if (data == null || typeof data !== 'object') {
    return input;
  }

  if (Array.isArray(data.values)) {
    if (typeof data.url === 'string') {
      throw new Error('input.data must provide either values or url, not both');
    }
    assertRowLimit(data.values, options.maxDataRows);
    assertRowObjects(data.values);
    return input;
  }

  if (typeof data.url !== 'string' || !data.url.trim()) {
    return input;
  }

  if (isRemoteReference(data.url)) {
    throw new Error(
      'remote data.url fetching is disabled in this server; use inline data.values ' +
        'or a local file path',
    );
  }

  if (options.disableFileReference) {
    throw new Error(
      'local data.url file references are disabled on this server; ' +
        'pass the rows inline with data.values instead',
    );
  }

  const filePath = resolveTrustedDataPath(data.url, options.cwd);
  const rows = readLocalRows(filePath, options);
  return { ...input, data: { values: rows } } as ChartAssemblyInput;
}

function isRemoteReference(rawUrl: string): boolean {
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawUrl.trim())) return false;
  return new URL(rawUrl).protocol !== 'file:';
}

/**
 * Resolve a local data.url. Any local file the agent can name is read — the host
 * governs the agent's file access. Relative references resolve against `cwd` (or
 * the working directory when not specified).
 */
function resolveTrustedDataPath(rawUrl: string, cwd?: string): string {
  const candidatePaths = trustedReferenceToPaths(rawUrl.trim(), cwd);
  let lastError: unknown;
  for (const candidatePath of candidatePaths) {
    try {
      const stats = statSync(candidatePath);
      if (!stats.isFile()) {
        throw new Error(`data.url must point to a file: ${rawUrl}`);
      }
      return realpathSync(candidatePath);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof Error && !/no such file or directory/i.test(lastError.message)) {
    throw lastError;
  }
  throw new Error(
    `data.url local file not found: ${rawUrl} (looked in: ${candidatePaths.join(', ')})`,
  );
}

function trustedReferenceToPaths(rawReference: string, cwd?: string): string[] {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawReference)) {
    const parsedUrl = new URL(rawReference);
    if (parsedUrl.protocol !== 'file:') {
      throw new Error(
        'remote data.url fetching is disabled in this server; use inline data.values ' +
          'or a local file path',
      );
    }
    return [fileURLToPath(parsedUrl)];
  }
  // Absolute paths are used as given; relative paths resolve against cwd when
  // given, or the process working directory otherwise.
  if (cwd) return [resolvePath(cwd, rawReference)];
  return [resolvePath(rawReference)];
}

function readLocalRows(
  filePath: string,
  options: DataSourceOptions,
): Record<string, unknown>[] {
  const maxFileBytes = options.maxDataFileBytes ?? MAX_DATA_FILE_BYTES;
  const stats = statSync(filePath);
  if (stats.size > maxFileBytes) {
    throw new Error(
      `data file is ${stats.size} bytes, exceeding the limit of ${maxFileBytes}`,
    );
  }

  const text = readFileSync(filePath, 'utf8');
  const extension = extname(filePath).toLowerCase();
  let rows: unknown[];
  if (extension === '.json') {
    rows = parseJsonRows(text);
  } else if (extension === '.csv') {
    rows = parseDelimitedRows(text, ',');
  } else if (extension === '.tsv') {
    rows = parseDelimitedRows(text, '\t');
  } else {
    throw new Error('data.url local files must be .json, .csv, or .tsv');
  }

  assertRowLimit(rows, options.maxDataRows);
  return assertRowObjects(rows);
}

function parseJsonRows(text: string): unknown[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed != null && typeof parsed === 'object') {
    const objectValue = parsed as Record<string, any>;
    if (Array.isArray(objectValue.values)) return objectValue.values;
    if (Array.isArray(objectValue.data)) return objectValue.data;
    if (Array.isArray(objectValue.data?.values)) return objectValue.data.values;
  }
  throw new Error('JSON data files must contain an array of row objects');
}

function parseDelimitedRows(text: string, delimiter: ',' | '\t'): Record<string, unknown>[] {
  const records = parseDelimitedRecords(text, delimiter).filter((record) =>
    record.some((field) => field.trim() !== ''),
  );
  if (records.length === 0) return [];

  const headers = records[0].map((header, index) => {
    const trimmedHeader = header.replace(/^\uFEFF/, '').trim();
    if (!trimmedHeader) {
      throw new Error(`data file has an empty header at column ${index + 1}`);
    }
    return trimmedHeader;
  });
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    throw new Error(`data file has duplicate headers: ${duplicateHeaders.join(', ')}`);
  }

  return records.slice(1).map((record) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      row[header] = coerceDelimitedValue(record[columnIndex] ?? '');
    });
    return row;
  });
}

function parseDelimitedRecords(text: string, delimiter: ',' | '\t'): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const nextChar = text[index + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char === '\r') {
      if (nextChar === '\n') index++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  record.push(field);
  records.push(record);
  return records;
}

function coerceDelimitedValue(value: string): unknown {
  const trimmedValue = value.trim();
  if (trimmedValue === '') return null;
  const lowerValue = trimmedValue.toLowerCase();
  if (lowerValue === 'true') return true;
  if (lowerValue === 'false') return false;
  if (/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }
  return trimmedValue;
}

function assertRowLimit(rows: unknown[], maxDataRows: number | undefined): void {
  if (typeof maxDataRows === 'number' && rows.length > maxDataRows) {
    throw new Error(
      `data has ${rows.length} rows, exceeding the limit of ${maxDataRows}`,
    );
  }
}

function assertRowObjects(rows: unknown[]): Record<string, unknown>[] {
  for (const [rowIndex, row] of rows.entries()) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`data row ${rowIndex + 1} must be an object`);
    }
  }
  return rows as Record<string, unknown>[];
}