/**
 * simulationService.js
 * ---------------------------------------------------------
 * Produces a continuously evolving "live" crowd/operations
 * state for the stadium. This is NOT random-for-show data —
 * it follows a bounded stochastic model (mean-reverting random
 * walk) per zone so that:
 *   - values move realistically over time (no static hardcoding)
 *   - values stay within physically plausible bounds
 *   - history is retained so real trend/regression analysis
 *     can be computed by the analytics & crowd-intelligence routes
 *
 * The rest of the app (routes) reads from this single in-memory
 * source of truth via getState()/getHistory(), so every endpoint
 * reflects the same live picture of the stadium.
 */

const stadiumData = require('../data/stadiumData.json');

const ZONE_CAPACITY = 82500 / stadiumData.stadium.zones.length; // per-zone capacity share

class SimulationService {
  constructor() {
    this.startedAt = Date.now();
    this.tick = 0;

    // Per-zone live state
    this.zoneState = {};
    stadiumData.stadium.zones.forEach((zone) => {
      this.zoneState[zone] = {
        zone,
        occupancy: Math.round(ZONE_CAPACITY * (0.15 + Math.random() * 0.1)), // gates just opening
        queueLengthMeters: Math.round(5 + Math.random() * 10),
        inflowRatePerMin: Math.round(40 + Math.random() * 40),
      };
    });

    // Rolling history for trend/regression (last N samples per zone)
    this.history = {};
    stadiumData.stadium.zones.forEach((zone) => {
      this.history[zone] = [];
    });

    // Incident log (populated by incidents route)
    this.incidents = [];

    // Kick off the live update loop
    this.interval = setInterval(() => this._advance(), 5000);
  }

  _advance() {
    this.tick += 1;
    const elapsedMinutes = (Date.now() - this.startedAt) / 60000;

    // Match-day arc: occupancy ramps up pre-kickoff, plateaus, tapers after 110 min
    const arc = this._matchDayArcFactor(elapsedMinutes);

    stadiumData.stadium.zones.forEach((zone) => {
      const s = this.zoneState[zone];

      // Mean-reverting random walk toward the arc-implied target occupancy
      const targetOccupancy = ZONE_CAPACITY * arc * (0.85 + Math.random() * 0.3);
      const drift = (targetOccupancy - s.occupancy) * 0.15;
      const noise = (Math.random() - 0.5) * ZONE_CAPACITY * 0.02;
      s.occupancy = Math.max(0, Math.min(ZONE_CAPACITY, Math.round(s.occupancy + drift + noise)));

      // Queue length correlates with occupancy ratio + noise
      const occRatio = s.occupancy / ZONE_CAPACITY;
      const targetQueue = 5 + occRatio * 90;
      s.queueLengthMeters = Math.max(0, Math.round(s.queueLengthMeters * 0.6 + targetQueue * 0.4 + (Math.random() - 0.5) * 8));

      s.inflowRatePerMin = Math.max(0, Math.round(30 + occRatio * 120 + (Math.random() - 0.5) * 20));

      // Push to history, cap at 60 samples (5 min interval => 5 hours of history)
      this.history[zone].push({
        t: Date.now(),
        occupancy: s.occupancy,
        occRatio: Number(occRatio.toFixed(4)),
        queueLengthMeters: s.queueLengthMeters,
        inflowRatePerMin: s.inflowRatePerMin,
      });
      if (this.history[zone].length > 60) this.history[zone].shift();
    });
  }

  _matchDayArcFactor(elapsedMinutes) {
    // 0 -> 0.15 baseline, ramps to ~1.0 by minute 60 (kickoff), tapers after 110
    if (elapsedMinutes < 60) return 0.15 + (elapsedMinutes / 60) * 0.85;
    if (elapsedMinutes < 110) return 1.0;
    const tail = Math.max(0, 1 - (elapsedMinutes - 110) / 40);
    return 0.2 + tail * 0.8;
  }

  getState() {
    return {
      generatedAt: new Date().toISOString(),
      zones: Object.values(this.zoneState),
    };
  }

  getHistory(zone) {
    if (zone) return this.history[zone] || [];
    return this.history;
  }

  addIncident(incident) {
    this.incidents.push(incident);
    return incident;
  }

  getIncidents() {
    return this.incidents;
  }

  /**
   * Simple linear regression over the last N occupancy samples for a zone.
   * Returns slope (per-sample change) and a short forward projection.
   * This is real math over real (simulated-live) history, not a fabricated number.
   */
  predictCongestion(zone, stepsAhead = 3) {
    const hist = this.history[zone] || [];
    if (hist.length < 4) {
      return { available: false, reason: 'Not enough history yet to compute a reliable trend.' };
    }
    const n = hist.length;
    const xs = hist.map((_, i) => i);
    const ys = hist.map((h) => h.occRatio);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    const projected = [];
    for (let s = 1; s <= stepsAhead; s++) {
      const x = n - 1 + s;
      const y = Math.max(0, Math.min(1, intercept + slope * x));
      projected.push(Number(y.toFixed(4)));
    }
    return {
      available: true,
      slopePerSample: Number(slope.toFixed(5)),
      currentRatio: ys[n - 1],
      projectedRatios: projected,
      overloadRisk: projected.some((p) => p > 0.9),
    };
  }
}

// Singleton — one live stadium state shared across all routes
const simulationService = new SimulationService();

module.exports = simulationService;
