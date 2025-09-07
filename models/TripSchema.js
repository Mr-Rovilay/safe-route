import mongoose from "mongoose";

const tripSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // 🔹 Trip details
  origin: {
    address: { type: String },
    coordinates: { lat: Number, lng: Number }
  },
  destination: {
    address: { type: String },
    coordinates: { lat: Number, lng: Number }
  },
  route: [{
    segmentId: { type: String },                       // links to Traffic.segmentId
    locationName: { type: String },                    // e.g. "Third Mainland Bridge"
    congestionLevel: { type: String },                 // pulled from Traffic
    avgSpeed: { type: Number },
    floodLevel: { type: String },
    weatherCondition: { type: String },
    travelTime: { type: Number }
  }],

  // 🔹 Trip status
  status: { type: String, enum: ["planned", "active", "completed", "cancelled"], default: "planned" },
  startedAt: { type: Date },
  endedAt: { type: Date },

  // 🔹 Alerts for user during trip
  alerts: [{
    message: { type: String },                         // e.g. "Accident 200m ahead"
    type: { type: String, enum: ["traffic", "flood", "weather"] },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    timestamp: { type: Date, default: Date.now }
  }],

  // 🔹 Analytics
  estimatedTime: { type: Number },                     // ETA when planned
  actualTime: { type: Number },                        // final duration
  recordedAt: { type: Date, default: Date.now }
});

tripSchema.index({ userId: 1, status: 1 });

const Trip = mongoose.model("Trip", tripSchema);
export default Trip;