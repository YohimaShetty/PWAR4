const express = require('express');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');
const geminiService = require('../services/geminiService');
const { isNonEmptyString } = require('../utils/validators');

const router = express.Router();

router.post('/ask', async (req, res) => {
  const { question, zone } = req.body;
  if (!isNonEmptyString(question, 2000)) {
    return res.status(400).json({ error: 'question is required.' });
  }

  const liveState = simulationService.getState();
  const incidents = simulationService.getIncidents().slice(-10);
  const zoneData = zone ? liveState.zones.find((z) => z.zone === zone.toUpperCase()) : null;

  let answer;
  try {
    answer = await geminiService.generate({
      userMessage: question,
      liveData: {
        yourZone: zone || 'unspecified',
        zoneLiveState: zoneData || null,
        allZonesLiveState: liveState.zones,
        recentIncidents: incidents,
        responseTeams: stadiumData.responseTeams,
        facilities: stadiumData.facilities,
      },
      extraInstruction:
        'You are speaking to an on-duty stadium VOLUNTEER, not a fan. Give short, task-oriented, actionable guidance. If they ask "what should I do", prioritize any open/unresolved incidents in their zone first, then general crowd-management duties implied by the live occupancy data.',
    });
  } catch (err) {
    return res.status(err.code === 'NO_API_KEY' ? 503 : 502).json({
      error: err.code === 'NO_API_KEY'
        ? 'AI service is not configured on the server (missing GEMINI_API_KEY).'
        : 'AI service temporarily unavailable. Please try again.',
    });
  }

  res.json({ answer });
});

module.exports = router;
