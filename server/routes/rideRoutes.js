import express from 'express';
import { 
  createRide,
  getAllRides,
  getRideById,
  updateRide,
  deleteRide,
  addPassenger,
  removePassenger,
  startRide,
  completeRide,
  cancelRide
} from '../controllers/rideController.js';
import { protect } from '../middleware/auth.js';
import { triggerEmergencyAlert } from '../controllers/rideController.js';
import { resetEmergencyNotification } from '../controllers/rideController.js';

const router = express.Router();

// All ride routes are protected
router.use(protect);

// Ride CRUD routes
router.post('/', createRide);
router.get('/', getAllRides);
router.get('/:id', getRideById);
router.put('/:id', updateRide);
router.delete('/:id', deleteRide);

// Passenger management
router.post('/:id/passengers', addPassenger);
router.delete('/:id/passengers', removePassenger);

// Ride status management
router.post('/:id/start', startRide);
router.post('/:id/complete', completeRide);
router.post('/:id/cancel', cancelRide);

// Emergency management
router.post('/:id/emergency', triggerEmergencyAlert);
router.post('/:id/reset-emergency', resetEmergencyNotification);

export default router;