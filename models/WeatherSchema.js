import mongoose from "mongoose";

const weatherSchema = new mongoose.Schema({
  city: { type: String, required: true },          
  lga: { type: String },                            // optional - store LGA if applicable
  coordinates: {                                   
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },

  // 🌡️ Basic Weather Info
  temperature: { type: Number },                    // °C
  feelsLike: { type: Number },                      // °C (what it feels like)
  minTemp: { type: Number },                        // daily min
  maxTemp: { type: Number },                        // daily max
  humidity: { type: Number },                       // %
  pressure: { type: Number },                       // hPa
  visibility: { type: Number },                     // meters
  windSpeed: { type: Number },                      // m/s
  windDirection: { type: Number },                  // degrees (0–360)
  cloudCover: { type: Number },                     // % of sky covered
  uvIndex: { type: Number },                        // UV index

  // 🌧️ Rain & Flood
  rainfall: { type: Number },                       // mm (last 1hr/3hr)
  precipitationProbability: { type: Number },       // %
  floodRisk: { type: String, enum: ["low", "moderate", "high"], default: "low" },

  // 🌩️ Extra Conditions
  sunrise: { type: Date },                          // for that location
  sunset: { type: Date },
  condition: { type: String },                      // e.g. "Rain", "Clear", "Thunderstorm"
  description: { type: String },                    // e.g. "light rain"

  // 🔁 System Info
  source: { type: String, default: "OpenWeather" }, // which API it came from
  recordedAt: { type: Date, default: Date.now }     // exact timestamp
});

// Index for fast queries
weatherSchema.index({ city: 1, lga: 1, recordedAt: -1 });

const Weather = mongoose.model("Weather", weatherSchema);
export default Weather;