import Weather from '../models/WeatherSchema.js';
import axios from 'axios';

// Get all weather data (with pagination and filtering)
export const getAllWeatherData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const city = req.query.city;
    const lga = req.query.lga;
    const condition = req.query.condition;
    const floodRisk = req.query.floodRisk;
    
    let query = {};
    
    // Filter by city if provided
    if (city) {
      query.city = { $regex: city, $options: 'i' };
    }
    
    // Filter by LGA if provided
    if (lga) {
      query.lga = { $regex: lga, $options: 'i' };
    }
    
    // Filter by condition if provided
    if (condition) {
      query.condition = { $regex: condition, $options: 'i' };
    }
    
    // Filter by flood risk if provided
    if (floodRisk) {
      query.floodRisk = floodRisk;
    }
    
    const weatherData = await Weather.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Weather.countDocuments(query);
    
    res.json({
      weatherData,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get weather data for a specific city
export const getWeatherByCity = async (req, res) => {
  try {
    const { city } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const weatherData = await Weather.find({ city: { $regex: city, $options: 'i' } })
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Weather.countDocuments({ city: { $regex: city, $options: 'i' } });
    
    res.json({
      weatherData,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get weather data by LGA
export const getWeatherByLGA = async (req, res) => {
  try {
    const { lga } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const weatherData = await Weather.find({ lga: { $regex: lga, $options: 'i' } })
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Weather.countDocuments({ lga: { $regex: lga, $options: 'i' } });
    
    res.json({
      weatherData,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get latest weather data for a location
export const getLatestWeather = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }
    
    // Find the closest weather data point to the provided coordinates
    const weatherData = await Weather.findOne({
      'coordinates.lat': { $exists: true },
      'coordinates.lng': { $exists: true }
    }).sort({
      recordedAt: -1 // Get the most recent
    });
    
    if (!weatherData) {
      return res.status(404).json({ message: 'Weather data not found' });
    }
    
    res.json({ weatherData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new weather data entry
export const createWeatherData = async (req, res) => {
  try {
    const weatherData = new Weather(req.body);
    await weatherData.save();
    
    res.status(201).json({
      message: 'Weather data created successfully',
      weatherData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update weather data
export const updateWeatherData = async (req, res) => {
  try {
    const { id } = req.params;
    
    let weatherData = await Weather.findById(id);
    
    if (!weatherData) {
      return res.status(404).json({ message: 'Weather data not found' });
    }
    
    // Update fields
    Object.assign(weatherData, req.body);
    await weatherData.save();
    
    res.json({
      message: 'Weather data updated successfully',
      weatherData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete weather data
export const deleteWeatherData = async (req, res) => {
  try {
    const { id } = req.params;
    
    const weatherData = await Weather.findById(id);
    
    if (!weatherData) {
      return res.status(404).json({ message: 'Weather data not found' });
    }
    
    await weatherData.remove();
    
    res.json({ message: 'Weather data deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Fetch weather data from OpenWeather API
export const fetchOpenWeatherData = async (req, res) => {
  try {
    const { lat, lng, city } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }
    
    // Fetch current weather data
    const currentResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    
    // Fetch 5-day forecast data
    const forecastResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    
    const currentData = currentResponse.data;
    const forecastData = forecastResponse.data;
    
    // Process current weather data
    const weatherData = {
      city: city || currentData.name,
      coordinates: {
        lat: currentData.coord.lat,
        lng: currentData.coord.lon
      },
      temperature: currentData.main.temp,
      feelsLike: currentData.main.feels_like,
      minTemp: currentData.main.temp_min,
      maxTemp: currentData.main.temp_max,
      humidity: currentData.main.humidity,
      pressure: currentData.main.pressure,
      visibility: currentData.visibility,
      windSpeed: currentData.wind?.speed || 0,
      windDirection: currentData.wind?.deg || 0,
      cloudCover: currentData.clouds?.all || 0,
      uvIndex: 0, // Not available in current weather API
      rainfall: currentData.rain ? currentData.rain['1h'] || 0 : 0,
      precipitationProbability: calculatePrecipitationProbability(forecastData),
      floodRisk: calculateFloodRisk(currentData, forecastData),
      sunrise: new Date(currentData.sys.sunrise * 1000),
      sunset: new Date(currentData.sys.sunset * 1000),
      condition: currentData.weather[0].main,
      description: currentData.weather[0].description,
      source: 'OpenWeather',
      recordedAt: new Date()
    };
    
    // Save weather data to database
    const weather = new Weather(weatherData);
    await weather.save();
    
    // Emit weather update via socket.io
    const io = req.app.get('io');
    io.emit('weather-update', weatherData);
    
    res.json({
      message: 'Weather data fetched and saved successfully',
      weatherData
    });
  } catch (error) {
    console.error('Error fetching OpenWeather data:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function to calculate precipitation probability from forecast data
const calculatePrecipitationProbability = (forecastData) => {
  // Get the next few forecasts to check for rain
  const forecasts = forecastData.list.slice(0, 8); // Next 24 hours (3-hour intervals)
  
  let rainCount = 0;
  forecasts.forEach(forecast => {
    if (forecast.rain && (forecast.rain['3h'] > 0)) {
      rainCount++;
    }
  });
  
  return Math.round((rainCount / forecasts.length) * 100);
};

// Helper function to calculate flood risk
const calculateFloodRisk = (currentData, forecastData) => {
  // Get rainfall intensity
  const currentRainfall = currentData.rain ? currentData.rain['1h'] || 0 : 0;
  
  // Get forecasted rainfall for next 24 hours
  const forecasts = forecastData.list.slice(0, 8);
  let totalForecastRain = 0;
  forecasts.forEach(forecast => {
    totalForecastRain += forecast.rain ? forecast.rain['3h'] || 0 : 0;
  });
  
  // Calculate flood risk based on current and forecasted rainfall
  const totalRain = currentRainfall + totalForecastRain;
  
  if (totalRain > 30) return 'high';      // Heavy rain expected
  if (totalRain > 15) return 'moderate';  // Moderate rain expected
  return 'low';                           // Light or no rain
};

// Get weather forecast for a location
export const getWeatherForecast = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }
    
    // Fetch 5-day forecast data
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    
    const forecastData = response.data;
    
    // Process forecast data to group by day
    const dailyForecasts = {};
    
    forecastData.list.forEach(item => {
      const date = new Date(item.dt * 1000).toLocaleDateString();
      
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          date,
          minTemp: item.main.temp_min,
          maxTemp: item.main.temp_max,
          conditions: [],
          rainfall: 0,
          humidity: item.main.humidity,
          windSpeed: item.wind?.speed || 0,
          icon: item.weather[0].icon
        };
      }
      
      // Update min/max temps
      dailyForecasts[date].minTemp = Math.min(dailyForecasts[date].minTemp, item.main.temp_min);
      dailyForecasts[date].maxTemp = Math.max(dailyForecasts[date].maxTemp, item.main.temp_max);
      
      // Add rainfall
      dailyForecasts[date].rainfall += item.rain ? item.rain['3h'] || 0 : 0;
      
      // Add condition if not already present
      const condition = item.weather[0].main;
      if (!dailyForecasts[date].conditions.includes(condition)) {
        dailyForecasts[date].conditions.push(condition);
      }
    });
    
    // Convert to array and sort by date
    const forecastArray = Object.values(dailyForecasts).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    // Calculate flood risk for each day
    forecastArray.forEach(day => {
      if (day.rainfall > 30) {
        day.floodRisk = 'high';
      } else if (day.rainfall > 15) {
        day.floodRisk = 'moderate';
      } else {
        day.floodRisk = 'low';
      }
    });
    
    res.json({
      city: forecastData.city.name,
      forecast: forecastArray
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get weather alerts for high flood risk areas
export const getFloodRiskAlerts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const minRisk = req.query.minRisk || 'moderate'; // Default to moderate and high
    
    let query = {};
    
    // Filter by flood risk level
    if (minRisk === 'high') {
      query.floodRisk = 'high';
    } else if (minRisk === 'moderate') {
      query.floodRisk = { $in: ['moderate', 'high'] };
    }
    
    // Only get recent weather data (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    query.recordedAt = { $gte: yesterday };
    
    const alerts = await Weather.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Weather.countDocuments(query);
    
    res.json({
      alerts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};