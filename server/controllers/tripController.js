import mongoose from "mongoose";
import Trip from "../models/TripSchema.js"; // Corrected import
import User from "../models/UserSchema.js"; // Corrected import
import { z } from "zod"; // Added for validation

// Input validation schemas
const coordinatesSchema = z.object({
  type: z.literal("Point").optional(),
  coordinates: z.array(z.number()).length(2),
});

const routeSchema = z.object({
  segmentId: z.string().optional(),
  locationName: z.string().optional(),
  congestionLevel: z.enum(["low", "moderate", "high", "severe"]).optional(),
  avgSpeed: z.number().min(0).optional(),
  floodLevel: z.enum(["none", "low", "moderate", "high"]).optional(),
  weatherCondition: z.enum(["clear", "rain", "storm", "fog", "other"]).optional(),
  travelTime: z.number().min(0).optional(),
});

const createTripSchema = z.object({
  origin: z.object({
    address: z.string().optional(),
    coordinates: coordinatesSchema,
  }),
  destination: z.object({
    address: z.string().optional(),
    coordinates: coordinatesSchema,
  }),
  route: z.array(routeSchema).optional(),
  estimatedTime: z.number().min(0).optional(),
});

const updateTripSchema = z.object({
  origin: z.object({
    address: z.string().optional(),
    coordinates: coordinatesSchema.optional(),
  }).optional(),
  destination: z.object({
    address: z.string().optional(),
    coordinates: coordinatesSchema.optional(),
  }).optional(),
  route: z.array(routeSchema).optional(),
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
  estimatedTime: z.number().min(0).optional(),
  actualTime: z.number().min(0).optional(),
});

const alertSchema = z.object({
  message: z.string(),
  type: z.enum(["traffic", "flood", "weather"]),
  severity: z.enum(["info", "warning", "critical"]).optional(),
});

// Create a new trip
export const createTrip = async (req, res) => {
  try {
    const parsedBody = createTripSchema.parse(req.body); // Validate input
    const { origin, destination, route = [], estimatedTime } = parsedBody;

    const trip = new Trip({
      userId: req.user._id,
      origin: {
        address: origin.address,
        coordinates: { type: "Point", coordinates: origin.coordinates },
      },
      destination: {
        address: destination.address,
        coordinates: { type: "Point", coordinates: destination.coordinates },
      },
      route,
      estimatedTime,
    });

    await trip.save();

    // Populate user reference
    await trip.populate("userId", "username email profilePicture");

    // Join user to their room
    const io = req.app.get("io");
    io.to(req.user._id.toString()).emit("joinUserRoom", { userId: req.user._id });

    res.status(201).json({
      message: "Trip created successfully",
      trip,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in createTrip:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Get all trips for a user
export const getUserTrips = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let query = { userId: req.user._id };
    if (status) query.status = status;

    const trips = await Trip.find(query)
      .populate("userId", "username email profilePicture")
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Trip.countDocuments(query);

    res.json({
      message: "Trips retrieved successfully",
      trips,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getUserTrips:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Get a single trip by ID
export const getTripById = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate("userId", "username email profilePicture");

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission (removed role check)
    if (trip.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to view this trip" });
    }

    res.json({ message: "Trip retrieved successfully", trip });
  } catch (error) {
    console.error("Error in getTripById:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Update a trip
export const updateTrip = async (req, res) => {
  try {
    const parsedBody = updateTripSchema.parse(req.body); // Validate input
    const { origin, destination, route, status, estimatedTime, actualTime } = parsedBody;

    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission (removed role check)
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this trip" });
    }

    if (origin) {
      trip.origin = {
        address: origin.address,
        coordinates: origin.coordinates ? { type: "Point", coordinates: origin.coordinates } : trip.origin.coordinates,
      };
    }
    if (destination) {
      trip.destination = {
        address: destination.address,
        coordinates: destination.coordinates ? { type: "Point", coordinates: destination.coordinates } : trip.destination.coordinates,
      };
    }
    if (route) trip.route = route;
    if (status) trip.status = status;
    if (estimatedTime) trip.estimatedTime = estimatedTime;
    if (actualTime) trip.actualTime = actualTime;

    await trip.save();

    // Populate user reference
    await trip.populate("userId", "username email profilePicture");

    // Emit update event
    const io = req.app.get("io");
    io.to(`user:${trip.userId}`).emit("tripUpdated", {
      tripId: trip._id,
      updatedFields: parsedBody,
      timestamp: new Date(),
    });

    res.json({ message: "Trip updated successfully", trip });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in updateTrip:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Delete a trip
export const deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission (removed role check)
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this trip" });
    }

    await trip.deleteOne();

    // Emit delete event
    const io = req.app.get("io");
    io.to(`user:${trip.userId}`).emit("tripDeleted", { tripId: trip._id, timestamp: new Date() });

    res.json({ message: "Trip deleted successfully" });
  } catch (error) {
    console.error("Error in deleteTrip:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Start a trip
export const startTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to start this trip" });
    }

    if (trip.status === "active") {
      return res.status(400).json({ message: "Trip is already active" });
    }

    if (trip.status === "completed") {
      return res.status(400).json({ message: "Trip is already completed" });
    }

    trip.status = "active";
    trip.startedAt = new Date();
    await trip.save();

    // Update user status
    const user = await User.findById(req.user._id);
    user.isOnTrip = true;
    // Optionally link to a ride if Trip is associated with Ride
    // user.currentRideId = someRideId;
    await user.save();

    const io = req.app.get("io");
    io.to(`user:${req.user._id}`).emit("tripStarted", {
      tripId: trip._id,
      startedAt: trip.startedAt,
      timestamp: new Date(),
    });

    res.json({ message: "Trip started successfully", trip });
  } catch (error) {
    console.error("Error in startTrip:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Complete a trip
export const completeTrip = async (req, res) => {
  try {
    const { actualTime } = req.body; // Optional actualTime from request
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to complete this trip" });
    }

    if (trip.status === "completed") {
      return res.status(400).json({ message: "Trip is already completed" });
    }

    if (trip.status === "planned") {
      return res.status(400).json({ message: "Trip has not started yet" });
    }

    trip.status = "completed";
    trip.endedAt = new Date();
    trip.actualTime = actualTime || Math.round((new Date() - trip.startedAt) / 60000); // In minutes
    await trip.save();

    // Update user status
    const user = await User.findById(req.user._id);
    user.isOnTrip = false;
    // Optionally clear currentRideId if linked
    // user.currentRideId = null;
    await user.save();

    const io = req.app.get("io");
    io.to(`user:${req.user._id}`).emit("tripCompleted", {
      tripId: trip._id,
      endedAt: trip.endedAt,
      actualTime: trip.actualTime,
      timestamp: new Date(),
    });

    res.json({ message: "Trip completed successfully", trip });
  } catch (error) {
    console.error("Error in completeTrip:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Cancel a trip
export const cancelTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to cancel this trip" });
    }

    if (trip.status === "completed") {
      return res.status(400).json({ message: "Cannot cancel a completed trip" });
    }

    if (trip.status === "cancelled") {
      return res.status(400).json({ message: "Trip is already cancelled" });
    }

    trip.status = "cancelled";
    await trip.save();

    if (trip.status === "active") {
      const user = await User.findById(req.user._id);
      user.isOnTrip = false;
      // Optionally clear currentRideId
      // user.currentRideId = null;
      await user.save();
    }

    const io = req.app.get("io");
    io.to(`user:${trip.userId}`).emit("tripCancelled", {
      tripId: trip._id,
      timestamp: new Date(),
    });

    res.json({ message: "Trip cancelled successfully", trip });
  } catch (error) {
    console.error("Error in cancelTrip:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Add an alert to a trip
export const addAlert = async (req, res) => {
  try {
    const parsedBody = alertSchema.parse(req.body); // Validate input
    const { message, type, severity = "info" } = parsedBody;

    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission (removed role check)
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to add alerts to this trip" });
    }

    const alert = { message, type, severity, timestamp: new Date() };
    trip.alerts.push(alert);
    await trip.save();

    const io = req.app.get("io");
    io.to(`user:${trip.userId}`).emit("tripAlert", {
      tripId: trip._id,
      alert,
      timestamp: new Date(),
    });

    res.json({ message: "Alert added successfully", trip });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in addAlert:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Update trip route data
export const updateRouteData = async (req, res) => {
  try {
    const { route } = z.object({ route: z.array(routeSchema) }).parse(req.body); // Validate input

    const trip = await Trip.findById(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check permission (removed role check)
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this trip" });
    }

    trip.route = route;
    await trip.save();

    const io = req.app.get("io");
    io.to(`user:${trip.userId}`).emit("routeUpdated", {
      tripId: trip._id,
      route,
      timestamp: new Date(),
    });

    res.json({ message: "Route data updated successfully", trip });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in updateRouteData:", error.message);
    res.status(500).json({ message: error.message });
  }
};