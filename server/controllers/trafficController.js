import Traffic from "../models/TrafficSchema.js"; // Corrected import
import axios from "axios";
import { z } from "zod";
import Weather from "../models/WeatherSchema.js";

// Input validation schemas
const querySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => parseInt(val) || 1),
  limit: z
    .string()
    .optional()
    .transform((val) => parseInt(val) || 20),
  lga: z.string().optional(),
  congestionLevel: z
    .enum(["free", "light", "moderate", "heavy", "severe"])
    .optional(),
  isFlooded: z.enum(["true", "false"]).optional(),
  severity: z
    .string()
    .optional()
    .transform((val) => parseInt(val)),
  floodLevel: z.enum(["none", "minor", "moderate", "severe"]).optional(),
  latitude: z
    .string()
    .optional()
    .transform((val) => parseFloat(val)),
  longitude: z
    .string()
    .optional()
    .transform((val) => parseFloat(val)),
  maxDistance: z
    .string()
    .optional()
    .transform((val) => parseInt(val) || 5000),
});

const trafficSchema = z.object({
  segmentId: z.string().regex(/^SEG-\w+$/),
  locationName: z.string(),
  lga: z.string(),
  coordinates: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.array(z.number()).length(2)).min(2),
  }),
  congestionLevel: z.enum(["free", "light", "moderate", "heavy", "severe"]),
  averageSpeed: z.number().min(0),
  typicalSpeed: z.number().min(0),
  travelTime: z.number().min(0),
  freeFlowTime: z.number().min(0),
  delay: z.number().min(0).optional(),
  incidentType: z
    .enum([
      "accident",
      "breakdown",
      "construction",
      "flood",
      "weather",
      "other",
      null,
    ])
    .optional(),
  incidentDescription: z.string().optional(),
  isPassable: z.boolean().optional(),
  severity: z.number().min(1).max(5).optional(),
  suggestedDetour: z.string().optional(),
  alternativeRoutes: z
    .array(
      z.object({
        routeName: z.string(),
        estimatedTime: z.number().min(0).optional(),
        distanceKm: z.number().min(0).optional(),
      })
    )
    .optional(),
  weather: z.object({
    condition: z.enum(["clear", "rain", "storm", "fog", "cloudy", "other"]),
    temperature: z.number().optional(),
    visibility: z.number().min(0).optional(),
    precipitation: z.number().min(0).optional(),
    recordedAt: z.string().datetime(),
  }),
  flood: z.object({
    isFlooded: z.boolean(),
    floodLevel: z.enum(["none", "minor", "moderate", "severe"]),
    description: z.string().optional(),
    recordedAt: z.string().datetime(),
  }),
  confidenceLevel: z.number().min(0).max(1).optional(),
  source: z.string().optional(),
});

// Helper functions (unchanged)
const getCongestionLevel = (trafficDuration, normalDuration) => {
  const ratio = trafficDuration / normalDuration;
  if (ratio < 1.1) return "free";
  if (ratio < 1.3) return "light";
  if (ratio < 1.6) return "moderate";
  if (ratio < 2.0) return "heavy";
  return "severe";
};

const calculateAverageSpeed = (distanceMeters, durationSeconds) => {
  return Math.round(distanceMeters / 1000 / (durationSeconds / 3600));
};

const getFloodLevel = (precipitation) => {
  if (precipitation > 15) return "severe";
  if (precipitation > 10) return "moderate";
  if (precipitation > 5) return "minor";
  return "none";
};

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

// Fetch Google Maps traffic data
export const fetchGoogleMapsTrafficData = async (segment) => {
  try {
    const { coordinates } = segment;
    const [start, end] = coordinates.coordinates;

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${start[1]},${start[0]}&destination=${end[1]},${end[0]}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    if (response.data.routes?.length > 0) {
      const route = response.data.routes[0];
      const leg = route.legs[0];

      const weather = await Weather.findOne({
        coordinates: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: segment.coordinates.coordinates[0],
            },
            $maxDistance: 5000,
          },
        },
      });

      return {
        congestionLevel: getCongestionLevel(
          leg.duration_in_traffic?.value || leg.duration.value,
          leg.duration.value
        ),
        averageSpeed: calculateAverageSpeed(
          leg.distance.value,
          leg.duration_in_traffic?.value || leg.duration.value
        ),
        typicalSpeed: calculateAverageSpeed(
          leg.distance.value,
          leg.duration.value
        ),
        travelTime: Math.round(
          (leg.duration_in_traffic?.value || leg.duration.value) / 60
        ),
        freeFlowTime: Math.round(leg.duration.value / 60),
        delay: Math.round(
          ((leg.duration_in_traffic?.value || leg.duration.value) -
            leg.duration.value) /
            60
        ),
        confidenceLevel: 0.9,
        alternativeRoutes: route.legs.map((l) => ({
          routeName: l.summary || "Alternate Route",
          estimatedTime: Math.round(l.duration.value / 60),
          distanceKm: l.distance.value / 1000,
        })),
        weatherId: weather?._id,
      };
    }
    return null;
  } catch (error) {
    console.error(
      `Error fetching Google Maps data for segment ${segment.segmentId}:`,
      error.message
    );
    return null;
  }
};

// Fetch OpenWeather data
export const fetchOpenWeatherData = async (coordinates) => {
  try {
    const [lng, lat] = coordinates.coordinates[0];

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );

    const weatherData = response.data;
    return {
      condition: weatherData.weather[0].main.toLowerCase(),
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

// Fetch flood data
export const fetchFloodData = async (weatherData, coordinates) => {
  try {
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
    // Check for admin token
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const segments = await Traffic.distinct("segmentId");
    const updatedData = [];

    for (const segmentId of segments) {
      const existingData = await Traffic.findOne({ segmentId }).sort({
        recordedAt: -1,
      });
      if (!existingData) continue;

      const trafficData = await fetchGoogleMapsTrafficData(existingData);
      if (!trafficData) continue;

      const weatherData = await fetchOpenWeatherData(existingData.coordinates);
      const floodData = await fetchFloodData(
        weatherData,
        existingData.coordinates
      );

      const historicalTrendEntry = {
        timestamp: new Date(),
        congestionLevel: trafficData.congestionLevel,
        avgSpeed: trafficData.averageSpeed,
        floodLevel: floodData.floodLevel,
        weatherCondition: weatherData?.condition || "clear",
      };

      // Update existing document or create new
      const updatedTrafficData = await Traffic.findOneAndUpdate(
        {
          segmentId,
          recordedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
        }, // Within last 15 minutes
        {
          ...trafficData,
          weather: weatherData || existingData.weather,
          flood: floodData,
          recordedAt: new Date(),
          $push: { historicalTrend: historicalTrendEntry },
        },
        { new: true, upsert: true }
      );

      updatedData.push(updatedTrafficData);

      const io = req.app.get("io");
      io.to(existingData.lga).emit("trafficUpdate", {
        segmentId,
        trafficData: updatedTrafficData,
      });
    }

    res.status(200).json({
      message: "Traffic data updated successfully",
      updatedCount: updatedData.length,
    });
  } catch (error) {
    console.error("Error in fetchExternalTrafficData:", error.message);
    res
      .status(500)
      .json({ message: "Failed to update traffic data", error: error.message });
  }
};

// Get all traffic data
export const getAllTrafficData = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const {
      page,
      limit,
      lga,
      congestionLevel,
      isFlooded,
      severity,
      floodLevel,
      latitude,
      longitude,
      maxDistance,
    } = parsedQuery;

    let query = {};
    if (lga) query.lga = lga;
    if (congestionLevel) query.congestionLevel = congestionLevel;
    if (isFlooded !== undefined)
      query["flood.isFlooded"] = isFlooded === "true";
    if (severity) query.severity = severity;
    if (floodLevel) query["flood.floodLevel"] = floodLevel;

    // Geospatial query for LineString
    if (latitude && longitude) {
      query.coordinates = {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        },
      };
    }

    const trafficData = await Traffic.find(query)
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Traffic.countDocuments(query);

    res.status(200).json({
      message: "Traffic data retrieved successfully",
      trafficData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getAllTrafficData:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch traffic data", error: error.message });
  }
};

// Get traffic by segment ID
export const getTrafficBySegmentId = async (req, res) => {
  try {
    const { segmentId } = z
      .object({ segmentId: z.string().regex(/^SEG-\w+$/) })
      .parse(req.params);

    const trafficData = await Traffic.findOne({ segmentId }).sort({
      recordedAt: -1,
    });
    if (!trafficData) {
      return res
        .status(404)
        .json({ message: `Traffic data not found for segment ${segmentId}` });
    }

    res
      .status(200)
      .json({ message: "Traffic data retrieved successfully", trafficData });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getTrafficBySegmentId:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch traffic data", error: error.message });
  }
};

// Get traffic by LGA
export const getTrafficByLGA = async (req, res) => {
  try {
    const { lga } = z.object({ lga: z.string() }).parse(req.params);
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit } = parsedQuery;

    const trafficData = await Traffic.find({ lga })
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Traffic.countDocuments({ lga });

    res.status(200).json({
      message: "Traffic data retrieved successfully",
      trafficData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getTrafficByLGA:", error.message);
    res
      .status(500)
      .json({
        message: "Failed to fetch traffic data by LGA",
        error: error.message,
      });
  }
};

// Create new traffic data
export const createTrafficData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsedBody = trafficSchema.parse(req.body);
    const trafficData = new Traffic({
      ...parsedBody,
      recordedAt: new Date(),
    });
    await trafficData.save();

    const io = req.app.get("io");
    io.to(trafficData.lga).emit("trafficUpdate", {
      segmentId: trafficData.segmentId,
      trafficData,
    });

    res.status(201).json({
      message: "Traffic data created successfully",
      trafficData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in createTrafficData:", error.message);
    res
      .status(500)
      .json({ message: "Failed to create traffic data", error: error.message });
  }
};

// Update traffic data
export const updateTrafficData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { segmentId } = z
      .object({ segmentId: z.string().regex(/^SEG-\w+$/) })
      .parse(req.params);
    const parsedBody = trafficSchema.partial().parse(req.body);

    const trafficData = await Traffic.findOneAndUpdate(
      { segmentId },
      { ...parsedBody, recordedAt: new Date() },
      { new: true, upsert: true }
    );

    const io = req.app.get("io");
    io.to(trafficData.lga).emit("trafficUpdate", { segmentId, trafficData });

    res.status(200).json({
      message: "Traffic data updated successfully",
      trafficData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in updateTrafficData:", error.message);
    res
      .status(500)
      .json({ message: "Failed to update traffic data", error: error.message });
  }
};

// Get traffic data for route planning
export const getRouteTraffic = async (req, res) => {
  try {
    const { segments } = z
      .object({ segments: z.array(z.string().regex(/^SEG-\w+$/)) })
      .parse(req.body);

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
      message: "Route traffic data retrieved successfully",
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
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getRouteTraffic:", error.message);
    res
      .status(500)
      .json({
        message: "Failed to fetch route traffic data",
        error: error.message,
      });
  }
};

// Get traffic incidents
export const getTrafficIncidents = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, lga, severity } = parsedQuery;

    let query = { incidentType: { $exists: true, $ne: null } };
    if (lga) query.lga = lga;
    if (severity) query.severity = severity;

    const incidents = await Traffic.find(query)
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Traffic.countDocuments(query);

    res.status(200).json({
      message: "Traffic incidents retrieved successfully",
      incidents,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getTrafficIncidents:", error.message);
    res
      .status(500)
      .json({
        message: "Failed to fetch traffic incidents",
        error: error.message,
      });
  }
};

// Get flooded roads
export const getFloodedRoads = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, lga, floodLevel } = parsedQuery;

    let query = { "flood.isFlooded": true };
    if (lga) query.lga = lga;
    if (floodLevel) query["flood.floodLevel"] = floodLevel;

    const floodedRoads = await Traffic.find(query)
      .sort({ "flood.recordedAt": -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Traffic.countDocuments(query);

    res.status(200).json({
      message: "Flooded roads retrieved successfully",
      floodedRoads,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getFloodedRoads:", error.message);
    res
      .status(500)
      .json({ message: "Failed to fetch flooded roads", error: error.message });
  }
};
