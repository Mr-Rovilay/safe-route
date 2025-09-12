import Alert from "../models/AlertSchema.js";
import Ride from "../models/RideSchema.js";
import Trip from "../models/TripSchema.js";
import Weather from "../models/WeatherSchema.js";
import Flood from "../models/FloodSchema.js";
import { z } from "zod";

// Input validation schemas
const querySchema = z.object({
  page: z.string().optional().transform((val) => parseInt(val) || 1),
  limit: z.string().optional().transform((val) => parseInt(val) || 20),
  type: z.enum(["traffic", "flood", "weather", "route"]).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  triggered: z.enum(["true", "false"]).optional().transform((val) => val === "true"),
  rideId: z.string().optional(),
  near: z.string().optional(),
  lng: z.string().optional().transform((val) => parseFloat(val)),
  lat: z.string().optional().transform((val) => parseFloat(val)),
  distance: z.string().optional().transform((val) => parseInt(val) || 1000),
});

const alertSchema = z.object({
  trip: z.string().optional(),
  ride: z.string().optional(),
  lga: z.string(),
  type: z.enum(["traffic", "flood", "weather", "route"]),
  description: z.string(),
  location: z.object({
    type: z.literal("Point").optional(),
    coordinates: z.array(z.number()).length(2),
  }),
  severity: z.enum(["low", "medium", "high"]).optional(),
  distanceTrigger: z.number().min(100).optional(),
  validUntil: z.string().datetime().optional(),
});

// Get all alerts
export const getAllAlerts = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, type, severity, triggered, rideId, near } = parsedQuery;

    let query = {};
    if (type) query.type = type;
    if (severity) query.severity = severity;
    if (triggered !== undefined) query.triggered = triggered;
    if (rideId) query.ride = rideId;
    if (near) {
      const [lng, lat, distance] = near.split(",").map(Number);
      query.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: distance || 1000,
        },
      };
    }

    const alerts = await Alert.find(query)
      .populate("ride", "status pickupLocation dropoffLocation")
      .populate("trip", "status origin destination")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Alert.countDocuments(query);

    res.json({
      message: "Alerts retrieved successfully",
      alerts,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getAllAlerts:", error.message);
    res.status(500).json({ message: "Failed to fetch alerts", error: error.message });
  }
};

// Get a single alert by ID
export const getAlertById = async (req, res) => {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const alert = await Alert.findById(id)
      .populate("ride", "status pickupLocation dropoffLocation")
      .populate("trip", "status origin destination");

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.json({ message: "Alert retrieved successfully", alert });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getAlertById:", error.message);
    res.status(500).json({ message: "Failed to fetch alert", error: error.message });
  }
};

// Create a new alert
export const createAlert = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsedBody = alertSchema.parse(req.body);
    const { trip, ride, lga, type, description, location, severity, distanceTrigger, validUntil } = parsedBody;

    const alert = new Alert({
      trip,
      ride,
      createdBy: req.user._id,
      lga,
      type,
      description,
      location: { type: "Point", coordinates: location.coordinates },
      severity,
      distanceTrigger,
      validUntil: validUntil ? new Date(validUntil) : undefined,
    });

    await alert.save();
    await alert.populate("ride", "status pickupLocation dropoffLocation");
    await alert.populate("trip", "status origin destination");

    const io = req.app.get("io");
    if (alert.trip) io.to(`trip:${alert.trip}`).emit("alertCreated", { alert });
    if (alert.ride) io.to(`ride:${alert.ride}`).emit("alertCreated", { alert });
    io.to(lga).emit("alertCreated", { alert });

    res.status(201).json({
      message: "Alert created successfully",
      alert,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in createAlert:", error.message);
    res.status(500).json({ message: "Failed to create alert", error: error.message });
  }
};

// Update an alert
export const updateAlert = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = z.object({ id: z.string() }).parse(req.params);
    const parsedBody = alertSchema.partial().parse(req.body);

    let alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    Object.assign(alert, parsedBody);
    if (parsedBody.location) {
      alert.location = { type: "Point", coordinates: parsedBody.location.coordinates };
    }
    if (parsedBody.validUntil) {
      alert.validUntil = new Date(parsedBody.validUntil);
    }

    await alert.save();
    await alert.populate("ride", "status pickupLocation dropoffLocation");
    await alert.populate("trip", "status origin destination");

    const io = req.app.get("io");
    if (alert.trip) io.to(`trip:${alert.trip}`).emit("alertUpdated", { alert });
    if (alert.ride) io.to(`ride:${alert.ride}`).emit("alertUpdated", { alert });
    io.to(alert.lga).emit("alertUpdated", { alert });

    res.json({
      message: "Alert updated successfully",
      alert,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in updateAlert:", error.message);
    res.status(500).json({ message: "Failed to update alert", error: error.message });
  }
};

// Delete an alert
export const deleteAlert = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = z.object({ id: z.string() }).parse(req.params);
    const alert = await Alert.findById(id);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    const { trip, ride, lga } = alert;
    await alert.deleteOne();

    const io = req.app.get("io");
    if (trip) io.to(`trip:${trip}`).emit("alertDeleted", { alertId: id });
    if (ride) io.to(`ride:${ride}`).emit("alertDeleted", { alertId: id });
    io.to(lga).emit("alertDeleted", { alertId: id });

    res.json({ message: "Alert deleted successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in deleteAlert:", error.message);
    res.status(500).json({ message: "Failed to delete alert", error: error.message });
  }
};

// Get alerts near a location
export const getAlertsNearLocation = async (req, res) => {
  try {
    const { lng, lat, distance } = querySchema.parse(req.query);
    if (!lng || !lat) {
      return res.status(400).json({ message: "Longitude and latitude are required" });
    }

    const alerts = await Alert.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: distance,
        },
      },
      triggered: false,
      $or: [{ validUntil: { $gt: new Date() } }, { validUntil: { $exists: false } }],
    })
      .populate("ride", "status pickupLocation dropoffLocation")
      .populate("trip", "status origin destination")
      .sort({ severity: -1 });

    res.json({ message: "Alerts near location retrieved successfully", alerts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getAlertsNearLocation:", error.message);
    res.status(500).json({ message: "Failed to fetch alerts near location", error: error.message });
  }
};

// Check and trigger alerts for a trip
export const checkTripAlerts = async (req, res) => {
  try {
    const { tripId } = z.object({ tripId: z.string() }).parse(req.params);
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (trip.userId.toString() !== req.user._id.toString() && req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Not authorized to access this trip" });
    }

    const currentLocation = trip.origin.coordinates.coordinates; // [lng, lat]
    const alerts = await Alert.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: currentLocation },
          $maxDistance: 5000,
        },
      },
      triggered: false,
      $or: [{ validUntil: { $gt: new Date() } }, { validUntil: { $exists: false } }],
    })
      .populate("ride", "status pickupLocation dropoffLocation")
      .populate("trip", "status origin destination")
      .sort({ severity: -1 });

    const triggeredAlerts = [];
    for (const alert of alerts) {
      const distance = calculateDistance(
        currentLocation[1],
        currentLocation[0],
        alert.location.coordinates[1],
        alert.location.coordinates[0]
      );

      if (distance <= alert.distanceTrigger) {
        alert.triggered = true;
        await alert.save();
        triggeredAlerts.push(alert);

        trip.alerts.push({
          message: alert.description,
          type: alert.type,
          severity: alert.severity,
          timestamp: new Date(),
        });
      }
    }

    await trip.save();

    const io = req.app.get("io");
    io.to(`user:${req.user._id}`).emit("tripAlerts", { tripId, alerts: triggeredAlerts });
    io.to(trip.lga).emit("tripAlerts", { tripId, alerts: triggeredAlerts });

    res.json({
      message: "Trip alerts checked successfully",
      triggeredAlerts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in checkTripAlerts:", error.message);
    res.status(500).json({ message: "Failed to check trip alerts", error: error.message });
  }
};

// Check and trigger alerts for a ride
export const checkRideAlerts = async (req, res) => {
  try {
    const { rideId } = z.object({ rideId: z.string() }).parse(req.params);
    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    const isParticipant =
      ride.createdBy.toString() === req.user._id.toString() ||
      ride.passengers.some((p) => p.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver.toString() === req.user._id.toString()) ||
      req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to access this ride" });
    }

    const currentLocation = ride.pickupLocation.coordinates; // [lng, lat]
    const alerts = await Alert.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: currentLocation },
          $maxDistance: 5000,
        },
      },
      triggered: false,
      $or: [{ validUntil: { $gt: new Date() } }, { validUntil: { $exists: false } }],
    })
      .populate("ride", "status pickupLocation dropoffLocation")
      .populate("trip", "status origin destination")
      .sort({ severity: -1 });

    const triggeredAlerts = [];
    for (const alert of alerts) {
      const distance = calculateDistance(
        currentLocation[1],
        currentLocation[0],
        alert.location.coordinates[1],
        alert.location.coordinates[0]
      );

      if (distance <= alert.distanceTrigger) {
        alert.triggered = true;
        await alert.save();
        triggeredAlerts.push(alert);
      }
    }

    const io = req.app.get("io");
    io.to(`ride:${rideId}`).emit("rideAlerts", { rideId, alerts: triggeredAlerts });
    io.to(ride.lga).emit("rideAlerts", { rideId, alerts: triggeredAlerts });

    res.json({
      message: "Ride alerts checked successfully",
      triggeredAlerts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in checkRideAlerts:", error.message);
    res.status(500).json({ message: "Failed to check ride alerts", error: error.message });
  }
};

// Helper function to calculate distance
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// Generate alerts from weather and flood data
export const generateWeatherFloodAlerts = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { lga } = z.object({ lga: z.string() }).parse(req.query);

    // Check for high-risk weather conditions
    const weatherConditions = await Weather.find({
      lga,
      floodRisk: { $in: ["moderate", "high"] },
      recordedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const floodConditions = await Flood.find({
      lga,
      severity: { $in: ["moderate", "high"] },
      recordedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const alerts = [];
    for (const weather of weatherConditions) {
      if (weather.floodRisk === "high") {
        const alert = new Alert({
          createdBy: req.user._id,
          lga,
          type: "weather",
          description: `High flood risk in ${weather.city}: ${weather.condition}`,
          location: weather.coordinates,
          severity: "high",
          distanceTrigger: 1000,
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        await alert.save();
        alerts.push(alert);
      }
    }

    for (const flood of floodConditions) {
      if (flood.severity === "high") {
        const alert = new Alert({
          createdBy: req.user._id,
          lga,
          type: "flood",
          description: `Flood detected in ${flood.locationName}: ${flood.advisoryMessage}`,
          location: flood.coordinates,
          severity: "high",
          distanceTrigger: 1000,
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        await alert.save();
        alerts.push(alert);
      }
    }

    const io = req.app.get("io");
    alerts.forEach((alert) => {
      io.to(lga).emit("alertCreated", { alert });
    });

    res.json({
      message: "Weather and flood alerts generated successfully",
      alerts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in generateWeatherFloodAlerts:", error.message);
    res.status(500).json({ message: "Failed to generate alerts", error: error.message });
  }
};