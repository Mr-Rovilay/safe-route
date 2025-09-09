import Flood from '../models/FloodSchema.js';
import axios from 'axios';

// Get all flood data (with pagination and filtering)
export const getAllFloodData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const lga = req.query.lga;
    const severity = req.query.severity;
    const riskLevel = req.query.riskLevel;
    const isPassable = req.query.isPassable;
    
    let query = {};
    
    // Filter by LGA if provided
    if (lga) {
      query.lga = { $regex: lga, $options: 'i' };
    }
    
    // Filter by severity if provided
    if (severity) {
      query.severity = severity;
    }
    
    // Filter by risk level if provided
    if (riskLevel) {
      query.riskLevel = riskLevel;
    }
    
    // Filter by passability if provided
    if (isPassable === 'true') {
      query.isPassable = true;
    } else if (isPassable === 'false') {
      query.isPassable = false;
    }
    
    const floodData = await Flood.find(query)
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Flood.countDocuments(query);
    
    res.json({
      floodData,
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

// Get flood data for a specific LGA
export const getFloodByLGA = async (req, res) => {
  try {
    const { lga } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const floodData = await Flood.find({ lga: { $regex: lga, $options: 'i' } })
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Flood.countDocuments({ lga: { $regex: lga, $options: 'i' } });
    
    res.json({
      floodData,
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

// Get flood data near a location
export const getFloodNearLocation = async (req, res) => {
  try {
    const { lat, lng, distance = 5000 } = req.query; // Distance in meters
    
    if (!lat || !lng) {
      return res.status(400).json({ 
        message: 'Latitude and longitude are required' 
      });
    }
    
    const floodData = await Flood.find({
      coordinates: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(distance)
        }
      }
    })
    .sort({ severity: -1 }); // Higher severity first
    
    res.json({ floodData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single flood report by ID
export const getFloodById = async (req, res) => {
  try {
    const flood = await Flood.findById(req.params.id);
    
    if (!flood) {
      return res.status(404).json({ message: 'Flood report not found' });
    }
    
    res.json({ flood });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new flood report
export const createFloodReport = async (req, res) => {
  try {
    const { 
      locationName,
      lga,
      coordinates,
      severity,
      waterLevel,
      cause,
      affectedRoads,
      durationEstimate,
      riskLevel,
      isPassable,
      advisoryMessage,
      source
    } = req.body;
    
    // Validate required fields
    if (!locationName || !lga || !coordinates || !coordinates.lat || !coordinates.lng || !severity) {
      return res.status(400).json({ 
        message: 'Location name, LGA, coordinates, and severity are required' 
      });
    }
    
    // Create new flood report
    const flood = new Flood({
      locationName,
      lga,
      coordinates: {
        lat: coordinates.lat,
        lng: coordinates.lng
      },
      severity,
      waterLevel,
      cause,
      affectedRoads,
      durationEstimate,
      riskLevel,
      isPassable,
      advisoryMessage,
      source
    });
    
    await flood.save();
    
    // Emit flood report created event via socket.io
    const io = req.app.get('io');
    io.emit('flood-report-created', { flood });
    
    // If severity is high or severe, emit a critical alert
    if (severity === 'high' || severity === 'severe') {
      io.emit('critical-flood-alert', {
        message: `Severe flooding reported in ${locationName}, ${lga}`,
        location: coordinates,
        severity,
        advisoryMessage
      });
    }
    
    res.status(201).json({
      message: 'Flood report created successfully',
      flood
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a flood report
export const updateFloodReport = async (req, res) => {
  try {
    const flood = await Flood.findById(req.params.id);
    
    if (!flood) {
      return res.status(404).json({ message: 'Flood report not found' });
    }
    
    const { 
      locationName,
      lga,
      coordinates,
      severity,
      waterLevel,
      cause,
      affectedRoads,
      durationEstimate,
      riskLevel,
      isPassable,
      advisoryMessage,
      source
    } = req.body;
    
    // Update fields if provided
    if (locationName) flood.locationName = locationName;
    if (lga) flood.lga = lga;
    if (coordinates && coordinates.lat && coordinates.lng) {
      flood.coordinates = {
        lat: coordinates.lat,
        lng: coordinates.lng
      };
    }
    if (severity) flood.severity = severity;
    if (waterLevel !== undefined) flood.waterLevel = waterLevel;
    if (cause) flood.cause = cause;
    if (affectedRoads) flood.affectedRoads = affectedRoads;
    if (durationEstimate) flood.durationEstimate = durationEstimate;
    if (riskLevel) flood.riskLevel = riskLevel;
    if (isPassable !== undefined) flood.isPassable = isPassable;
    if (advisoryMessage) flood.advisoryMessage = advisoryMessage;
    if (source) flood.source = source;
    
    await flood.save();
    
    // Emit flood report updated event via socket.io
    const io = req.app.get('io');
    io.emit('flood-report-updated', { flood });
    
    res.json({
      message: 'Flood report updated successfully',
      flood
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a flood report
export const deleteFloodReport = async (req, res) => {
  try {
    const flood = await Flood.findById(req.params.id);
    
    if (!flood) {
      return res.status(404).json({ message: 'Flood report not found' });
    }
    
    await flood.remove();
    
    // Emit flood report deleted event via socket.io
    const io = req.app.get('io');
    io.emit('flood-report-deleted', { floodId: req.params.id });
    
    res.json({ message: 'Flood report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get high-risk flood areas
export const getHighRiskFloodAreas = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Get flood reports with high or severe severity
    const floodData = await Flood.find({
      $or: [
        { severity: { $in: ['high', 'severe'] } },
        { riskLevel: 'high' },
        { isPassable: false }
      ]
    })
    .sort({ recordedAt: -1 })
    .skip(skip)
    .limit(limit);
    
    const total = await Flood.countDocuments({
      $or: [
        { severity: { $in: ['high', 'severe'] } },
        { riskLevel: 'high' },
        { isPassable: false }
      ]
    });
    
    res.json({
      floodData,
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

// Get flood statistics by LGA
export const getFloodStatsByLGA = async (req, res) => {
  try {
    const stats = await Flood.aggregate([
      {
        $group: {
          _id: '$lga',
          count: { $sum: 1 },
          highSeverityCount: {
            $sum: {
              $cond: [
                { $in: ['$severity', ['high', 'severe']] },
                1,
                0
              ]
            }
          },
          impassableCount: {
            $sum: {
              $cond: [
                { $eq: ['$isPassable', false] },
                1,
                0
              ]
            }
          },
          avgWaterLevel: { $avg: '$waterLevel' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Simulate flood data from weather data (for demo purposes)
export const simulateFloodData = async (req, res) => {
  try {
    // In a real implementation, this would fetch data from a flood monitoring API
    // For now, we'll simulate based on recent weather data
    
    // Get recent weather data with high precipitation
    const Weather = mongoose.model('Weather');
    const recentWeather = await Weather.find({
      rainfall: { $gt: 10 }, // More than 10mm of rain
      recordedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });
    
    const createdFloods = [];
    
    for (const weather of recentWeather) {
      // Simulate flood severity based on rainfall
      let severity = 'low';
      if (weather.rainfall > 30) severity = 'severe';
      else if (weather.rainfall > 20) severity = 'high';
      else if (weather.rainfall > 15) severity = 'moderate';
      
      // Create a simulated flood report
      const flood = new Flood({
        locationName: `${weather.city} Area`,
        lga: weather.lga || 'Unknown',
        coordinates: {
          lat: weather.coordinates.lat,
          lng: weather.coordinates.lng
        },
        severity,
        waterLevel: Math.round(weather.rainfall * 2), // Simulated water level
        cause: 'Heavy rainfall',
        affectedRoads: ['Main road', 'Side streets'], // Simulated
        durationEstimate: 'Until rain stops',
        riskLevel: severity === 'severe' ? 'high' : severity === 'high' ? 'moderate' : 'low',
        isPassable: severity !== 'severe',
        advisoryMessage: severity === 'severe' ? 
          'Avoid this area, roads are impassable' : 
          'Exercise caution when traveling through this area',
        source: 'Simulated from weather data'
      });
      
      await flood.save();
      createdFloods.push(flood);
    }
    
    // Emit flood reports via socket.io
    const io = req.app.get('io');
    io.emit('flood-simulation-complete', {
      message: `Created ${createdFloods.length} flood reports based on recent weather data`,
      floods: createdFloods
    });
    
    res.json({
      message: `Created ${createdFloods.length} flood reports based on recent weather data`,
      createdFloods
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};