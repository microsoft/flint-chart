// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Geographic gazetteer for choropleth maps — shared across backends.
 *
 * Real-world datasets identify regions by *name* ("California", "United
 * States") or by a familiar short code (USPS "CA", ISO alpha-2 "US", alpha-3
 * "USA") — almost never by the numeric ids that TopoJSON feature geometries
 * actually carry (FIPS state codes, ISO 3166-1 *numeric* country codes). This
 * module crosswalks any of those user-facing forms to whatever key a given
 * backend's geo rendering needs:
 *
 *   - `resolveUsState` / `resolveCountry` — numeric feature id, for the
 *     Vega-Lite backend's TopoJSON join (`us-10m.json` / `world-110m.json`).
 *   - `resolveUsStateCode` / `resolveCountryCode` — USPS / ISO alpha-3 code,
 *     for the Plotly backend's native `choropleth`/`scattergeo` `locations`.
 *
 * Living in `chart-types/` (rather than under one backend's `templates/`)
 * follows the same cross-backend-shared-logic convention as
 * `chart-types/gantt.ts` / `chart-types/waterfall.ts`.
 *
 * Lookups are case- and punctuation-insensitive. A value that is already the
 * numeric id passes through unchanged.
 */

/**
 * Normalise a label for matching: accent-folded, lowercased, alphanumerics
 * only. Accent folding (NFD + strip combining marks) lets "Côte d'Ivoire" and
 * "São Tomé" match their plain-ASCII gazetteer keys.
 */
function norm(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// US states — [FIPS, name, USPS code]
// ---------------------------------------------------------------------------

const US_STATES: Array<[number, string, string]> = [
    [1, 'Alabama', 'AL'], [2, 'Alaska', 'AK'], [4, 'Arizona', 'AZ'], [5, 'Arkansas', 'AR'],
    [6, 'California', 'CA'], [8, 'Colorado', 'CO'], [9, 'Connecticut', 'CT'], [10, 'Delaware', 'DE'],
    [11, 'District of Columbia', 'DC'], [12, 'Florida', 'FL'], [13, 'Georgia', 'GA'], [15, 'Hawaii', 'HI'],
    [16, 'Idaho', 'ID'], [17, 'Illinois', 'IL'], [18, 'Indiana', 'IN'], [19, 'Iowa', 'IA'],
    [20, 'Kansas', 'KS'], [21, 'Kentucky', 'KY'], [22, 'Louisiana', 'LA'], [23, 'Maine', 'ME'],
    [24, 'Maryland', 'MD'], [25, 'Massachusetts', 'MA'], [26, 'Michigan', 'MI'], [27, 'Minnesota', 'MN'],
    [28, 'Mississippi', 'MS'], [29, 'Missouri', 'MO'], [30, 'Montana', 'MT'], [31, 'Nebraska', 'NE'],
    [32, 'Nevada', 'NV'], [33, 'New Hampshire', 'NH'], [34, 'New Jersey', 'NJ'], [35, 'New Mexico', 'NM'],
    [36, 'New York', 'NY'], [37, 'North Carolina', 'NC'], [38, 'North Dakota', 'ND'], [39, 'Ohio', 'OH'],
    [40, 'Oklahoma', 'OK'], [41, 'Oregon', 'OR'], [42, 'Pennsylvania', 'PA'], [44, 'Rhode Island', 'RI'],
    [45, 'South Carolina', 'SC'], [46, 'South Dakota', 'SD'], [47, 'Tennessee', 'TN'], [48, 'Texas', 'TX'],
    [49, 'Utah', 'UT'], [50, 'Vermont', 'VT'], [51, 'Virginia', 'VA'], [53, 'Washington', 'WA'],
    [54, 'West Virginia', 'WV'], [55, 'Wisconsin', 'WI'], [56, 'Wyoming', 'WY'],
];

/**
 * Extra US-state forms: AP-style newspaper abbreviations ("Calif.", "Wash."),
 * directional shorthand ("N. Carolina", "S. Dakota") and common variants. Keys
 * are already `norm`-ed (punctuation/spacing removed), so "N. Carolina" arrives
 * as "ncarolina". None collide with a two-letter USPS code.
 */
const US_STATE_ALIASES: Record<string, number> = {
    // AP-style abbreviations
    ala: 1, ariz: 4, ark: 5, calif: 6, colo: 8, conn: 9, del: 10, fla: 12,
    ill: 17, ind: 18, kan: 20, kans: 20, mass: 25, mich: 26, minn: 27,
    miss: 28, mont: 30, neb: 31, nebr: 31, nev: 32, okla: 40, ore: 41,
    oreg: 41, penn: 42, penna: 42, tenn: 47, tex: 48, wash: 53, wis: 55,
    wisc: 55, wyo: 56,
    // Directional shorthand
    ncarolina: 37, scarolina: 45, ndakota: 38, sdakota: 46, wvirginia: 54,
    nhampshire: 33, njersey: 34, nmexico: 35, nyork: 36,
    // District of Columbia variants
    washingtondc: 11, dcusa: 11,
};

// ---------------------------------------------------------------------------
// Countries — [ISO numeric, name, alpha-2, alpha-3]
// Numeric ids match Vega's world-110m.json `countries` feature ids.
// ---------------------------------------------------------------------------

const COUNTRIES: Array<[number, string, string, string]> = [
    [156, 'China', 'CN', 'CHN'], [356, 'India', 'IN', 'IND'], [840, 'United States', 'US', 'USA'],
    [360, 'Indonesia', 'ID', 'IDN'], [586, 'Pakistan', 'PK', 'PAK'], [566, 'Nigeria', 'NG', 'NGA'],
    [76, 'Brazil', 'BR', 'BRA'], [50, 'Bangladesh', 'BD', 'BGD'], [643, 'Russia', 'RU', 'RUS'],
    [484, 'Mexico', 'MX', 'MEX'], [231, 'Ethiopia', 'ET', 'ETH'], [392, 'Japan', 'JP', 'JPN'],
    [608, 'Philippines', 'PH', 'PHL'], [818, 'Egypt', 'EG', 'EGY'], [180, 'DR Congo', 'CD', 'COD'],
    [704, 'Vietnam', 'VN', 'VNM'], [364, 'Iran', 'IR', 'IRN'], [792, 'Turkey', 'TR', 'TUR'],
    [276, 'Germany', 'DE', 'DEU'], [764, 'Thailand', 'TH', 'THA'], [826, 'United Kingdom', 'GB', 'GBR'],
    [250, 'France', 'FR', 'FRA'], [710, 'South Africa', 'ZA', 'ZAF'], [380, 'Italy', 'IT', 'ITA'],
    [404, 'Kenya', 'KE', 'KEN'], [170, 'Colombia', 'CO', 'COL'], [724, 'Spain', 'ES', 'ESP'],
    [32, 'Argentina', 'AR', 'ARG'], [12, 'Algeria', 'DZ', 'DZA'], [124, 'Canada', 'CA', 'CAN'],
    [616, 'Poland', 'PL', 'POL'], [804, 'Ukraine', 'UA', 'UKR'], [682, 'Saudi Arabia', 'SA', 'SAU'],
    [504, 'Morocco', 'MA', 'MAR'], [604, 'Peru', 'PE', 'PER'], [36, 'Australia', 'AU', 'AUS'],
    [398, 'Kazakhstan', 'KZ', 'KAZ'], [152, 'Chile', 'CL', 'CHL'], [752, 'Sweden', 'SE', 'SWE'],
    [578, 'Norway', 'NO', 'NOR'], [528, 'Netherlands', 'NL', 'NLD'], [56, 'Belgium', 'BE', 'BEL'],
    [756, 'Switzerland', 'CH', 'CHE'], [40, 'Austria', 'AT', 'AUT'], [620, 'Portugal', 'PT', 'PRT'],
    [300, 'Greece', 'GR', 'GRC'], [372, 'Ireland', 'IE', 'IRL'], [246, 'Finland', 'FI', 'FIN'],
    [208, 'Denmark', 'DK', 'DNK'], [554, 'New Zealand', 'NZ', 'NZL'], [410, 'South Korea', 'KR', 'KOR'],
    [458, 'Malaysia', 'MY', 'MYS'], [862, 'Venezuela', 'VE', 'VEN'], [218, 'Ecuador', 'EC', 'ECU'],
    [4, 'Afghanistan', 'AF', 'AFG'], [368, 'Iraq', 'IQ', 'IRQ'], [887, 'Yemen', 'YE', 'YEM'],
    [144, 'Sri Lanka', 'LK', 'LKA'], [104, 'Myanmar', 'MM', 'MMR'], [116, 'Cambodia', 'KH', 'KHM'],
    [24, 'Angola', 'AO', 'AGO'], [834, 'Tanzania', 'TZ', 'TZA'], [800, 'Uganda', 'UG', 'UGA'],
    [716, 'Zimbabwe', 'ZW', 'ZWE'], [288, 'Ghana', 'GH', 'GHA'], [384, 'Ivory Coast', 'CI', 'CIV'],
    [686, 'Senegal', 'SN', 'SEN'],
    // Additional countries — numeric ids verified present in world-110m.json.
    [268, 'Georgia', 'GE', 'GEO'], [524, 'Nepal', 'NP', 'NPL'], [192, 'Cuba', 'CU', 'CUB'],
    [634, 'Qatar', 'QA', 'QAT'], [400, 'Jordan', 'JO', 'JOR'], [422, 'Lebanon', 'LB', 'LBN'],
    [376, 'Israel', 'IL', 'ISR'], [414, 'Kuwait', 'KW', 'KWT'], [512, 'Oman', 'OM', 'OMN'],
    [784, 'United Arab Emirates', 'AE', 'ARE'], [788, 'Tunisia', 'TN', 'TUN'], [434, 'Libya', 'LY', 'LBY'],
    [729, 'Sudan', 'SD', 'SDN'], [120, 'Cameroon', 'CM', 'CMR'], [508, 'Mozambique', 'MZ', 'MOZ'],
    [450, 'Madagascar', 'MG', 'MDG'], [894, 'Zambia', 'ZM', 'ZMB'], [466, 'Mali', 'ML', 'MLI'],
    [854, 'Burkina Faso', 'BF', 'BFA'], [562, 'Niger', 'NE', 'NER'], [148, 'Chad', 'TD', 'TCD'],
    [706, 'Somalia', 'SO', 'SOM'], [68, 'Bolivia', 'BO', 'BOL'], [600, 'Paraguay', 'PY', 'PRY'],
    [858, 'Uruguay', 'UY', 'URY'], [320, 'Guatemala', 'GT', 'GTM'], [340, 'Honduras', 'HN', 'HND'],
    [214, 'Dominican Republic', 'DO', 'DOM'], [591, 'Panama', 'PA', 'PAN'], [188, 'Costa Rica', 'CR', 'CRI'],
    [191, 'Croatia', 'HR', 'HRV'], [688, 'Serbia', 'RS', 'SRB'], [703, 'Slovakia', 'SK', 'SVK'],
    [705, 'Slovenia', 'SI', 'SVN'], [100, 'Bulgaria', 'BG', 'BGR'], [642, 'Romania', 'RO', 'ROU'],
    [348, 'Hungary', 'HU', 'HUN'], [112, 'Belarus', 'BY', 'BLR'], [440, 'Lithuania', 'LT', 'LTU'],
    [428, 'Latvia', 'LV', 'LVA'], [233, 'Estonia', 'EE', 'EST'], [352, 'Iceland', 'IS', 'ISL'],
    [418, 'Laos', 'LA', 'LAO'], [496, 'Mongolia', 'MN', 'MNG'], [408, 'North Korea', 'KP', 'PRK'],
    [158, 'Taiwan', 'TW', 'TWN'], [64, 'Bhutan', 'BT', 'BTN'], [760, 'Syria', 'SY', 'SYR'],
    [203, 'Czechia', 'CZ', 'CZE'], [795, 'Turkmenistan', 'TM', 'TKM'], [860, 'Uzbekistan', 'UZ', 'UZB'],
    [31, 'Azerbaijan', 'AZ', 'AZE'], [51, 'Armenia', 'AM', 'ARM'], [558, 'Nicaragua', 'NI', 'NIC'],
];

/** Extra colloquial names that should resolve to a country numeric id. */
const COUNTRY_ALIASES: Record<string, number> = {
    usa: 840, us: 840, unitedstatesofamerica: 840, america: 840,
    uk: 826, greatbritain: 826, britain: 826, england: 826,
    russianfederation: 643, southkorea: 410, korea: 410, republicofkorea: 410,
    skorea: 410, korearep: 410, koreasouth: 410, koreasouthrepublicof: 410,
    nkorea: 408, koreanorth: 408, koreademrep: 408, dprk: 408,
    democraticpeoplesrepublicofkorea: 408,
    democraticrepublicofthecongo: 180, congokinshasa: 180, drc: 180,
    vietnam: 704, vietnamsocialistrepublic: 704, ivorycoast: 384, cotedivoire: 384,
    iranislamicrepublicof: 364, syrianarabrepublic: 760, tanzaniaunitedrepublicof: 834,
    burma: 104, czechrepublic: 203, czechia: 203, uae: 784, unitedarabemirates: 784,
    holland: 528, thenetherlands: 528, turkiye: 792,
    laopdr: 418, laopeoplesdemocraticrepublic: 418,
};

// ---------------------------------------------------------------------------
// Lookup maps (built once)
// ---------------------------------------------------------------------------

function buildMap(entries: Array<[number, string[]]>): Map<string, number> {
    const m = new Map<string, number>();
    for (const [id, keys] of entries) {
        for (const k of keys) {
            const nk = norm(k);
            if (nk && !m.has(nk)) m.set(nk, id);
        }
    }
    return m;
}

const US_STATE_LOOKUP = (() => {
    const m = buildMap(US_STATES.map(([id, name, usps]) => [id, [name, usps]]));
    for (const [alias, id] of Object.entries(US_STATE_ALIASES)) {
        if (!m.has(alias)) m.set(alias, id);
    }
    return m;
})();

const COUNTRY_LOOKUP = (() => {
    const m = buildMap(COUNTRIES.map(([id, name, a2, a3]) => [id, [name, a2, a3]]));
    for (const [alias, id] of Object.entries(COUNTRY_ALIASES)) {
        if (!m.has(alias)) m.set(alias, id);
    }
    return m;
})();

// ---------------------------------------------------------------------------
// Public resolvers
// ---------------------------------------------------------------------------

/** A choropleth region resolver: user value → TopoJSON numeric feature id. */
export type GeoResolver = (value: unknown) => number | undefined;

function resolveWith(lookup: Map<string, number>, value: unknown): number | undefined {
    if (value == null) return undefined;
    // Already a numeric feature id (or a numeric string like "6" / "06").
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const s = String(value).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    const nk = norm(s);
    if (!nk) return undefined;
    const direct = lookup.get(nk);
    if (direct !== undefined) return direct;
    // Fallback: strip common qualifiers — "State of California", "California,
    // USA", "Washington State" — and retry. Only runs after a direct miss, so
    // legitimate names that happen to end in these tokens still match first.
    let r = nk;
    if (r.startsWith('stateof')) r = r.slice(7);
    if (r.endsWith('usa')) r = r.slice(0, -3);
    else if (r.endsWith('state')) r = r.slice(0, -5);
    if (r !== nk && r) return lookup.get(r);
    return undefined;
}

/** Resolve a US state name / USPS code / FIPS id to its FIPS numeric id. */
export const resolveUsState: GeoResolver = (value) => resolveWith(US_STATE_LOOKUP, value);

/** Resolve a country name / ISO alpha-2 / alpha-3 / numeric to its ISO numeric id. */
export const resolveCountry: GeoResolver = (value) => resolveWith(COUNTRY_LOOKUP, value);

// ---------------------------------------------------------------------------
// Code resolvers — for backends (Plotly) whose native geo traces key on a
// short code rather than a TopoJSON numeric feature id.
//
// Plotly's `choropleth`/`scattergeo` traces resolve `locations` through a
// built-in atlas (no user-supplied TopoJSON needed) keyed on:
//   - `locationmode: 'USA-states'`  → 2-letter USPS codes ("CA")
//   - default (`locationmode: 'ISO-3'`) → 3-letter ISO alpha-3 codes ("USA")
//
// These resolvers share the same gazetteer/alias tables as the numeric-id
// resolvers above (`resolveUsState` / `resolveCountry`), so a value that
// resolves for the Vega-Lite choropleth (name, USPS/ISO code, or a bare
// numeric id) resolves the same way here — same data contract, different
// output shape.
// ---------------------------------------------------------------------------

/** A code resolver: user value → the short code a native geo trace expects. */
export type GeoCodeResolver = (value: unknown) => string | undefined;

function resolveCodeWith(
    lookup: Map<string, number>, codeById: Map<number, string>, value: unknown,
): string | undefined {
    if (value == null) return undefined;
    // A bare numeric id (or numeric string) is resolved through the same
    // id → code table used to build the gazetteer.
    if (typeof value === 'number' && Number.isFinite(value)) return codeById.get(value);
    const s = String(value).trim();
    if (/^\d+$/.test(s)) return codeById.get(parseInt(s, 10));
    const id = resolveWith(lookup, value);
    return id !== undefined ? codeById.get(id) : undefined;
}

const US_STATE_USPS_BY_ID = new Map(US_STATES.map(([id, , usps]) => [id, usps]));
const COUNTRY_ALPHA3_BY_ID = new Map(COUNTRIES.map(([id, , , a3]) => [id, a3]));

/** Resolve a US state name / USPS code / FIPS id to its 2-letter USPS code. */
export const resolveUsStateCode: GeoCodeResolver = (value) =>
    resolveCodeWith(US_STATE_LOOKUP, US_STATE_USPS_BY_ID, value);

/** Resolve a country name / ISO alpha-2 / alpha-3 / numeric to its ISO alpha-3 code. */
export const resolveCountryCode: GeoCodeResolver = (value) =>
    resolveCodeWith(COUNTRY_LOOKUP, COUNTRY_ALPHA3_BY_ID, value);

// ---------------------------------------------------------------------------
// Map scope inference (US vs World) — shared by every backend's Map /
// Choropleth templates so "which base geography do we draw" is decided the
// same way regardless of which renderer draws it.
// ---------------------------------------------------------------------------

export type MapScope = 'us' | 'world';

// Generous bounding box for the United States (contiguous states + Alaska +
// Hawaii). Used only to *infer* scope: a dataset whose every point falls
// inside is treated as a US map; anything outside flips the whole map to world.
const US_LON: readonly [number, number] = [-170, -66];
const US_LAT: readonly [number, number] = [18, 72];

function inUsBox(lon: number, lat: number): boolean {
    return lon >= US_LON[0] && lon <= US_LON[1] && lat >= US_LAT[0] && lat <= US_LAT[1];
}

/** Infer scope for a bubble map from its longitude/latitude points. */
export function inferBubbleScope(rows: any[], lonField?: string, latField?: string): MapScope {
    if (!lonField || !latField) return 'us';
    for (const r of rows) {
        const lon = Number(r[lonField]);
        const lat = Number(r[latField]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        if (!inUsBox(lon, lat)) return 'world';
    }
    return 'us';
}

/** Infer scope for a choropleth from its region keys (names / codes / ids). */
export function inferChoroplethScope(rows: any[], idField?: string): MapScope {
    if (!idField) return 'us';
    for (const r of rows) {
        const v = r[idField];
        if (v == null || v === '') continue;
        // A value that resolves as a US state (by name, USPS code, FIPS id, or a
        // bare numeric that passes straight through) keeps us in the US; the
        // first value that doesn't flips the whole map to world.
        if (resolveUsState(v) === undefined) return 'world';
    }
    return 'us';
}

/**
 * Map the id field's *semantic type* to a map scope. This is the most reliable
 * signal we have: a field declared 'State' should use the US states map and the
 * US-state resolver, a field declared 'Country' the world map and country
 * resolver. It disambiguates the codes that collide between the two namespaces
 * — "CA" (California vs Canada), "IN" (Indiana vs India), "Georgia" (US state
 * vs the country) — which value inference alone cannot. Geographic types that
 * neither base layer can render (City, Region, Address, ZipCode) return
 * undefined so callers fall back to value inference.
 */
const SEMANTIC_SCOPE: Record<string, MapScope> = { State: 'us', Country: 'world' };

export function semanticScope(semType: string | undefined): MapScope | undefined {
    if (!semType) return undefined;
    return Object.prototype.hasOwnProperty.call(SEMANTIC_SCOPE, semType)
        ? SEMANTIC_SCOPE[semType]
        : undefined;
}

/** Honor an explicit `region` choice, else the id field's semantic type, else inference. */
export function pickMapScope(
    chartProperties: any,
    semScope: MapScope | undefined,
    infer: () => MapScope,
): MapScope {
    const choice = chartProperties?.region;
    if (choice === 'us' || choice === 'world') return choice;
    if (semScope) return semScope;
    return infer();
}
