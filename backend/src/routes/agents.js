// AI agents: run (creates a pending proposal), list runs, approve (applies changes) or reject.
const express = require('express');
const { ah } = require('../utils');
const { requireFirm } = require('../middleware/auth');
const { AGENTS, publicAgent, runAgent, approveRun, rejectRun, listRuns, loadRun } = require('../services/agents');

const router = express.Router();
router.use(requireFirm);

router.get('/', (req, res) => res.json(Object.values(AGENTS).map(publicAgent)));
router.get('/runs', ah(async (req, res) => res.json(await listRuns(req))));
router.get('/runs/:id', ah(async (req, res) => res.json(await loadRun(req, req.params.id))));
router.post('/runs/:id/approve', ah(async (req, res) => res.json(await approveRun(req, req.params.id, req.body || {}))));
router.post('/runs/:id/reject', ah(async (req, res) => res.json(await rejectRun(req, req.params.id, req.body || {}))));
router.post('/:agent/run', ah(async (req, res) => {
  const { entity_type, entity_id } = req.body || {};
  res.status(201).json(await runAgent(req, req.params.agent, String(entity_type || ''), Number(entity_id)));
}));

module.exports = router;
