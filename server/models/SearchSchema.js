import mongoose from "mongoose";

const searchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User ID is required"],
  },
  query: { type: String, required: [true, "Query is required"] },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  trafficId: { type: mongoose.Schema.Types.ObjectId, ref: "Traffic" },
  weatherId: { type: mongoose.Schema.Types.ObjectId, ref: "Weather" },
  floodId: { type: mongoose.Schema.Types.ObjectId, ref: "Flood" },
  createdAt: { type: Date, default: Date.now, required: true },
  lga: { type: String, required: [true, "LGA is required"] },
});

searchSchema.index({ query: "text" });
searchSchema.index({ location: "2dsphere" });
searchSchema.index({ userId: 1, createdAt: -1 });

const Search = mongoose.model("Search", searchSchema);
export default Search;