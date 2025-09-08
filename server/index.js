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
import { initSockets } from './controllers/socketController.js';

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message, err.stack); // Log errors for debugging
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large. Maximum size is 5MB.' });
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum is 5.' });
    }
  } else if (err.message === 'Only image files are allowed!') {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

app.get("/", (req, res) => {
  res.send("SafeRoute API is running");
});

// Initialize socket events
initSockets(io);

// Schedule weather check every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  try {
    if (!process.env.OPENWEATHER_API_KEY) {
      console.log('OpenWeather API key not configured, skipping weather check');
      return;
    }
    
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=6.5244&lon=3.3792&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    
    const forecasts = response.data.list.slice(0, 4);
    let maxRain = 0;
    let rainTimes = [];
    
    forecasts.forEach(forecast => {
      const rain = forecast.rain ? forecast.rain['3h'] : 0;
      if (rain > 0) {
        maxRain = Math.max(maxRain, rain);
        rainTimes.push(new Date(forecast.dt * 1000).toLocaleTimeString());
      }
    });
    
    if (maxRain > 3) {
      const alert = {
        message: `Rain expected in Lagos (${maxRain.toFixed(1)}mm) at: ${rainTimes.join(', ')}`,
        severity: maxRain > 10 ? 'high' : 'medium',
        maxRain,
        rainTimes,
        timestamp: new Date(),
      };
      
      io.emit('weather-alert', alert);
      console.log('Weather alert emitted:', alert.message);
    }
  } catch (error) {
    console.error('Error in scheduled weather check:', error.message);
  }
});

// Schedule traffic data update every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    console.log('Starting scheduled traffic data update...');
    const response = await axios.post(`http://localhost:${PORT}/api/traffic/fetch-external`, {}, {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }, // Use admin token
    });
    console.log(`Traffic data updated successfully: ${response.data.updatedCount} segments`);
  } catch (error) {
    console.error('Error in scheduled traffic data update:', error.message);
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
  console.error('Unhandled Rejection:', err.message, err.stack);
  server.close(() => process.exit(1));
});