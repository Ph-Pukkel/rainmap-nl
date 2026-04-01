import proj4 from 'proj4';

// Rijksdriehoek (EPSG:28992) projection definition
const RD_PROJECTION = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs';
const WGS84_PROJECTION = '+proj=longlat +datum=WGS84 +no_defs';

proj4.defs('EPSG:28992', RD_PROJECTION);

/**
 * Convert Rijksdriehoek (RD/EPSG:28992) coordinates to WGS84 (EPSG:4326)
 */
export function rdToWgs84(x: number, y: number): { lat: number; lon: number } {
  const [lon, lat] = proj4('EPSG:28992', WGS84_PROJECTION, [x, y]);
  return { lat, lon };
}

/**
 * Convert WGS84 to RD coordinates
 */
export function wgs84ToRd(lat: number, lon: number): { x: number; y: number } {
  const [x, y] = proj4(WGS84_PROJECTION, 'EPSG:28992', [lon, lat]);
  return { x, y };
}

/**
 * Calculate bounding box for the Netherlands
 */
export const NETHERLANDS_BOUNDS: [[number, number], [number, number]] = [
  [3.31497, 50.7504],  // Southwest
  [7.09205, 53.4720],  // Northeast
];

/**
 * Calculate distance between two points in km (Haversine)
 */
export function distanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Split Netherlands into grid cells for batch API requests (e.g., Netatmo)
 */
export function netherlandsGrid(cellSizeKm: number = 50): Array<{
  lat_ne: number; lon_ne: number;
  lat_sw: number; lon_sw: number;
}> {
  const [[lonMin, latMin], [lonMax, latMax]] = NETHERLANDS_BOUNDS;
  const latStep = cellSizeKm / 111;
  const lonStep = cellSizeKm / (111 * Math.cos(toRad((latMin + latMax) / 2)));

  const cells: Array<{ lat_ne: number; lon_ne: number; lat_sw: number; lon_sw: number }> = [];

  for (let lat = latMin; lat < latMax; lat += latStep) {
    for (let lon = lonMin; lon < lonMax; lon += lonStep) {
      cells.push({
        lat_sw: lat,
        lon_sw: lon,
        lat_ne: Math.min(lat + latStep, latMax),
        lon_ne: Math.min(lon + lonStep, lonMax),
      });
    }
  }

  return cells;
}
