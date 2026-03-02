import { Router } from 'express';
import { LOOKUPS, STUDENTS, addSubmission, getSubmissions } from '../data/store.js';

const router = Router();

const computeLevel = (recall, understand, hots, maxRecall, maxUnderstand, maxHots) => {
  if (maxRecall <= 0 || maxUnderstand <= 0 || maxHots <= 0) return '—';
  const pr = (recall / maxRecall) * 100;
  const pu = (understand / maxUnderstand) * 100;
  const ph = (hots / maxHots) * 100;
  if (pr < 50 || pu < 50 || ph < 50) return 'ضعيف';
  if (pr >= 80 && pu >= 80 && ph >= 80) return 'ممتاز';
  return 'جيد';
};

const createRowArray = ({ header, row, timestamp, batchId, level }) => [
  timestamp,
  batchId,
  header.teacherName,
  header.grade,
  header.section,
  header.subject,
  header.exam,
  header.maxRecall,
  header.maxUnderstand,
  header.maxHots,
  header.totalMax,
  row.studentName,
  row.recall,
  row.understand,
  row.hots,
  row.recall + row.understand + row.hots,
  row.plan,
  level
];

router.get('/', (req, res) => {
  const action = req.query.action;
  if (action === 'lookups') {
    return res.json({ ok: true, ...LOOKUPS });
  }
  if (action === 'students') {
    const grade = req.query.grade || '';
    const section = req.query.section || '';
    const key = `${grade}-${section}`;
    const list = STUDENTS[key] || ['Alya', 'Farah', 'Nada'];
    return res.json({ ok: true, students: list });
  }
  if (action === 'getData') {
    return res.json({ ok: true, rows: getSubmissions() });
  }
  return res.status(400).json({ ok: false, error: 'Unknown action' });
});

router.post('/', (req, res) => {
  const action = req.body?.action;
  if (action !== 'submit') {
    return res.status(400).json({ ok: false, error: 'Unknown action' });
  }
  const { header, rows } = req.body || {};
  if (!header || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }
  const batchId = `${Date.now()}`;
  const timestamp = new Date().toISOString();
  rows.forEach((row) => {
    const level = computeLevel(
      row.recall,
      row.understand,
      row.hots,
      header.maxRecall,
      header.maxUnderstand,
      header.maxHots
    );
    addSubmission(createRowArray({ header, row, timestamp, batchId, level }));
  });
  return res.json({ ok: true, inserted: rows.length, batchId });
});

export default router;
