import Alert from '../models/AlertSchema.js';
import Ride from '../models/RideSchema.js';
import Trip from '../models/TripSchema.js';

// Get all alerts (with pagination and filtering)
export const getAllAlerts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type;
    const severity = req.query.severity;
    const triggered = req.query.triggered;
    const rideId = req.query.rideId;
    const near = req.query.near; // Format: lng,lat,distance
    
    let query = {};
    
    // Filter by type if provided
    if (type) {
      query.type = type;
    }
    
    // Filter by severity if provided
    if (severity) {
      query.severity = severity;
    }
    
    // Filter by triggered status if provided
    if (triggered === 'true') {
      query.triggered = true;
    } else if (triggered === 'false') {
      query.triggered = false;
    }
    
    // Filter by ride ID if provided
    if (rideId) {
      query.ride = rideId;
    }
    
    // Filter by location if near parameter is provided
    if (near) {
      const [lng, lat, distance] = near.split(',').map(Number);
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: distance || 1000 // Default 1km
        }
      };
    }
    
    const alerts = await Alert.find(query)
      .populate('ride', 'status pickupLocation dropoffLocation')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Alert.countDocuments(query);
    
    res.json({
      alerts,
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

// Get a single alert by ID
export const getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('ride', 'status pickupLocation dropoffLocation');
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    res.json({ alert });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new alert
export const createAlert = async (req, res) => {
  try {
    const { 
      ride,
      type,
      description,
      location,
      severity,
      distanceTrigger,
      validUntil
    } = req.body;
    
    // Validate required fields
    if (!type || !description || !location || !location.coordinates) {
      return res.status(400).json({ 
        message: 'Type, description, and location with coordinates are required' 
      });
    }
    
    // Create new alert
    const alert = new Alert({
      ride,
      type,
      description,
      location: {
        type: 'Point',
        coordinates: location.coordinates
      },
      severity,
      distanceTrigger,
      validUntil
    });
    
    await alert.save();
    
    // Populate ride reference if exists
    await alert.populate('ride', 'status pickupLocation dropoffLocation');
    
    // Emit alert created event via socket.io
    const io = req.app.get('io');
    
    // If alert is linked to a ride, emit to ride room
    if (alert.ride) {
      io.to(`ride:${alert.ride._id}`).emit('alert-created', { alert });
    }
    
    // Emit to general alerts room
    io.emit('new-alert', { alert });
    
    res.status(201).json({
      message: 'Alert created successfully',
      alert
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update an alert
export const updateAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    const { 
      ride,
      type,
      description,
      location,
      severity,
      distanceTrigger,
      validUntil,
      triggered
    } = req.body;
    
    // Update fields if provided
    if (ride !== undefined) alert.ride = ride;
    if (type) alert.type = type;
    if (description) alert.description = description;
    if (location && location.coordinates) {
      alert.location = {
        type: 'Point',
        coordinates: location.coordinates
      };
    }
    if (severity) alert.severity = severity;
    if (distanceTrigger !== undefined) alert.distanceTrigger = distanceTrigger;
    if (validUntil) alert.validUntil = validUntil;
    if (triggered !== undefined) alert.triggered = triggered;
    
    await alert.save();
    
    // Populate ride reference if exists
    await alert.populate('ride', 'status pickupLocation dropoffLocation');
    
    // Emit alert updated event via socket.io
    const io = req.app.get('io');
    
    // If alert is linked to a ride, emit to ride room
    if (alert.ride) {
      io.to(`ride:${alert.ride._id}`).emit('alert-updated', { alert });
    }
    
    // Emit to general alerts room
    io.emit('alert-updated', { alert });
    
    res.json({
      message: 'Alert updated successfully',
      alert
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete an alert
export const deleteAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    
    // Store ride ID before deletion for socket event
    const rideId = alert.ride;
    
    await alert.remove();
    
    // Emit alert deleted event via socket.io
    const io = req.app.get('io');
    
    // If alert was linked to a ride, emit to ride room
    if (rideId) {
      io.to(`ride:${rideId}`).emit('alert-deleted', { alertId: req.params.id });
    }
    
    // Emit to general alerts room
    io.emit('alert-deleted', { alertId: req.params.id });
    
    res.json({ message: 'Alert deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get alerts near a location
export const getAlertsNearLocation = async (req, res) => {
  try {
    const { lng, lat, distance = 1000 } = req.query; // Distance in meters
    
    if (!lng || !lat) {
      return res.status(400).json({ 
        message: 'Longitude and latitude are required' 
      });
    }
    
    const alerts = await Alert.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(distance)
        }
      },
      triggered: false // Only get alerts that haven't been triggered yet
    })
    .populate('ride', 'status pickupLocation dropoffLocation')
    .sort({ severity: -1 }); // Higher severity first
    
    res.json({ alerts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check and trigger alerts for a trip
export const checkTripAlerts = async (req, res) => {
  try {
    const { tripId } = req.params;
    
    // Get trip details
    const trip = await Trip.findById(tripId);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to access this trip
    if (trip.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to access this trip' });
    }
    
    // Get alerts near the trip's current location
    // For this example, we'll use the origin coordinates
    // In a real app, you would use the user's current location
    const currentLocation = trip.origin.coordinates;
    
    const alerts = await Alert.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [currentLocation.lng, currentLocation.lat]
          },
          $maxDistance: 5000 // 5km radius
        }
      },
      triggered: false,
      $or: [
        { validUntil: { $gt: new Date() } },
        { validUntil: { $exists: false } }
      ]
    })
    .populate('ride', 'status pickupLocation dropoffLocation')
    .sort({ severity: -1 });
    
    // Process alerts to check if they should be triggered
    const triggeredAlerts = [];
    
    for (const alert of alerts) {
      // Calculate distance between current location and alert
      const distance = calculateDistance(
        currentLocation.lat, currentLocation.lng,
        alert.location.coordinates[1], alert.location.coordinates[0]
      );
      
      // Check if alert should be triggered based on distance
      if (distance <= alert.distanceTrigger) {
        alert.triggered = true;
        await alert.save();
        
        triggeredAlerts.push(alert);
        
        // Add alert to trip
        trip.alerts.push({
          message: alert.description,
          type: alert.type,
          severity: alert.severity,
          timestamp: new Date()
        });
      }
    }
    
    // Save trip with new alerts
    await trip.save();
    
    // Emit triggered alerts via socket.io
    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('trip-alerts', {
      tripId,
      alerts: triggeredAlerts
    });
    
    res.json({
      message: 'Trip alerts checked successfully',
      triggeredAlerts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check and trigger alerts for a ride
export const checkRideAlerts = async (req, res) => {
  try {
    const { rideId } = req.params;
    
    // Get ride details
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to access this ride
    const isParticipant = 
      ride.createdBy.toString() === req.user._id.toString() ||
      ride.passengers.some(p => p.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver.toString() === req.user._id.toString());
    
    if (!isParticipant && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to access this ride' });
    }
    
    // Get alerts near the ride's current location
    // For this example, we'll use the pickup location
    // In a real app, you would use the vehicle's current location
    const currentLocation = ride.pickupLocation.coordinates;
    
    const alerts = await Alert.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [currentLocation[0], currentLocation[1]]
          },
          $maxDistance: 5000 // 5km radius
        }
      },
      triggered: false,
      $or: [
        { validUntil: { $gt: new Date() } },
        { validUntil: { $exists: false } }
      ]
    })
    .populate('ride', 'status pickupLocation dropoffLocation')
    .sort({ severity: -1 });
    
    // Process alerts to check if they should be triggered
    const triggeredAlerts = [];
    
    for (const alert of alerts) {
      // Calculate distance between current location and alert
      const distance = calculateDistance(
        currentLocation[1], currentLocation[0],
        alert.location.coordinates[1], alert.location.coordinates[0]
      );
      
      // Check if alert should be triggered based on distance
      if (distance <= alert.distanceTrigger) {
        alert.triggered = true;
        await alert.save();
        
        triggeredAlerts.push(alert);
      }
    }
    
    // Emit triggered alerts via socket.io
    const io = req.app.get('io');
    io.to(`ride:${rideId}`).emit('ride-alerts', {
      rideId,
      alerts: triggeredAlerts
    });
    
    res.json({
      message: 'Ride alerts checked successfully',
      triggeredAlerts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function to calculate distance between two coordinates
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};