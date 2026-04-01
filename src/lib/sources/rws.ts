import type { StationRecord } from './types';
import { rdToWgs84 } from '../map/utils';

const RWS_BASE_URL = 'https://waterinfo.rws.nl/api/';

interface RWSMeetlocatieRaw {
  meetlocatie_code: string;
  naam: string;
  x_coordinaat: number;
  y_coordinaat: number;
  beheerder?: string;
  laatste_waarde?: number;
  eenheid?: string;
}

export function transformRWSStation(raw: RWSMeetlocatieRaw): StationRecord {
  const { lat, lon } = rdToWgs84(raw.x_coordinaat, raw.y_coordinaat);

  return {
    external_id: raw.meetlocatie_code,
    name: raw.naam,
    latitude: lat,
    longitude: lon,
    operator: raw.beheerder || 'Rijkswaterstaat',
    sensor_type: 'Neerslagmeter',
    metadata: {
      original_x: raw.x_coordinaat,
      original_y: raw.y_coordinaat,
      eenheid: raw.eenheid,
    },
    measurement: raw.laatste_waarde !== undefined ? {
      measured_at: new Date().toISOString(),
      rainfall_mm: raw.laatste_waarde,
      rainfall_period: '10min',
    } : undefined,
  };
}

export { RWS_BASE_URL };
