import mongoose from "mongoose";

const floodSchema = new mongoose.Schema({
  locationName: { type: String, required: true },         // e.g. "Lekki Phase 1"
  lga: { type: String, required: true },                  // link to LGA
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },

  // 🌊 Flood Conditions
  severity: { type: String, enum: ["low", "moderate", "high", "severe"], required: true },
  waterLevel: { type: Number },                           // in cm (if measurable)
  cause: { type: String },                                // e.g. "Heavy rainfall", "Blocked drainage"
  affectedRoads: [{ type: String }],                      // list of roads flooded
  durationEstimate: { type: String },                     // e.g. "2 hours", "Until drainage clears"

  // 🚨 Risk & Alerts
  riskLevel: { type: String, enum: ["low", "moderate", "high"], default: "low" },
  isPassable: { type: Boolean, default: true },           // can cars still pass?
  advisoryMessage: { type: String },                      // e.g. "Avoid Lekki Expressway, take Admiralty Road instead"

  // 🔁 System Info
  source: { type: String, default: "NEMA/OpenData" },     // where info comes from
  recordedAt: { type: Date, default: Date.now }           // exact timestamp
});

// Index for fast queries by LGA + time
floodSchema.index({ lga: 1, recordedAt: -1 });

const Flood = mongoose.model("Flood", floodSchema);
export default Flood;