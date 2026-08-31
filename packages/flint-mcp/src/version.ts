// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';

export const VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;
