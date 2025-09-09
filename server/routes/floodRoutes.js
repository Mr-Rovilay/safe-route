import express from 'express';
import { 
  getAllFloodData,
  getFloodByLGA,
  getFloodNearLocation,
  getFloodById,
  createFloodReport,
  updateFloodReport,
  deleteFloodReport,
  getHighRiskFloodAreas,
  getFloodStatsByLGA,
  simulateFloodData
} from '../controllers/floodController.js';

const router = express.Router();

// Public routes for flood data
router.get('/', getAllFloodData);
router.get('/lga/:lga', getFloodByLGA);
router.get('/near', getFloodNearLocation);
router.get('/high-risk', getHighRiskFloodAreas);
router.get('/stats', getFloodStatsByLGA);
router.get('/:id', getFloodById);

// Admin routes for flood data management
router.post('/', createFloodReport);
router.put('/:id', updateFloodReport);
router.delete('/:id', deleteFloodReport);
router.post('/simulate', simulateFloodData);

export default router;