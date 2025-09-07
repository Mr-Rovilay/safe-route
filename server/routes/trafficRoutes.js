import express from 'express';
import { 
  getAllTrafficData,
  getTrafficBySegmentId,
  getTrafficByLGA,
  createTrafficData,
  updateTrafficData,
  getRouteTraffic,
  fetchExternalTrafficData,
  getTrafficIncidents,
  getFloodedRoads
} from '../controllers/trafficController.js';

const router = express.Router();

// Public routes for traffic data
router.get('/', getAllTrafficData);
router.get('/segment/:segmentId', getTrafficBySegmentId);
router.get('/lga/:lga', getTrafficByLGA);
router.get('/incidents', getTrafficIncidents);
router.get('/flooded', getFloodedRoads);

// Route planning (requires segment IDs in request body)
router.post('/route', getRouteTraffic);

// Admin routes for traffic data management
router.post('/', createTrafficData);
router.put('/segment/:segmentId', updateTrafficData);
router.post('/fetch-external', fetchExternalTrafficData);

export default router;