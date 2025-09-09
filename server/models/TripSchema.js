import mongoose from "mongoose";

const tripSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true // Added for performance
  },
  origin: {
    address: { type: String },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true } // [lng, lat]
    }
  },
  destination: {
    address: { type: String },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true } // [lng, lat]
    }
  },
  route: [{
    segmentId: {
      type: String,
      validate: {
        validator: async function (v) {
          if (!v) return true; // Allow null
          const traffic = await mongoose.model("Traffic").findOne({ segmentId: v });
          return !!traffic; // Ensure segmentId exists
        },
        message: "Invalid Traffic segmentId"
      }
    },
    locationName: { type: String }, // e.g., "Third Mainland Bridge"
    congestionLevel: {
      type: String,
      enum: ["low", "moderate", "high", "severe"],
      default: "low"
    },
    avgSpeed: { type: Number, min: 0 },
    floodLevel: {
      type: String,
      enum: ["none", "low", "moderate", "high"],
      default: "none"
    },
    weatherCondition: {
      type: String,
      enum: ["clear", "rain", "storm", "fog", "other"],
      default: "clear"
    },
    travelTime: { type: Number, min: 0 } // In minutes
  }],
  status: {
    type: String,
    enum: ["planned", "active", "completed", "cancelled"],
    default: "planned"
  },
  startedAt: { type: Date },
  endedAt: { type: Date },
  alerts: [{
    message: { type: String, required: true },
    type: { type: String, enum: ["traffic", "flood", "weather"], required: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    timestamp: { type: Date, default: Date.now }
  }],
  estimatedTime: { type: Number, min: 0 }, // In minutes
  actualTime: { type: Number, min: 0 }, // In minutes
  recordedAt: { type: Date, default: Date.now }
});

tripSchema.index({ "origin.coordinates": "2dsphere", "destination.coordinates": "2dsphere" });
tripSchema.index({ userId: 1, status: 1, recordedAt: -1 }); // Enhanced index
tripSchema.index({ "alerts.type": 1, "alerts.severity": 1 }); // Added for alert filtering

const Trip = mongoose.model("Trip", tripSchema);
export default Trip;