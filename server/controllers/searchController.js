import Search from "../models/SearchSchema.js";
import User from "../models/UserSchema.js";
import Traffic from "../models/TrafficSchema.js";
import Weather from "../models/WeatherSchema.js";
import Flood from "../models/FloodSchema.js";
import { z } from "zod";

// Input validation schemas
const querySchema = z.object({
  page: z.string().optional().transform((val) => parseInt(val) || 1),
  limit: z.string().optional().transform((val) => parseInt(val) || 20),
  userId: z.string().optional(),
  q: z.string().optional(),
  lng: z.string().optional().transform((val) => parseFloat(val)),
  lat: z.string().optional().transform((val) => parseFloat(val)),
  distance: z.string().optional().transform((val) => parseInt(val) || 10000),
  days: z.string().optional().transform((val) => parseInt(val) || 7),
});

const searchSchema = z.object({
  query: z.string(),
  location: z.object({
    type: z.literal("Point").optional(),
    coordinates: z.array(z.number()).length(2),
  }),
});

// Create a new search record
export const createSearch = async (req, res) => {
  try {
    const parsedBody = searchSchema.parse(req.body);
    const { query, location } = parsedBody;
    const lga = req.body.lga; // Optional LGA for Socket.IO room

    let trafficId, weatherId, floodId;

    // Fetch nearest traffic data
    const traffic = await Traffic.findOne({
      coordinates: {
        $near: {
          $geometry: { type: "Point", coordinates: location.coordinates },
          $maxDistance: 5000,
        },
      },
    }).sort({ recordedAt: -1 });
    if (traffic) trafficId = traffic._id;

    // Fetch nearest weather data
    const weather = await Weather.findOne({
      coordinates: {
        $near: {
          $geometry: { type: "Point", coordinates: location.coordinates },
          $maxDistance: 5000,
        },
      },
    }).sort({ recordedAt: -1 });
    if (weather) weatherId = weather._id;

    // Fetch nearest flood data
    const flood = await Flood.findOne({
      coordinates: {
        $near: {
          $geometry: { type: "Point", coordinates: location.coordinates },
          $maxDistance: 5000,
        },
      },
    }).sort({ recordedAt: -1 });
    if (flood) floodId = flood._id;

    const search = new Search({
      userId: req.user._id,
      query,
      location: { type: "Point", coordinates: location.coordinates },
      trafficId,
      weatherId,
      floodId,
      createdAt: new Date(),
    });

    await search.save();

    // Update user's searchHistory
    await User.findByIdAndUpdate(req.user._id, {
      $push: { searchHistory: search._id },
    });

    // Emit search event
    const io = req.app.get("io");
    if (lga) {
      io.to(lga).emit("searchCreated", { search, traffic, weather, flood });
    }

    // Notify active Trips
    if (flood && flood.severity === "high") {
      const trips = await mongoose.model("Trip").find({
        "route.segmentId": { $in: flood.affectedRoads },
        status: "active",
      });
      for (const trip of trips) {
        trip.alerts.push({
          message: `Flood detected near ${query}: ${flood.advisoryMessage}`,
          type: "search",
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

    res.status(201).json({
      message: "Search recorded successfully",
      search: { ...search.toObject(), traffic, weather, flood },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in createSearch:", error.message);
    res.status(500).json({ message: "Failed to create search", error: error.message });
  }
};

// Get all search records
export const getAllSearches = async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsedQuery = querySchema.parse(req.query);
    const { page, limit, userId, q } = parsedQuery;

    let filter = {};
    if (userId) filter.userId = userId;
    if (q) filter.$text = { $search: q };

    const searches = await Search.find(filter)
      .populate("userId", "username email")
      .populate("trafficId")
      .populate("weatherId")
      .populate("floodId")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Search.countDocuments(filter);

    res.json({
      message: "Search records retrieved successfully",
      searches,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getAllSearches:", error.message);
    res.status(500).json({ message: "Failed to fetch searches", error: error.message });
  }
};

// Get user search records
export const getUserSearches = async (req, res) => {
  try {
    const { userId } = z.object({ userId: z.string() }).parse(req.params);
    const parsedQuery = querySchema.parse(req.query);
    const { page, limit } = parsedQuery;

    if (req.user._id.toString() !== userId && req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Not authorized to view these searches" });
    }

    const searches = await Search.find({ userId })
      .populate("trafficId")
      .populate("weatherId")
      .populate("floodId")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Search.countDocuments({ userId });

    res.json({
      message: "User searches retrieved successfully",
      searches,
      pagination: { total, page, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getUserSearches:", error.message);
    res.status(500).json({ message: "Failed to fetch user searches", error: error.message });
  }
};

// Get popular search queries
export const getPopularSearches = async (req, res) => {
  try {
    const { limit } = querySchema.parse(req.query);

    const popularSearches = await Search.aggregate([
      { $group: { _id: "$query", count: { $sum: 1 }, locations: { $push: "$location.coordinates" } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    res.json({ message: "Popular searches retrieved successfully", popularSearches });
  } catch (error) {
    console.error("Error in getPopularSearches:", error.message);
    res.status(500).json({ message: "Failed to fetch popular searches", error: error.message });
  }
};

// Get search trends
export const getSearchTrends = async (req, res) => {
  try {
    const { days } = querySchema.parse(req.query);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trends = await Search.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            query: "$query",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1, count: -1 } },
    ]);

    const trendsByDate = {};
    trends.forEach((trend) => {
      const date = trend._id.date;
      if (!trendsByDate[date]) trendsByDate[date] = [];
      trendsByDate[date].push({ query: trend._id.query, count: trend.count });
    });

    const result = Object.keys(trendsByDate)
      .map((date) => ({
        date,
        topQueries: trendsByDate[date].slice(0, 5),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ message: "Search trends retrieved successfully", trends: result });
  } catch (error) {
    console.error("Error in getSearchTrends:", error.message);
    res.status(500).json({ message: "Failed to fetch search trends", error: error.message });
  }
};

// Get search statistics
export const getSearchStats = async (req, res) => {
  try {
    const totalSearches = await Search.countDocuments();
    const uniqueQueries = await Search.distinct("query");
    const topQueries = await Search.aggregate([
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    const searchesByDay = await Search.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]);

    res.json({
      message: "Search statistics retrieved successfully",
      totalSearches,
      uniqueQueriesCount: uniqueQueries.length,
      topQueries,
      searchesByDay,
    });
  } catch (error) {
    console.error("Error in getSearchStats:", error.message);
    res.status(500).json({ message: "Failed to fetch search statistics", error: error.message });
  }
};

// Get searches near a location
export const getSearchesNearLocation = async (req, res) => {
  try {
    const { lng, lat, distance } = querySchema.parse(req.query);
    if (!lng || !lat) {
      return res.status(400).json({ message: "Longitude and latitude are required" });
    }

    const searches = await Search.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: distance,
        },
      },
    })
      .populate("userId", "username email")
      .populate("trafficId")
      .populate("weatherId")
      .populate("floodId")
      .sort({ createdAt: -1 });

    res.json({ message: "Searches near location retrieved successfully", searches });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in getSearchesNearLocation:", error.message);
    res.status(500).json({ message: "Failed to fetch searches near location", error: error.message });
  }
};

// Delete a search record
export const deleteSearch = async (req, res) => {
  try {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const search = await Search.findById(id);
    if (!search) {
      return res.status(404).json({ message: "Search record not found" });
    }

    if (search.userId.toString() !== req.user._id.toString() && req.headers["x-admin-token"] !== process.env.ADMIN_TOKEN) {
      return res.status(403).json({ message: "Not authorized to delete this search" });
    }

    await search.deleteOne();
    await User.findByIdAndUpdate(search.userId, {
      $pull: { searchHistory: id },
    });

    const io = req.app.get("io");
    io.to(`user:${search.userId}`).emit("searchDeleted", { searchId: id });

    res.json({ message: "Search record deleted successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors.map((e) => e.message).join(", ") });
    }
    console.error("Error in deleteSearch:", error.message);
    res.status(500).json({ message: "Failed to delete search", error: error.message });
  }
};