import express from 'express';
import { 
  getAllAlerts,
  getAlertById,
  createAlert,
  updateAlert,
  deleteAlert,
  getAlertsNearLocation,
  checkTripAlerts,
  checkRideAlerts
} from '../controllers/alertController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes for alerts
router.get('/', getAllAlerts);
router.get('/near', getAlertsNearLocation);
router.get('/:id', getAlertById);

// Protected routes for alert management
router.use(protect);

// Alert CRUD routes
router.post('/', createAlert);
router.put('/:id', updateAlert);
router.delete('/:id', deleteAlert);

// Alert checking for trips and rides
router.post('/trip/:tripId/check', checkTripAlerts);
router.post('/ride/:rideId/check', checkRideAlerts);

export default router;