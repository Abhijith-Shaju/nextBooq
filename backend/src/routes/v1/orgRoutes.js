const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requireOrgOwner } = require('../../middleware/requireOrgOwner');
const { getOrganization, getCafes, getCafeStaff, postAssignStaff, deleteStaff } = require('../../controllers/org/orgController');

router.use(authenticate, requireOrgOwner);

router.get('/', getOrganization);
router.get('/cafes', getCafes);
router.get('/cafes/:cafeId/staff', getCafeStaff);
router.post('/cafes/:cafeId/staff', postAssignStaff);
router.delete('/cafes/:cafeId/staff/:userId', deleteStaff);

module.exports = router;
