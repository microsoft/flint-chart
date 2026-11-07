// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Publishes the built-in maps' boundaries on Flint's site, where compiled specs name them.
 *
 *   node scripts/publish-site-geo.mjs <site-dir> [--offline]
 *
 * Copies the package's `src/geo` files into `<site-dir>/geo/<GEO_VERSION>/`, writes
 * `<site-dir>/geo/manifest.json` (every published file's SHA-256), and checks the result against
 * the manifest the live site serves: a file published once must be published again, unchanged, or
 * the specs that name it would draw another map or none. New boundaries go out under the next
 * version (bump `GEO_VERSION` in `basemap-sources.ts`); before that, keep the old version's files
 * in `site/public/geo/<version>/` so the site goes on serving them. `--offline` skips the check.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = join(root, 'packages/flint-js/src/geo');
const sources = readFileSync(join(root, 'packages/flint-js/src/chart-types/basemap-sources.ts'), 'utf8');

const constant = (name) => {
    const match = sources.match(new RegExp(`export const ${name} = '([^']+)'`));
    if (!match) throw new Error(`basemap-sources.ts has no "export const ${name} = '…'"`);
    return match[1];
};
const SITE_GEO = constant('SITE_GEO');
const GEO_VERSION = constant('GEO_VERSION');

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const siteDir = args.find((arg) => !arg.startsWith('--'));
if (!siteDir) {
    console.error('usage: node scripts/publish-site-geo.mjs <site-dir> [--offline]');
    process.exit(2);
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const errors = [];

// The current version, from the package.
const geoDir = join(siteDir, 'geo');
const currentDir = join(geoDir, GEO_VERSION);
mkdirSync(currentDir, { recursive: true });
for (const file of readdirSync(sourceDir).filter((name) => name.endsWith('.json') || name === 'NOTICE.md')) {
    const target = join(currentDir, file);
    if (file.endsWith('.json') && existsSync(target) && sha256(target) !== sha256(join(sourceDir, file))) {
        errors.push(`geo/${GEO_VERSION}/${file}: the site already has a different copy (site/public/geo/${GEO_VERSION}?); the package's is the current version's`);
        continue;
    }
    copyFileSync(join(sourceDir, file), target);
}

// Every version the site serves: the current one and any kept in site/public/geo.
const manifest = {};
for (const version of readdirSync(geoDir).filter((name) => /^v\d+$/.test(name)).sort()) {
    manifest[version] = {};
    for (const file of readdirSync(join(geoDir, version)).filter((name) => name.endsWith('.json')).sort()) {
        manifest[version][file] = sha256(join(geoDir, version, file));
    }
}
writeFileSync(join(geoDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (!offline) {
    const url = `${SITE_GEO}/manifest.json`;
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status === 404) {
        console.log(`${url}: nothing published yet`);
    } else if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}; cannot check the published boundaries`);
    } else {
        const live = await response.json();
        for (const [version, files] of Object.entries(live)) {
            for (const [file, hash] of Object.entries(files)) {
                const now = manifest[version]?.[file];
                if (now === undefined) errors.push(`geo/${version}/${file}: published, but missing from this build`);
                else if (now !== hash) errors.push(`geo/${version}/${file}: published, but changed in this build`);
            }
        }
    }
}

if (errors.length) {
    console.error('Published boundaries must never change or disappear:');
    for (const error of errors) console.error(`  ${error}`);
    console.error(`Keep a published version's files in site/public/geo/<version>/, and publish new boundaries by bumping GEO_VERSION in packages/flint-js/src/chart-types/basemap-sources.ts.`);
    process.exit(1);
}

for (const [version, files] of Object.entries(manifest)) {
    console.log(`geo/${version}: ${Object.keys(files).join(', ')}`);
}
