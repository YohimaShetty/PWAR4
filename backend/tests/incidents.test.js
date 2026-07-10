const request = require('supertest');
const app = require('../server');

describe('POST /api/incidents', () => {
  test('classifies a fire incident as critical priority 1 and dispatches a fire team', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .send({ type: 'fire', zone: 'C', description: 'Smoke near concourse' });

    expect(res.status).toBe(201);
    expect(res.body.incident.severity).toBe('critical');
    expect(res.body.incident.priority).toBe(1);
    expect(res.body.incident.dispatchedTeam).toMatch(/Fire/i);
  });

  test('classifies a lost child as medium severity and routes to child services', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .send({ type: 'lost_child', zone: 'E', description: 'Child separated from parent near gate 5' });

    expect(res.status).toBe(201);
    expect(res.body.incident.severity).toBe('medium');
    expect(res.body.incident.dispatchedTeam).toMatch(/Child/i);
  });

  test('rejects an incident with an invalid type', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .send({ type: 'not_a_real_type', zone: 'A', description: 'test' });

    expect(res.status).toBe(400);
  });

  test('rejects an incident missing a description', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .send({ type: 'medical', zone: 'A' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/incidents', () => {
  test('lists previously reported incidents', async () => {
    await request(app)
      .post('/api/incidents')
      .send({ type: 'blocked_exit', zone: 'G', description: 'Exit G3 blocked by barrier' });

    const res = await request(app).get('/api/incidents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.incidents)).toBe(true);
    expect(res.body.incidents.length).toBeGreaterThan(0);
  });
});