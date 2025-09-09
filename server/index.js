import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import connectDB from "./db/db.js";
import http from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import multer from "multer";
import cron from "node-cron";
import axios from "axios";
import authRoutes from './routes/authRoutes.js';
import rideRoutes from './routes/rideRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import trafficRoutes from './routes/trafficRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import weatherRoutes from './routes/weatherRoutes.js';
import floodRoutes from './routes/floodRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import { initSockets } from './controllers/socketController.js';
// Import models needed for scheduled jobs
import Weather from './models/WeatherSchema.js';
import Traffic from './models/TrafficSchema.js';
// import Flood from './models/FloodSchema.js';
// import Search from "./models/SearchSchema.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach Socket.IO to app for access in controllers
app.set('io', io);

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/traffic', trafficRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/floods', floodRoutes);
app.use('/api/searches', searchRoutes);

// Add this route to index.js before starting the server
// app.get('/create-indexes', async (req, res) => {
//   try {
//     // Create indexes for Traffic model
//     await Traffic.collection.createIndex({ location: "2dsphere" });
    
//     // Create indexes for Flood model
//     await Flood.collection.createIndex({ coordinates: "2dsphere" });
//     await Flood.collection.createIndex({ lga: 1, recordedAt: -1 });
    
//     // Create indexes for Search model
//     await Search.collection.createIndex({ query: "text" });
//     await Search.collection.createIndex({ location: "2dsphere" });
    
//     res.json({ message: "Indexes created successfully" });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// Error handling middleware
app.use((err, req, res, next) => {
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large. Maximum size is 5MB.' });
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum is 5.' });
    }
  } else if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({ message: err.message });
  }
  
  // Handle other errors
  res.status(500).json({ message: 'Something went wrong!' });
});

app.get("/", (req, res) => {
  res.send("SafeRoute API is running");
});

// Initialize socket events
initSockets(io);

// Schedule weather check every 30 minutes for key Lagos locations
cron.schedule('*/30 * * * *', async () => {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      console.log('OpenWeather API key not configured, skipping weather check');
      return;
    }
    
    console.log('Starting scheduled weather data update...');
    
    // Key locations in Lagos to monitor
    const lagosLocations = [
      { name: 'Lagos Island', lat: 6.4541, lng: 3.3947 },
      { name: 'Victoria Island', lat: 6.4341, lng: 3.4187 },
      { name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
      { name: 'Lekki', lat: 6.4449, lng: 3.4762 },
      { name: 'Surulere', lat: 6.4943, lng: 3.3544 },
      { name: 'Apapa', lat: 6.4476, lng: 3.3692 },
      { name: 'Mainland', lat: 6.5244, lng: 3.3792 }
    ];
    
    let updateCount = 0;
    let highRiskAreas = [];
    
    // Fetch weather data for each location
    for (const location of lagosLocations) {
      try {
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );
        
        // Fetch forecast data
        const forecastResponse = await axios.get(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${location.lat}&lon=${location.lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );
        
        const currentData = response.data;
        const forecastData = forecastResponse.data;
        
        // Calculate precipitation probability and flood risk
        const precipitationProbability = calculatePrecipitationProbability(forecastData);
        const floodRisk = calculateFloodRisk(currentData, forecastData);
        
        // Create weather data object
        const weatherData = {
          city: location.name,
          lga: getLGAFromLocation(location.name),
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
          uvIndex: 0,
          rainfall: currentData.rain ? currentData.rain['1h'] || 0 : 0,
          precipitationProbability,
          floodRisk,
          sunrise: new Date(currentData.sys.sunrise * 1000),
          sunset: new Date(currentData.sys.sunset * 1000),
          condition: currentData.weather[0].main,
          description: currentData.weather[0].description,
          source: 'OpenWeather',
          recordedAt: new Date()
        };
        
        // Save to database using imported Weather model
        const weather = new Weather(weatherData);
        await weather.save();
        
        updateCount++;
        
        // Check for high flood risk
        if (floodRisk === 'high') {
          highRiskAreas.push({
            location: location.name,
            floodRisk,
            rainfall: weatherData.rainfall,
            precipitationProbability
          });
        }
        
        // Emit weather update via socket.io
        io.emit('weather-update', weatherData);
        
      } catch (error) {
        console.error(`Error fetching weather data for ${location.name}:`, error.message);
      }
    }
    
    console.log(`Weather data updated for ${updateCount} locations`);
    
    // If there are high flood risk areas, emit an alert
    if (highRiskAreas.length > 0) {
      io.emit('flood-risk-alert', {
        message: 'High flood risk detected in the following areas',
        areas: highRiskAreas,
        timestamp: new Date()
      });
      console.log('Flood risk alert emitted for:', highRiskAreas.map(a => a.location).join(', '));
    }
    
  } catch (error) {
    console.error('Error in scheduled weather update:', error);
  }
});

// Schedule traffic data update every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    console.log('Starting scheduled traffic data update...');
    
    // Get all segments to update
    const segments = await Traffic.distinct('segmentId');
    
    const updatedData = [];
    
    for (const segmentId of segments) {
      // Get existing data for this segment
      const existingData = await Traffic.findOne({ segmentId }).sort({ recordedAt: -1 });
      
      if (!existingData) {
        console.log(`No existing data found for segment: ${segmentId}`);
        continue;
      }
      
      // Fetch traffic data from Google Maps
      const trafficData = await fetchGoogleMapsTrafficData(existingData);
      
      if (!trafficData) {
        console.log(`Failed to fetch traffic data for segment: ${segmentId}`);
        continue;
      }
      
      // Fetch weather data from OpenWeather
      let weatherData = {};
      try {
        const { midPoint } = existingData.coordinates;
        const weatherResponse = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?lat=${midPoint.lat}&lon=${midPoint.lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );
        
        weatherData = {
          condition: weatherResponse.data.weather[0].main,
          temperature: weatherResponse.data.main.temp,
          visibility: weatherResponse.data.visibility,
          precipitation: weatherResponse.data.rain ? weatherResponse.data.rain['1h'] || 0 : 0,
          recordedAt: new Date()
        };
      } catch (error) {
        console.error('Error fetching weather data:', error);
        // Use existing weather data if available
        weatherData = existingData.weather || {};
      }
      
      // Fetch flood data based on weather
      const floodData = await fetchFloodData(weatherData, existingData.coordinates.midPoint);
      
      // Create updated traffic data
      const updatedTrafficData = {
        segmentId,
        ...trafficData,
        weather: weatherData,
        flood: floodData,
        recordedAt: new Date()
      };
      
      // Save updated data
      const traffic = new Traffic(updatedTrafficData);
      await traffic.save();
      
      updatedData.push(traffic);
      
      // Emit real-time update via socket.io
      io.emit('traffic-update', {
        segmentId,
        trafficData: updatedTrafficData
      });
    }
    
    console.log(`Traffic data updated successfully: ${updatedData.length} segments`);
  } catch (error) {
    console.error('Error in scheduled traffic data update:', error);
  }
});

// Schedule flood data simulation every hour (for demo purposes)
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Starting scheduled flood data simulation...');
    
    // Call the simulateFloodData endpoint internally
    const response = await axios.post(`${process.env.BASE_URL || 'http://localhost:5000'}/api/floods/simulate`);
    
    console.log(`Flood simulation completed: ${response.data.createdFloods.length} flood reports created`);
  } catch (error) {
    console.error('Error in scheduled flood simulation:', error);
  }
});

// Connect to database and start server
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to the database", err);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Helper functions for the scheduled job
function calculatePrecipitationProbability(forecastData) {
  const forecasts = forecastData.list.slice(0, 8);
  let rainCount = 0;
  forecasts.forEach(forecast => {
    if (forecast.rain && (forecast.rain['3h'] > 0)) {
      rainCount++;
    }
  });
  return Math.round((rainCount / forecasts.length) * 100);
}

function calculateFloodRisk(currentData, forecastData) {
  const currentRainfall = currentData.rain ? currentData.rain['1h'] || 0 : 0;
  const forecasts = forecastData.list.slice(0, 8);
  let totalForecastRain = 0;
  forecasts.forEach(forecast => {
    totalForecastRain += forecast.rain ? forecast.rain['3h'] || 0 : 0;
  });
  const totalRain = currentRainfall + totalForecastRain;
  
  if (totalRain > 30) return 'high';
  if (totalRain > 15) return 'moderate';
  return 'low';
}

function getLGAFromLocation(locationName) {
  // Simple mapping of location names to LGAs
  const lgaMap = {
    'Lagos Island': 'Lagos Island',
    'Victoria Island': 'Eti-Osa',
    'Ikeja': 'Ikeja',
    'Lekki': 'Eti-Osa',
    'Surulere': 'Surulere',
    'Apapa': 'Apapa',
    'Mainland': 'Lagos Mainland'
  };
  
  return lgaMap[locationName] || 'Unknown';
}

// Helper functions for traffic data
async function fetchGoogleMapsTrafficData(segment) {
  try {
    const { start, end } = segment.coordinates;
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];
      
      return {
        congestionLevel: getCongestionLevel(leg.duration_in_traffic.value, leg.duration.value),
        averageSpeed: calculateAverageSpeed(leg.distance.value, leg.duration_in_traffic.value),
        typicalSpeed: calculateAverageSpeed(leg.distance.value, leg.duration.value),
        travelTime: Math.round(leg.duration_in_traffic.value / 60), // Convert to minutes
        freeFlowTime: Math.round(leg.duration.value / 60), // Convert to minutes
        delay: Math.round((leg.duration_in_traffic.value - leg.duration.value) / 60), // Convert to minutes
        confidenceLevel: 0.9 // High confidence for Google Maps data
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Google Maps traffic data:', error);
    return null;
  }
}

function getCongestionLevel(trafficDuration, normalDuration) {
  const ratio = trafficDuration / normalDuration;
  
  if (ratio < 1.1) return "free";
  if (ratio < 1.3) return "light";
  if (ratio < 1.6) return "moderate";
  if (ratio < 2.0) return "heavy";
  return "severe";
}

function calculateAverageSpeed(distanceMeters, durationSeconds) {
  return Math.round((distanceMeters / 1000) / (durationSeconds / 3600)); // km/h
}

async function fetchFloodData(weatherData, coordinates) {
  try {
    // If we have precipitation data, use it to determine flood level
    if (weatherData && weatherData.precipitation) {
      const floodLevel = getFloodLevel(weatherData, weatherData.precipitation);
      
      return {
        isFlooded: floodLevel !== "none",
        floodLevel,
        description: getFloodDescription(floodLevel),
        recordedAt: new Date()
      };
    }
    
    // If no precipitation data, simulate based on location
    const isFlooded = Math.random() > 0.8; // 20% chance of flood
    const floodLevel = isFlooded ? 
      ['minor', 'moderate', 'severe'][Math.floor(Math.random() * 3)] : 
      'none';
    
    return {
      isFlooded,
      floodLevel,
      description: getFloodDescription(floodLevel),
      recordedAt: new Date()
    };
  } catch (error) {
    console.error('Error fetching flood data:', error);
    return {
      isFlooded: false,
      floodLevel: 'none',
      description: '',
      recordedAt: new Date()
    };
  }
}

function getFloodLevel(weatherData, precipitation) {
  if (precipitation > 15) return "severe";
  if (precipitation > 10) return "moderate";
  if (precipitation > 5) return "minor";
  return "none";
}

function getFloodDescription(floodLevel) {
  switch (floodLevel) {
    case 'severe':
      return 'Road completely flooded, avoid area';
    case 'moderate':
      return 'Significant flooding, drive with caution';
    case 'minor':
      return 'Water pooling on road shoulders';
    default:
      return '';
  }
}