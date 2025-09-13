import mongoose from "mongoose";
import Ride from "../models/RideSchema.js"; // Corrected import name
import User from "../models/UserSchema.js"; // Corrected import name
import { z } from "zod"; // Added for validation

// Input validation schemas
const locationSchema = z.object({
  type: z.literal("Point").optional(),
  coordinates: z.array(z.number()).length(2),
});

const createRideSchema = z.object({
  pickupLocation: locationSchema,
  dropoffLocation: locationSchema,
  passengers: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(), // MongoDB ObjectId
  driver: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  route: z.array(locationSchema).optional(),
  liveTracking: z.boolean().optional(),
});

const updateRideSchema = z.object({
  pickupLocation: locationSchema.optional(),
  dropoffLocation: locationSchema.optional(),
  passengers: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
  driver: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  status: z.enum(["pending", "active", "completed", "cancelled"]).optional(),
  route: z.array(locationSchema).optional(),
  liveTracking: z.boolean().optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
});

const passengerSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/), // MongoDB ObjectId
});

// Create a new ride
export const createRide = async (req, res) => {
  try {
    const parsedBody = createRideSchema.parse(req.body); // Validate input
    const { pickupLocation, dropoffLocation, passengers = [], driver, route, liveTracking = true } = parsedBody;

    const ride = new Ride({
      createdBy: req.user._id,
      pickupLocation: { type: "Point", coordinates: pickupLocation.coordinates },
      dropoffLocation: { type: "Point", coordinates: dropoffLocation.coordinates },
      passengers,
      driver,
      route: route ? route.map(point => ({ type: "Point", coordinates: point.coordinates })) : [],
      liveTracking,
    });

    await ride.save();

    // Populate references
    await ride.populate("createdBy", "username email profilePicture");
    if (ride.driver) {
      await ride.populate("driver", "username email profilePicture");
    }
    if (ride.passengers.length > 0) {
      await ride.populate("passengers", "username email profilePicture");
    }

    // Join creator to ride room
    const io = req.app.get("io");
    io.to(req.user._id.toString()).emit("joinRideRoom", { rideId: ride._id });

    res.status(201).json({
      message: "Ride created successfully",
      ride,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in createRide:", error.message);
    res.status(50).json({ message: error.message });
  }
};

// Get all rides
export const getAllRides = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    let query = {};
    if (status) {
      query.status = status;
    }

    // Removed role-based admin check; show rides user is involved in
    query.$or = [
      { createdBy: req.user._id },
      { passengers: req.user._id },
      { driver: req.user._id },
    ];

    const rides = await Ride.find(query)
      .populate("createdBy", "username email profilePicture")
      .populate("driver", "username email profilePicture")
      .populate("passengers", "username email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Ride.countDocuments(query);

    res.json({
      message: "Rides retrieved successfully", // Added for consistency
      rides,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getAllRides:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Get a single ride by ID
export const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("createdBy", "username email profilePicture")
      .populate("driver", "username email profilePicture")
      .populate("passengers", "username email profilePicture");

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if user has permission to view
    const hasPermission =
      ride.createdBy._id.toString() === req.user._id.toString() ||
      ride.passengers.some(p => p._id.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver._id.toString() === req.user._id.toString());

    if (!hasPermission) {
      return res.status(403).json({ message: "Not authorized to view this ride" });
    }

    res.json({ message: "Ride retrieved successfully", ride }); // Added message
  } catch (error) {
    console.error("Error in getRideById:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Update a ride
export const updateRide = async (req, res) => {
  try {
    const parsedBody = updateRideSchema.parse(req.body); // Validate input
    const { pickupLocation, dropoffLocation, passengers, driver, status, route, liveTracking, startedAt, endedAt } = parsedBody;

    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (ride.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this ride" });
    }

    if (pickupLocation) ride.pickupLocation = { type: "Point", coordinates: pickupLocation.coordinates };
    if (dropoffLocation) ride.dropoffLocation = { type: "Point", coordinates: dropoffLocation.coordinates };
    if (passengers) ride.passengers = passengers;
    if (driver) ride.driver = driver;
    if (status) ride.status = status;
    if (route) ride.route = route.map(point => ({ type: "Point", coordinates: point.coordinates }));
    if (liveTracking !== undefined) ride.liveTracking = liveTracking;
    if (startedAt) ride.startedAt = new Date(startedAt);
    if (endedAt) ride.endedAt = new Date(endedAt);

    await ride.save();

    // Populate references
    await ride.populate("createdBy", "username email profilePicture");
    if (ride.driver) await ride.populate("driver", "username email profilePicture");
    if (ride.passengers.length > 0) await ride.populate("passengers", "username email profilePicture");

    // Emit update event
    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("rideUpdated", {
      rideId: ride._id,
      updatedFields: parsedBody,
      timestamp: new Date(),
    });

    res.json({ message: "Ride updated successfully", ride });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in updateRide:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Delete a ride
export const deleteRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (ride.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this ride" });
    }

    await ride.deleteOne(); // Updated to deleteOne for clarity

    // Emit delete event
    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("rideDeleted", { rideId: ride._id, timestamp: new Date() });

    res.json({ message: "Ride deleted successfully" });
  } catch (error) {
    console.error("Error in deleteRide:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Add a passenger
export const addPassenger = async (req, res) => {
  try {
    const { userId } = passengerSchema.parse(req.body); // Validate input

    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (ride.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to add passengers to this ride" });
    }

    if (ride.passengers.includes(userId)) {
      return res.status(400).json({ message: "User is already a passenger" });
    }

    ride.passengers.push(userId);
    await ride.save();

    // Populate passengers
    await ride.populate("passengers", "username email profilePicture");

    // Emit passenger added event
    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("passengerAdded", {
      rideId: ride._id,
      userId,
      timestamp: new Date(),
    });

    res.json({ message: "Passenger added successfully", ride });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in addPassenger:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Remove a passenger
export const removePassenger = async (req, res) => {
  try {
    const { userId } = passengerSchema.parse(req.body); // Validate input

    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (allow self-removal)
    if (
      ride.createdBy.toString() !== req.user._id.toString() &&
      userId !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Not authorized to remove this passenger" });
    }

    if (!ride.passengers.includes(userId)) {
      return res.status(400).json({ message: "User is not a passenger" });
    }

    ride.passengers = ride.passengers.filter(id => id.toString() !== userId);
    await ride.save();

    // Emit passenger removed event
    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("passengerRemoved", {
      rideId: ride._id,
      userId,
      timestamp: new Date(),
    });

    res.json({ message: "Passenger removed successfully", ride });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in removePassenger:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Cancel a ride
export const cancelRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (
      ride.createdBy.toString() !== req.user._id.toString() &&
      (!ride.driver || ride.driver.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ message: "Not authorized to cancel this ride" });
    }

    if (ride.status === "completed") {
      return res.status(400).json({ message: "Cannot cancel a completed ride" });
    }

    if (ride.status === "cancelled") {
      return res.status(400).json({ message: "Ride is already cancelled" });
    }

    ride.status = "cancelled";
    await ride.save();

    // Emit cancel event
    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("rideCancelled", {
      rideId: ride._id,
      timestamp: new Date(),
    });

    res.json({ message: "Ride cancelled successfully", ride });
  } catch (error) {
    console.error("Error in cancelRide:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Trigger emergency alert
export const triggerEmergencyAlert = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    const isParticipant =
      ride.createdBy.toString() === req.user._id.toString() ||
      ride.passengers.some(p => p.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver.toString() === req.user._id.toString());

    if (!isParticipant) {
      return res.status(403).json({ message: "Not authorized to trigger emergency for this ride" });
    }

    if (ride.emergencyContactNotified) {
      return res.status(400).json({ message: "Emergency contacts have already been notified" });
    }

    const user = await User.findById(req.user._id);

    ride.emergencyContactNotified = true;
    ride.emergencyNotifiedAt = new Date(); // Added timestamp
    await ride.save();

    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("emergencyAlert", {
      rideId: ride._id,
      triggeredBy: {
        _id: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
      },
      timestamp: new Date(),
      location: user.location,
    });

    res.json({
      message: "Emergency alert triggered successfully",
      emergencyContactNotified: ride.emergencyContactNotified,
      emergencyNotifiedAt: ride.emergencyNotifiedAt, // Added
    });
  } catch (error) {
    console.error("Error in triggerEmergencyAlert:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Reset emergency notification
export const resetEmergencyNotification = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (ride.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to reset emergency status" });
    }

    ride.emergencyContactNotified = false;
    ride.emergencyNotifiedAt = null; // Reset timestamp
    await ride.save();

    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("emergencyReset", {
      rideId: ride._id,
      timestamp: new Date(),
    });

    res.json({
      message: "Emergency notification status reset successfully",
      emergencyContactNotified: ride.emergencyContactNotified,
      emergencyNotifiedAt: ride.emergencyNotifiedAt, // Added
    });
  } catch (error) {
    console.error("Error in resetEmergencyNotification:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Start a ride
export const startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (
      ride.createdBy.toString() !== req.user._id.toString() &&
      (!ride.driver || ride.driver.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ message: "Not authorized to start this ride" });
    }

    if (ride.status === "active") {
      return res.status(400).json({ message: "Ride is already active" });
    }

    if (ride.status === "completed") {
      return res.status(400).json({ message: "Ride is already completed" });
    }

    ride.status = "active";
    ride.startedAt = new Date();
    await ride.save();

    // Update user currentRideId
    await User.findByIdAndUpdate(ride.createdBy, { currentRideId: ride._id, isOnTrip: true });
    if (ride.driver) {
      await User.findByIdAndUpdate(ride.driver, { currentRideId: ride._id, isOnTrip: true });
    }
    if (ride.passengers.length > 0) {
      await User.updateMany(
        { _id: { $in: ride.passengers } },
        { currentRideId: ride._id, isOnTrip: true }
      );
    }

    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("rideStarted", {
      rideId: ride._id,
      startedAt: ride.startedAt,
      timestamp: new Date(),
    });

    res.json({ message: "Ride started successfully", ride });
  } catch (error) {
    console.error("Error in startRide:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Complete a ride
export const completeRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check permission (removed role check)
    if (
      ride.createdBy.toString() !== req.user._id.toString() &&
      (!ride.driver || ride.driver.toString() !== req.user._id.toString())
    ) {
      return res.status(403).json({ message: "Not authorized to complete this ride" });
    }

    if (ride.status === "completed") {
      return res.status(400).json({ message: "Ride is already completed" });
    }

    if (ride.status === "pending") {
      return res.status(400).json({ message: "Ride has not started yet" });
    }

    ride.status = "completed";
    ride.endedAt = new Date();
    await ride.save();

    // Clear user currentRideId
    await User.findByIdAndUpdate(ride.createdBy, { currentRideId: null, isOnTrip: false });
    if (ride.driver) {
      await User.findByIdAndUpdate(ride.driver, { currentRideId: null, isOnTrip: false });
    }
    if (ride.passengers.length > 0) {
      await User.updateMany(
        { _id: { $in: ride.passengers } },
        { currentRideId: null, isOnTrip: false }
      );
    }

    const io = req.app.get("io");
    io.to(`ride:${ride._id}`).emit("rideCompleted", {
      rideId: ride._id,
      endedAt: ride.endedAt,
      timestamp: new Date(),
    });

    res.json({ message: "Ride completed successfully", ride });
  } catch (error) {
    console.error("Error in completeRide:", error.message);
    res.status(500).json({ message: error.message });
  }
};