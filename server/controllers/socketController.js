import axios from 'axios';
import dotenv from 'dotenv';
import { socketAuthenticate } from '../middleware/auth.js';

dotenv.config();

// Store active intervals to prevent memory leaks
const activeIntervals = new Map();
const userLocations = new Map(); // Store user locations for proximity alerts

export const initSockets = (io) => {
  // Apply auth to all sockets
  io.use(socketAuthenticate);
  
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.userId}`);
    
    // Join a room for Lagos-specific updates (scalable for other cities)
    socket.join('lagos-updates');
    
    // Join user-specific room for targeted notifications
    socket.join(`user:${socket.user.userId}`);
    
    // Event: Submit flood report (real-time version, broadcasts to others)
    socket.on('submit-flood-report', async (data) => {
      try {
        const { latitude, longitude, description, severity } = data;
        
        // Validate input
        if (!latitude || !longitude || !description || !severity) {
          return socket.emit('error', { message: 'Missing required fields' });
        }
        

        
        await report.save();
        
        // Populate user info for broadcast
     
        
        // Check for nearby users and send proximity alerts
        await sendProximityAlerts(io, reportData);
        
        socket.emit('report-confirmed', { 
          message: 'Report submitted and broadcasted',
          reportId: report._id
        });
      } catch (err) {
        console.error('Flood report submission error:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Event: Update user location for proximity alerts
    socket.on('update-location', (data) => {
      const { latitude, longitude } = data;
      
      if (!latitude || !longitude) {
        return socket.emit('error', { message: 'Invalid location data' });
      }
      
      // Store user location
      userLocations.set(socket.user.userId, { latitude, longitude });
      
      // Join location-based room (rough grid-based for proximity)
      const latGrid = Math.floor(latitude / 0.01);
      const lngGrid = Math.floor(longitude / 0.01);
      socket.join(`location:${latGrid}:${lngGrid}`);
      
      console.log(`User ${socket.user.userId} at ${latitude}, ${longitude}`);
    });
    
    // Event: Get nearby flood hotspots
    socket.on('get-nearby-hotspots', async (data) => {
      try {
        const { latitude, longitude, radius = 5000 } = data; // Radius in meters
        
        
        socket.emit('nearby-hotspots');
      } catch (err) {
        console.error('Nearby hotspots fetch error:', err);
        socket.emit('error', { message: 'Failed to fetch nearby hotspots' });
      }
    });
    
    // Set up periodic rain alerts for this socket
    const rainInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/forecast?lat=6.5244&lon=3.3792&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );
        
        const forecast = response.data.list[0];
        const rain = forecast.rain ? forecast.rain['3h'] : 0;
        
        // Only emit if there's significant rain
        if (rain > 1) {
          const alert = {
            message: `Rain expected (${rain}mm in next 3 hours)`,
            severity: rain > 5 ? 'high' : 'medium',
            timestamp: new Date()
          };
          
          socket.emit('rain-alert-update', alert);
        }
      } catch (err) {
        console.error('Periodic rain alert error:', err);
        // Don't emit error to client to avoid spam
      }
    }, 300000); // 5 minutes
    
    // Store the interval ID for cleanup
    activeIntervals.set(socket.id, rainInterval);
    
    socket.on('disconnect', () => {
      // Clear the interval for this socket
      const interval = activeIntervals.get(socket.id);
      if (interval) {
        clearInterval(interval);
        activeIntervals.delete(socket.id);
      }
      
      // Remove user location
      userLocations.delete(socket.user.userId);
      
      console.log(`User disconnected: ${socket.user.userId}`);
    });
  });
};

// Helper function to send proximity alerts to nearby users
async function sendProximityAlerts(io, reportData) {
  const reportCoords = reportData.location.coordinates;
  
  // Check all user locations
  for (const [userId, userLocation] of userLocations.entries()) {
    // Calculate distance between user and flood report
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      reportCoords[1], // latitude
      reportCoords[0]  // longitude
    );
    
    // If user is within 5km of the flood report
    if (distance <= 5) {
      io.to(`user:${userId}`).emit('proximity-flood-alert', {
        report: reportData,
        distance: `${distance.toFixed(2)} km`,
        message: `Flood reported ${distance.toFixed(2)} km from your location`
      });
    }
  }
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in km
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}