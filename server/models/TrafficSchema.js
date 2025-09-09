import mongoose from "mongoose";

const trafficSchema = new mongoose.Schema({
  // 🔹 Location Info
  segmentId: { type: String, required: [true, "Segment ID is required"], unique: true },
  locationName: { type: String, required: [true, "Location name is required"] },
  lga: { type: String, required: [true, "LGA is required"] }, // e.g., "Lagos Mainland"
  coordinates: {
    type: {
      type: String,
      enum: ["LineString"],
      default: "LineString",
    },
    coordinates: [[Number]], // [[lng, lat], [lng, lat]] for start and end points
  },

  // 🔹 Traffic Conditions
  congestionLevel: {
    type: String,
    enum: ["free", "light", "moderate", "heavy", "severe"],
    required: [true, "Congestion level is required"],
  },
  averageSpeed: { type: Number, required: [true, "Average speed is required"] }, // km/h
  typicalSpeed: { type: Number, required: [true, "Typical speed is required"] }, // normal flow speed
  travelTime: { type: Number, required: [true, "Travel time is required"] }, // minutes
  freeFlowTime: { type: Number, required: [true, "Free flow time is required"] }, // minutes
  delay: { type: Number, default: 0 }, // minutes lost due to traffic

  // 🔹 Incident & Hazards
  incidentType: {
    type: String,
    enum: ["accident", "breakdown", "construction", "flood", "weather", "other", null],
    default: null,
  },
  incidentDescription: { type: String },
  isPassable: { type: Boolean, default: true },
  severity: { type: Number, min: 1, max: 5 },

  // 🔹 Suggested Routing
  suggestedDetour: { type: String },
  alternativeRoutes: [
    {
      routeName: String,
      estimatedTime: Number, // minutes
      distanceKm: Number,
    },
  ],

  // 🔹 Embedded Weather Data
  weather: {
    condition: { type: String }, // e.g., "Rain", "Clear"
    temperature: { type: Number }, // °C
    visibility: { type: Number }, // meters
    precipitation: { type: Number, default: 0 }, // mm/hr
    recordedAt: { type: Date, required: [true, "Weather recordedAt is required"] },
  },

  // 🔹 Embedded Flood Data
  flood: {
    isFlooded: { type: Boolean, default: false },
    floodLevel: {
      type: String,
      enum: ["none", "minor", "moderate", "severe"],
      default: "none",
    },
    description: { type: String },
    recordedAt: { type: Date, required: [true, "Flood recordedAt is required"] },
  },

  // 🔹 Analytics
  confidenceLevel: { type: Number, min: 0, max: 1, default: 0.5 },
  historicalTrend: [
    {
      timestamp: { type: Date, required: true },
      congestionLevel: String,
      avgSpeed: Number,
      floodLevel: String,
      weatherCondition: String,
    },
  ],

  // 🔹 Metadata
  source: { type: String, default: "Google Maps API + OpenWeather + Flood DB" },
  recordedAt: { type: Date, default: Date.now, required: true },
});

// Indexing for performance
trafficSchema.index({ segmentId: 1, recordedAt: -1 });
trafficSchema.index({ lga: 1 });
// trafficSchema.index({ coordinates: "2dsphere" });
trafficSchema.index({ location: "2dsphere" });

const Traffic = mongoose.model("Traffic", trafficSchema);
export default Traffic;