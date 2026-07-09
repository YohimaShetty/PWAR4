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
    gates: stadiumData.gates,
    facilities: stadiumData.facilities,
    responseTeams: stadiumData.responseTeams,
    transportOptions: stadiumData.transportOptions,
    liveCrowd: simulationService.getState(),
    recentIncidents: simulationService.getIncidents().slice(-10),
  };
}

// Non-streaming endpoint (simple request/response, used as a fallback)
router.post('/', async (req, res) => {
  const errors = validateChatBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { message, sessionId = 'default' } = req.body;
  const history = getHistory(sessionId);

  try {
    const answer = await geminiService.generate({
      history,
      liveData: buildLiveData(),
      userMessage: message,
    });
    pushTurn(sessionId, 'user', message);
    pushTurn(sessionId, 'assistant', answer);
    res.json({ answer, sessionId });
  } catch (err) {
    res.status(err.code === 'NO_API_KEY' ? 503 : 502).json({
      error: err.code === 'NO_API_KEY'
        ? 'AI service is not configured on the server (missing GEMINI_API_KEY).'
        : 'AI service temporarily unavailable. Please try again.',
    });
  }
});

// Streaming endpoint via Server-Sent Events, used by the dashboard chat widget
router.post('/stream', async (req, res) => {
  const errors = validateChatBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { message, sessionId = 'default' } = req.body;
  const history = getHistory(sessionId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let full = '';
  try {
    await geminiService.generateStream({
      history,
      liveData: buildLiveData(),
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
      : "I don't have enough information to answer that accurately.";
    res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
  }
  res.end();
});

router.delete('/session/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ cleared: true });
});

module.exports = router;
