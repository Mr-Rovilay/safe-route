import express from 'express';
import { 
  createTrip,
  getUserTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  startTrip,
  completeTrip,
  cancelTrip,
  addAlert,
  updateRouteData
} from '../controllers/tripController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All trip routes are protected
router.use(protect);

// Trip CRUD routes
router.post('/', createTrip);
router.get('/', getUserTrips);
router.get('/:id', getTripById);
router.put('/:id', updateTrip);
router.delete('/:id', deleteTrip);

// Trip status management
router.post('/:id/start', startTrip);
router.post('/:id/complete', completeTrip);
router.post('/:id/cancel', cancelTrip);

// Trip alerts and route updates
router.post('/:id/alerts', addAlert);
router.put('/:id/route', updateRouteData);

export default router;