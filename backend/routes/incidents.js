const express = require('express');
const crypto = require('crypto');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');
const geminiService = require('../services/geminiService');
const { validateIncidentBody } = require('../utils/validators');

const router = express.Router();

// Deterministic, auditable severity/priority rules — never left to an LLM guess.
const SEVERITY_RULES = {
  fire: { severity: 'critical', priority: 1, teamType: 'fire' },
  violence: { severity: 'critical', priority: 1, teamType: 'security' },
  medical: { severity: 'high', priority: 2, teamType: 'medical' },
  blocked_exit: { severity: 'high', priority: 2, teamType: 'fire' },
  lost_child: { severity: 'medium', priority: 3, teamType: 'child_services' },
  other: { severity: 'low', priority: 4, teamType: 'general' },
};

function euclidean(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function nearestTeam(zone, teamType) {
  const zoneDef = stadiumData.seatZoneMap[zone.toUpperCase()];
  const origin = zoneDef
    ? { x: 0, y: 0 } // fallback origin if we only have a zone letter, refined below
    : { x: 0, y: 0 };

  // Use the gate location tied to the zone as the incident's approximate origin point
  const gate = zoneDef ? stadiumData.gates.find((g) => g.name === zoneDef.gate) : null;
  const point = gate || origin;

  const candidates = stadiumData.responseTeams.filter((t) => t.type === teamType);
  const pool = candidates.length ? candidates : stadiumData.responseTeams;

  let best = null;
  let bestDist = Infinity;
  pool.forEach((t) => {
    const d = euclidean(point, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  });
  return { team: best, distanceMeters: Math.round(bestDist * 40) };
}

router.post('/', async (req, res) => {
  const errors = validateIncidentBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { type, description, zone } = req.body;
  const rule = SEVERITY_RULES[type];
  const dispatch = nearestTeam(zone, rule.teamType);

  const incident = {
    id: crypto.randomUUID(),
    type,
    description,
    zone: zone.toUpperCase(),
    severity: rule.severity,
    priority: rule.priority,
    dispatchedTeam: dispatch.team ? dispatch.team.name : null,
    distanceMeters: dispatch.distanceMeters,
    reportedAt: new Date().toISOString(),
    status: 'dispatched',
  };

  simulationService.addIncident(incident);

  // Ask Gemini only for the human-readable, plain-language action guidance —
  // severity/priority/team are already deterministically decided above, so the
  // model cannot alter the safety-critical classification.
  let aiGuidance;
  try {
    aiGuidance = await geminiService.generate({
      userMessage: `An incident was just reported. Type: ${type}. Description: "${description}". Zone: ${incident.zone}. Assigned severity: ${incident.severity}. Dispatched team: ${incident.dispatchedTeam}, ${incident.distanceMeters}m away. Write concise, calm, numbered immediate-action guidance (max 5 steps) for on-site staff, based only on this information.`,
      liveData: { incident, responseTeams: stadiumData.responseTeams },
      extraInstruction: 'Respond with only the numbered action steps, no preamble.',
    });
  } catch (err) {
    aiGuidance = err.code === 'NO_API_KEY'
      ? 'AI guidance unavailable: server is missing GEMINI_API_KEY. Standard protocol: notify the dispatched team, secure the area, and await confirmation.'
      : "I don't have enough information to answer that accurately.";
  }

  res.status(201).json({ incident, aiGuidance });
});

router.get('/', (req, res) => {
  res.json({ incidents: simulationService.getIncidents() });
});

module.exports = router;
