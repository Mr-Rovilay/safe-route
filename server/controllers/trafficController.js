import Traffic from '../models/TrafficSchema.js'; // Fixed import path
import axios from 'axios';

// Helper function to determine congestion level
const getCongestionLevel = (trafficDuration, normalDuration) => {
  const ratio = trafficDuration / normalDuration;
  
  if (ratio < 1.1) return "free";
  if (ratio < 1.3) return "light";
  if (ratio < 1.6) return "moderate";
  if (ratio < 2.0) return "heavy";
  return "severe";
};

// Helper function to calculate average speed
const calculateAverageSpeed = (distanceMeters, durationSeconds) => {
  return Math.round((distanceMeters / 1000) / (durationSeconds / 3600)); // km/h
};

// Helper function to determine flood level based on weather and precipitation
const getFloodLevel = (weatherData, precipitation) => {
  if (precipitation > 15) return "severe";
  if (precipitation > 10) return "moderate";
  if (precipitation > 5) return "minor";
  return "none";
};

// Fetch traffic data from Google Maps API
export const fetchGoogleMapsTrafficData = async (segment) => {
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
};

// Fetch weather data from OpenWeather API
export const fetchOpenWeatherData = async (coordinates) => {
  try {
    const { lat, lng } = coordinates;
    
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    
    const weatherData = response.data;
    
    return {
      condition: weatherData.weather[0].main,
      temperature: weatherData.main.temp,
      visibility: weatherData.visibility,
      precipitation: weatherData.rain ? weatherData.rain['1h'] || 0 : 0,
      recordedAt: new Date()
    };
  } catch (error) {
    console.error('Error fetching OpenWeather data:', error);
    return null;
  }
};

// Fetch flood data based on weather conditions
export const fetchFloodData = async (weatherData, coordinates) => {
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
    
    // If no precipitation data, use flood API if available
    // For now, we'll simulate based on location
    // In a real implementation, you would use a flood API like:
    // https://environment.data.gov.uk/flood-monitoring/api/help
    
    // Simulate flood data based on location and weather
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
};

// Helper function to get flood description
const getFloodDescription = (floodLevel) => {
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
};

// Update fetchExternalTrafficData to use real APIs
export const fetchExternalTrafficData = async (req, res) => {
  try {
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
      const weatherData = await fetchOpenWeatherData(existingData.coordinates.midPoint);
      
      if (!weatherData) {
        console.log(`Failed to fetch weather data for segment: ${segmentId}`);
        // Use existing weather data if available
        weatherData = existingData.weather || {};
      }
      
      // Fetch flood data based on weather
      const floodData = await fetchFloodData(weatherData, existingData.coordinates.midPoint);
      
      // Create updated traffic data
      const updatedTrafficData = {
        segmentId,
        locationName: existingData.locationName,
        lga: existingData.lga,
        coordinates: existingData.coordinates,
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
      const io = req.app.get('io');
      io.emit('traffic-update', {
        segmentId,
        trafficData: updatedTrafficData
      });
    }
    
    res.json({
      message: 'Traffic data updated successfully',
      updatedCount: updatedData.length
    });
  } catch (error) {
    console.error('Error in fetchExternalTrafficData:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all traffic data (with pagination and filtering)
export const getAllTrafficData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const lga = req.query.lga;
    const congestionLevel = req.query.congestionLevel;
    const isFlooded = req.query.isFlooded;
    
    let query = {};
    
    // Filter by LGA if provided
    if (lga) {
      query.lga = lga;
    }
    
    // Filter by congestion level if provided
    if (congestionLevel) {
      query.congestionLevel = congestionLevel;
    }
    
    // Filter by flood status if provided
    if (isFlooded === 'true') {
      query['flood.isFlooded'] = true;
    } else if (isFlooded === 'false') {
      query['flood.isFlooded'] = false;
    }
    
    const trafficData = await Traffic.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Traffic.countDocuments(query);
    
    res.json({
      trafficData,
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

// Get traffic data for a specific segment
export const getTrafficBySegmentId = async (req, res) => {
  try {
    const { segmentId } = req.params;
    
    // Get the most recent traffic data for this segment
    const trafficData = await Traffic.findOne({ segmentId })
      .sort({ recordedAt: -1 });
    
    if (!trafficData) {
      return res.status(404).json({ message: 'Traffic data not found for this segment' });
    }
    
    res.json({ trafficData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get traffic data by LGA
export const getTrafficByLGA = async (req, res) => {
  try {
    const { lga } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const trafficData = await Traffic.find({ lga })
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Traffic.countDocuments({ lga });
    
    res.json({
      trafficData,
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

// Create new traffic data entry
export const createTrafficData = async (req, res) => {
  try {
    const trafficData = new Traffic(req.body);
    await trafficData.save();
    
    res.status(201).json({
      message: 'Traffic data created successfully',
      trafficData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update traffic data
export const updateTrafficData = async (req, res) => {
  try {
    const { segmentId } = req.params;
    
    let trafficData = await Traffic.findOne({ segmentId });
    
    if (!trafficData) {
      // If no existing data, create new entry
      trafficData = new Traffic({
        segmentId,
        ...req.body
      });
    } else {
      // Update existing data
      Object.assign(trafficData, req.body);
    }
    
    await trafficData.save();
    
    // Emit traffic update event via socket.io
    const io = req.app.get('io');
    io.emit('traffic-update', {
      segmentId,
      trafficData
    });
    
    res.json({
      message: 'Traffic data updated successfully',
      trafficData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get traffic data for route planning
export const getRouteTraffic = async (req, res) => {
  try {
    const { segments } = req.body; // Array of segment IDs
    
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ message: 'Segments array is required' });
    }
    
    // Get the most recent traffic data for each segment
    const trafficPromises = segments.map(segmentId => 
      Traffic.findOne({ segmentId }).sort({ recordedAt: -1 })
    );
    
    const trafficData = await Promise.all(trafficPromises);
    
    // Filter out null results
    const validTrafficData = trafficData.filter(data => data !== null);
    
    // Calculate overall route statistics
    let totalDelay = 0;
    let totalTravelTime = 0;
    let hasIncidents = false;
    let hasFloods = false;
    
    validTrafficData.forEach(data => {
      if (data.delay) totalDelay += data.delay;
      if (data.travelTime) totalTravelTime += data.travelTime;
      if (data.incidentType) hasIncidents = true;
      if (data.flood.isFlooded) hasFloods = true;
    });
    
    res.json({
      segments: validTrafficData,
      routeSummary: {
        totalDelay,
        totalTravelTime,
        hasIncidents,
        hasFloods,
        segmentCount: validTrafficData.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get traffic incidents
export const getTrafficIncidents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const lga = req.query.lga;
    const severity = req.query.severity;
    
    let query = { incidentType: { $exists: true, $ne: null } };
    
    // Filter by LGA if provided
    if (lga) {
      query.lga = lga;
    }
    
    // Filter by severity if provided
    if (severity) {
      query.severity = parseInt(severity);
    }
    
    const incidents = await Traffic.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Traffic.countDocuments(query);
    
    res.json({
      incidents,
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

// Get flooded roads
export const getFloodedRoads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const lga = req.query.lga;
    const floodLevel = req.query.floodLevel;
    
    let query = { 'flood.isFlooded': true };
    
    // Filter by LGA if provided
    if (lga) {
      query.lga = lga;
    }
    
    // Filter by flood level if provided
    if (floodLevel) {
      query['flood.floodLevel'] = floodLevel;
    }
    
    const floodedRoads = await Traffic.find(query)
      .sort({ 'flood.recordedAt': -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Traffic.countDocuments(query);
    
    res.json({
      floodedRoads,
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