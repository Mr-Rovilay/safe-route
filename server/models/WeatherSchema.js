import mongoose from "mongoose";

const weatherSchema = new mongoose.Schema({
  city: { type: String, required: [true, "City is required"] },
  lga: { type: String, required: [true, "LGA is required"] },
  coordinates: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  temperature: { type: Number, min: -50, max: 50 }, // °C
  feelsLike: { type: Number, min: -50, max: 50 }, // °C
  minTemp: { type: Number, min: -50, max: 50 }, // °C
  maxTemp: { type: Number, min: -50, max: 50 }, // °C
  humidity: { type: Number, min: 0, max: 100 }, // %
  pressure: { type: Number, min: 800, max: 1200 }, // hPa
  visibility: { type: Number, min: 0 }, // meters
  windSpeed: { type: Number, min: 0 }, // m/s
  windDirection: { type: Number, min: 0, max: 360 }, // degrees
  cloudCover: { type: Number, min: 0, max: 100 }, // %
  uvIndex: { type: Number, min: 0, max: 11 }, // UV index
  rainfall: { type: Number, min: 0 }, // mm
  precipitationProbability: { type: Number, min: 0, max: 100 }, // %
  floodRisk: { type: String, enum: ["low", "moderate", "high"], default: "low" },
  sunrise: { type: Date },
  sunset: { type: Date },
  condition: {
    type: String,
    enum: [
      "clear", "rain", "storm", "fog", "cloudy", "thunderstorm", "other",
      "clouds", "drizzle", "snow", "mist", "haze" // Added common OpenWeather values
    ],
    required: true,
  },
  description: { type: String },
  source: { type: String, default: "OpenWeather" },
  recordedAt: { type: Date, default: Date.now, required: true },
});

weatherSchema.index({ city: 1, lga: 1, recordedAt: -1 });
weatherSchema.index({ coordinates: "2dsphere" });
weatherSchema.index({ floodRisk: 1, condition: 1 });

const Weather = mongoose.model("Weather", weatherSchema);
export default Weather;