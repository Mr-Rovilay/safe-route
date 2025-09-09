import express from 'express';
import { 
  getAllWeatherData,
  getWeatherByCity,
  getWeatherByLGA,
  getLatestWeather,
  createWeatherData,
  updateWeatherData,
  deleteWeatherData,
  fetchOpenWeatherData,
  getWeatherForecast,
  getFloodRiskAlerts
} from '../controllers/weatherController.js';

const router = express.Router();

// Public routes for weather data
router.get('/', getAllWeatherData);
router.get('/city/:city', getWeatherByCity);
router.get('/lga/:lga', getWeatherByLGA);
router.get('/latest', getLatestWeather);
router.get('/forecast', getWeatherForecast);
router.get('/alerts', getFloodRiskAlerts);

// Admin routes for weather data management
router.post('/', createWeatherData);
router.put('/:id', updateWeatherData);
router.delete('/:id', deleteWeatherData);
router.post('/fetch', fetchOpenWeatherData);

export default router;