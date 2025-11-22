export interface GeoCoordinates {
    lat: number;
    lon: number;
}

export interface GeoBoundingBox {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
}

export interface GeoCity {
    id: number;               // our internal city ID
    name: string;             // "Kyiv"
    countryCode: string;      // ISO2, e.g. "UA"
    countryName: string;      // "Ukraine"
    codeIATA?: string | null; // e.g. "IEV", "LON"
    coordinates: GeoCoordinates;  // city center
    boundingBox: GeoBoundingBox;  // city bounding box
}
