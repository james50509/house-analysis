export interface GeoCoord {
    lat: number;
    lng: number;
}

export interface GeoCache {
    [key: string]: GeoCoord;
}

interface ArcGisCandidate {
    location?: { x: number; y: number };
    score?: number;
    attributes?: {
        Addr_type?: string;
        Score?: number;
    };
}

const CACHE_KEY = 'geo_cache_v12_manual_project_presets';

const DISTRICTS = [
    '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
    '板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區', '淡水區', '五股區',
    '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區', '雙溪區', '貢寮區', '金山區',
    '萬里區', '烏來區', '鶯歌區', '三峽區', '瑞芳區'
];

const TAIPEI_DISTRICTS = new Set([
    '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'
]);

const DISTRICT_CITY_MAP: Record<string, string> = Object.fromEntries(
    DISTRICTS.map(dist => [dist, TAIPEI_DISTRICTS.has(dist) ? '臺北市' : '新北市'])
);

const TAIPEI_NEW_TAIPEI_BOUNDS = {
    minLat: 24.75,
    maxLat: 25.35,
    minLng: 121.25,
    maxLng: 122.05
};

// Local presets prevent public geocoders from pinning Taiwanese addresses to the wrong city.
// Coordinates are project/building anchors when a doorplate exists, and road-block anchors when the source file only has a road/land section.
const PROJECT_COORDS_PRESET: Record<string, GeoCoord> = {
    '睿泰曜': { lat: 25.05166667, lng: 121.56525 },
    '西華璞園': { lat: 25.05805556, lng: 121.54586111 },
    '金朋馥蓊': { lat: 25.04961111, lng: 121.54480556 },
    '敦睦': { lat: 25.05083333, lng: 121.5475 },
    '鳴森苑': { lat: 25.05663, lng: 121.56392 },
    '崧?': { lat: 25.05008333, lng: 121.57152778 },
    '崧喆': { lat: 25.05008333, lng: 121.57152778 },
    '勤美璞真城仰': { lat: 25.05638, lng: 121.54812 },
    '沐青': { lat: 25.05152, lng: 121.56902 },
    '杜拜藝術館': { lat: 25.04842, lng: 121.55552 },
    '南京鉑蘊': { lat: 25.05111111, lng: 121.56111111 },
    '筑丰敦匯': { lat: 25.04975, lng: 121.55302778 },
    '敦仰': { lat: 25.05077778, lng: 121.54852778 },
    '敦北VOGUE': { lat: 25.05136111, lng: 121.554 },
    '聲光沁玥': { lat: 25.04611111, lng: 121.55833333 },
    '和風悅': { lat: 25.05195, lng: 121.56670 },
    '碧硯閣': { lat: 25.05642, lng: 121.56310 },
    '松捷樂': { lat: 25.05027, lng: 121.57738 },
    '璞園樸園': { lat: 25.05386111, lng: 121.5505 },
    '京釀': { lat: 25.05291667, lng: 121.56688889 },
    '八德采邑': { lat: 25.04855, lng: 121.56232 },
    '國美榕遇': { lat: 25.04655556, lng: 121.56800000 },
    '吉祥．如藝': { lat: 25.04630556, lng: 121.56786111 },
    '吉祥?如藝': { lat: 25.04630556, lng: 121.56786111 },
    '耑序': { lat: 25.04236111, lng: 121.55050000 },
    '青后': { lat: 25.04355556, lng: 121.56622222 },
    '達欣文和苑': { lat: 25.04972222, lng: 121.54166667 },
    'ASTER ONE': { lat: 25.04055556, lng: 121.50722222 },
    '德運元鼎': { lat: 25.04027778, lng: 121.55611111 },
    '宏築臻玥': { lat: 25.05555556, lng: 121.53750000 },
    '親家JIA': { lat: 25.04419444, lng: 121.54291667 }
};

const ADDRESS_COORDS_PRESET: Array<{ pattern: string; coord: GeoCoord }> = [
    { pattern: '南京東路五段253號', coord: PROJECT_COORDS_PRESET['睿泰曜'] },
    { pattern: '民生東路三段111號', coord: PROJECT_COORDS_PRESET['西華璞園'] },
    { pattern: '南京東路三段256巷', coord: PROJECT_COORDS_PRESET['金朋馥蓊'] },
    { pattern: '敦化北路50巷16號', coord: PROJECT_COORDS_PRESET['敦睦'] },
    { pattern: '延壽街', coord: PROJECT_COORDS_PRESET['鳴森苑'] },
    { pattern: '八德路四段', coord: PROJECT_COORDS_PRESET['崧喆'] },
    { pattern: '敦化段一小段45號', coord: PROJECT_COORDS_PRESET['勤美璞真城仰'] },
    { pattern: '南京東路五段386號', coord: PROJECT_COORDS_PRESET['沐青'] },
    { pattern: '八德路三段155巷4弄18號', coord: PROJECT_COORDS_PRESET['杜拜藝術館'] },
    { pattern: '南京東路五段', coord: PROJECT_COORDS_PRESET['南京鉑蘊'] },
    { pattern: '北寧路32巷', coord: PROJECT_COORDS_PRESET['筑丰敦匯'] },
    { pattern: '敦化北路8號', coord: PROJECT_COORDS_PRESET['敦仰'] },
    { pattern: '南京東路四段66號', coord: PROJECT_COORDS_PRESET['敦北VOGUE'] },
    { pattern: '光復南路45巷13號', coord: PROJECT_COORDS_PRESET['聲光沁玥'] },
    { pattern: '南京東路五段291巷29弄30', coord: PROJECT_COORDS_PRESET['和風悅'] },
    { pattern: '八德路四段599號', coord: PROJECT_COORDS_PRESET['松捷樂'] },
    { pattern: '敦化北路145巷', coord: PROJECT_COORDS_PRESET['璞園樸園'] },
    { pattern: '南京東路五段291巷29弄23號', coord: PROJECT_COORDS_PRESET['京釀'] },
    { pattern: '八德路四段175號', coord: PROJECT_COORDS_PRESET['八德采邑'] }
];

function normalizeAddress(value: string): string {
    return value
        .replace(/[\uff01-\uff5e]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
        .replace(/\u3000/g, '')
        .replace(/\s+/g, '')
        .replace(/臺/g, '台')
        .trim();
}

function normalizeProject(value?: string): string {
    return normalizeAddress(value || '').replace(/\(.+\)$/, '');
}

function lookupPreset(projectName?: string, address?: string): GeoCoord | null {
    const project = normalizeProject(projectName);
    if (project && PROJECT_COORDS_PRESET[project]) return PROJECT_COORDS_PRESET[project];

    if (project) {
        const fuzzyKey = Object.keys(PROJECT_COORDS_PRESET).find(key => {
            const normalizedKey = normalizeProject(key);
            return normalizedKey.includes(project) || project.includes(normalizedKey);
        });

        if (fuzzyKey) return PROJECT_COORDS_PRESET[fuzzyKey];
    }

    const normalizedAddress = normalizeAddress(address || '');
    const addressPreset = ADDRESS_COORDS_PRESET.find(item => normalizedAddress.includes(normalizeAddress(item.pattern)));
    return addressPreset?.coord || null;
}

function hasHouseNumber(value: string): boolean {
    return /\d+(?:巷\d+)?(?:弄\d+)?號/.test(value);
}

function hasPreciseRoadSegment(value: string): boolean {
    return /(?:路|街|大道|巷|弄)/.test(value) && hasHouseNumber(value);
}

function inSupportedBounds(coord: GeoCoord): boolean {
    return coord.lat >= TAIPEI_NEW_TAIPEI_BOUNDS.minLat
        && coord.lat <= TAIPEI_NEW_TAIPEI_BOUNDS.maxLat
        && coord.lng >= TAIPEI_NEW_TAIPEI_BOUNDS.minLng
        && coord.lng <= TAIPEI_NEW_TAIPEI_BOUNDS.maxLng;
}

function makeCacheKey(address: string, dist: string, projectName?: string): string {
    return `${normalizeProject(projectName)}_${normalizeAddress(address)}_${dist}`;
}

export class GeoManager {
    static loadCache(): GeoCache {
        try {
            const c = localStorage.getItem(CACHE_KEY);
            return c ? JSON.parse(c) : {};
        } catch {
            return {};
        }
    }

    static saveCache(cache: GeoCache) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            console.error('Cache save failed', e);
        }
    }

    static async geocode(query: string, dist: string, cache: GeoCache, projectName?: string): Promise<GeoCoord | null> {
        const preset = lookupPreset(projectName, query);
        if (preset) return preset;

        const cleanQuery = normalizeAddress(query);
        const city = DISTRICT_CITY_MAP[dist] || '';
        const cleanAddress = cleanQuery.includes('市') || cleanQuery.includes('縣')
            ? cleanQuery
            : `${city}${dist}${cleanQuery.replace(dist, '')}`;

        // Missing pins are safer than wrong pins. Public geocoders often over-match Taiwan postal codes.
        if (!hasPreciseRoadSegment(cleanAddress)) return null;

        const cacheKey = makeCacheKey(cleanAddress, dist, projectName);
        if (cache[cacheKey]) return cache[cacheKey];

        const exact = await this.fetchApi(cleanAddress);
        if (exact) {
            cache[cacheKey] = exact;
            return exact;
        }

        return null;
    }

    private static async fetchApi(q: string): Promise<GeoCoord | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            const params = new URLSearchParams({
                f: 'json',
                singleLine: q,
                maxLocations: '5',
                countryCode: 'TWN',
                outFields: 'Addr_type,Score'
            });

            const res = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params.toString()}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) return null;
            const json = await res.json();
            const candidates = (json.candidates || []) as ArcGisCandidate[];
            const acceptedTypes = new Set(['PointAddress', 'StreetAddress', 'Subaddress']);
            const best = candidates.find(candidate => {
                const score = candidate.score ?? candidate.attributes?.Score ?? 0;
                const addrType = candidate.attributes?.Addr_type || '';
                const coord = candidate.location ? { lat: candidate.location.y, lng: candidate.location.x } : null;
                return score >= 88 && acceptedTypes.has(addrType) && coord && inSupportedBounds(coord);
            });

            if (!best?.location) return null;
            return { lat: best.location.y, lng: best.location.x };
        } catch {
            console.warn(`Geocode API failed for: ${q}`);
            return null;
        }
    }
}
