import Flood from "../models/FloodSchema.js"; // Corrected import
import Traffic from "../models/TrafficSchema.js"; // Added for integration
import { z } from "zod";

// Input validation schemas
const querySchema = z.object({
  page: z.string().optional().transform((val) => parseInt(val) || 1),
  limit: z.string().optional().transform((val) => parseInt(val) || 20),
  lga: z.string().optional(),
  severity: z.enum(["low", "moderate", "high", "severe"]).optional(),
  riskLevel: z.enum(["low", "moderate", "high"]).optional(),
  isPassable: z.enum(["true", "false"]).optional(),
  lat: z.string().optional().transform((val) => parseFloat(val)),
  lng: z.string().optional().transform((val) => parseFloat(val)),
  distance: z.string().optional().transform((val) => parseInt(val) || 5000),
});

const floodSchema = z.object({
  locationName: z.string(),
  lga: z.string(),
  coordinates: z.object({
    type: z.literal("Point").optional(),
    coordinates: z.array(z.number()).length(2),
  }),
  severity: z.enum(["low", "moderate", "high", "severe"]),
  waterLevel: z.number().min(0).optional(),
  cause: z.enum(["heavy rainfall", "blocked drainage", "river overflow", "coastal flooding", "other"]).optional(),
  affectedRoads: z.array(z.string()).optional(),
  durationEstimate: z.string().optional(),
  riskLevel: z.enum(["low", "moderate", "high"]).optional(),
  isPassable: z.boolean().optional(),
  advisoryMessage: z.string().optional(),
  source: z.string().optional(),
});

// Get all flood data
export const getAllFloodData = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, lga, severity, riskLevel, isPassable } = parsedQuery;

    let query = {};
    if (lga) query.lga = { $regex: lga, $options: "i" };
    if (severity) query.severity = severity;
    if (riskLevel) query.riskLevel = riskLevel;
    if (isPassable !== undefined) query.isPassable = isPassable === "true";

    const floodData = await Flood.find(query)
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Flood.countDocuments(query);

    res.json({
      message: "Flood data retrieved successfully",
      floodData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getAllFloodData:", error.message);
    res.status(500).json({ message: "Failed to fetch flood data", error: error.message });
  }
};

// Get flood data by LGA
export const getFloodByLGA = async (req, res) => {
  try {
    const { lga } = z.object({ lga: z.string() }).parse(req.params);
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit } = parsedQuery;

    const floodData = await Flood.find({ lga: { $regex: lga, $options: "i" } })
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Flood.countDocuments({ lga: { $regex: lga, $options: "i" } });

    res.json({
      message: "Flood data retrieved successfully",
      floodData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getFloodByLGA:", error.message);
    res.status(500).json({ message: "Failed to fetch flood data by LGA", error: error.message });
  }
};

// Get flood data near a location
export const getFloodNearLocation = async (req, res) => {
  try {
    const { lat, lng, distance } = querySchema.parse(req.query);

    if (!lat || !lng) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    const floodData = await Flood.find({
      coordinates: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: distance,
        },
      },
    }).sort({ severity: -1 });

    res.json({ message: "Flood data near location retrieved successfully", floodData });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in getFloodNearLocation:", error.message);
    res.status(500).json({ message: "Failed to fetch flood data near location", error: error.message });
  }
};

// Get flood by ID
export const getFloodById = async (req, res) => {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const flood = await Flood.findById(id);

    if (!flood) {
      return res.status(404).json({ message: "Flood report not found" });
    }

    res.json({ message: "Flood report retrieved successfully", flood });
  } catch (error) {
    console.error("Error in getFloodById:", error.message);
    res.status(500).json({ message: "Failed to fetch flood report", error: error.message });
  }
};

// Create a flood report
export const createFloodReport = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsedBody = floodSchema.parse(req.body);
    const flood = new Flood({
      ...parsedBody,
      coordinates: { type: "Point", coordinates: parsedBody.coordinates.coordinates },
      recordedAt: new Date(),
    });

    await flood.save();

    const io = req.app.get("io");
    io.to(flood.lga).emit("floodReportCreated", { flood });

    if (flood.severity === "high" || flood.severity === "severe") {
      io.to(flood.lga).emit("criticalFloodAlert", {
        message: `Severe flooding reported in ${flood.locationName}, ${flood.lga}`,
        location: flood.coordinates,
        severity: flood.severity,
        advisoryMessage: flood.advisoryMessage,
      });

      // Update related Trips with alerts
      const trips = await mongoose.model("Trip").find({
        "route.segmentId": { $in: flood.affectedRoads },
        status: "active",
      });
      for (const trip of trips) {
        trip.alerts.push({
          message: `Flood reported on ${flood.locationName}: ${flood.advisoryMessage}`,
          type: "flood",
          severity: flood.severity === "severe" ? "critical" : "warning",
          timestamp: new Date(),
        });
        await trip.save();
        io.to(`user:${trip.userId}`).emit("tripAlert", {
          tripId: trip._id,
          alert: trip.alerts[trip.alerts.length - 1],
        });
      }
    }

    res.status(201).json({
      message: "Flood report created successfully",
      flood,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in createFloodReport:", error.message);
    res.status(500).json({ message: "Failed to create flood report", error: error.message });
  }
};

// Update a flood report
export const updateFloodReport = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = z.object({ id: z.string() }).parse(req.params);
    const parsedBody = floodSchema.partial().parse(req.body);

    const flood = await Flood.findById(id);
    if (!flood) {
      return res.status(404).json({ message: "Flood report not found" });
    }

    Object.assign(flood, parsedBody);
    if (parsedBody.coordinates) {
      flood.coordinates = { type: "Point", coordinates: parsedBody.coordinates.coordinates };
    }
    flood.recordedAt = new Date();
    await flood.save();

    const io = req.app.get("io");
    io.to(flood.lga).emit("floodReportUpdated", { flood });

    res.json({
      message: "Flood report updated successfully",
      flood,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map(e => e.message).join(", ") });
    }
    console.error("Error in updateFloodReport:", error.message);
    res.status(500).json({ message: "Failed to update flood report", error: error.message });
  }
};

// Delete a flood report
export const deleteFloodReport = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = z.object({ id: z.string() }).parse(req.params);
    const flood = await Flood.findById(id);
    if (!flood) {
      return res.status(404).json({ message: "Flood report not found" });
    }

    await flood.deleteOne();

    const io = req.app.get("io");
    io.to(flood.lga).emit("floodReportDeleted", { floodId: id });

    res.json({ message: "Flood report deleted successfully" });
  } catch (error) {
    console.error("Error in deleteFloodReport:", error.message);
    res.status(500).json({ message: "Failed to delete flood report", error: error.message });
  }
};

// Get high-risk flood areas
export const getHighRiskFloodAreas = async (req, res) => {
  try {
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit } = parsedQuery;

    const floodData = await Flood.find({
      $or: [
        { severity: { $in: ["high", "severe"] } },
        { riskLevel: "high" },
        { isPassable: false },
      ],
    })
      .sort({ recordedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Flood.countDocuments({
      $or: [
        { severity: { $in: ["high", "severe"] } },
        { riskLevel: "high" },
        { isPassable: false },
      ],
    });

    res.json({
      message: "High-risk flood areas retrieved successfully",
      floodData,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error in getHighRiskFloodAreas:", error.message);
    res.status(500).json({ message: "Failed to fetch high-risk flood areas", error: error.message });
  }
};

// Get flood statistics by LGA
export const getFloodStatsByLGA = async (req, res) => {
  try {
    const stats = await Flood.aggregate([
      {
        $group: {
          _id: "$lga",
          count: { $sum: 1 },
          highSeverityCount: {
            $sum: { $cond: [{ $in: ["$severity", ["high", "severe"]] }, 1, 0] },
          },
          impassableCount: {
            $sum: { $cond: [{ $eq: ["$isPassable", false] }, 1, 0] },
          },
          avgWaterLevel: { $avg: "$waterLevel" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({ message: "Flood statistics retrieved successfully", stats });
  } catch (error) {
    console.error("Error in getFloodStatsByLGA:", error.message);
    res.status(500).json({ message: "Failed to fetch flood statistics", error: error.message });
  }
};

// Simulate flood data from Traffic weather data
export const simulateFloodData = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Use Traffic.weather instead of Weather model
    const recentTraffic = await Traffic.find({
      "weather.precipitation": { $gt: 10 },
      "weather.recordedAt": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const createdFloods = [];

    for (const traffic of recentTraffic) {
      let severity = "low";
      const rainfall = traffic.weather.precipitation;
      if (rainfall > 30) severity = "severe";
      else if (rainfall > 20) severity = "high";
      else if (rainfall > 15) severity = "moderate";

      const flood = new Flood({
        locationName: traffic.locationName,
        lga: traffic.lga,
        coordinates: {
          type: "Point",
          coordinates: traffic.coordinates.coordinates[0], // Use start point
        },
        severity,
        waterLevel: Math.round(rainfall * 2),
        cause: "heavy rainfall",
        affectedRoads: [traffic.segmentId],
        durationEstimate: "Until rain stops",
        riskLevel: severity === "severe" ? "high" : severity === "high" ? "moderate" : "low",
        isPassable: severity !== "severe",
        advisoryMessage: severity === "severe" ? "Avoid this area, roads are impassable" : "Exercise caution",
        source: "Simulated from traffic weather data",
      });

      await flood.save();
      createdFloods.push(flood);

      // Update Traffic.flood
      await Traffic.findOneAndUpdate(
        { segmentId: traffic.segmentId },
        {
          "flood.isFlooded": severity !== "none",
          "flood.floodLevel": severity,
          "flood.description": flood.advisoryMessage,
          "flood.recordedAt": new Date(),
        },
        { new: true }
      );
    }

    const io = req.app.get("io");
    for (const flood of createdFloods) {
      io.to(flood.lga).emit("floodReportCreated", { flood });
    }

    res.json({
      message: `Created ${createdFloods.length} flood reports from traffic weather data`,
      createdFloods,
    });
  } catch (error) {
    console.error("Error in simulateFloodData:", error.message);
    res.status(500).json({ message: "Failed to simulate flood data", error: error.message });
  }
};