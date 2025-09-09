import Search from '../models/SearchSchema.js';
import User from '../models/UserSchema.js';
import Traffic from '../models/TrafficSchema.js';
import Weather from '../models/WeatherSchema.js';
import Flood from '../models/FloodSchema.js';

// Create a new search record with current data
export const createSearch = async (req, res) => {
  try {
    const { query, location } = req.body;
    
    // Validate required fields
    if (!query || !location || !location.coordinates) {
      return res.status(400).json({ 
        message: 'Query and location with coordinates are required' 
      });
    }
    
    // Get current traffic data for the location (if available)
    let trafficData = {};
    try {
      // Find the nearest traffic segment
      const traffic = await Traffic.findOne({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: location.coordinates
            },
            $maxDistance: 5000 // 5km radius
          }
        }
      }).sort({ recordedAt: -1 });
      
      if (traffic) {
        trafficData = {
          congestionLevel: traffic.congestionLevel,
          avgSpeed: traffic.averageSpeed,
          incidents: traffic.incidentType ? [traffic.incidentType] : []
        };
      }
    } catch (error) {
      console.error('Error fetching traffic data:', error);
    }
    
    // Get current weather data for the location (if available)
    let weatherData = {};
    try {
      // Find the nearest weather data
      const weather = await Weather.findOne({
        'coordinates.lat': { $exists: true },
        'coordinates.lng': { $exists: true }
      }).sort({
        recordedAt: -1 // Get the most recent
      });
      
      if (weather) {
        weatherData = {
          condition: weather.condition,
          temperature: weather.temperature,
          humidity: weather.humidity,
          precipitation: weather.rainfall,
          windSpeed: weather.windSpeed
        };
      }
    } catch (error) {
      console.error('Error fetching weather data:', error);
    }
    
    // Get current flood data for the location (if available)
    let floodData = {
      severity: 'none',
      waterLevel: 0,
      description: ''
    };
    try {
      // Find the nearest flood data
      const flood = await Flood.findOne({
        coordinates: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: location.coordinates
            },
            $maxDistance: 5000 // 5km radius
          }
        }
      }).sort({ recordedAt: -1 });
      
      if (flood) {
        floodData = {
          severity: flood.severity,
          waterLevel: flood.waterLevel || 0,
          description: flood.description || ''
        };
      }
    } catch (error) {
      console.error('Error fetching flood data:', error);
    }
    
    // Create new search record
    const search = new Search({
      userId: req.user ? req.user._id : null,
      query,
      location: {
        type: 'Point',
        coordinates: location.coordinates
      },
      traffic: trafficData,
      weather: weatherData,
      flood: floodData
    });
    
    await search.save();
    
    // If user is authenticated, update user's search history
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        $push: { searchHistory: search._id }
      });
    }
    
    res.status(201).json({
      message: 'Search recorded successfully',
      search
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all search records (with pagination and filtering)
export const getAllSearches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const userId = req.query.userId;
    const query = req.query.q;
    
    let filter = {};
    
    // Filter by user ID if provided
    if (userId) {
      filter.userId = userId;
    }
    
    // Filter by query text if provided
    if (query) {
      filter.$text = { $search: query };
    }
    
    const searches = await Search.find(filter)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Search.countDocuments(filter);
    
    res.json({
      searches,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get search records for a specific user
export const getUserSearches = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Check if user has permission to view these searches
    if (req.user._id.toString() !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view these searches' });
    }
    
    const searches = await Search.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Search.countDocuments({ userId });
    
    res.json({
      searches,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get popular search queries
export const getPopularSearches = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const popularSearches = await Search.aggregate([
      {
        $group: {
          _id: '$query',
          count: { $sum: 1 },
          locations: { $push: '$location.coordinates' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: limit
      }
    ]);
    
    res.json({ popularSearches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get search trends by location
export const getSearchTrends = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const trends = await Search.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            query: '$query'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1, count: -1 }
      }
    ]);
    
    // Group by date
    const trendsByDate = {};
    trends.forEach(trend => {
      const date = trend._id.date;
      if (!trendsByDate[date]) {
        trendsByDate[date] = [];
      }
      trendsByDate[date].push({
        query: trend._id.query,
        count: trend.count
      });
    });
    
    // Get top 5 queries for each date
    const result = Object.keys(trendsByDate).map(date => ({
      date,
      topQueries: trendsByDate[date].slice(0, 5)
    }));
    
    res.json({ trends: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get search statistics
export const getSearchStats = async (req, res) => {
  try {
    const totalSearches = await Search.countDocuments();
    
    const uniqueQueries = await Search.distinct('query');
    
    const topQueries = await Search.aggregate([
      {
        $group: {
          _id: '$query',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    const searchesByDay = await Search.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      },
      {
        $limit: 30 // Last 30 days
      }
    ]);
    
    res.json({
      totalSearches,
      uniqueQueriesCount: uniqueQueries.length,
      topQueries,
      searchesByDay
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get searches near a location
export const getSearchesNearLocation = async (req, res) => {
  try {
    const { lng, lat, distance = 10000 } = req.query; // Distance in meters
    
    if (!lng || !lat) {
      return res.status(400).json({ 
        message: 'Longitude and latitude are required' 
      });
    }
    
    const searches = await Search.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(distance)
        }
      }
    })
    .populate('userId', 'username email')
    .sort({ createdAt: -1 });
    
    res.json({ searches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a search record
export const deleteSearch = async (req, res) => {
  try {
    const { id } = req.params;
    
    const search = await Search.findById(id);
    
    if (!search) {
      return res.status(404).json({ message: 'Search record not found' });
    }
    
    // Check if user has permission to delete this search
    if (search.userId && search.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this search' });
    }
    
    await search.remove();
    
    // If user is authenticated, remove from user's search history
    if (req.user && search.userId) {
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { searchHistory: id }
      });
    }
    
    res.json({ message: 'Search record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};