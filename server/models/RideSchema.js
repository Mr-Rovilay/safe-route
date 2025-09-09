import mongoose from "mongoose";

const rideSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true // Added index for performance
  },
  pickupLocation: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  dropoffLocation: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  passengers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    validate: {
      validator: async function (v) {
        const user = await mongoose.model("User").findById(v);
        return !!user; // Ensure user exists
      },
      message: "Passenger ID does not exist"
    }
  }],
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    validate: {
      validator: async function (v) {
        if (!v) return true; // Allow null driver
        const user = await mongoose.model("User").findById(v);
        return !!user; // Ensure driver exists
      },
      message: "Driver ID does not exist"
    },
    index: true // Added index for performance
  },
  status: {
    type: String,
    enum: ["pending", "active", "completed", "cancelled"],
    default: "pending"
  },
  route: [{
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [lng, lat] for polyline
  }],
  startedAt: { type: Date },
  endedAt: { type: Date },
  liveTracking: { type: Boolean, default: true },
  emergencyContactNotified: { type: Boolean, default: false },
  emergencyNotifiedAt: { type: Date }, // Added for tracking
  createdAt: { type: Date, default: Date.now }
});

rideSchema.index({ pickupLocation: "2dsphere", dropoffLocation: "2dsphere" });
rideSchema.index({ passengers: 1 }); // Added index for passenger queries

const Ride = mongoose.model("Ride", rideSchema);
export default Ride;