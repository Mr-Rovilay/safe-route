import mongoose from "mongoose";

const searchSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional: store who searched
  query: { type: String, required: true },                       // e.g. "Yaba", "Lekki Phase 1"
  
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], index: "2dsphere" } // [lng, lat]
  },

  // Latest traffic snapshot
  traffic: {
    congestionLevel: { type: String },             // e.g. "heavy", "moderate"
    avgSpeed: { type: Number },                    // km/h
    incidents: [{ type: String }]                  // e.g. ["Accident", "Roadblock"]
  },

  // Latest weather snapshot
  weather: {
    condition: { type: String },                   // e.g. "rainy", "sunny"
    temperature: { type: Number },
    humidity: { type: Number },
    precipitation: { type: Number },               // mm
    windSpeed: { type: Number }
  },

  // Latest flood snapshot
  flood: {
    severity: { type: String, enum: ["none", "minor", "moderate", "severe"] },
    waterLevel: { type: Number },                  // cm if available
    description: { type: String }
  },

  createdAt: { type: Date, default: Date.now }
});

// Index for faster lookup by text or location
searchSchema.index({ query: "text" });
searchSchema.index({ location: "2dsphere" });

const Search = mongoose.model("Search", searchSchema);
export default Search;