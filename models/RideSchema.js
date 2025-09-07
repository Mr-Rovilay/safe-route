import mongoose from "mongoose";

const rideSchema = new mongoose.Schema({
  // who created/owns the ride
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // pickup and dropoff
  pickupLocation: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  dropoffLocation: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }
  },

  // ride participants
  passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // multiple users for carpool
  driver: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // if ride-hailing is added

  // ride details
  status: {
    type: String,
    enum: ["pending", "active", "completed", "cancelled"],
    default: "pending"
  },
  route: { type: Array }, // list of coordinates for navigation polyline
  startedAt: { type: Date },
  endedAt: { type: Date },

  // safety + tracking
  liveTracking: { type: Boolean, default: true }, // enable/disable location tracking
  emergencyContactNotified: { type: Boolean, default: false }, // for safety alerts

  createdAt: { type: Date, default: Date.now }
});

rideSchema.index({ pickupLocation: "2dsphere", dropoffLocation: "2dsphere" });

const Ride = mongoose.model("Ride", rideSchema);
export default Ride;