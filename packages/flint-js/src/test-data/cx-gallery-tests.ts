// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Representative test cases for the CanvasXpress-exclusive gallery chart types
 * added to the flint CanvasXpress backend (3D scatter, circular bubble/packed,
 * dendrogram tree, tag cloud, statistics boxplot). Synthetic data in flint's
 * usual style — enough structure to read as a real example.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';

/** Small deterministic PRNG so the gallery renders identically every run. */
function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function numMeta(fields: string[]): Record<string, any> {
    const meta: Record<string, any> = {};
    fields.forEach((f) => { meta[f] = { type: Type.Number, semanticType: 'Quantity', levels: [] }; });
    return meta;
}

function catMeta(field: string, levels: string[]): Record<string, any> {
    return { [field]: { type: Type.String, semanticType: 'Category', levels } };
}

// ─── 3D scatter ────────────────────────────────────────────────────────────

export function genScatter3dTests(): TestCase[] {
    const rng = makeRng(70123);
    const species = ['Setosa', 'Versicolor', 'Virginica'];
    const rows: Array<Record<string, any>> = [];
    species.forEach((sp, k) => {
        const base = 3 + k * 2;
        for (let i = 0; i < 40; i++) {
            rows.push({
                'Sepal Length': +(base + rng() * 1.6).toFixed(2),
                'Sepal Width': +(2 + (2 - k) * 0.4 + rng()).toFixed(2),
                'Petal Length': +(1 + k * 2 + rng() * 1.2).toFixed(2),
                Species: sp,
            });
        }
    });
    return [{
        title: 'Iris morphology in 3D (rotatable)',
        description:
            'A rotatable 3D scatter: three numeric measurements on the x/y/z axes, coloured '
            + 'by species. The clusters separate in space — a view the 2D grammar cannot show.',
        tags: ['scatter3d', '3d', 'multivariate', 'scientific', 'gallery'],
        chartType: 'Scatter 3D',
        data: rows,
        fields: ['Sepal Length', 'Sepal Width', 'Petal Length', 'Species'].map((f) => makeField(f)),
        metadata: { ...numMeta(['Sepal Length', 'Sepal Width', 'Petal Length']), ...catMeta('Species', species) },
        encodingMap: {
            x: makeEncodingItem('Sepal Length'),
            y: makeEncodingItem('Sepal Width'),
            z: makeEncodingItem('Petal Length'),
            color: makeEncodingItem('Species'),
        },
    }];
}

// ─── Packed bubble ───────────────────────────────────────────────────────────

export function genBubbleTests(): TestCase[] {
    const rng = makeRng(90218);
    const regions = ['North', 'South', 'East', 'West'];
    const items = [
        'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
        'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
    ];
    const rows = items.map((name, i) => ({
        Item: name,
        Revenue: Math.round(30 + rng() * 220),
        Region: regions[i % regions.length],
    }));
    return [{
        title: 'Revenue by product (packed bubbles)',
        description:
            'A packed-circle chart: every product a circle sized by revenue and coloured by '
            + 'region, packed by the engine. Part-to-whole magnitude at a glance, no axes.',
        tags: ['bubble', 'packed-circle', 'part-to-whole', 'gallery'],
        chartType: 'Bubble Chart',
        data: rows,
        fields: ['Item', 'Revenue', 'Region'].map((f) => makeField(f)),
        metadata: {
            Item: { type: Type.String, semanticType: 'Category', levels: items },
            Revenue: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            Region: { type: Type.String, semanticType: 'Category', levels: regions },
        },
        encodingMap: {
            x: makeEncodingItem('Item'),
            size: makeEncodingItem('Revenue'),
            color: makeEncodingItem('Region'),
        },
    }, genGroupedBubbleCase()];
}

/** Real packed bubbles: 2018 CO2 emissions, continents clustered (via `hierarchy`),
 * countries sized by emissions — the CanvasXpress bubble-2 gallery dataset. */
function genGroupedBubbleCase(): TestCase {
    const rows: Array<{ continent: string; country: string; code: string; co2: number }> = [
        { continent: "Asia", country: "Afghanistan", code: "AFG", co2: 10.452666 },
        { continent: "Europe", country: "Albania", code: "ALB", co2: 5.402999 },
        { continent: "Africa", country: "Algeria", code: "DZA", co2: 164.309295 },
        { continent: "Europe", country: "Andorra", code: "AND", co2: 0.46421 },
        { continent: "Africa", country: "Angola", code: "AGO", co2: 37.678605 },
        { continent: "North America", country: "Anguilla", code: "AIA", co2: 0.147145 },
        { continent: "North America", country: "Antigua & Barbuda", code: "ATG", co2: 0.505574 },
        { continent: "South America", country: "Argentina", code: "ARG", co2: 185.029897 },
        { continent: "Asia", country: "Armenia", code: "ARM", co2: 6.296603 },
        { continent: "North America", country: "Aruba", code: "ABW", co2: 0.943234 },
        { continent: "Oceania", country: "Australia", code: "AUS", co2: 415.953947 },
        { continent: "Europe", country: "Austria", code: "AUT", co2: 66.719678 },
        { continent: "Europe", country: "Azerbaijan", code: "AZE", co2: 37.488394 },
        { continent: "North America", country: "Bahamas", code: "BHS", co2: 2.03001 },
        { continent: "Asia", country: "Bahrain", code: "BHR", co2: 31.594487 },
        { continent: "Asia", country: "Bangladesh", code: "BGD", co2: 85.718805 },
        { continent: "North America", country: "Barbados", code: "BRB", co2: 1.207134 },
        { continent: "Europe", country: "Belarus", code: "BLR", co2: 61.871676 },
        { continent: "Europe", country: "Belgium", code: "BEL", co2: 100.207836 },
        { continent: "North America", country: "Belize", code: "BLZ", co2: 0.612205 },
        { continent: "Africa", country: "Benin", code: "BEN", co2: 7.759753 },
        { continent: "North America", country: "Bermuda", code: "BMU", co2: 0.648945 },
        { continent: "Asia", country: "Bhutan", code: "BTN", co2: 1.662172 },
        { continent: "South America", country: "Bolivia", code: "BOL", co2: 22.345503 },
        { continent: "Europe", country: "Bosnia and Herzegovina", code: "BIH", co2: 22.086102 },
        { continent: "Africa", country: "Botswana", code: "BWA", co2: 6.815418 },
        { continent: "South America", country: "Brazil", code: "BRA", co2: 466.649304 },
        { continent: "North America", country: "British Virgin Islands", code: "VGB", co2: 0.173555 },
        { continent: "Asia", country: "Brunei Darussalam", code: "BRN", co2: 9.560399 },
        { continent: "Europe", country: "Bulgaria", code: "BGR", co2: 43.551599 },
        { continent: "Africa", country: "Burkina Faso", code: "BFA", co2: 4.140342 },
        { continent: "Africa", country: "Burundi", code: "BDI", co2: 0.568028 },
        { continent: "Asia", country: "Cambodia", code: "KHM", co2: 15.479031 },
        { continent: "Africa", country: "Cameroon", code: "CMR", co2: 7.566796 },
        { continent: "North America", country: "Canada", code: "CAN", co2: 586.504635 },
        { continent: "Africa", country: "Cape Verde", code: "CPV", co2: 0.609509 },
        { continent: "Africa", country: "Central African Republic", code: "CAF", co2: 0.300478 },
        { continent: "Africa", country: "Chad", code: "TCD", co2: 1.008035 },
        { continent: "South America", country: "Chile", code: "CHL", co2: 85.829114 },
        { continent: "Asia", country: "China", code: "CHN", co2: 9956.568523 },
        { continent: "South America", country: "Colombia", code: "COL", co2: 92.228209 },
        { continent: "Africa", country: "Comoros", code: "COM", co2: 0.245927 },
        { continent: "Africa", country: "Congo", code: "COG", co2: 3.518309 },
        { continent: "Oceania", country: "Cook Islands", code: "COK", co2: 0.072706 },
        { continent: "Central America", country: "Costa Rica", code: "CRI", co2: 8.249118 },
        { continent: "Europe", country: "Croatia", code: "HRV", co2: 17.718646 },
        { continent: "North America", country: "Cuba", code: "CUB", co2: 26.084446 },
        { continent: "Europe", country: "Cyprus", code: "CYP", co2: 7.332762 },
        { continent: "Europe", country: "Czechia", code: "CZE", co2: 104.411211 },
        { continent: "Africa", country: "Democratic Republic of the Congo", code: "COD", co2: 2.231343 },
        { continent: "Europe", country: "Denmark", code: "DNK", co2: 34.65143 },
        { continent: "Africa", country: "Djibouti", code: "DJI", co2: 0.389975 },
        { continent: "North America", country: "Dominican Republic", code: "DOM", co2: 25.305221 },
        { continent: "South America", country: "Ecuador", code: "ECU", co2: 41.817989 },
        { continent: "Africa", country: "Egypt", code: "EGY", co2: 251.460913 },
        { continent: "Central America", country: "El Salvador", code: "SLV", co2: 6.018265 },
        { continent: "Africa", country: "Equatorial Guinea", code: "GNQ", co2: 5.90578 },
        { continent: "Africa", country: "Eritrea", code: "ERI", co2: 0.708769 },
        { continent: "Europe", country: "Estonia", code: "EST", co2: 17.710953 },
        { continent: "Africa", country: "Ethiopia", code: "ETH", co2: 16.184949 },
        { continent: "Oceania", country: "Fiji", code: "FJI", co2: 2.123769 },
        { continent: "Europe", country: "Finland", code: "FIN", co2: 45.849349 },
        { continent: "Europe", country: "France", code: "FRA", co2: 331.725446 },
        { continent: "Oceania", country: "French Polynesia", code: "PYF", co2: 0.780633 },
        { continent: "Africa", country: "Gabon", code: "GAB", co2: 4.803117 },
        { continent: "Africa", country: "Gambia", code: "GMB", co2: 0.56324 },
        { continent: "Asia", country: "Georgia", code: "GEO", co2: 9.862173 },
        { continent: "Europe", country: "Germany", code: "DEU", co2: 755.362342 },
        { continent: "Africa", country: "Ghana", code: "GHA", co2: 14.479998 },
        { continent: "Europe", country: "Greece", code: "GRC", co2: 71.797869 },
        { continent: "North America", country: "Greenland", code: "GRL", co2: 0.511728 },
        { continent: "North America", country: "Grenada", code: "GRD", co2: 0.278597 },
        { continent: "Central America", country: "Guatemala", code: "GTM", co2: 19.411335 },
        { continent: "Africa", country: "Guinea", code: "GIN", co2: 3.032114 },
        { continent: "Africa", country: "Guinea-Bissau", code: "GNB", co2: 0.308612 },
        { continent: "South America", country: "Guyana", code: "GUY", co2: 2.342628 },
        { continent: "North America", country: "Haiti", code: "HTI", co2: 3.366964 },
        { continent: "Central America", country: "Honduras", code: "HND", co2: 10.470701 },
        { continent: "Asia", country: "Hong Kong", code: "HKG", co2: 42.505723 },
        { continent: "Europe", country: "Hungary", code: "HUN", co2: 49.628491 },
        { continent: "Europe", country: "Iceland", code: "ISL", co2: 3.674529 },
        { continent: "Asia", country: "India", code: "IND", co2: 2591.323739 },
        { continent: "Asia", country: "Indonesia", code: "IDN", co2: 576.58439 },
        { continent: "Asia", country: "Iran", code: "IRN", co2: 755.402186 },
        { continent: "Asia", country: "Iraq", code: "IRQ", co2: 211.270294 },
        { continent: "Europe", country: "Ireland", code: "IRL", co2: 38.803394 },
        { continent: "Asia", country: "Israel", code: "ISR", co2: 62.212641 },
        { continent: "Europe", country: "Italy", code: "ITA", co2: 348.085029 },
        { continent: "North America", country: "Jamaica", code: "JAM", co2: 8.009662 },
        { continent: "Asia", country: "Japan", code: "JPN", co2: 1135.688 },
        { continent: "Asia", country: "Jordan", code: "JOR", co2: 24.923803 },
        { continent: "Asia", country: "Kazakhstan", code: "KAZ", co2: 319.647412 },
        { continent: "Africa", country: "Kenya", code: "KEN", co2: 17.136703 },
        { continent: "Oceania", country: "Kiribati", code: "KIR", co2: 0.068879 },
        { continent: "Asia", country: "Kuwait", code: "KWT", co2: 104.217567 },
        { continent: "Asia", country: "Kyrgyzstan", code: "KGZ", co2: 10.16888 },
        { continent: "Asia", country: "Lao People's Democratic Republic", code: "LAO", co2: 32.26245 },
        { continent: "Europe", country: "Latvia", code: "LVA", co2: 7.859287 },
        { continent: "Asia", country: "Lebanon", code: "LBN", co2: 27.565431 },
        { continent: "Africa", country: "Lesotho", code: "LSO", co2: 2.425558 },
        { continent: "Africa", country: "Liberia", code: "LBR", co2: 1.27446 },
        { continent: "Africa", country: "Libya", code: "LBY", co2: 45.205986 },
        { continent: "Europe", country: "Liechtenstein", code: "LIE", co2: 0.14375 },
        { continent: "Europe", country: "Lithuania", code: "LTU", co2: 13.669492 },
        { continent: "Europe", country: "Luxembourg", code: "LUX", co2: 9.56852 },
        { continent: "Asia", country: "Macao", code: "MAC", co2: 2.216456 },
        { continent: "Africa", country: "Madagascar", code: "MDG", co2: 4.187806 },
        { continent: "Africa", country: "Malawi", code: "MWI", co2: 1.470252 },
        { continent: "Asia", country: "Malaysia", code: "MYS", co2: 249.144498 },
        { continent: "Asia", country: "Maldives", code: "MDV", co2: 1.565092 },
        { continent: "Africa", country: "Mali", code: "MLI", co2: 3.273276 },
        { continent: "Europe", country: "Malta", code: "MLT", co2: 1.531581 },
        { continent: "Oceania", country: "Marshall Islands", code: "MHL", co2: 0.153065 },
        { continent: "Africa", country: "Mauritania", code: "MRT", co2: 3.934804 },
        { continent: "Africa", country: "Mauritius", code: "MUS", co2: 4.901611 },
        { continent: "North America", country: "Mexico", code: "MEX", co2: 451.080829 },
        { continent: "Europe", country: "Moldova", code: "MDA", co2: 5.877784 },
        { continent: "Asia", country: "Mongolia", code: "MNG", co2: 64.508256 },
        { continent: "Europe", country: "Montenegro", code: "MNE", co2: 2.123147 },
        { continent: "Africa", country: "Morocco", code: "MAR", co2: 65.367444 },
        { continent: "Africa", country: "Mozambique", code: "MOZ", co2: 8.383478 },
        { continent: "Asia", country: "Myanmar", code: "MMR", co2: 26.095603 },
        { continent: "Africa", country: "Namibia", code: "NAM", co2: 4.154302 },
        { continent: "Oceania", country: "Nauru", code: "NRU", co2: 0.049746 },
        { continent: "Asia", country: "Nepal", code: "NPL", co2: 13.410432 },
        { continent: "Europe", country: "Netherlands", code: "NLD", co2: 160.170147 },
        { continent: "Oceania", country: "New Caledonia", code: "NCL", co2: 8.20904 },
        { continent: "Oceania", country: "New Zealand", code: "NZL", co2: 35.080341 },
        { continent: "Central America", country: "Nicaragua", code: "NIC", co2: 5.377193 },
        { continent: "Africa", country: "Niger", code: "NER", co2: 2.093847 },
        { continent: "Africa", country: "Nigeria", code: "NGA", co2: 136.078346 },
        { continent: "Oceania", country: "Niue", code: "NIU", co2: 0.007653 },
        { continent: "Asia", country: "Democratic People's Republic of Korea", code: "PRK", co2: 38.162935 },
        { continent: "Europe", country: "The former Yugoslav Republic of Macedonia", code: "MKD", co2: 6.980909 },
        { continent: "Europe", country: "Norway", code: "NOR", co2: 43.817657 },
        { continent: "Asia", country: "Oman", code: "OMN", co2: 71.029916 },
        { continent: "Asia", country: "Pakistan", code: "PAK", co2: 247.425382 },
        { continent: "Central America", country: "Panama", code: "PAN", co2: 12.096333 },
        { continent: "Oceania", country: "Papua New Guinea", code: "PNG", co2: 6.786146 },
        { continent: "South America", country: "Paraguay", code: "PRY", co2: 8.103032 },
        { continent: "South America", country: "Peru", code: "PER", co2: 54.210259 },
        { continent: "Asia", country: "Philippines", code: "PHL", co2: 138.924391 },
        { continent: "Europe", country: "Poland", code: "POL", co2: 337.705742 },
        { continent: "Europe", country: "Portugal", code: "PRT", co2: 51.482481 },
        { continent: "Africa", country: "Qatar", code: "QAT", co2: 109.24468 },
        { continent: "Europe", country: "Romania", code: "ROU", co2: 76.951219 },
        { continent: "Asia", country: "Russia", code: "RUS", co2: 1691.360426 },
        { continent: "Africa", country: "Rwanda", code: "RWA", co2: 1.080098 },
        { continent: "Africa", country: "Saint Helena", code: "SHN", co2: 0.011319 },
        { continent: "North America", country: "Saint Kitts and Nevis", code: "KNA", co2: 0.249014 },
        { continent: "North America", country: "Saint Lucia", code: "LCA", co2: 0.362202 },
        { continent: "North America", country: "Saint Pierre and Miquelon", code: "SPM", co2: 0.079232 },
        { continent: "North America", country: "Saint Vincent and the Grenadines", code: "VCT", co2: 0.264106 },
        { continent: "Oceania", country: "Samoa", code: "WSM", co2: 0.267864 },
        { continent: "Africa", country: "Sao Tome and Principe", code: "STP", co2: 0.126126 },
        { continent: "Asia", country: "Saudi Arabia", code: "SAU", co2: 576.757836 },
        { continent: "Europe", country: "Serbia", code: "SRB", co2: 46.0531 },
        { continent: "Africa", country: "Seychelles", code: "SYC", co2: 0.60536 },
        { continent: "Africa", country: "Sierra Leone", code: "SLE", co2: 0.987559 },
        { continent: "Asia", country: "Singapore", code: "SGP", co2: 38.28806 },
        { continent: "Europe", country: "Slovakia", code: "SVK", co2: 36.087837 },
        { continent: "Europe", country: "Slovenia", code: "SVN", co2: 14.487844 },
        { continent: "Oceania", country: "Solomon Islands", code: "SLB", co2: 0.298477 },
        { continent: "Africa", country: "Somalia", code: "SOM", co2: 0.658329 },
        { continent: "Asia", country: "Republic of Korea", code: "KOR", co2: 634.934068 },
        { continent: "Africa", country: "South Sudan", code: "SSD", co2: 1.539884 },
        { continent: "Europe", country: "Spain", code: "ESP", co2: 269.654254 },
        { continent: "Asia", country: "Sri Lanka", code: "LKA", co2: 22.973233 },
        { continent: "Africa", country: "Sudan", code: "SDN", co2: 22.372399 },
        { continent: "South America", country: "Suriname", code: "SUR", co2: 2.551817 },
        { continent: "Europe", country: "Sweden", code: "SWE", co2: 41.766183 },
        { continent: "Europe", country: "Switzerland", code: "CHE", co2: 36.895485 },
        { continent: "Asia", country: "Syria", code: "SYR", co2: 25.877689 },
        { continent: "Asia", country: "Taiwan", code: "TWN", co2: 273.104667 },
        { continent: "Asia", country: "Tajikistan", code: "TJK", co2: 7.473265 },
        { continent: "Africa", country: "Tanzania", code: "TZA", co2: 11.501889 },
        { continent: "Asia", country: "Thailand", code: "THA", co2: 292.452995 },
        { continent: "Asia", country: "Timor-Leste", code: "TLS", co2: 0.520422 },
        { continent: "Africa", country: "Togo", code: "TGO", co2: 3.167303 },
        { continent: "Oceania", country: "Tonga", code: "TON", co2: 0.164545 },
        { continent: "North America", country: "Trinidad and Tobago", code: "TTO", co2: 37.865571 },
        { continent: "Africa", country: "Tunisia", code: "TUN", co2: 30.357093 },
        { continent: "Asia", country: "Turkey", code: "TUR", co2: 419.194747 },
        { continent: "Asia", country: "Turkmenistan", code: "TKM", co2: 78.034724 },
        { continent: "Oceania", country: "Tuvalu", code: "TUV", co2: 0.01148 },
        { continent: "Africa", country: "Uganda", code: "UGA", co2: 5.384767 },
        { continent: "Europe", country: "Ukraine", code: "UKR", co2: 231.694165 },
        { continent: "Asia", country: "United Arab Emirates", code: "ARE", co2: 188.541366 },
        { continent: "Europe", country: "United Kingdom", code: "GBR", co2: 380.138559 },
        { continent: "North America", country: "United States", code: "USA", co2: 5424.881502 },
        { continent: "South America", country: "Uruguay", code: "URY", co2: 6.251839 },
        { continent: "Asia", country: "Uzbekistan", code: "UZB", co2: 113.93837 },
        { continent: "Oceania", country: "Vanuatu", code: "VUT", co2: 0.145412 },
        { continent: "South America", country: "Venezuela", code: "VEN", co2: 129.596274 },
        { continent: "Asia", country: "Vietnam", code: "VNM", co2: 211.774129 },
        { continent: "Asia", country: "Yemen", code: "YEM", co2: 9.945288 },
        { continent: "Africa", country: "Zambia", code: "ZMB", co2: 6.930094 },
        { continent: "Africa", country: "Zimbabwe", code: "ZWE", co2: 11.340575 },
    ];
    const continents = Array.from(new Set(rows.map((r) => r.continent)));
    return {
        title: 'Annual CO2 emissions in 2018 (by continent)',
        description:
            'A grouped packed-bubble chart of 2018 CO2 emissions: every country is a circle '
            + 'sized by its emissions, clustered into one packed group per continent (the '
            + '`hierarchy`) and coloured by continent — within- and across-continent magnitude '
            + 'both read at a glance.',
        tags: ['bubble', 'packed-circle', 'grouped', 'hierarchy', 'co2', 'gallery'],
        chartType: 'Bubble Chart',
        data: rows,
        fields: ['continent', 'country', 'code', 'co2'].map((f) => makeField(f)),
        metadata: {
            continent: { type: Type.String, semanticType: 'Category', levels: continents },
            country: { type: Type.String, semanticType: 'Category', levels: rows.map((r) => r.country) },
            code: { type: Type.String, semanticType: 'Category', levels: rows.map((r) => r.code) },
            co2: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        },
        encodingMap: {
            x: makeEncodingItem('country'),
            size: makeEncodingItem('co2'),
            color: makeEncodingItem('continent'),
            group: makeEncodingItem('continent'),
        },
    };
}

// ─── Tag cloud ───────────────────────────────────────────────────────────────

export function genTagCloudTests(): TestCase[] {
    const words = [
        ['data', 90], ['visualization', 72], ['chart', 64], ['analysis', 58], ['genomics', 51],
        ['interactive', 47], ['heatmap', 43], ['network', 40], ['scatter', 37], ['cluster', 34],
        ['boxplot', 31], ['volcano', 29], ['pathway', 27], ['expression', 25], ['reproducible', 23],
        ['dashboard', 21], ['statistics', 19], ['correlation', 17], ['pie', 15], ['bar', 13],
    ];
    const rows = words.map(([word, weight]) => ({ Term: word as string, Frequency: weight as number }));
    return [{
        title: 'Term frequency (tag cloud)',
        description:
            'A tag cloud: each term sized by its frequency and packed into the canvas — a quick '
            + 'read of relative emphasis across a vocabulary.',
        tags: ['tagcloud', 'wordcloud', 'text', 'gallery'],
        chartType: 'Tag Cloud',
        data: rows,
        fields: ['Term', 'Frequency'].map((f) => makeField(f)),
        metadata: {
            Term: { type: Type.String, semanticType: 'Category', levels: words.map((w) => w[0] as string) },
            Frequency: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        },
        encodingMap: {
            x: makeEncodingItem('Term'),
            size: makeEncodingItem('Frequency'),
        },
    }];
}

// ─── Hierarchy tree ──────────────────────────────────────────────────────────

export function genTreeTests(): TestCase[] {
    const rng = makeRng(13370);
    const tree: Record<string, Record<string, string[]>> = {
        Engineering: { Platform: ['Core', 'API'], Mobile: ['iOS', 'Android'] },
        Sales: { Enterprise: ['East', 'West'], SMB: ['Inbound', 'Field'] },
        Research: { Bio: ['Genomics', 'Proteomics'], Data: ['ML', 'Viz'] },
    };
    const rows: Array<Record<string, any>> = [];
    for (const division of Object.keys(tree)) {
        for (const department of Object.keys(tree[division])) {
            for (const team of tree[division][department]) {
                rows.push({
                    Division: division,
                    Department: department,
                    Team: team,
                    Headcount: Math.round(5 + rng() * 25),
                });
            }
        }
    }
    return [{
        title: 'Org hierarchy (collapsible tree)',
        description:
            'A hierarchical node-link tree: divisions branch into departments branch into '
            + 'teams (the leaves), coloured by division. A real collapsible dendrogram — '
            + 'click a node to fold/unfold its subtree.',
        tags: ['tree', 'hierarchy', 'dendrogram', 'node-link', 'gallery'],
        chartType: 'Tree',
        data: rows,
        fields: ['Division', 'Department', 'Team', 'Headcount'].map((f) => makeField(f)),
        metadata: {
            Division: { type: Type.String, semanticType: 'Category', levels: Object.keys(tree) },
            Department: { type: Type.String, semanticType: 'Category', levels: [] },
            Team: { type: Type.String, semanticType: 'Category', levels: [] },
            Headcount: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        },
        encodingMap: {
            x: makeEncodingItem('Team'),
            color: makeEncodingItem('Division'),
        },
    }];
}
