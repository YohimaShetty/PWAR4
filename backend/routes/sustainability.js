const express = require('express');
const stadiumData = require('../data/stadiumData.json');
const { validateSustainabilityBody } = require('../utils/validators');

const router = express.Router();

router.post('/footprint', (req, res) => {
  const errors = validateSustainabilityBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { distanceKm, mode } = req.body;
  const option = stadiumData.transportOptions.find((o) => o.mode === mode);
  if (!option) {
    return res.status(400).json({
      error: `Unknown mode "${mode}". Supported modes: ${stadiumData.transportOptions.map((o) => o.mode).join(', ')}.`,
    });
  }

  const co2Grams = Math.round(distanceKm * option.co2GPerKm);
  const travelMinutes = Math.round((distanceKm / option.avgSpeedKmh) * 60);

  const alternatives = stadiumData.transportOptions
    .filter((o) => o.mode !== mode)
    .map((o) => ({
      mode: o.mode,
      co2Grams: Math.round(distanceKm * o.co2GPerKm),
      travelMinutes: Math.round((distanceKm / o.avgSpeedKmh) * 60),
      co2SavingsGrams: co2Grams - Math.round(distanceKm * o.co2GPerKm),
    }))
    .sort((a, b) => b.co2SavingsGrams - a.co2SavingsGrams);

  res.json({
    input: { distanceKm, mode },
    estimatedCo2Grams: co2Grams,
    estimatedTravelMinutes: travelMinutes,
    betterAlternatives: alternatives.filter((a) => a.co2SavingsGrams > 0).slice(0, 3),
    waterRefillStations: stadiumData.facilities.filter((f) => f.type === 'water'),
    recyclingPoints: stadiumData.facilities.filter((f) => f.type === 'recycling'),
  });
});

router.get('/options', (req, res) => {
  res.json({ transportOptions: stadiumData.transportOptions });
});

module.exports = router;
