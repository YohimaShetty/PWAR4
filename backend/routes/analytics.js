const express = require('express');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');
const geminiService = require('../services/geminiService');

const router = express.Router();

function aggregate() {
  const state = simulationService.getState();
  const capacity = 82500 / stadiumData.stadium.zones.length;
  const totalOccupancy = state.zones.reduce((s, z) => s + z.occupancy, 0);
  const avgQueue = state.zones.reduce((s, z) => s + z.queueLengthMeters, 0) / state.zones.length;
  const busiest = [...state.zones].sort((a, b) => b.occupancy - a.occupancy)[0];
  const quietest = [...state.zones].sort((a, b) => a.occupancy - b.occupancy)[0];
  const incidents = simulationService.getIncidents();
  const incidentsByType = incidents.reduce((acc, i) => {
    acc[i.type] = (acc[i.type] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: state.generatedAt,
    totalOccupancy,
    totalCapacity: 82500,
    occupancyRatio: Number((totalOccupancy / 82500).toFixed(3)),
    avgQueueLengthMeters: Math.round(avgQueue),
    busiestZone: busiest,
    quietestZone: quietest,
    zoneCapacityShare: Math.round(capacity),
    totalIncidents: incidents.length,
    incidentsByType,
    zones: state.zones,
  };
}

router.get('/summary', (req, res) => {
  res.json(aggregate());
});

router.get('/explain', async (req, res) => {
  const data = aggregate();
  let explanation;
  try {
    explanation = await geminiService.generate({
      userMessage: 'Explain the current stadium operations analytics in plain English for a non-technical event organizer. Cover overall occupancy, the busiest and quietest zones, queue conditions, and incident summary. 4-6 sentences.',
      liveData: data,
      extraInstruction: 'This is a chart-explanation task, not a chat. Be direct and skip any greeting.',
    });
  } catch (err) {
    return res.status(err.code === 'NO_API_KEY' ? 503 : 502).json({
      data,
      explanation: err.code === 'NO_API_KEY'
        ? 'AI explanation unavailable: server is missing GEMINI_API_KEY.'
        : "I don't have enough information to answer that accurately.",
    });
  }
  res.json({ data, explanation });
});

module.exports = router;
