// Rijksdriehoek (RD/EPSG:28992) to WGS84 (EPSG:4326) conversion
// Using the simplified polynomial approximation

const X0 = 155000;
const Y0 = 463000;
const PHI0 = 52.15517440;
const LAM0 = 5.38720621;

const Kp = [0, 2, 0, 2, 0, 2, 1, 4, 2, 4, 1];
const Kq = [1, 0, 2, 1, 3, 2, 0, 0, 3, 1, 1];
const Kpq = [
  3235.65389, -32.58297, -0.24750, -0.84978, -0.06550,
  -0.01709, -0.00738, 0.00530, -0.00039, 0.00033, -0.00012,
];

const Lp = [1, 1, 1, 3, 1, 3, 0, 3, 1, 0, 2, 5];
const Lq = [0, 1, 2, 0, 3, 1, 1, 2, 4, 2, 0, 0];
const Lpq = [
  5260.52916, 105.94684, 2.45656, -0.81885, 0.05594,
  -0.05607, 0.01199, -0.00256, 0.00128, 0.00022, -0.00022, 0.00026,
];

export function rdToWgs84(x: number, y: number): { lat: number; lon: number } {
  const dX = (x - X0) * 1e-5;
  const dY = (y - Y0) * 1e-5;

  let phi = 0;
  let lam = 0;

  for (let i = 0; i < Kpq.length; i++) {
    phi += Kpq[i] * Math.pow(dX, Kp[i]) * Math.pow(dY, Kq[i]);
  }

  for (let i = 0; i < Lpq.length; i++) {
    lam += Lpq[i] * Math.pow(dX, Lp[i]) * Math.pow(dY, Lq[i]);
  }

  const lat = PHI0 + phi / 3600;
  const lon = LAM0 + lam / 3600;

  return { lat, lon };
}
