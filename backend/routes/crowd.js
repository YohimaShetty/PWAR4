const express = require('express');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');

const router = express.Router();

router.get('/live', (req, res) => {
  const state = simulationService.getState();
  const enriched = state.zones.map((z) => {
    const capacity = 82500 / stadiumData.stadium.zones.length;
    const ratio = z.occupancy / capacity;
    let level = 'low';
    if (ratio > 0.85) level = 'critical';
    else if (ratio > 0.65) level = 'high';
    else if (ratio > 0.4) level = 'moderate';
    return { ...z, capacity: Math.round(capacity), occupancyRatio: Number(ratio.toFixed(3)), level };
  });
  res.json({ generatedAt: state.generatedAt, zones: enriched });
});

router.get('/predict/:zone', (req, res) => {
  const zone = req.params.zone.toUpperCase();
  if (!stadiumData.stadium.zones.includes(zone)) {
    return res.status(404).json({ error: `Zone ${zone} does not exist.` });
  }
  const prediction = simulationService.predictCongestion(zone);
  if (!prediction.available) {
    return res.status(200).json({
      zone,
      available: false,
      message: "I don't have enough information to answer that accurately yet — the model needs a few more live data samples.",
    });
  }

  let recommendation = 'No action needed — congestion trend is stable.';
  if (prediction.overloadRisk) {
    const zoneKeys = stadiumData.stadium.zones;
    const idx = zoneKeys.indexOf(zone);
    const alt = zoneKeys[(idx + 1) % zoneKeys.length];
    recommendation = `Projected overload in zone ${zone} within the next few update cycles. Recommend directing incoming fans toward zone ${alt}'s gate and opening an additional queue lane.`;
  }

  res.json({ zone, ...prediction, recommendation });
});

module.exports = router;
