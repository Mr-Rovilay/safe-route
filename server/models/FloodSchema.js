import mongoose from "mongoose";

const floodSchema = new mongoose.Schema({
  locationName: { type: String, required: [true, "Location name is required"] },
  lga: { type: String, required: [true, "LGA is required"] },
  coordinates: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  severity: {
    type: String,
    enum: ["low", "moderate", "high", "severe"],
    required: [true, "Severity is required"],
  },
  waterLevel: { type: Number, min: 0 }, // in cm
  cause: {
    type: String,
    enum: ["heavy rainfall", "blocked drainage", "river overflow", "coastal flooding", "other"],
    default: "other",
  },
  affectedRoads: [{
    type: String,
    validate: {
      validator: async function (v) {
        if (!v) return true;
        const traffic = await mongoose.model("Traffic").findOne({ segmentId: v });
        return !!traffic || /^[A-Za-z\s-]+$/.test(v); // Allow segmentId or road name
      },
      message: "Invalid road name or segmentId",
    },
  }],
  durationEstimate: { type: String }, // e.g., "2 hours"
  riskLevel: { type: String, enum: ["low", "moderate", "high"], default: "low" },
  isPassable: { type: Boolean, default: true },
  advisoryMessage: { type: String },
  source: { type: String, default: "NEMA/OpenData" },
  recordedAt: { type: Date, default: Date.now, required: true },
});

floodSchema.index({ lga: 1, recordedAt: -1 });
floodSchema.index({ coordinates: "2dsphere" });
floodSchema.index({ severity: 1, riskLevel: 1 });

const Flood = mongoose.model("Flood", floodSchema);
export default Flood;