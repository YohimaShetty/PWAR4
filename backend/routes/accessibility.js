const express = require('express');
const stadiumData = require('../data/stadiumData.json');

const router = express.Router();

const PROFILE_PRIORITIES = {
  wheelchair: ['restroom', 'medical', 'food', 'charging'],
  elderly: ['restroom', 'medical', 'food', 'water'],
  family_with_kids: ['restroom', 'food', 'water', 'charging'],
  visually_impaired: ['medical', 'restroom', 'food'],
  hearing_impaired: ['medical', 'restroom', 'food'],
};

router.get('/facilities', (req, res) => {
  const { zone, profile } = req.query;

  if (profile && !PROFILE_PRIORITIES[profile]) {
    return res.status(400).json({
      error: `Unknown profile. Supported profiles: ${Object.keys(PROFILE_PRIORITIES).join(', ')}.`,
    });
  }

  let facilities = stadiumData.facilities.filter((f) => f.accessible);
  if (zone) facilities = facilities.filter((f) => f.zone === zone.toUpperCase());

  const priorityOrder = profile ? PROFILE_PRIORITIES[profile] : null;
  if (priorityOrder) {
    facilities = [...facilities].sort(
      (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
    );
  }

  const guidance = {
    wheelchair: 'All listed facilities have step-free access. Elevators are available at every gate concourse.',
    elderly: 'Seating with armrests and shaded rest areas are located near each restroom listed below.',
    family_with_kids: 'Family restrooms and stroller parking are available at the food courts listed below.',
    visually_impaired: 'Tactile guidance strips lead from each gate to the medical room and restrooms listed below. Staff can provide a guided escort — ask at any gate.',
    hearing_impaired: 'Visual paging screens are installed at all facilities listed below; staff carry text-relay tablets.',
  };

  res.json({
    profile: profile || null,
    guidance: profile ? guidance[profile] : null,
    facilities,
  });
});

module.exports = router;
