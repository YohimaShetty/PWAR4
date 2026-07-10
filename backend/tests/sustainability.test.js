const request = require('supertest');
const app = require('../server');

describe('POST /api/sustainability/footprint', () => {
  test('correctly computes CO2 grams as distance * emission factor', async () => {
    const res = await request(app)
      .post('/api/sustainability/footprint')
      .send({ distanceKm: 10, mode: 'private_car' });

    expect(res.status).toBe(200);
    // private_car co2GPerKm is 192 in stadiumData.json -> 10 * 192 = 1920
    expect(res.body.estimatedCo2Grams).toBe(1920);
  });

  test('walking produces zero emissions', async () => {
    const res = await request(app)
      .post('/api/sustainability/footprint')
      .send({ distanceKm: 5, mode: 'walking' });

    expect(res.status).toBe(200);
    expect(res.body.estimatedCo2Grams).toBe(0);
  });

  test('rejects an unknown transport mode', async () => {
    const res = await request(app)
      .post('/api/sustainability/footprint')
      .send({ distanceKm: 5, mode: 'teleporter' });

    expect(res.status).toBe(400);
  });

  test('rejects a non-positive distance', async () => {
    const res = await request(app)
      .post('/api/sustainability/footprint')
      .send({ distanceKm: -3, mode: 'metro' });

    expect(res.status).toBe(400);
  });

  test('suggests only alternatives that actually reduce emissions', async () => {
    const res = await request(app)
      .post('/api/sustainability/footprint')
      .send({ distanceKm: 8, mode: 'metro' }); // metro is already low-emission

    expect(res.status).toBe(200);
    res.body.betterAlternatives.forEach((alt) => {
      expect(alt.co2SavingsGrams).toBeGreaterThan(0);
    });
  });
});

describe('GET /api/sustainability/options', () => {
  test('returns the full list of transport options', async () => {
    const res = await request(app).get('/api/sustainability/options');
    expect(res.status).toBe(200);
    expect(res.body.transportOptions.length).toBeGreaterThan(0);
  });
});