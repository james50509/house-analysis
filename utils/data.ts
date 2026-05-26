import * as XLSX from 'xlsx';
import * as d3 from 'd3';
import { HouseData, ParkingData, ProcessingResult, RawRow } from '../types';

const M2_TO_PING = 0.3025;
const SQM_UNIT_TO_WAN_PER_PING = 3.305785 / 10000;

const DISTRICTS = [
    '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
    '板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '土城區', '蘆洲區', '汐止區', '樹林區', '鶯歌區', '三峽區',
    '淡水區', '瑞芳區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區',
    '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區'
].sort((a, b) => b.length - a.length);

const TAIPEI_DISTRICTS = new Set([
    '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區'
]);

const DISTRICT_CITY_MAP: { [key: string]: string } = Object.fromEntries(
    DISTRICTS.map(dist => [dist, TAIPEI_DISTRICTS.has(dist) ? '臺北市' : '新北市'])
);

const CHINESE_NUM: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
};

function normalizeHeader(value: any): string {
    return String(value ?? '')
        .replace(/\s+/g, '')
        .replace(/[()（）:：]/g, '')
        .trim();
}

function findKey(row: RawRow, aliases: string[]): string | null {
    const normalizedAliases = aliases.map(normalizeHeader);
    return Object.keys(row).find(key => {
        const nk = normalizeHeader(key);
        return normalizedAliases.some(alias => nk.includes(alias));
    }) || null;
}

function parseNumber(value: any): number {
    if (value == null) return 0;
    const text = String(value)
        .replace(/,/g, '')
        .replace(/[萬元坪元]/g, '')
        .replace(/平方公尺|平方|公尺|㎡|m2/gi, '')
        .replace(/--|－|—|-/g, '')
        .trim();
    const parsed = parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseROCDate(value: any): Date | null {
    if (value == null || value === '') return null;

    if (typeof value === 'number') {
        if (value > 100000 && value < 2000000) return parseROCDate(String(Math.trunc(value)));
        const excelDate = new Date((value - 25569) * 86400 * 1000);
        return Number.isNaN(excelDate.getTime()) ? null : excelDate;
    }

    const text = String(value).trim().replace(/\u3000/g, '').replace(/\./g, '/').replace(/-/g, '/');
    const slashParts = text.split('/').map(part => parseInt(part, 10));
    if (slashParts.length >= 3 && slashParts.every(Number.isFinite)) {
        const year = slashParts[0] < 1911 ? slashParts[0] + 1911 : slashParts[0];
        const date = new Date(year, slashParts[1] - 1, slashParts[2]);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const compact = text.match(/^(\d{3,4})(\d{2})(\d{2})$/);
    if (compact) {
        const year = parseInt(compact[1], 10);
        const date = new Date(year < 1911 ? year + 1911 : year, parseInt(compact[2], 10) - 1, parseInt(compact[3], 10));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

function chineseFloorToNumber(text: string): number | null {
    if (!text) return null;
    if (/^\d+$/.test(text)) return parseInt(text, 10);
    if (text === '十') return 10;

    const tenIndex = text.indexOf('十');
    if (tenIndex >= 0) {
        const tensText = text.slice(0, tenIndex);
        const onesText = text.slice(tenIndex + 1);
        const tens = tensText ? CHINESE_NUM[tensText] || 0 : 1;
        const ones = onesText ? CHINESE_NUM[onesText] || 0 : 0;
        return tens * 10 + ones;
    }

    return CHINESE_NUM[text] ?? null;
}

function parseFloorStr(value: any): number | null {
    if (value == null || String(value).trim() === '') return null;
    let text = String(value).split('/')[0].trim();
    let sign = 1;
    if (/^B/i.test(text) || text.includes('地下')) {
        sign = -1;
        text = text.replace(/^B/i, '').replace(/地下/g, '');
    }

    text = text.replace(/[樓層Ff]/g, '').replace(/第/g, '').trim();
    const numeric = parseInt(text, 10);
    if (Number.isFinite(numeric)) return numeric * sign;

    const chinese = chineseFloorToNumber(text);
    return chinese == null ? null : chinese * sign;
}

function convertAreaToPing(value: number, key?: string | null, raw?: any): number {
    const hint = `${key || ''}${raw || ''}`;
    return /平方公尺|公尺|㎡|m2/i.test(hint) ? value * M2_TO_PING : value;
}

function convertTotalToWan(value: number, key?: string | null): number {
    const hint = key || '';
    return hint.includes('元') && !hint.includes('萬元') || value > 100000 ? Math.round(value / 10000) : value;
}

function convertUnitToWanPerPing(value: number, key?: string | null): number {
    const hint = key || '';
    if (/平方公尺|公尺|㎡|m2/i.test(hint)) return Math.round(value * SQM_UNIT_TO_WAN_PER_PING * 10) / 10;
    return hint.includes('元') && !hint.includes('萬元') || value > 2000 ? Math.round((value / 10000) * 10) / 10 : value;
}

function extractDistrict(value: any): string | null {
    if (!value) return null;
    const text = String(value);
    return DISTRICTS.find(dist => text.includes(dist)) || null;
}

function normalizeRoomType(value: any): string {
    if (value == null || String(value).trim() === '') return '開放格局';
    const text = String(value).replace(/\s+/g, '');

    const digitMatch = text.match(/([1-4])房/);
    if (digitMatch) return `${digitMatch[1]}房`;

    const chineseRoom: Record<string, string> = { '一房': '1房', '二房': '2房', '兩房': '2房', '三房': '3房', '四房': '4房' };
    const hit = Object.keys(chineseRoom).find(key => text.includes(key));
    if (hit) return chineseRoom[hit];

    if (/開放|studio/i.test(text)) return '開放格局';
    return '其他';
}

function normalizeProjectName(value: any): string {
    const text = String(value ?? '').trim();
    if (!text) return '(未命名)';
    if (text === '崧?') return '崧喆';
    if (text.includes('吉祥') && text.includes('如藝')) return '吉祥．如藝';
    if (text.includes('宏普建設台灣川普建設瑞閣') || text.includes('宏普建設台灣川普瑞閣')) return '瑞閣';
    return text;
}

function extractBathrooms(value: any): number {
    if (value == null || String(value).trim() === '') return 0;
    const text = String(value).replace(/\s+/g, '');
    const digitMatch = text.match(/([0-9])衛/);
    if (digitMatch) return parseInt(digitMatch[1], 10);

    const chineseBath: Record<string, number> = { '一衛': 1, '二衛': 2, '兩衛': 2, '三衛': 3, '四衛': 4 };
    const hit = Object.keys(chineseBath).find(key => text.includes(key));
    return hit ? chineseBath[hit] : 0;
}

function normalizeId(filename: string, rawId: string): string {
    const base = filename.replace(/ - (房地|車位|土地).*$/i, '').replace(/\.(csv|xls|xlsx)$/i, '');
    return `${base}_${String(rawId).split('-')[0]}`;
}

function buildRows(rows: any[][], headerIndex: number, sourceFile: string): RawRow[] {
    const keys = rows[headerIndex].map(key => String(key ?? '').trim());
    return rows.slice(headerIndex + 1).map(row => {
        const obj: RawRow = {};
        keys.forEach((key, index) => {
            if (key) obj[key] = row[index];
        });
        obj._source_file = sourceFile;
        return obj;
    });
}

function findHeaderIndex(rows: any[][], aliases: string[]): number {
    const normalizedAliases = aliases.map(normalizeHeader);
    return rows.findIndex(row => {
        const cells = row.map(normalizeHeader);
        return normalizedAliases.every(alias => cells.some(cell => cell.includes(alias)));
    });
}

function findCellIndex(header: any[], aliases: string[]): number {
    const normalizedAliases = aliases.map(normalizeHeader);
    return header.findIndex(cell => {
        const normalizedCell = normalizeHeader(cell);
        return normalizedAliases.some(alias => normalizedCell.includes(alias));
    });
}

function parseParkingPriceWan(value: any): number {
    const parsed = parseNumber(value);
    if (parsed <= 0) return 0;
    return parsed >= 10000 ? Math.round(parsed / 10000) : parsed;
}

function normalizeParkingFloor(value: any): string {
    const text = String(value ?? '').replace(/\s+/g, '').trim();
    if (!text) return '未標示';

    const basementDigit = text.match(/地下([0-9]+)樓/);
    if (basementDigit) return `B${parseInt(basementDigit[1], 10)}`;

    const basementChinese = text.match(/地下([一二三四五六七八九十]+)樓/);
    if (basementChinese) {
        const floor = chineseFloorToNumber(basementChinese[1]);
        if (floor) return `B${floor}`;
    }

    const aboveDigit = text.match(/([0-9]+)樓/);
    if (aboveDigit) return `${parseInt(aboveDigit[1], 10)}F`;

    return text;
}

function parseExplicitParkingSheet(rows: any[][], sourceFile: string): ParkingData[] {
    const headerIndex = findHeaderIndex(rows, ['車位類別', '車位價格', '所在樓層']);
    if (headerIndex < 0) return [];

    const header = rows[headerIndex];
    const idIndex = findCellIndex(header, ['序號', '編號']);
    const typeIndex = findCellIndex(header, ['車位類別']);
    const priceIndex = findCellIndex(header, ['車位價格']);
    const areaIndex = findCellIndex(header, ['車位面積']);
    const floorIndex = findCellIndex(header, ['所在樓層']);

    if (typeIndex < 0 || priceIndex < 0 || floorIndex < 0) return [];

    return rows.slice(headerIndex + 1).map(row => {
        const type = String(row[typeIndex] ?? '').trim();
        const price = parseParkingPriceWan(row[priceIndex]);
        const floor = normalizeParkingFloor(row[floorIndex]);
        const area = areaIndex >= 0 ? convertAreaToPing(parseNumber(row[areaIndex]), '坪', row[areaIndex]) : 0;

        if (!type || price <= 0 || !floor) return null;
        return {
            caseId: idIndex >= 0 ? normalizeId(sourceFile, String(row[idIndex] ?? '').split('-')[0].trim()) : undefined,
            type,
            price,
            area: Math.round(area * 10) / 10,
            dist: '',
            project: '',
            floor
        };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
}

function detectSheet(rows: any[][]): { headerIndex: number; kind: 'main' | 'car' | 'land' } | null {
    for (let index = 0; index < Math.min(rows.length, 30); index++) {
        const cells = rows[index].map(normalizeHeader);
        const rowText = cells.join('|');
        const hasTotal = cells.some(cell => cell.includes('總價') || cell.includes('總金額'));
        const hasUnit = cells.some(cell => cell.includes('單價'));
        const hasAddress = cells.some(cell => cell.includes('坐落') || cell.includes('門牌') || cell.includes('地址'));
        const hasProject = cells.some(cell => cell.includes('建案') || cell.includes('社區') || cell.includes('案名'));
        const hasCar = rowText.includes('車位');
        const hasCarPrice = rowText.includes('車位總價') || rowText.includes('車位價格') || rowText.includes('車位價');
        const hasLandPosition = rowText.includes('土地位置') || rowText.includes('土地區段位置') || rowText.includes('地段');

        if (hasTotal && hasUnit || hasAddress && hasProject && hasUnit) return { headerIndex: index, kind: 'main' };
        if (hasCar && hasCarPrice) return { headerIndex: index, kind: 'car' };
        if (hasLandPosition && !hasUnit) return { headerIndex: index, kind: 'land' };
    }
    return null;
}

export const processFiles = async (files: File[]): Promise<ProcessingResult> => {
    let rawMain: RawRow[] = [];
    let rawCar: RawRow[] = [];
    let rawLand: RawRow[] = [];
    let explicitParkingData: ParkingData[] = [];
    const logs: string[] = [];

    for (const file of files) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        let matchedSheets = 0;

        workbook.SheetNames.forEach((sheetName, sheetIndex) => {
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
            if (rows.length < 2) return;

            if (sheetIndex === 3 || sheetName.includes('車位')) {
                const parsedParking = parseExplicitParkingSheet(rows, file.name);
                if (parsedParking.length > 0) {
                    explicitParkingData = explicitParkingData.concat(parsedParking);
                    matchedSheets += 1;
                }
            }

            const detected = detectSheet(rows);
            if (!detected) return;

            const jsonRows = buildRows(rows, detected.headerIndex, file.name);
            matchedSheets += 1;
            if (detected.kind === 'main') rawMain = rawMain.concat(jsonRows);
            if (detected.kind === 'car') rawCar = rawCar.concat(jsonRows);
            if (detected.kind === 'land') rawLand = rawLand.concat(jsonRows);
        });

        logs.push(`Loaded ${file.name}`);
        if (matchedSheets === 0) logs.push(`Warning: ${file.name} 找不到可辨識的實價登錄表頭`);
    }

    if (rawMain.length === 0) {
        return { data: [], parkingData: [], logs: [...logs, 'Error: No valid main data found.'] };
    }

    const landMap = new Map<string, number>();
    rawLand.forEach(row => {
        const kId = findKey(row, ['編號', '交易編號']);
        const kArea = findKey(row, ['土地移轉總面積平方公尺', '移轉面積', '面積']);
        if (!kId || !kArea) return;

        const id = normalizeId(row._source_file, String(row[kId]));
        const area = parseNumber(row[kArea]);
        if (area > 0) landMap.set(id, (landMap.get(id) || 0) + area);
    });

    const idMap = new Map<string, { dist: string | null; project: string; address: string; land: number }>();
    const carMap = new Map<string, { price: number; area: number; types: string[]; floors: string[] }>();
    const parkingData: ParkingData[] = [];

    rawMain.forEach((row, index) => {
        const kId = findKey(row, ['編號', '交易編號']);
        const kDist = findKey(row, ['鄉鎮市區', '行政區', '鄉鎮', '市區']);
        const kAddr = findKey(row, ['土地位置建物門牌', '建物坐落', '坐落', '地址', '門牌']);
        const kProj = findKey(row, ['建案名稱', '建案', '案名', '社區']);
        const id = normalizeId(row._source_file, kId ? String(row[kId]) : String(index));
        const address = kAddr ? String(row[kAddr] ?? '').trim() : '';
        const dist = kDist ? String(row[kDist] ?? '').trim() : extractDistrict(address);
        const project = kProj ? normalizeProjectName(row[kProj]) : '(未命名)';

        idMap.set(id, { dist, project, address, land: landMap.get(id) || 0 });
    });

    rawCar.forEach(row => {
        const kId = findKey(row, ['編號', '交易編號']);
        const kPrice = findKey(row, ['車位總價', '車位價格', '車位價', '價格']);
        const kType = findKey(row, ['車位類別', '車位種類', '車位型態', '類別']);
        const kArea = findKey(row, ['車位移轉總面積平方公尺', '車位面積', '車位坪數', '面積']);
        const kFloor = findKey(row, ['車位樓層', '停車層位', '樓層']);
        if (!kId || !kPrice) return;

        const id = normalizeId(row._source_file, String(row[kId]));
        const price = convertTotalToWan(parseNumber(row[kPrice]), kPrice);
        if (price <= 0) return;

        const area = kArea ? convertAreaToPing(parseNumber(row[kArea]), kArea, row[kArea]) : 0;
        const type = kType && row[kType] ? String(row[kType]) : '未標示';
        const floorNumber = kFloor ? parseFloorStr(row[kFloor]) : null;
        const floor = floorNumber == null ? '未標示' : floorNumber < 0 ? `B${Math.abs(floorNumber)}` : `${floorNumber}F`;
        const meta = idMap.get(id);

        parkingData.push({
            type,
            price,
            area,
            dist: meta?.dist || '未知',
            project: meta?.project || '未知',
            floor
        });

        const current = carMap.get(id) || { price: 0, area: 0, types: [], floors: [] };
        current.price += price;
        current.area += area;
        current.types.push(type);
        current.floors.push(floor);
        carMap.set(id, current);
    });

    explicitParkingData.forEach(item => {
        if (!item.caseId) return;

        const current = carMap.get(item.caseId) || { price: 0, area: 0, types: [], floors: [] };
        current.price += item.price;
        current.area += item.area;
        if (item.type) current.types.push(item.type);
        if (item.floor) current.floors.push(item.floor);
        carMap.set(item.caseId, current);
    });

    const data = rawMain.map((row, index): HouseData | null => {
        const kId = findKey(row, ['編號', '交易編號']);
        const kTotal = findKey(row, ['總價元', '總價萬元', '總價', '總金額']);
        const kArea = findKey(row, ['總面積坪', '總面積', '建物移轉總面積平方公尺', '建物移轉總面積', '建物總面積', '移轉總面積']);
        const kUnit = findKey(row, ['單價萬元坪', '單價元平方公尺', '單價']);
        const kLayout = findKey(row, ['建物格局', '房型', '格局']);
        const kRooms = findKey(row, ['建物現況格局房', '格局房']);
        const kBaths = findKey(row, ['建物現況格局衛', '格局衛']);
        const kDate = findKey(row, ['交易年月日', '交易日期', '日期', '年月']);
        const kAddr = findKey(row, ['土地位置建物門牌', '建物坐落', '坐落', '地址', '門牌']);
        const kFloor = findKey(row, ['移轉層次', '樓別樓高', '樓別', '樓層', '樓高']);
        const kBuildDate = findKey(row, ['建築完成年月', '完工日期']);
        const kAge = findKey(row, ['屋齡']);
        const kCarPrice = findKey(row, ['車位總價萬元', '車位總價', '車位價格', '車位價']);
        const kCarArea = findKey(row, ['車位移轉總面積平方公尺', '車位面積', '車位坪數']);
        const kCarType = findKey(row, ['車位類別', '車位種類', '車位型態']);
        const kTransactionTarget = findKey(row, ['交易標的']);

        if (!kTotal || !kArea) return null;

        const id = normalizeId(row._source_file, kId ? String(row[kId]) : String(index));
        const meta = idMap.get(id) || { dist: null, project: '(未命名)', address: '', land: 0 };
        const externalCar = carMap.get(id) || { price: 0, area: 0, types: [], floors: [] };

        const rawTotal = convertTotalToWan(parseNumber(row[kTotal]), kTotal);
        const rawArea = convertAreaToPing(parseNumber(row[kArea]), kArea, row[kArea]);
        const embeddedCarPrice = kCarPrice ? convertTotalToWan(parseNumber(row[kCarPrice]), kCarPrice) : 0;
        const embeddedCarArea = kCarArea ? convertAreaToPing(parseNumber(row[kCarArea]), kCarArea, row[kCarArea]) : 0;
        const carPrice = embeddedCarPrice || externalCar.price;
        const carArea = embeddedCarArea || externalCar.area;

        const houseTotal = Math.max(rawTotal - carPrice, 0);
        const houseArea = rawArea - carArea > 0.5 ? rawArea - carArea : rawArea;
        let unit = kUnit ? convertUnitToWanPerPing(parseNumber(row[kUnit]), kUnit) : 0;
        if (unit === 0 && houseArea > 0) unit = Math.round((houseTotal / houseArea) * 10) / 10;
        if (unit > 600 || unit < 1 || houseTotal <= 0 || houseArea <= 0) return null;

        const date = kDate ? parseROCDate(row[kDate]) : null;
        const buildDate = kBuildDate ? parseROCDate(row[kBuildDate]) : null;
        let age = kAge ? parseNumber(row[kAge]) : 0;
        if (!age && buildDate && date) {
            age = Math.max(0, (date.getTime() - buildDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
        }

        let address = kAddr ? String(row[kAddr] ?? '').trim() : meta.address;
        const dist = meta.dist || extractDistrict(address) || '未知';
        if (address) {
            address = address
                .replace(/[\uff01-\uff5e]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
                .replace(/\u3000/g, ' ')
                .replace(/\s+/g, '');
            if (dist !== '未知' && !address.includes(dist)) address = `${dist}${address}`;
            if (!address.includes('市') && !address.includes('縣')) address = `${DISTRICT_CITY_MAP[dist] || '臺北市'}${address}`;
        }

        const roomSource = kLayout ? row[kLayout] : '';
        let roomType = normalizeRoomType(roomSource);
        if (kRooms && row[kRooms]) {
            const rooms = parseNumber(row[kRooms]);
            if (rooms >= 1 && rooms <= 4) roomType = `${rooms}房`;
        }

        const bath = kBaths && row[kBaths] ? parseNumber(row[kBaths]) : extractBathrooms(roomSource);
        const floor = kFloor ? parseFloorStr(row[kFloor]) : null;
        const parkingType = kCarType && row[kCarType] ? String(row[kCarType]) : externalCar.types.join('、');

        if (carPrice > 0 && embeddedCarPrice > 0) {
            const floorLabel = floor == null ? '未標示' : floor < 0 ? `B${Math.abs(floor)}` : `${floor}F`;
            parkingData.push({
                type: parkingType || (kTransactionTarget && String(row[kTransactionTarget]).includes('車位') ? '含車位' : '未標示'),
                price: carPrice,
                area: Math.round(carArea * 10) / 10,
                dist,
                project: meta.project || '(未命名)',
                floor: floorLabel
            });
        }

        return {
            id,
            dist,
            project: meta.project || '(未命名)',
            address,
            total: Math.round(houseTotal),
            unit,
            houseTotal: Math.round(houseTotal),
            area: Math.round(houseArea * 10) / 10,
            landArea: Math.round((meta.land || 0) * 100) / 100,
            areaP: Math.round(carArea * 10) / 10,
            priceP: carPrice,
            parkingType,
            floor,
            date,
            month: date ? d3.timeFormat('%Y/%m')(date) : null,
            type: roomType,
            bath,
            age: Math.round(age * 10) / 10
        };
    }).filter((row): row is HouseData => row !== null && row.total > 0 && row.unit > 0 && !!row.dist);

    logs.push(`Parsed ${data.length} valid housing rows from ${rawMain.length} main rows.`);
    const finalParkingData = explicitParkingData.map(item => {
        const meta = item.caseId ? idMap.get(item.caseId) : null;
        return {
            ...item,
            dist: meta?.dist || item.dist || '未標示',
            project: meta?.project || item.project || ''
        };
    });
    logs.push(`Parsed ${finalParkingData.length} parking rows from explicit parking sheet.`);

    return { data, parkingData: finalParkingData, logs };
};
