import mongoose from "mongoose";

const trafficSchema = new mongoose.Schema({
  // 🔹 Location Info
  segmentId: { type: String, required: true },            // unique ID for road segment
  locationName: { type: String, required: true },         // e.g. "Third Mainland Bridge"
  lga: { type: String },                                  // e.g. "Lagos Mainland"
  coordinates: {
    start: { lat: Number, lng: Number },
    end: { lat: Number, lng: Number },
    midPoint: { lat: Number, lng: Number }
  },

  // 🔹 Traffic Conditions
  congestionLevel: { type: String, enum: ["free", "light", "moderate", "heavy", "severe"], required: true },
  averageSpeed: { type: Number },                         // km/h
  typicalSpeed: { type: Number },                         // normal flow speed
  travelTime: { type: Number },                           // current ETA (mins)
  freeFlowTime: { type: Number },                         // ETA without traffic
  delay: { type: Number },                                // minutes lost due to traffic

  // 🔹 Incident & Hazards
  incidentType: { type: String, enum: ["accident", "breakdown", "construction", "flood", "weather", "other"] },
  incidentDescription: { type: String },
  isPassable: { type: Boolean, default: true },
  severity: { type: Number, min: 1, max: 5 },

  // 🔹 Suggested Routing
  suggestedDetour: { type: String },
  alternativeRoutes: [{
    routeName: String,
    estimatedTime: Number,
    distanceKm: Number
  }],

  // 🔹 Embedded Weather Data
  weather: {
    condition: { type: String },                         // e.g. "Rain", "Clear", "Cloudy"
    temperature: { type: Number },                       // °C
    visibility: { type: Number },                        // meters
    precipitation: { type: Number },                     // mm/hr rainfall
    recordedAt: { type: Date }                           // when weather was fetched
  },

  // 🔹 Embedded Flood Data
  flood: {
    isFlooded: { type: Boolean, default: false },
    floodLevel: { type: String, enum: ["none", "minor", "moderate", "severe"], default: "none" },
    description: { type: String },                       // e.g. "Water covering half the road"
    recordedAt: { type: Date }                           // timestamp of flood data
  },

  // 🔹 Analytics
  confidenceLevel: { type: Number, min: 0, max: 1 },      // reliability score
  historicalTrend: [{
    timestamp: { type: Date },
    congestionLevel: String,
    avgSpeed: Number,
    floodLevel: String,
    weatherCondition: String
  }],

  // 🔹 Metadata
  source: { type: String, default: "Google Maps API + OpenWeather + Flood DB" },
  recordedAt: { type: Date, default: Date.now }
});

// Indexing for performance
trafficSchema.index({ segmentId: 1, recordedAt: -1 });
trafficSchema.index({ lga: 1 });

const Traffic = mongoose.model("Traffic", trafficSchema);
export default Traffic;