import Weather from "../models/WeatherSchema.js"; 
import Flood from "../models/FloodSchema.js"; 
import axios from "axios";
import { z } from "zod";

// Input validation schemas
const querySchema = z.object({
  page: z.string().optional().transform((val) => parseInt(val) || 1),
  limit: z.string().optional().transform((val) => parseInt(val) || 20),
  city: z.string().optional(),
  lga: z.string().optional(),
  condition: z.enum(["clear", "rain", "storm", "fog", "cloudy", "thunderstorm", "other"]).optional(),
  floodRisk: z.enum(["low", "moderate", "high"]).optional(),
  lat: z.string().optional().transform((val) => parseFloat(val)),
  lng: z.string().optional().transform((val) => parseFloat(val)),
  minRisk: z.enum(["moderate", "high"]).optional(),
});

const weatherSchema = z.object({
  city: z.string(),
  lga: z.string(),
  coordinates: z.object({
    type: z.literal("Point").optional(),
    coordinates: z.array(z.number()).length(2),
  }),
  temperature: z.number().min(-50).max(50).optional(),
  feelsLike: z.number().min(-50).max(50).optional(),
  minTemp: z.number().min(-50).max(50).optional(),
  maxTemp: z.number().min(-50).max(50).optional(),
  humidity: z.number().min(0).max(100).optional(),
  pressure: z.number().min(800).max(1200).optional(),
  visibility: z.number().min(0).optional(),
  windSpeed: z.number().min(0).optional(),
  windDirection: z.number().min(0).max(360).optional(),
  cloudCover: z.number().min(0).max(100).optional(),
  uvIndex: z.number().min(0).max(11).optional(),
  rainfall: z.number().min(0).optional(),
  precipitationProbability: z.number().min(0).max(100).optional(),
  floodRisk: z.enum(["low", "moderate", "high"]).optional(),
  sunrise: z.string().datetime().optional(),
  sunset: z.string().datetime().optional(),
  condition: z.enum(["clear", "rain", "storm", "fog", "cloudy", "thunderstorm", "other"]),
  description: z.string().optional(),
  source: z.string().optional(),
});

// Get all weather data
export const getAllWeatherData = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, city, lga, condition, floodRisk } = parsedQuery;

    let query = {};
    if (city) query.city = { $regex: city, $options: "i" };
    if (lga) query.lga = { $regex: lga, $options: "i" };
    if (condition) query.condition = condition;
    if (floodRisk) query.floodRisk = floodRisk;

    const weatherData = await Weather.find(query)
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Weather.countDocuments(query);

    res.json({
      message: "Weather data retrieved successfully",
      weatherData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getAllWeatherData:", error.message);
    res.status(500).json({ message: "Failed to fetch weather data", error: error.message });
  }
};

// Get weather by city
export const getWeatherByCity = async (req, res) => {
  try {
    const { city } = z.object({ city: z.string() }).parse(req.params);
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit } = parsedQuery;

    const weatherData = await Weather.find({ city: { $regex: city, $options: "i" } })
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Weather.countDocuments({ city: { $regex: city, $options: "i" } });

    res.json({
      message: "Weather data retrieved successfully",
      weatherData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getWeatherByCity:", error.message);
    res.status(500).json({ message: "Failed to fetch weather data by city", error: error.message });
  }
};

// Get weather by LGA
export const getWeatherByLGA = async (req, res) => {
  try {
    const { lga } = z.object({ lga: z.string() }).parse(req.params);
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit } = parsedQuery;

    const weatherData = await Weather.find({ lga: { $regex: lga, $options: "i" } })
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Weather.countDocuments({ lga: { $regex: lga, $options: "i" } });

    res.json({
      message: "Weather data retrieved successfully",
      weatherData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getWeatherByLGA:", error.message);
    res.status(500).json({ message: "Failed to fetch weather data by LGA", error: error.message });
  }
};

// Get latest weather data
export const getLatestWeather = async (req, res) => {
  try {
    const { lat, lng } = querySchema.parse(req.query);

    if (!lat || !lng) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    const weatherData = await Weather.findOne({
      coordinates: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: 5000,
        },
      },
    }).sort({ recordedAt: -1 });

    if (!weatherData) {
      return res.status(404).json({ message: "Weather data not found" });
    }

    res.json({ message: "Latest weather data retrieved successfully", weatherData });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getLatestWeather:", error.message);
    res.status(500).json({ message: "Failed to fetch latest weather data", error: error.message });
  }
};

// Create weather data
export const createWeatherData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsedBody = weatherSchema.parse(req.body);
    const weatherData = new Weather({
      ...parsedBody,
      coordinates: { type: "Point", coordinates: parsedBody.coordinates.coordinates },
      recordedAt: new Date(),
    });
    await weatherData.save();

    const io = req.app.get("io");
    io.to(weatherData.lga).emit("weatherUpdate", weatherData);

    res.status(201).json({
      message: "Weather data created successfully",
      weatherData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in createWeatherData:", error.message);
    res.status(500).json({ message: "Failed to create weather data", error: error.message });
  }
};

// Update weather data
export const updateWeatherData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = z.object({ id: z.string() }).parse(req.params);
    const parsedBody = weatherSchema.partial().parse(req.body);

    let weatherData = await Weather.findById(id);
    if (!weatherData) {
      return res.status(404).json({ message: "Weather data not found" });
    }

    Object.assign(weatherData, parsedBody);
    if (parsedBody.coordinates) {
      weatherData.coordinates = { type: "Point", coordinates: parsedBody.coordinates.coordinates };
    }
    weatherData.recordedAt = new Date();
    await weatherData.save();

    const io = req.app.get("io");
    io.to(weatherData.lga).emit("weatherUpdate", weatherData);

    res.json({
      message: "Weather data updated successfully",
      weatherData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in updateWeatherData:", error.message);
    res.status(500).json({ message: "Failed to update weather data", error: error.message });
  }
};

// Delete weather data
export const deleteWeatherData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = z.object({ id: z.string() }).parse(req.params);
    const weatherData = await Weather.findById(id);
    if (!weatherData) {
      return res.status(404).json({ message: "Weather data not found" });
    }

    await weatherData.deleteOne();

    const io = req.app.get("io");
    io.to(weatherData.lga).emit("weatherDeleted", { weatherId: id });

    res.json({ message: "Weather data deleted successfully" });
  } catch (error) {
    console.error("Error in deleteWeatherData:", error.message);
    res.status(500).json({ message: "Failed to delete weather data", error: error.message });
  }
};

// Fetch OpenWeather data
export const fetchOpenWeatherData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { lat, lng, city, lga } = querySchema.parse(req.query);
    if (!lat || !lng || !lga) {
      return res.status(400).json({ message: "Latitude, longitude, and LGA are required" });
    }

    const currentResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    const forecastResponse = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );

    const currentData = currentResponse.data;
    const forecastData = forecastResponse.data;

    const weatherData = {
      city: city || currentData.name,
      lga,
      coordinates: { type: "Point", coordinates: [currentData.coord.lon, currentData.coord.lat] },
      temperature: currentData.main.temp,
      feelsLike: currentData.main.feels_like,
      minTemp: currentData.main.temp_min,
      maxTemp: currentData.main.temp_max,
      humidity: currentData.main.humidity,
      pressure: currentData.main.pressure,
      visibility: currentData.visibility,
      windSpeed: currentData.wind?.speed || 0,
      windDirection: currentData.wind?.deg || 0,
      cloudCover: currentData.clouds?.all || 0,
      uvIndex: 0,
      rainfall: currentData.rain ? currentData.rain["1h"] || 0 : 0,
      precipitationProbability: calculatePrecipitationProbability(forecastData),
      floodRisk: calculateFloodRisk(currentData, forecastData),
      sunrise: new Date(currentData.sys.sunrise * 1000),
      sunset: new Date(currentData.sys.sunset * 1000),
      condition: currentData.weather[0].main.toLowerCase(),
      description: currentData.weather[0].description,
      source: "OpenWeather",
      recordedAt: new Date(),
    };

    const weather = await Weather.findOneAndUpdate(
      { city, lga, recordedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } },
      weatherData,
      { new: true, upsert: true }
    );

    const io = req.app.get("io");
    io.to(weather.lga).emit("weatherUpdate", weather);

    // Check for high flood risk and update Flood records
    if (weather.floodRisk === "high") {
      const flood = new Flood({
        locationName: weather.city,
        lga: weather.lga,
        coordinates: weather.coordinates,
        severity: "high",
        waterLevel: Math.round(weather.rainfall * 2),
        cause: "heavy rainfall",
        affectedRoads: [],
        durationEstimate: "Until rain stops",
        riskLevel: "high",
        isPassable: false,
        advisoryMessage: `High flood risk in ${weather.city}. Avoid low-lying areas.`,
        source: "OpenWeather",
      });
      await flood.save();
      io.to(weather.lga).emit("floodReportCreated", { flood });

      // Notify active Trips
      const trips = await mongoose.model("Trip").find({ lga: weather.lga, status: "active" });
      for (const trip of trips) {
        trip.alerts.push({
          message: `High flood risk in ${weather.city}: Avoid low-lying areas`,
          type: "weather",
          severity: "critical",
          timestamp: new Date(),
        });
        await trip.save();
        io.to(`user:${trip.userId}`).emit("tripAlert", {
          tripId: trip._id,
          alert: trip.alerts[trip.alerts.length - 1],
        });
      }
    }

    res.json({
      message: "Weather data fetched and saved successfully",
      weatherData: weather,
    });
  } catch (error) {
    console.error("Error in fetchOpenWeatherData:", error.message);
    res.status(500).json({ message: "Failed to fetch weather data", error: error.message });
  }
};

// Helper functions
const calculatePrecipitationProbability = (forecastData) => {
  const forecasts = forecastData.list.slice(0, 8);
  let rainCount = 0;
  forecasts.forEach((forecast) => {
    if (forecast.rain && forecast.rain["3h"] > 0) rainCount++;
  });
  return Math.round((rainCount / forecasts.length) * 100);
};

const calculateFloodRisk = async (currentData, forecastData) => {
  const currentRainfall = currentData.rain ? currentData.rain["1h"] || 0 : 0;
  const forecasts = forecastData.list.slice(0, 8);
  let totalForecastRain = 0;
  forecasts.forEach((forecast) => {
    totalForecastRain += forecast.rain ? forecast.rain["3h"] || 0 : 0;
  });
  const totalRain = currentRainfall + totalForecastRain;

  // Check historical rainfall for context
  const historical = await Weather.aggregate([
    {
      $match: {
        coordinates: {
          $geoNear: {
            $geometry: { type: "Point", coordinates: [currentData.coord.lon, currentData.coord.lat] },
            $maxDistance: 5000,
          },
        },
        recordedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    },
    { $group: { _id: null, avgRainfall: { $avg: "$rainfall" } } },
  ]);

  const avgHistoricalRain = historical[0]?.avgRainfall || 0;
  if (totalRain > 30 || (totalRain > 15 && avgHistoricalRain > 10)) return "high";
  if (totalRain > 15) return "moderate";
  return "low";
};

// Get weather forecast
export const getWeatherForecast = async (req, res) => {
  try {
    const { lat, lng } = querySchema.parse(req.query);
    if (!lat || !lng) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
    );
    const forecastData = response.data;

    const dailyForecasts = {};
    forecastData.list.forEach((item) => {
      const date = new Date(item.dt * 1000).toLocaleDateString();
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          date,
          minTemp: item.main.temp_min,
          maxTemp: item.main.temp_max,
          conditions: [],
          rainfall: 0,
          humidity: item.main.humidity,
          windSpeed: item.wind?.speed || 0,
          icon: item.weather[0].icon,
        };
      }
      dailyForecasts[date].minTemp = Math.min(dailyForecasts[date].minTemp, item.main.temp_min);
      dailyForecasts[date].maxTemp = Math.max(dailyForecasts[date].maxTemp, item.main.temp_max);
      dailyForecasts[date].rainfall += item.rain ? item.rain["3h"] || 0 : 0;
      const condition = item.weather[0].main.toLowerCase();
      if (!dailyForecasts[date].conditions.includes(condition)) {
        dailyForecasts[date].conditions.push(condition);
      }
    });

    const forecastArray = Object.values(dailyForecasts).sort((a, b) => new Date(a.date) - new Date(b.date));
    forecastArray.forEach((day) => {
      day.floodRisk = day.rainfall > 30 ? "high" : day.rainfall > 15 ? "moderate" : "low";
    });

    res.json({
      message: "Weather forecast retrieved successfully",
      city: forecastData.city.name,
      forecast: forecastArray,
    });
  } catch (error) {
    console.error("Error in getWeatherForecast:", error.message);
    res.status(500).json({ message: "Failed to fetch weather forecast", error: error.message });
  }
};

// Get flood risk alerts
export const getFloodRiskAlerts = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, minRisk } = parsedQuery;

    let query = { recordedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } };
    if (minRisk === "high") query.floodRisk = "high";
    else if (minRisk === "moderate") query.floodRisk = { $in: ["moderate", "high"] };

    const alerts = await Weather.find(query)
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Weather.countDocuments(query);

    res.json({
      message: "Flood risk alerts retrieved successfully",
      alerts,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getFloodRiskAlerts:", error.message);
    res.status(500).json({ message: "Failed to fetch flood risk alerts", error: error.message });
  }
};