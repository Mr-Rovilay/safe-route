import mongoose from "mongoose";

const trafficSchema = new mongoose.Schema({
  segmentId: {
    type: String,
    required: [true, "Segment ID is required"],
    unique: true,
    validate: {
      validator: (v) => /^SEG-\w+$/.test(v), // e.g., SEG-123
      message: "Segment ID must start with 'SEG-'"
    }
  },
  locationName: { type: String, required: [true, "Location name is required"] },
  lga: { type: String, required: [true, "LGA is required"] },
  coordinates: {
    type: {
      type: String,
      enum: ["LineString"],
      default: "LineString",
    },
    coordinates: [[Number]], // [[lng, lat], [lng, lat]]
  },
  congestionLevel: {
    type: String,
    enum: ["free", "light", "moderate", "heavy", "severe"],
    required: [true, "Congestion level is required"],
  },
  averageSpeed: { type: Number, required: [true, "Average speed is required"], min: 0 },
  typicalSpeed: { type: Number, required: [true, "Typical speed is required"], min: 0 },
  travelTime: { type: Number, required: [true, "Travel time is required"], min: 0 },
  freeFlowTime: { type: Number, required: [true, "Free flow time is required"], min: 0 },
  delay: { type: Number, default: 0, min: 0 },
  incidentType: {
    type: String,
    enum: ["accident", "breakdown", "construction", "flood", "weather", "other", null],
    default: null,
  },
  incidentDescription: { type: String },
  isPassable: { type: Boolean, default: true },
  severity: { type: Number, min: 1, max: 5 },
  suggestedDetour: { type: String },
  alternativeRoutes: [
    {
      routeName: { type: String, required: true },
      estimatedTime: { type: Number, min: 0 },
      distanceKm: { type: Number, min: 0 },
    },
  ],
weatherId: { type: mongoose.Schema.Types.ObjectId, ref: "Weather" },
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
  confidenceLevel: { type: Number, min: 0, max: 1, default: 0.5 },
  historicalTrend: [
    {
      timestamp: { type: Date, required: true },
      congestionLevel: {
        type: String,
        enum: ["free", "light", "moderate", "heavy", "severe"]
      },
      avgSpeed: { type: Number, min: 0 },
      floodLevel: {
        type: String,
        enum: ["none", "minor", "moderate", "severe"]
      },
      weatherCondition: {
        type: String,
        enum: ["clear", "rain", "storm", "fog", "cloudy", "other"]
      },
    },
  ],
  source: { type: String, default: "Google Maps API + OpenWeather + Flood DB" },
  recordedAt: { type: Date, default: Date.now, required: true },
});

trafficSchema.index({ segmentId: 1, recordedAt: -1 });
trafficSchema.index({ lga: 1 });
trafficSchema.index({ coordinates: "2dsphere" }); // Fixed index
trafficSchema.index({ "flood.floodLevel": 1, incidentType: 1 }); // Added for filtering

const Traffic = mongoose.model("Traffic", trafficSchema);
export default Traffic;