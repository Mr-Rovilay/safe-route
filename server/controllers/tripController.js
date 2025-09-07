import Trip from '../models/TripSchema.js';
import User from '../models/UserSchema.js';

// Create a new trip
export const createTrip = async (req, res) => {
  try {
    const { 
      origin, 
      destination, 
      route = [],
      estimatedTime 
    } = req.body;
    
    // Validate required fields
    if (!origin || !destination || !origin.coordinates || !destination.coordinates) {
      return res.status(400).json({ message: 'Origin and destination with coordinates are required' });
    }
    
    // Create new trip
    const trip = new Trip({
      userId: req.user._id,
      origin,
      destination,
      route,
      estimatedTime
    });
    
    await trip.save();
    
    // Populate user reference
    await trip.populate('userId', 'username email profilePicture');
    
    res.status(201).json({
      message: 'Trip created successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all trips for a user (with pagination and filtering)
export const getUserTrips = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    
    let query = { userId: req.user._id };
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    const trips = await Trip.find(query)
      .populate('userId', 'username email profilePicture')
      .sort({ recordedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Trip.countDocuments(query);
    
    res.json({
      trips,
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

// Get a single trip by ID
export const getTripById = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id)
      .populate('userId', 'username email profilePicture');
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to view this trip
    if (trip.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this trip' });
    }
    
    res.json({ trip });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a trip
export const updateTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to update this trip
    if (trip.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this trip' });
    }
    
    const { 
      origin, 
      destination, 
      route, 
      status,
      estimatedTime,
      actualTime
    } = req.body;
    
    // Update fields if provided
    if (origin) trip.origin = origin;
    if (destination) trip.destination = destination;
    if (route) trip.route = route;
    if (status) trip.status = status;
    if (estimatedTime) trip.estimatedTime = estimatedTime;
    if (actualTime) trip.actualTime = actualTime;
    
    await trip.save();
    
    // Populate user reference
    await trip.populate('userId', 'username email profilePicture');
    
    res.json({
      message: 'Trip updated successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a trip
export const deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to delete this trip
    if (trip.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this trip' });
    }
    
    await trip.remove();
    
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Start a trip
export const startTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to start this trip
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to start this trip' });
    }
    
    // Check if trip is already started or completed
    if (trip.status === 'active') {
      return res.status(400).json({ message: 'Trip is already active' });
    }
    
    if (trip.status === 'completed') {
      return res.status(400).json({ message: 'Trip is already completed' });
    }
    
    // Update trip status and start time
    trip.status = 'active';
    trip.startedAt = new Date();
    await trip.save();
    
    // Update user's current ride status
    const user = await User.findById(req.user._id);
    user.isOnTrip = true;
    await user.save();
    
    // Emit trip started event via socket.io
    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('trip-started', {
      tripId: trip._id,
      startedAt: trip.startedAt
    });
    
    res.json({
      message: 'Trip started successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Complete a trip
export const completeTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to complete this trip
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to complete this trip' });
    }
    
    // Check if trip is already completed or not started
    if (trip.status === 'completed') {
      return res.status(400).json({ message: 'Trip is already completed' });
    }
    
    if (trip.status === 'planned') {
      return res.status(400).json({ message: 'Trip has not started yet' });
    }
    
    // Calculate actual time if not provided
    let actualTime = req.body.actualTime;
    if (!actualTime && trip.startedAt) {
      actualTime = Math.round((new Date() - trip.startedAt) / 60000); // in minutes
    }
    
    // Update trip status and end time
    trip.status = 'completed';
    trip.endedAt = new Date();
    trip.actualTime = actualTime;
    await trip.save();
    
    // Update user's current ride status
    const user = await User.findById(req.user._id);
    user.isOnTrip = false;
    await user.save();
    
    // Emit trip completed event via socket.io
    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('trip-completed', {
      tripId: trip._id,
      endedAt: trip.endedAt,
      actualTime: trip.actualTime
    });
    
    res.json({
      message: 'Trip completed successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel a trip
export const cancelTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to cancel this trip
    if (trip.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to cancel this trip' });
    }
    
    // Check if trip is already completed or cancelled
    if (trip.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel a completed trip' });
    }
    
    if (trip.status === 'cancelled') {
      return res.status(400).json({ message: 'Trip is already cancelled' });
    }
    
    // Update trip status
    trip.status = 'cancelled';
    await trip.save();
    
    // If trip was active, update user's current ride status
    if (trip.status === 'active') {
      const user = await User.findById(req.user._id);
      user.isOnTrip = false;
      await user.save();
    }
    
    // Emit trip cancelled event via socket.io
    const io = req.app.get('io');
    io.to(`user:${req.user._id}`).emit('trip-cancelled', {
      tripId: trip._id
    });
    
    res.json({
      message: 'Trip cancelled successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add an alert to a trip
export const addAlert = async (req, res) => {
  try {
    const { message, type, severity = 'info' } = req.body;
    
    if (!message || !type) {
      return res.status(400).json({ message: 'Message and type are required' });
    }
    
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to add alerts to this trip
    if (trip.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to add alerts to this trip' });
    }
    
    // Add alert
    trip.alerts.push({
      message,
      type,
      severity,
      timestamp: new Date()
    });
    
    await trip.save();
    
    // Emit alert event via socket.io
    const io = req.app.get('io');
    io.to(`user:${trip.userId}`).emit('trip-alert', {
      tripId: trip._id,
      alert: {
        message,
        type,
        severity,
        timestamp: new Date()
      }
    });
    
    res.json({
      message: 'Alert added successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update trip route data (for real-time updates during trip)
export const updateRouteData = async (req, res) => {
  try {
    const { route } = req.body;
    
    if (!route || !Array.isArray(route)) {
      return res.status(400).json({ message: 'Valid route array is required' });
    }
    
    const trip = await Trip.findById(req.params.id);
    
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    
    // Check if user has permission to update this trip
    if (trip.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this trip' });
    }
    
    // Update route data
    trip.route = route;
    await trip.save();
    
    // Emit route update event via socket.io
    const io = req.app.get('io');
    io.to(`user:${trip.userId}`).emit('route-updated', {
      tripId: trip._id,
      route
    });
    
    res.json({
      message: 'Route data updated successfully',
      trip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};