const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireOrgOwner } = require('../../middleware/requireOrgOwner');
const { getCafes } = require('../../controllers/org/orgController');

router.use(authenticate, requireOrgOwner);

router.get('/cafes', getCafes);

module.exports = router;
