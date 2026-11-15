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
    // The rest of world-110m.json's countries, so every shape on a world map can take a value.
    [8, 'Albania', 'AL', 'ALB'], [10, 'Antarctica', 'AQ', 'ATA'], [44, 'Bahamas', 'BS', 'BHS'],
    [70, 'Bosnia and Herzegovina', 'BA', 'BIH'], [72, 'Botswana', 'BW', 'BWA'], [84, 'Belize', 'BZ', 'BLZ'],
    [90, 'Solomon Islands', 'SB', 'SLB'], [96, 'Brunei', 'BN', 'BRN'], [108, 'Burundi', 'BI', 'BDI'],
    [140, 'Central African Republic', 'CF', 'CAF'], [178, 'Republic of the Congo', 'CG', 'COG'],
    [196, 'Cyprus', 'CY', 'CYP'], [204, 'Benin', 'BJ', 'BEN'], [222, 'El Salvador', 'SV', 'SLV'],
    [226, 'Equatorial Guinea', 'GQ', 'GNQ'], [232, 'Eritrea', 'ER', 'ERI'], [238, 'Falkland Islands', 'FK', 'FLK'],
    [242, 'Fiji', 'FJ', 'FJI'], [260, 'French Southern Territories', 'TF', 'ATF'], [262, 'Djibouti', 'DJ', 'DJI'],
    [266, 'Gabon', 'GA', 'GAB'], [270, 'Gambia', 'GM', 'GMB'], [275, 'Palestine', 'PS', 'PSE'],
    [304, 'Greenland', 'GL', 'GRL'], [324, 'Guinea', 'GN', 'GIN'], [328, 'Guyana', 'GY', 'GUY'],
    [332, 'Haiti', 'HT', 'HTI'], [388, 'Jamaica', 'JM', 'JAM'], [417, 'Kyrgyzstan', 'KG', 'KGZ'],
    [426, 'Lesotho', 'LS', 'LSO'], [430, 'Liberia', 'LR', 'LBR'], [442, 'Luxembourg', 'LU', 'LUX'],
    [454, 'Malawi', 'MW', 'MWI'], [478, 'Mauritania', 'MR', 'MRT'], [498, 'Moldova', 'MD', 'MDA'],
    [499, 'Montenegro', 'ME', 'MNE'], [516, 'Namibia', 'NA', 'NAM'], [540, 'New Caledonia', 'NC', 'NCL'],
    [548, 'Vanuatu', 'VU', 'VUT'], [598, 'Papua New Guinea', 'PG', 'PNG'], [624, 'Guinea-Bissau', 'GW', 'GNB'],
    [626, 'Timor-Leste', 'TL', 'TLS'], [630, 'Puerto Rico', 'PR', 'PRI'], [646, 'Rwanda', 'RW', 'RWA'],
    [694, 'Sierra Leone', 'SL', 'SLE'], [728, 'South Sudan', 'SS', 'SSD'], [732, 'Western Sahara', 'EH', 'ESH'],
    [740, 'Suriname', 'SR', 'SUR'], [748, 'Eswatini', 'SZ', 'SWZ'], [762, 'Tajikistan', 'TJ', 'TJK'],
    [768, 'Togo', 'TG', 'TGO'], [780, 'Trinidad and Tobago', 'TT', 'TTO'], [807, 'North Macedonia', 'MK', 'MKD'],
    // Small states the 110m map is too coarse to draw. They resolve all the same, so a backend that
    // draws them (Plotly's own geography) or a finer base map can colour them.
    [20, 'Andorra', 'AD', 'AND'], [28, 'Antigua and Barbuda', 'AG', 'ATG'], [48, 'Bahrain', 'BH', 'BHR'],
    [52, 'Barbados', 'BB', 'BRB'], [132, 'Cape Verde', 'CV', 'CPV'], [174, 'Comoros', 'KM', 'COM'],
    [212, 'Dominica', 'DM', 'DMA'], [296, 'Kiribati', 'KI', 'KIR'], [308, 'Grenada', 'GD', 'GRD'],
    [336, 'Vatican', 'VA', 'VAT'], [344, 'Hong Kong', 'HK', 'HKG'], [438, 'Liechtenstein', 'LI', 'LIE'],
    [446, 'Macao', 'MO', 'MAC'], [462, 'Maldives', 'MV', 'MDV'], [470, 'Malta', 'MT', 'MLT'],
    [480, 'Mauritius', 'MU', 'MUS'], [492, 'Monaco', 'MC', 'MCO'], [520, 'Nauru', 'NR', 'NRU'],
    [583, 'Micronesia', 'FM', 'FSM'], [584, 'Marshall Islands', 'MH', 'MHL'], [585, 'Palau', 'PW', 'PLW'],
    [659, 'Saint Kitts and Nevis', 'KN', 'KNA'], [662, 'Saint Lucia', 'LC', 'LCA'],
    [670, 'Saint Vincent and the Grenadines', 'VC', 'VCT'], [674, 'San Marino', 'SM', 'SMR'],
    [678, 'Sao Tome and Principe', 'ST', 'STP'], [690, 'Seychelles', 'SC', 'SYC'], [702, 'Singapore', 'SG', 'SGP'],
    [776, 'Tonga', 'TO', 'TON'], [798, 'Tuvalu', 'TV', 'TUV'], [882, 'Samoa', 'WS', 'WSM'],
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
    // "Congo" alone is the Republic, as the UN and Our World in Data name it; DR Congo has its own name.
    congo: 178, congobrazzaville: 178, republicofcongo: 178, congorep: 178,
    democraticrepublicofcongo: 180, congodemrep: 180,
    easttimor: 626, timor: 626, swaziland: 748, macedonia: 807, northmacedonia: 807,
    bosnia: 70, bruneidarussalam: 96, kyrgyzrepublic: 417, republicofmoldova: 498,
    thegambia: 270, gambiathe: 270, thebahamas: 44, bahamasthe: 44,
    stateofpalestine: 275, palestinianterritories: 275, westbankandgaza: 275,
    caboverde: 132, micronesiacountry: 583, micronesiafedsts: 583, hongkongsarchina: 344,
    macaosarchina: 446, holysee: 336, saotomeandprincipe: 678,
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
// Declared key types — a choropleth's `keyType` says what its region key is,
// so the map skips guessing its region and reads the key in that namespace
// only: "CA" as an ISO 2 code is Canada, as a US state it is California.
// ---------------------------------------------------------------------------

/** What a choropleth's region key holds. `auto` reads it as names, codes or ids and infers the map. */
export const MAP_KEY_TYPES = ['auto', 'iso3', 'iso2', 'iso-numeric', 'country-name', 'us-state', 'fips'] as const;
export type MapKeyType = typeof MAP_KEY_TYPES[number];

const COUNTRY_BY_ALPHA2 = new Map(COUNTRIES.map(([id, , a2]) => [a2, id]));
const COUNTRY_BY_ALPHA3 = new Map(COUNTRIES.map(([id, , , a3]) => [a3, id]));
const COUNTRY_IDS = new Set(COUNTRIES.map(([id]) => id));
COUNTRY_BY_ALPHA2.set('UK', 826);

/** The map a declared key type draws, or undefined for `auto`. */
export function keyTypeScope(keyType: unknown): MapScope | undefined {
    if (keyType === 'us-state' || keyType === 'fips') return 'us';
    if (keyType === 'iso3' || keyType === 'iso2' || keyType === 'iso-numeric' || keyType === 'country-name') return 'world';
    return undefined;
}

/** The resolver a declared key type reads its keys with; undefined for `auto` or an unknown type. */
export function keyTypeResolver(keyType: unknown): GeoResolver | undefined {
    const text = (value: unknown) => (value == null ? '' : String(value).trim());
    const digits = (value: unknown) => (/^\d+$/.test(text(value)) ? parseInt(text(value), 10) : undefined);
    switch (keyType) {
        case 'iso3': return (value) => COUNTRY_BY_ALPHA3.get(text(value).toUpperCase());
        case 'iso2': return (value) => COUNTRY_BY_ALPHA2.get(text(value).toUpperCase());
        case 'iso-numeric': return (value) => {
            const id = digits(value);
            return id !== undefined && COUNTRY_IDS.has(id) ? id : undefined;
        };
        case 'country-name': return (value) => (digits(value) === undefined ? resolveCountry(value) : undefined);
        case 'us-state': return (value) => (digits(value) === undefined ? resolveUsState(value) : undefined);
        // A state's FIPS code runs 1–78, a county's five digits.
        case 'fips': return (value) => digits(value);
        default: return undefined;
    }
}

/**
 * Groups of countries that statistics tables list beside the countries themselves — the world,
 * income groups, blocs, continents and World Bank regions, by name or code. Such a row is not a
 * typo to report as unmatched: no single region on the map is it.
 */
const AGGREGATE_REGIONS = new Set([
    'world', 'oecd', 'oecdmembers', 'europeanunion', 'eu', 'eu27', 'eu28', 'euroarea', 'eurozone', 'g7', 'g20',
    'highincome', 'lowincome', 'middleincome', 'lowermiddleincome', 'uppermiddleincome', 'lowandmiddleincome',
    'highincomecountries', 'lowincomecountries', 'africa', 'asia', 'europe', 'oceania', 'americas', 'antarcticregion',
    'northamerica', 'southamerica', 'latinamerica', 'latinamericaandcaribbean', 'latinamericacaribbean',
    'subsaharanafrica', 'middleeast', 'middleeastandnorthafrica', 'middleeastnorthafrica', 'eastasiaandpacific',
    'eastasiapacific', 'southasia', 'europeandcentralasia', 'europecentralasia', 'arabworld', 'leastdevelopedcountries',
    'smallstates', 'fragileandconflictaffectedsituations', 'heavilyindebtedpoorcountries', 'idatotal', 'ibrdonly',
    'wld', 'oed', 'euu', 'emu', 'hic', 'lic', 'lmc', 'umc', 'mic', 'lmy', 'ssf', 'ssa', 'eas', 'eap', 'ecs', 'eca',
    'lcn', 'lac', 'mea', 'mna', 'nac', 'sas', 'arb', 'ldc', 'owid_wrl',
]);

/** Whether a region key names a group of countries rather than one. */
export function isAggregateRegion(value: unknown): boolean {
    if (value == null) return false;
    const key = norm(String(value));
    return AGGREGATE_REGIONS.has(key) || AGGREGATE_REGIONS.has(String(value).trim().toLowerCase());
}

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

const COUNTRY_ALPHA2_BY_ID = new Map(COUNTRIES.map(([id, , a2]) => [id, a2]));

/** A country's ISO alpha-2 or alpha-3 code, from its ISO numeric id. */
export function countryAlpha(id: number, form: 'iso2' | 'iso3'): string | undefined {
    return (form === 'iso2' ? COUNTRY_ALPHA2_BY_ID : COUNTRY_ALPHA3_BY_ID).get(id);
}

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

/** US territory FIPS codes above the 1–56 state range: American Samoa, Guam, Northern Mariana Islands, Puerto Rico, Virgin Islands. */
const US_TERRITORY_FIPS = new Set([60, 66, 69, 72, 78]);

/**
 * Infer scope for a choropleth from its region keys (names / codes / ids).
 *
 * Numeric ids are read by range, since a bare number resolves in both namespaces:
 * US state FIPS run 1–56 (plus territories), county FIPS 1001 and up, and ISO 3166
 * numeric country codes 4–894. Any id in 57–999 that is not a territory FIPS can only
 * be a country, so a dataset keyed by ISO numeric codes (`map_id`) draws the world map.
 */
export function inferChoroplethScope(rows: any[], idField?: string): MapScope {
    if (!idField) return 'us';
    // Named keys are weighed: the US map where US states are at least half of them and outnumber the
    // keys that are only countries, so a total row ("United States") or a stray foreign key among
    // states keeps the states' map, and is reported as unmatched there.
    let named = 0;
    let states = 0;
    let countries = 0;
    const seen = new Set<string>();
    for (const r of rows) {
        const v = r[idField];
        if (v == null || v === '') continue;
        const s = String(v).trim();
        if (/^\d+$/.test(s)) {
            const n = parseInt(s, 10);
            if (n >= 57 && n <= 999 && !US_TERRITORY_FIPS.has(n)) return 'world';
            continue;
        }
        if (seen.has(s)) continue;
        seen.add(s);
        named++;
        if (resolveUsState(v) !== undefined) states++;
        else if (resolveCountry(v) !== undefined) countries++;
    }
    if (named === 0) return 'us';
    return states >= named / 2 && states > countries ? 'us' : 'world';
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

/** Honor an explicit `region` choice, else a declared `keyType`, else the id field's semantic type, else inference. */
export function pickMapScope(
    chartProperties: any,
    semScope: MapScope | undefined,
    infer: () => MapScope,
): MapScope {
    const choice = chartProperties?.region;
    if (choice === 'us' || choice === 'world') return choice;
    const declared = keyTypeScope(chartProperties?.keyType);
    if (declared) return declared;
    if (semScope) return semScope;
    return infer();
}
