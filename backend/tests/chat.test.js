jest.mock('../services/geminiService', () => ({
  generate: jest.fn(async () => {
    throw new Error('Gemini should not be called for deterministic questions');
  }),
  generateStream: jest.fn(async () => {
    throw new Error('Gemini stream should not be called for deterministic questions');
  }),
}));

const request = require('supertest');
const app = require('../server');

describe('POST /api/chat', () => {
  test('answers gate count directly from live stadium data', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'How many gates are there?' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic');
    expect(res.body.answer).toMatch(/There are 8 gates/i);
  });

  test('answers busiest zone directly from live crowd data', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'Which zone is busiest right now?' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('deterministic');
    expect(res.body.answer).toMatch(/Zone [A-H] is currently the busiest/i);
  });
});

describe('POST /api/chat/stream', () => {
  test('streams a deterministic answer for gate count queries', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'How many gates are there?' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('There are 8 gates');
    expect(res.text).toContain('deterministic');
  });
});