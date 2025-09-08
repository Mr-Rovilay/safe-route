import express from 'express';
import {
  fetchExternalTrafficData,
  getAllTrafficData,
  getTrafficBySegmentId,
  getTrafficByLGA,
  createTrafficData,
  updateTrafficData,
  getRouteTraffic,
  getTrafficIncidents,
  getFloodedRoads,
} from '../controllers/trafficController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getAllTrafficData); // Get all traffic data with filters
router.get('/segment/:segmentId', getTrafficBySegmentId); // Get traffic by segment ID
router.get('/lga/:lga', getTrafficByLGA); // Get traffic by LGA
router.get('/incidents', getTrafficIncidents); // Get traffic incidents
router.get('/flooded', getFloodedRoads); // Get flooded roads

// Protected routes (require authentication)
router.post('/fetch-external', protect, fetchExternalTrafficData); // Fetch and update external data
router.post('/', protect, createTrafficData); // Create new traffic data
router.patch('/segment/:segmentId', protect, updateTrafficData); // Update traffic data
router.post('/route', protect, getRouteTraffic); // Get traffic for route planning

export default router;