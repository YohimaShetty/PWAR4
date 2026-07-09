const express = require('express');
const PDFDocument = require('pdfkit');
const stadiumData = require('../data/stadiumData.json');
const simulationService = require('../services/simulationService');
const geminiService = require('../services/geminiService');

const router = express.Router();

const REPORT_TYPES = [
  'incident_report',
  'daily_operations',
  'crowd_summary',
  'accessibility_summary',
  'volunteer_summary',
  'sustainability_report',
];

function drawHeader(doc, title) {
  doc.fontSize(20).fillColor('#0f172a').text('StadiumMind AI', { continued: false });
  doc.fontSize(11).fillColor('#475569').text(stadiumData.stadium.name);
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor('#0f172a').text(title);
  doc.fontSize(9).fillColor('#94a3b8').text(`Generated ${new Date().toLocaleString()}`);
  doc.moveDown();
  doc.strokeColor('#e2e8f0').moveTo(doc.x, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
}

function keyValue(doc, label, value) {
  doc.fontSize(11).fillColor('#334155').text(`${label}: `, { continued: true }).fillColor('#0f172a').text(`${value}`);
}

router.get('/:type', async (req, res) => {
  const { type } = req.params;
  if (!REPORT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unknown report type. Supported: ${REPORT_TYPES.join(', ')}` });
  }

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}.pdf"`);
  doc.pipe(res);

  const state = simulationService.getState();
  const incidents = simulationService.getIncidents();

  try {
    if (type === 'incident_report') {
      drawHeader(doc, 'Incident Report');
      if (incidents.length === 0) {
        doc.fontSize(11).fillColor('#475569').text('No incidents have been reported in this session.');
      } else {
        incidents.forEach((i, idx) => {
          keyValue(doc, 'Incident', `#${idx + 1} — ${i.type}`);
          keyValue(doc, 'Zone', i.zone);
          keyValue(doc, 'Severity', i.severity);
          keyValue(doc, 'Priority', i.priority);
          keyValue(doc, 'Dispatched Team', i.dispatchedTeam || 'N/A');
          keyValue(doc, 'Reported At', i.reportedAt);
          doc.fontSize(11).fillColor('#334155').text(`Description: ${i.description}`);
          doc.moveDown();
        });
      }
    }

    if (type === 'daily_operations' || type === 'crowd_summary') {
      drawHeader(doc, type === 'daily_operations' ? 'Daily Operations Report' : 'Crowd Summary Report');
      const capacity = 82500 / stadiumData.stadium.zones.length;
      state.zones.forEach((z) => {
        keyValue(doc, `Zone ${z.zone} occupancy`, `${z.occupancy} / ${Math.round(capacity)} (${((z.occupancy / capacity) * 100).toFixed(1)}%)`);
        keyValue(doc, `Zone ${z.zone} queue length`, `${z.queueLengthMeters} m`);
        doc.moveDown(0.3);
      });
      if (type === 'daily_operations') {
        doc.moveDown();
        keyValue(doc, 'Total incidents logged', incidents.length);
      }
    }

    if (type === 'accessibility_summary') {
      drawHeader(doc, 'Accessibility Summary Report');
      const accessible = stadiumData.facilities.filter((f) => f.accessible);
      keyValue(doc, 'Total accessible facilities', accessible.length);
      keyValue(doc, 'Total facilities', stadiumData.facilities.length);
      doc.moveDown();
      accessible.forEach((f) => {
        doc.fontSize(11).fillColor('#334155').text(`• ${f.name} (${f.type}) — Zone ${f.zone}`);
      });
    }

    if (type === 'volunteer_summary') {
      drawHeader(doc, 'Volunteer Operations Summary');
      keyValue(doc, 'Response teams on duty', stadiumData.responseTeams.length);
      doc.moveDown();
      stadiumData.responseTeams.forEach((t) => {
        doc.fontSize(11).fillColor('#334155').text(`• ${t.name} — ${t.type} — Zone ${t.zone}`);
      });
      doc.moveDown();
      keyValue(doc, 'Incidents requiring response today', incidents.length);
    }

    if (type === 'sustainability_report') {
      drawHeader(doc, 'Sustainability Report');
      stadiumData.transportOptions.forEach((o) => {
        keyValue(doc, `${o.mode} CO2 factor`, `${o.co2GPerKm} g/km`);
      });
      doc.moveDown();
      keyValue(doc, 'Water refill stations', stadiumData.facilities.filter((f) => f.type === 'water').length);
      keyValue(doc, 'Recycling points', stadiumData.facilities.filter((f) => f.type === 'recycling').length);
    }

    // AI-written executive summary appended to every report, grounded in the same data drawn above
    try {
      const aiSummary = await geminiService.generate({
        userMessage: `Write a 3-4 sentence executive summary for this "${type}" report, for a stadium operations director.`,
        liveData: { state, incidents, stadiumData },
        extraInstruction: 'Plain prose, no headers, no bullet points.',
      });
      doc.moveDown();
      doc.strokeColor('#e2e8f0').moveTo(doc.x, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();
      doc.fontSize(12).fillColor('#0f172a').text('AI Executive Summary', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#334155').text(aiSummary);
    } catch (err) {
      doc.moveDown();
      doc.fontSize(10).fillColor('#94a3b8').text('(AI executive summary unavailable — GEMINI_API_KEY not configured on server.)');
    }

    doc.end();
  } catch (err) {
    // If headers already sent (pipe started), we cannot send JSON — end the doc gracefully.
    doc.fontSize(11).fillColor('red').text('An error occurred while generating this report.');
    doc.end();
  }
});

module.exports = router;
