const request = require('supertest');
const app = require('../server');

describe('POST /api/navigation', () => {
  test('returns a valid gate, route, and facilities for a real seat section', async () => {
    const res = await request(app)
      .post('/api/navigation')
      .send({ seatSection: '114', accessible: false });

    expect(res.status).toBe(200);
    expect(res.body.zone).toBe('B');
    expect(res.body.recommendedGate).toMatch(/Gate/);
    expect(res.body.route.distanceMeters).toBeGreaterThan(0);
    expect(res.body.route.estimatedWalkMinutes).toBeGreaterThan(0);
    expect(res.body.nearestRestroom).not.toBeNull();
    expect(res.body.nearestMedicalRoom).not.toBeNull();
  });

  test('returns 404 for a seat section that does not exist in the seat map', async () => {
    const res = await request(app)
      .post('/api/navigation')
      .send({ seatSection: '999' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('returns 400 when seatSection is missing', async () => {
    const res = await request(app).post('/api/navigation').send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  test('includes arrival advice when arrivalMinutesFromNow is provided', async () => {
    const res = await request(app)
      .post('/api/navigation')
      .send({ seatSection: '114', arrivalMinutesFromNow: 2 });

    expect(res.status).toBe(200);
    expect(res.body.arrivalAdvice).toBeDefined();
  });
});