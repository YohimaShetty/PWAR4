const express = require('express');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');
const geminiService = require('../services/geminiService');
const { validateChatBody } = require('../utils/validators');

const router = express.Router();

// In-memory conversation memory per session (fine for a single-instance deploy;
// swap for Redis/DB-backed sessions for multi-instance production).
const sessions = new Map();
const MAX_TURNS_KEPT = 12;

function getHistory(sessionId) {
  return sessions.get(sessionId) || [];
}

function pushTurn(sessionId, role, text) {
  const hist = getHistory(sessionId);
  hist.push({ role, text });
  while (hist.length > MAX_TURNS_KEPT) hist.shift();
  sessions.set(sessionId, hist);
}

function buildLiveData() {
  return {
    stadium: stadiumData.stadium,
    seatZoneMap: stadiumData.seatZoneMap,
    gates: stadiumData.gates,
    facilities: stadiumData.facilities,
    responseTeams: stadiumData.responseTeams,
    transportOptions: stadiumData.transportOptions,
    liveCrowd: simulationService.getState(),
    recentIncidents: simulationService.getIncidents().slice(-10),
  };
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function getDeterministicAnswer(message, liveData) {
  const normalized = String(message || '').toLowerCase().trim();

  if (/\bhow many\b.*\bgates?\b/.test(normalized) || /\bnumber of gates?\b/.test(normalized)) {
    return `There are ${liveData.gates.length} gates at ${liveData.stadium.name}.`;
  }

  if (/\bwhich zone is busiest\b/.test(normalized) || /\bbusiest zone\b/.test(normalized)) {
    const zones = Array.isArray(liveData.liveCrowd && liveData.liveCrowd.zones) ? liveData.liveCrowd.zones : [];
    if (!zones.length) return null;

    const busiest = zones.reduce((best, zone) => {
      if (!best || zone.occupancy > best.occupancy) return zone;
      return best;
    }, null);

    if (!busiest) return null;

    const cap = liveData.stadium.capacity / liveData.stadium.zones.length;
    const ratio = cap > 0 ? busiest.occupancy / cap : 0;
    return `Zone ${busiest.zone} is currently the busiest, with ${busiest.occupancy} people (${formatPercent(ratio)} of its zone capacity) and a queue of about ${busiest.queueLengthMeters} meters.`;
  }

  if (/\bhow many zones?\b/.test(normalized)) {
    return `There are ${liveData.stadium.zones.length} zones in ${liveData.stadium.name}.`;
  }

  return null;
}

// Non-streaming endpoint (simple request/response, used as a fallback)
router.post('/', async (req, res) => {
  const errors = validateChatBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { message, sessionId = 'default' } = req.body;
  const history = getHistory(sessionId);
  const liveData = buildLiveData();

  const deterministicAnswer = getDeterministicAnswer(message, liveData);
  if (deterministicAnswer) {
    pushTurn(sessionId, 'user', message);
    pushTurn(sessionId, 'assistant', deterministicAnswer);
    return res.json({ answer: deterministicAnswer, sessionId, source: 'deterministic' });
  }

  try {
    const answer = await geminiService.generate({
      history,
      liveData,
      userMessage: message,
    });
    pushTurn(sessionId, 'user', message);
    pushTurn(sessionId, 'assistant', answer);
    res.json({ answer, sessionId });
  } catch (err) {
    if (err.code === 'NO_API_KEY') {
      return res.status(503).json({
        error: 'AI service is not configured on the server (missing GEMINI_API_KEY).',
      });
    }
    if (err.code === 'GEMINI_RATE_LIMIT') {
      if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
      return res.status(429).json({
        error: 'Gemini API quota/rate limit exceeded. Please wait and retry, or increase your Gemini API quota.',
      });
    }
    return res.status(502).json({
      error: 'AI service temporarily unavailable. Please try again.',
    });
  }
});

// Streaming endpoint via Server-Sent Events, used by the dashboard chat widget
router.post('/stream', async (req, res) => {
  const errors = validateChatBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { message, sessionId = 'default' } = req.body;
  const history = getHistory(sessionId);
  const liveData = buildLiveData();

  const deterministicAnswer = getDeterministicAnswer(message, liveData);
  if (deterministicAnswer) {
    pushTurn(sessionId, 'user', message);
    pushTurn(sessionId, 'assistant', deterministicAnswer);
    res.write(`data: ${JSON.stringify({ chunk: deterministicAnswer })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true, source: 'deterministic' })}\n\n`);
    return res.end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let full = '';
  try {
    await geminiService.generateStream({
      history,
      liveData,
      userMessage: message,
      onChunk: (chunk) => {
        full += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
    });
    pushTurn(sessionId, 'user', message);
    pushTurn(sessionId, 'assistant', full);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    const errMsg = err.code === 'NO_API_KEY'
      ? 'AI service is not configured on the server (missing GEMINI_API_KEY).'
      : err.code === 'GEMINI_RATE_LIMIT'
        ? 'Gemini API quota/rate limit exceeded. Please wait and retry, or increase your Gemini API quota.'
        : 'AI service temporarily unavailable. Please try again.';
    res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
  }
  res.end();
});

router.delete('/session/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ cleared: true });
});

module.exports = router;
