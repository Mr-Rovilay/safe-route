import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: false }, // optional for general alerts

  type: {
    type: String,
    enum: ["traffic", "flood", "weather", "route"],
    required: true
  },
  description: { type: String, required: true },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  severity: { type: String, enum: ["low", "medium", "high"], default: "low" },

  distanceTrigger: { type: Number, default: 100 }, // only used if linked to a trip
  validUntil: { type: Date }, 
  triggered: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

alertSchema.index({ location: "2dsphere" });

const Alert = mongoose.model("Alert", alertSchema);
export default Alert;