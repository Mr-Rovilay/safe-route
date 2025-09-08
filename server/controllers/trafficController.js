import Traffic from '../models/TrafficSchema.js'; // Corrected import name
import axios from 'axios';
import { z } from 'zod'; // For input validation

// Input validation schemas
const querySchema = z.object({
  page: z.string().optional().transform((val) => parseInt(val) || 1),
  limit: z.string().optional().transform((val) => parseInt(val) || 20),
  lga: z.string().optional(),
  congestionLevel: z.enum(["free", "light", "moderate", "heavy", "severe"]).optional(),
  isFlooded: z.enum(["true", "false"]).optional(),
  severity: z.string().optional().transform((val) => parseInt(val)),
  floodLevel: z.enum(["none", "minor", "moderate", "severe"]).optional(),
});

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

// Helper function to determine flood level
const getFloodLevel = (precipitation) => {
  if (precipitation > 15) return "severe";
  if (precipitation > 10) return "moderate";
  if (precipitation > 5) return "minor";
  return "none";
};

// Helper function to get flood description
const getFloodDescription = (floodLevel) => {
  switch (floodLevel) {
    case "severe":
      return "Road completely flooded, avoid area";
    case "moderate":
      return "Significant flooding, drive with caution";
    case "minor":
      return "Water pooling on road shoulders";
    default:
      return "";
  }
};

// Fetch traffic data from Google Maps API
export const fetchGoogleMapsTrafficData = async (segment) => {
  try {
    const { coordinates } = segment;
    const [start, end] = coordinates.coordinates; // [[lng, lat], [lng, lat]]

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${start[1]},${start[0]}&destination=${end[1]},${end[0]}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    if (response.data.routes?.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];

      return {
        congestionLevel: getCongestionLevel(leg.duration_in_traffic?.value || leg.duration.value, leg.duration.value),
        averageSpeed: calculateAverageSpeed(leg.distance.value, leg.duration_in_traffic?.value || leg.duration.value),
        typicalSpeed: calculateAverageSpeed(leg.distance.value, leg.duration.value),
        travelTime: Math.round((leg.duration_in_traffic?.value || leg.duration.value) / 60),
        freeFlowTime: Math.round(leg.duration.value / 60),
        delay: Math.round(((leg.duration_in_traffic?.value || leg.duration.value) - leg.duration.value) / 60),
        confidenceLevel: 0.9,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching Google Maps traffic data for segment ${segment.segmentId}:`, error.message);
    return null;
  }
};

// Fetch weather data from OpenWeather API
export const fetchOpenWeatherData = async (coordinates) => {
  try {
    const [lng, lat] = coordinates.coordinates[0]; // Use start point for weather

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );

    const weatherData = response.data;

    return {
      condition: weatherData.weather[0].main,
      temperature: weatherData.main.temp,
      visibility: weatherData.visibility,
      precipitation: weatherData.rain ? weatherData.rain["1h"] || 0 : 0,
      recordedAt: new Date(),
    };
  } catch (error) {
    console.error("Error fetching OpenWeather data:", error.message);
    return null;
  }
};

// Fetch flood data (placeholder for real API)
export const fetchFloodData = async (weatherData, coordinates) => {
  try {
    // Placeholder: Use precipitation to estimate flood level
    // In production, integrate with a flood API (e.g., Nigerian Meteorological Agency)
    const precipitation = weatherData?.precipitation || 0;
    const floodLevel = getFloodLevel(precipitation);

    return {
      isFlooded: floodLevel !== "none",
      floodLevel,
      description: getFloodDescription(floodLevel),
      recordedAt: new Date(),
    };
  } catch (error) {
    console.error("Error fetching flood data:", error.message);
    return {
      isFlooded: false,
      floodLevel: "none",
      description: "",
      recordedAt: new Date(),
    };
  }
};

// Fetch and update external traffic data
export const fetchExternalTrafficData = async (req, res) => {
  try {
    const segments = await Traffic.distinct("segmentId");

    const updatedData = [];

    for (const segmentId of segments) {
      const existingData = await Traffic.findOne({ segmentId }).sort({ recordedAt: -1 });
      if (!existingData) {
        console.log(`No existing data found for segment: ${segmentId}`);
        continue;
      }

      const trafficData = await fetchGoogleMapsTrafficData(existingData);
      if (!trafficData) {
        console.log(`Failed to fetch traffic data for segment: ${segmentId}`);
        continue;
      }

      const weatherData = await fetchOpenWeatherData(existingData.coordinates);
      const floodData = await fetchFloodData(weatherData, existingData.coordinates);

      const updatedTrafficData = {
        segmentId,
        locationName: existingData.locationName,
        lga: existingData.lga,
        coordinates: existingData.coordinates,
        ...trafficData,
        weather: weatherData || existingData.weather,
        flood: floodData,
        recordedAt: new Date(),
      };

      const traffic = new Traffic(updatedTrafficData);
      await traffic.save();
      updatedData.push(traffic);

      const io = req.app.get('io');
      io.to(existingData.lga).emit('traffic-update', {
        segmentId,
        trafficData: updatedTrafficData,
      });
    }

    res.status(200).json({
      message: 'Traffic data updated successfully',
      updatedCount: updatedData.length,
    });
  } catch (error) {
    console.error('Error in fetchExternalTrafficData:', error.message);
    res.status(500).json({ message: 'Failed to update traffic data', error: error.message });
  }
};

// Get all traffic data with filters and pagination
export const getAllTrafficData = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, lga, congestionLevel, isFlooded } = parsedQuery;
    const skip = (page - 1) * limit;

    let query = {};
    if (lga) query.lga = lga;
    if (congestionLevel) query.congestionLevel = congestionLevel;
    if (isFlooded !== undefined) query["flood.isFlooded"] = isFlooded === "true";

    // Add geospatial query if user location is provided
    if (req.query.latitude && req.query.longitude) {
      const maxDistance = parseInt(req.query.maxDistance) || 5000; // meters
      query.coordinates = {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(req.query.longitude), parseFloat(req.query.latitude)],
          },
          $maxDistance: maxDistance,
        },
      };
    }

    const trafficData = await Traffic.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Traffic.countDocuments(query);

    res.status(200).json({
      trafficData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getAllTrafficData:", error.message);
    res.status(500).json({ message: "Failed to fetch traffic data", error: error.message });
  }
};

// Get traffic data by segment ID
export const getTrafficBySegmentId = async (req, res) => {
  try {
    const { segmentId } = req.params;

    const trafficData = await Traffic.findOne({ segmentId }).sort({ recordedAt: -1 });
    if (!trafficData) {
      return res.status(404).json({ message: `Traffic data not found for segment ${segmentId}` });
    }

    res.status(200).json({ trafficData });
  } catch (error) {
    console.error("Error in getTrafficBySegmentId:", error.message);
    res.status(500).json({ message: "Failed to fetch traffic data", error: error.message });
  }
};

// Get traffic data by LGA
export const getTrafficByLGA = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { lga } = req.params;
    const { page, limit } = parsedQuery;
    const skip = (page - 1) * limit;

    const trafficData = await Traffic.find({ lga })
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Traffic.countDocuments({ lga });

    res.status(200).json({
      trafficData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getTrafficByLGA:", error.message);
    res.status(500).json({ message: "Failed to fetch traffic data by LGA", error: error.message });
  }
};

// Create new traffic data entry
export const createTrafficData = async (req, res) => {
  try {
    const trafficData = new Traffic(req.body);
    await trafficData.save();

    const io = req.app.get('io');
    io.to(trafficData.lga).emit('traffic-update', { segmentId: trafficData.segmentId, trafficData });

    res.status(201).json({
      message: 'Traffic data created successfully',
      trafficData,
    });
  } catch (error) {
    console.error("Error in createTrafficData:", error.message);
    res.status(500).json({ message: "Failed to create traffic data", error: error.message });
  }
};

// Update traffic data
export const updateTrafficData = async (req, res) => {
  try {
    const { segmentId } = req.params;

    let trafficData = await Traffic.findOne({ segmentId });
    if (!trafficData) {
      trafficData = new Traffic({ segmentId, ...req.body });
    } else {
      Object.assign(trafficData, req.body);
    }

    await trafficData.save();

    const io = req.app.get('io');
    io.to(trafficData.lga).emit('traffic-update', { segmentId, trafficData });

    res.status(200).json({
      message: 'Traffic data updated successfully',
      trafficData,
    });
  } catch (error) {
    console.error("Error in updateTrafficData:", error.message);
    res.status(500).json({ message: "Failed to update traffic data", error: error.message });
  }
};

// Get traffic data for route planning
export const getRouteTraffic = async (req, res) => {
  try {
    const { segments } = req.body;
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ message: 'Segments array is required' });
    }

    const trafficPromises = segments.map((segmentId) =>
      Traffic.findOne({ segmentId }).sort({ recordedAt: -1 })
    );

    const trafficData = await Promise.all(trafficPromises);
    const validTrafficData = trafficData.filter((data) => data !== null);

    let totalDelay = 0;
    let totalTravelTime = 0;
    let hasIncidents = false;
    let hasFloods = false;

    validTrafficData.forEach((data) => {
      totalDelay += data.delay || 0;
      totalTravelTime += data.travelTime || 0;
      if (data.incidentType) hasIncidents = true;
      if (data.flood.isFlooded) hasFloods = true;
    });

    res.status(200).json({
      segments: validTrafficData,
      routeSummary: {
        totalDelay,
        totalTravelTime,
        hasIncidents,
        hasFloods,
        segmentCount: validTrafficData.length,
      },
    });
  } catch (error) {
    console.error("Error in getRouteTraffic:", error.message);
    res.status(500).json({ message: "Failed to fetch route traffic data", error: error.message });
  }
};

// Get traffic incidents
export const getTrafficIncidents = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, lga, severity } = parsedQuery;
    const skip = (page - 1) * limit;

    let query = { incidentType: { $exists: true, $ne: null } };
    if (lga) query.lga = lga;
    if (severity) query.severity = severity;

    const incidents = await Traffic.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Traffic.countDocuments(query);

    res.status(200).json({
      incidents,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getTrafficIncidents:", error.message);
    res.status(500).json({ message: "Failed to fetch traffic incidents", error: error.message });
  }
};

// Get flooded roads
export const getFloodedRoads = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, lga, floodLevel } = parsedQuery;
    const skip = (page - 1) * limit;

    let query = { "flood.isFlooded": true };
    if (lga) query.lga = lga;
    if (floodLevel) query["flood.floodLevel"] = floodLevel;

    const floodedRoads = await Traffic.find(query)
      .sort({ "flood.recordedAt": -1 })
      .skip(skip)
      .limit(limit);

    const total = await Traffic.countDocuments(query);

    res.status(200).json({
      floodedRoads,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getFloodedRoads:", error.message);
    res.status(500).json({ message: "Failed to fetch flooded roads", error: error.message });
  }
};