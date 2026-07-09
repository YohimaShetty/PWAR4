/**
 * validators.js - lightweight, dependency-free input validation.
 */

function isNonEmptyString(v, maxLen = 2000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function isValidZone(zone, validZones) {
  return typeof zone === 'string' && validZones.includes(zone.toUpperCase());
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateChatBody(body) {
  const errors = [];
  if (!isNonEmptyString(body.message, 4000)) errors.push('message must be a non-empty string (max 4000 chars).');
  if (body.sessionId && typeof body.sessionId !== 'string') errors.push('sessionId must be a string.');
  return errors;
}

function validateNavigationBody(body) {
  const errors = [];
  if (!isNonEmptyString(body.seatSection, 20)) errors.push('seatSection is required.');
  if (body.currentZone && typeof body.currentZone !== 'string') errors.push('currentZone must be a string.');
  if (body.arrivalMinutesFromNow !== undefined && !isFiniteNumber(body.arrivalMinutesFromNow)) {
    errors.push('arrivalMinutesFromNow must be a number.');
  }
  return errors;
}

function validateIncidentBody(body) {
  const errors = [];
  const allowedTypes = ['medical', 'violence', 'lost_child', 'blocked_exit', 'fire', 'other'];
  if (!allowedTypes.includes(body.type)) errors.push(`type must be one of ${allowedTypes.join(', ')}.`);
  if (!isNonEmptyString(body.description, 1000)) errors.push('description is required (max 1000 chars).');
  if (!isNonEmptyString(body.zone, 5)) errors.push('zone is required.');
  return errors;
}

function validateSustainabilityBody(body) {
  const errors = [];
  if (!isFiniteNumber(body.distanceKm) || body.distanceKm <= 0) errors.push('distanceKm must be a positive number.');
  if (!isNonEmptyString(body.mode, 30)) errors.push('mode is required.');
  return errors;
}

module.exports = {
  isNonEmptyString,
  isValidZone,
  isFiniteNumber,
  validateChatBody,
  validateNavigationBody,
  validateIncidentBody,
  validateSustainabilityBody,
};
