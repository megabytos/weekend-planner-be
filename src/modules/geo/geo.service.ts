import { GEO_CITIES } from './geo.constants.js';
import type { GeoCity } from './geo.types.js';

export class GeoService {
    listCities(params?: { q?: string; countryCode?: string }): GeoCity[] {
        const q = params?.q?.trim().toLowerCase();
        const countryCode = params?.countryCode?.trim().toUpperCase();

        return GEO_CITIES.filter((city) => {
            if (countryCode && city.countryCode.toUpperCase() !== countryCode) {
                return false;
            }
            if (q && !city.name.toLowerCase().includes(q)) {
                return false;
            }
            return true;
        });
    }

    getCityById(id: number): GeoCity | undefined {
        return GEO_CITIES.find((c) => c.id === id);
    }
}
