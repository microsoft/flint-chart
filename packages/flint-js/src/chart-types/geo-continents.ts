// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The continents a map's data can be framed by: which continent each country belongs to (the UN's
 * M49 grouping: Russia in Europe, Turkey and the Caucasus in Asia, Central America and the Caribbean
 * in North America), and the frame an atlas draws each continent in.
 */

import { keyTypeResolver } from './geo';
import type { GeoBox } from './geo-frame';

export const CONTINENTS = ['europe', 'africa', 'asia', 'northAmerica', 'southAmerica', 'oceania'] as const;
export type Continent = typeof CONTINENTS[number];

/** Each continent as an atlas frames it: its mainland and near islands, not every outlying territory. */
export const CONTINENT_FRAMES: Record<Continent, GeoBox> = {
    europe: [-25, 34, 45, 72],
    africa: [-18, -35, 52, 38],
    asia: [26, -11, 146, 56],
    northAmerica: [-168, 7, -52, 72],
    southAmerica: [-82, -56, -34, 13],
    // Across the antimeridian to Samoa and Tonga.
    oceania: [112, -48, 189, 0],
};

/** ISO 3166-1 alpha-3 codes by continent. */
const MEMBERS: Record<Continent, string> = {
    africa: 'DZA AGO BEN BWA BFA BDI CPV CMR CAF TCD COM COG COD CIV DJI EGY GNQ ERI SWZ ETH GAB GMB GHA GIN GNB KEN LSO LBR LBY MDG MWI MLI MRT MUS MAR MOZ NAM NER NGA RWA STP SEN SYC SLE SOM ZAF SSD SDN TZA TGO TUN UGA ZMB ZWE ESH SHN IOT',
    europe: 'ALB AND AUT BLR BEL BIH BGR HRV CZE DNK EST FIN FRA DEU GRC HUN ISL IRL ITA LVA LIE LTU LUX MLT MDA MCO MNE NLD MKD NOR POL PRT ROU RUS SMR SRB SVK SVN ESP SWE CHE UKR GBR VAT XKX FRO GIB GGY JEY IMN ALA SJM',
    asia: 'AFG ARM AZE BHR BGD BTN BRN KHM CHN CYP GEO IND IDN IRN IRQ ISR JPN JOR KAZ KWT KGZ LAO LBN MYS MDV MNG MMR NPL PRK OMN PAK PSE PHL QAT SAU SGP KOR LKA SYR TWN TJK THA TLS TUR TKM ARE UZB VNM YEM HKG MAC',
    northAmerica: 'ATG BHS BRB BLZ CAN CRI CUB DMA DOM SLV GRD GTM HTI HND JAM MEX NIC PAN KNA LCA VCT TTO USA GRL BMU PRI ABW AIA BES BLM CUW MAF MSR SPM SXM TCA VGB VIR CYM',
    southAmerica: 'ARG BOL BRA CHL COL ECU GUY PRY PER SUR URY VEN FLK SGS',
    oceania: 'AUS FJI KIR MHL FSM NRU NZL PLW PNG WSM SLB TON TUV VUT ASM COK GUM MNP NCL NFK NIU PCN PYF TKL WLF UMI CCK CXR HMD',
};

/** ISO 3166-1 numeric codes of the territories the country gazetteer leaves out. */
const TERRITORY_IDS: Record<string, number> = {
    ABW: 533, AIA: 660, ALA: 248, ASM: 16, BES: 535, BLM: 652, BMU: 60, CCK: 166, COK: 184, CUW: 531,
    CXR: 162, CYM: 136, FRO: 234, GGY: 831, GIB: 292, GUM: 316, HMD: 334, IMN: 833, IOT: 86, JEY: 832,
    MAF: 663, MNP: 580, MSR: 500, NFK: 574, NIU: 570, PCN: 612, PYF: 258, SGS: 239, SHN: 654, SJM: 744,
    SPM: 666, SXM: 534, TCA: 796, TKL: 772, UMI: 581, VGB: 92, VIR: 850, WLF: 876,
};

const CONTINENT_BY_ID: ReadonlyMap<number, Continent> = (() => {
    const numeric = keyTypeResolver('iso3')!;
    const out = new Map<number, Continent>();
    for (const continent of CONTINENTS) {
        for (const code of MEMBERS[continent].split(' ')) {
            const id = numeric(code) ?? TERRITORY_IDS[code];
            if (id !== undefined) out.set(id, continent);
        }
    }
    return out;
})();

/** The continent a country belongs to, by ISO numeric id. */
export function continentOf(id: number): Continent | undefined {
    return CONTINENT_BY_ID.get(id);
}

/** The continent a place lies in: the frame that holds it, the one whose middle is nearer where two do (Istanbul in Europe, Cairo in Africa). */
export function continentAt(lon: number, lat: number): Continent | undefined {
    let best: Continent | undefined;
    let nearest = Infinity;
    for (const continent of CONTINENTS) {
        const [w, s, e, n] = CONTINENT_FRAMES[continent];
        // A frame across the antimeridian holds a place west of it as that place plus 360°.
        const at = lon < w && lon + 360 <= e ? lon + 360 : lon;
        if (at < w || at > e || lat < s || lat > n) continue;
        const distance = Math.hypot(at - (w + e) / 2, lat - (s + n) / 2);
        if (distance < nearest) [best, nearest] = [continent, distance];
    }
    return best;
}
