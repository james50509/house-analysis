export interface RawRow {
    [key: string]: any;
}

export interface HouseData {
    id: string;
    dist: string;
    project: string;
    address: string;
    total: number;      // Net Total Price (Wan)
    unit: number;       // Net Unit Price (Wan/Ping)
    houseTotal: number;
    area: number;       // Net Area (Ping)
    landArea: number;
    areaP: number;      // Parking Area
    priceP: number;     // Parking Price
    parkingType: string;
    floor: number | null;
    date: Date | null;
    month: string | null; // YYYY/MM
    type: string;       // Room Type (e.g., 2房)
    bath: number;
    age: number;
}

export interface ParkingData {
    caseId?: string;
    type: string;
    price: number;
    area: number;
    dist: string;
    project: string;
    floor: string;
}

export interface ProcessingResult {
    data: HouseData[];
    parkingData: ParkingData[];
    logs: string[];
}

export type ViewTab = 'data' | 'market' | 'room' | 'parking';
