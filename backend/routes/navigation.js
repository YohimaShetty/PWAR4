const express = require('express');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');
const { validateNavigationBody } = require('../utils/validators');

const router = express.Router();

function euclidean(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// 1 stadium-plan unit ≈ 40 meters (documented constant, used consistently everywhere)
const UNIT_TO_METERS = 40;

function zoneForSection(section) {
  const num = parseInt(section, 10);
  for (const [zone, def] of Object.entries(stadiumData.seatZoneMap)) {
    if (def.sections.includes(num)) return zone;
  }
  return null;
}

function nearestFacility(originPoint, type, accessibleOnly = false) {
  const candidates = stadiumData.facilities.filter(
    (f) => f.type === type && (!accessibleOnly || f.accessible)
  );
  if (candidates.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  candidates.forEach((f) => {
    const d = euclidean(originPoint, f);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  });
  return { facility: best, distanceMeters: Math.round(bestDist * UNIT_TO_METERS) };
}

router.post('/', (req, res) => {
  const errors = validateNavigationBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { seatSection, accessible = false, arrivalMinutesFromNow } = req.body;
  const zone = zoneForSection(seatSection);

  if (!zone) {
    return res.status(404).json({
      error: `Section ${seatSection} was not found in the stadium seat map. Please check the section number.`,
    });
  }

  const zoneDef = stadiumData.seatZoneMap[zone];
  const gate = stadiumData.gates.find((g) => g.name === zoneDef.gate);

  // Crowd-aware recommendation: if the home gate's zone is currently overloaded,
  // suggest the adjacent lightest-loaded zone's gate instead.
  const liveState = simulationService.getState();
  const zoneLoad = {};
  liveState.zones.forEach((z) => {
    zoneLoad[z.zone] = z.occupancy;
  });

  const zoneKeys = stadiumData.stadium.zones;
  const idx = zoneKeys.indexOf(zone);
  const neighborZones = [zoneKeys[(idx + 1) % zoneKeys.length], zoneKeys[(idx - 1 + zoneKeys.length) % zoneKeys.length]];

  let recommendedZone = zone;
  const homeLoadRatio = zoneLoad[zone] / (82500 / zoneKeys.length);
  if (homeLoadRatio > 0.85) {
    const lighter = neighborZones
      .map((z) => ({ z, ratio: zoneLoad[z] / (82500 / zoneKeys.length) }))
      .sort((a, b) => a.ratio - b.ratio)[0];
    if (lighter && lighter.ratio < homeLoadRatio - 0.1) recommendedZone = lighter.z;
  }

  const recGate = stadiumData.gates.find((g) => g.name === stadiumData.seatZoneMap[recommendedZone].gate);

  const walkDistanceMeters = Math.round(euclidean({ x: 0, y: 0 }, recGate) * UNIT_TO_METERS);
  const walkSpeed = recGate.avgWalkSpeedMps;
  const etaSeconds = Math.round(walkDistanceMeters / walkSpeed);

  const restroom = nearestFacility(recGate, 'restroom', accessible);
  const food = nearestFacility(recGate, 'food', accessible);
  const medical = nearestFacility(recGate, 'medical', accessible);
  const charging = nearestFacility(recGate, 'charging', accessible);

  const response = {
    seatSection,
    zone,
    recommendedGate: recGate.name,
    gateChangedDueToCrowding: recommendedZone !== zone,
    route: {
      distanceMeters: walkDistanceMeters,
      estimatedWalkSeconds: etaSeconds,
      estimatedWalkMinutes: Math.round((etaSeconds / 60) * 10) / 10,
    },
    nearestRestroom: restroom,
    nearestFoodCourt: food,
    nearestMedicalRoom: medical,
    nearestChargingStation: charging,
  };

  if (arrivalMinutesFromNow !== undefined) {
    response.arrivalAdvice =
      arrivalMinutesFromNow < response.route.estimatedWalkMinutes + 5
        ? 'Tight timing — head to the recommended gate now to make kickoff comfortably.'
        : 'You have comfortable time to reach your seat via the recommended gate.';
  }

  return res.json(response);
});

module.exports = router;
