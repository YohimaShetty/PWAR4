const request = require('supertest');
const app = require('../server');

describe('GET /api/accessibility/facilities', () => {
  test('returns only accessible facilities', async () => {
    const res = await request(app).get('/api/accessibility/facilities');
    expect(res.status).toBe(200);
    res.body.facilities.forEach((f) => expect(f.accessible).toBe(true));
  });

  test('filters by zone when provided', async () => {
    const res = await request(app).get('/api/accessibility/facilities?zone=A');
    expect(res.status).toBe(200);
    res.body.facilities.forEach((f) => expect(f.zone).toBe('A'));
  });

  test('rejects an unknown accessibility profile', async () => {
    const res = await request(app).get('/api/accessibility/facilities?profile=not_a_profile');
    expect(res.status).toBe(400);
  });

  test('returns tailored guidance text for a known profile', async () => {
    const res = await request(app).get('/api/accessibility/facilities?profile=wheelchair');
    expect(res.status).toBe(200);
    expect(res.body.guidance).toMatch(/step-free/i);
  });
});

describe('GET /api/crowd/live', () => {
  test('returns occupancy data for all 8 zones with a valid level classification', async () => {
    const res = await request(app).get('/api/crowd/live');
    expect(res.status).toBe(200);
    expect(res.body.zones.length).toBe(8);
    res.body.zones.forEach((z) => {
      expect(['low', 'moderate', 'high', 'critical']).toContain(z.level);
      expect(z.occupancyRatio).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('GET /api/crowd/predict/:zone', () => {
  test('rejects a zone that does not exist', async () => {
    const res = await request(app).get('/api/crowd/predict/Z');
    expect(res.status).toBe(404);
  });

  test('returns a valid response shape for a real zone', async () => {
    const res = await request(app).get('/api/crowd/predict/A');
    expect(res.status).toBe(200);
    expect(res.body.zone).toBe('A');
  });
});

describe('GET /api/health', () => {
  test('reports service status and AI configuration state', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.aiConfigured).toBe('boolean');
  });
});