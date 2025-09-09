import express from 'express';
import { 
  createSearch,
  getAllSearches,
  getUserSearches,
  getPopularSearches,
  getSearchTrends,
  getSearchStats,
  getSearchesNearLocation,
  deleteSearch
} from '../controllers/searchController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes for search data
router.get('/', getAllSearches);
router.get('/popular', getPopularSearches);
router.get('/trends', getSearchTrends);
router.get('/stats', getSearchStats);
router.get('/near', getSearchesNearLocation);

// Protected routes
router.use(protect);

// Search management
router.post('/', createSearch);
router.get('/user/:userId', getUserSearches);
router.delete('/:id', deleteSearch);

export default router;