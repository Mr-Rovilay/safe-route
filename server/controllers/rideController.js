import Ride from "../models/RideSchema.js";

// Create a new ride
export const createRide = async (req, res) => {
  try {
    const { 
      pickupLocation, 
      dropoffLocation, 
      passengers = [], 
      driver,
      route,
      liveTracking = true 
    } = req.body;
    
    // Validate required fields
    if (!pickupLocation || !dropoffLocation || !pickupLocation.coordinates || !dropoffLocation.coordinates) {
      return res.status(400).json({ message: 'Pickup and dropoff locations with coordinates are required' });
    }
    
    // Create new ride
    const ride = new Ride({
      createdBy: req.user._id,
      pickupLocation: {
        type: 'Point',
        coordinates: pickupLocation.coordinates
      },
      dropoffLocation: {
        type: 'Point',
        coordinates: dropoffLocation.coordinates
      },
      passengers,
      driver,
      route,
      liveTracking
    });
    
    await ride.save();
    
    // Populate references for response
    await ride.populate('createdBy', 'username email profilePicture');
    if (ride.driver) {
      await ride.populate('driver', 'username email profilePicture');
    }
    if (ride.passengers.length > 0) {
      await ride.populate('passengers', 'username email profilePicture');
    }
    
    res.status(201).json({
      message: 'Ride created successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all rides (with pagination and filtering)
export const getAllRides = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    
    let query = {};
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    }
    
    // If user is not admin, only show rides they created or participate in
    if (req.user.role !== 'admin') {
      query.$or = [
        { createdBy: req.user._id },
        { passengers: req.user._id },
        { driver: req.user._id }
      ];
    }
    
    const rides = await Ride.find(query)
      .populate('createdBy', 'username email profilePicture')
      .populate('driver', 'username email profilePicture')
      .populate('passengers', 'username email profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Ride.countDocuments(query);
    
    res.json({
      rides,
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

// Get a single ride by ID
export const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('createdBy', 'username email profilePicture')
      .populate('driver', 'username email profilePicture')
      .populate('passengers', 'username email profilePicture');
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to view this ride
    const hasPermission = 
      ride.createdBy._id.toString() === req.user._id.toString() ||
      ride.passengers.some(p => p._id.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver._id.toString() === req.user._id.toString()) ||
      req.user.role === 'admin';
    
    if (!hasPermission) {
      return res.status(403).json({ message: 'Not authorized to view this ride' });
    }
    
    res.json({ ride });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a ride
export const updateRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to update this ride
    if (ride.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this ride' });
    }
    
    const { 
      pickupLocation, 
      dropoffLocation, 
      passengers, 
      driver,
      status,
      route,
      liveTracking,
      startedAt,
      endedAt
    } = req.body;
    
    // Update fields if provided
    if (pickupLocation && pickupLocation.coordinates) {
      ride.pickupLocation = {
        type: 'Point',
        coordinates: pickupLocation.coordinates
      };
    }
    
    if (dropoffLocation && dropoffLocation.coordinates) {
      ride.dropoffLocation = {
        type: 'Point',
        coordinates: dropoffLocation.coordinates
      };
    }
    
    if (passengers) ride.passengers = passengers;
    if (driver) ride.driver = driver;
    if (status) ride.status = status;
    if (route) ride.route = route;
    if (liveTracking !== undefined) ride.liveTracking = liveTracking;
    if (startedAt) ride.startedAt = startedAt;
    if (endedAt) ride.endedAt = endedAt;
    
    await ride.save();
    
    // Populate references for response
    await ride.populate('createdBy', 'username email profilePicture');
    if (ride.driver) {
      await ride.populate('driver', 'username email profilePicture');
    }
    if (ride.passengers.length > 0) {
      await ride.populate('passengers', 'username email profilePicture');
    }
    
    res.json({
      message: 'Ride updated successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a ride
export const deleteRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to delete this ride
    if (ride.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this ride' });
    }
    
    await ride.remove();
    
    res.json({ message: 'Ride deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add a passenger to a ride
export const addPassenger = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to add passengers
    if (ride.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to add passengers to this ride' });
    }
    
    // Check if user is already a passenger
    if (ride.passengers.includes(userId)) {
      return res.status(400).json({ message: 'User is already a passenger' });
    }
    
    // Add passenger
    ride.passengers.push(userId);
    await ride.save();
    
    // Populate references for response
    await ride.populate('passengers', 'username email profilePicture');
    
    res.json({
      message: 'Passenger added successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove a passenger from a ride
export const removePassenger = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to remove passengers
    if (ride.createdBy.toString() !== req.user._id.toString() && 
        userId !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to remove this passenger' });
    }
    
    // Check if user is a passenger
    if (!ride.passengers.includes(userId)) {
      return res.status(400).json({ message: 'User is not a passenger' });
    }
    
    // Remove passenger
    ride.passengers = ride.passengers.filter(id => id.toString() !== userId);
    await ride.save();
    
    res.json({
      message: 'Passenger removed successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel a ride
export const cancelRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to cancel this ride
    if (ride.createdBy.toString() !== req.user._id.toString() && 
        (ride.driver && ride.driver.toString() !== req.user._id.toString()) && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to cancel this ride' });
    }
    
    // Check if ride is already completed or cancelled
    if (ride.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel a completed ride' });
    }
    
    if (ride.status === 'cancelled') {
      return res.status(400).json({ message: 'Ride is already cancelled' });
    }
    
    // Update ride status
    ride.status = 'cancelled';
    await ride.save();
    
    res.json({
      message: 'Ride cancelled successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Trigger emergency alert
export const triggerEmergencyAlert = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to trigger emergency for this ride
    const isParticipant = 
      ride.createdBy.toString() === req.user._id.toString() ||
      ride.passengers.some(p => p.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver.toString() === req.user._id.toString());
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to trigger emergency for this ride' });
    }
    
    // Check if emergency has already been notified
    if (ride.emergencyContactNotified) {
      return res.status(400).json({ message: 'Emergency contacts have already been notified' });
    }
    
    // Get user details for emergency contact
    const user = await User.findById(req.user._id);
    
    // Here you would implement the actual notification logic
    // This could include:
    // 1. Sending SMS to emergency contacts
    // 2. Sending email notifications
    // 3. Notifying emergency services
    // 4. Push notifications to other users in the ride
    
    // For now, we'll just update the field
    ride.emergencyContactNotified = true;
    await ride.save();
    
    // Emit emergency event via socket.io
    const io = req.app.get('io');
    io.to(`ride:${ride._id}`).emit('emergency-alert', {
      rideId: ride._id,
      triggeredBy: {
        _id: user._id,
        username: user.username,
        profilePicture: user.profilePicture
      },
      timestamp: new Date(),
      location: user.location
    });
    
    res.json({
      message: 'Emergency alert triggered successfully',
      emergencyContactNotified: ride.emergencyContactNotified
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reset emergency notification status
export const resetEmergencyNotification = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to reset emergency status
    if (ride.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to reset emergency status' });
    }
    
    // Reset emergency notification status
    ride.emergencyContactNotified = false;
    await ride.save();
    
    res.json({
      message: 'Emergency notification status reset successfully',
      emergencyContactNotified: ride.emergencyContactNotified
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update startRide to set user's current ride
export const startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to start this ride
    if (ride.createdBy.toString() !== req.user._id.toString() && 
        (ride.driver && ride.driver.toString() !== req.user._id.toString()) && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to start this ride' });
    }
    
    // Check if ride is already started or completed
    if (ride.status === 'active') {
      return res.status(400).json({ message: 'Ride is already active' });
    }
    
    if (ride.status === 'completed') {
      return res.status(400).json({ message: 'Ride is already completed' });
    }
    
    // Update ride status and start time
    ride.status = 'active';
    ride.startedAt = new Date();
    await ride.save();
    
    // Set current ride for all participants
    const User = mongoose.model('User'); // Dynamic import to avoid circular dependency
    
    // Update creator
    await User.findByIdAndUpdate(ride.createdBy, {
      currentRideId: ride._id,
      isOnTrip: true
    });
    
    // Update driver if exists
    if (ride.driver) {
      await User.findByIdAndUpdate(ride.driver, {
        currentRideId: ride._id,
        isOnTrip: true
      });
    }
    
    // Update passengers
    if (ride.passengers.length > 0) {
      await User.updateMany(
        { _id: { $in: ride.passengers } },
        {
          currentRideId: ride._id,
          isOnTrip: true
        }
      );
    }
    
    // Emit ride started event via socket.io
    const io = req.app.get('io');
    io.to(`ride:${ride._id}`).emit('ride-started', {
      rideId: ride._id,
      startedAt: ride.startedAt
    });
    
    res.json({
      message: 'Ride started successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update completeRide to clear user's current ride
export const completeRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user has permission to complete this ride
    if (ride.createdBy.toString() !== req.user._id.toString() && 
        (ride.driver && ride.driver.toString() !== req.user._id.toString()) && 
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to complete this ride' });
    }
    
    // Check if ride is already completed or not started
    if (ride.status === 'completed') {
      return res.status(400).json({ message: 'Ride is already completed' });
    }
    
    if (ride.status === 'pending') {
      return res.status(400).json({ message: 'Ride has not started yet' });
    }
    
    // Update ride status and end time
    ride.status = 'completed';
    ride.endedAt = new Date();
    await ride.save();
    
    // Clear current ride for all participants
    const User = mongoose.model('User'); // Dynamic import to avoid circular dependency
    
    // Update creator
    await User.findByIdAndUpdate(ride.createdBy, {
      currentRideId: null,
      isOnTrip: false
    });
    
    // Update driver if exists
    if (ride.driver) {
      await User.findByIdAndUpdate(ride.driver, {
        currentRideId: null,
        isOnTrip: false
      });
    }
    
    // Update passengers
    if (ride.passengers.length > 0) {
      await User.updateMany(
        { _id: { $in: ride.passengers } },
        {
          currentRideId: null,
          isOnTrip: false
        }
      );
    }
    
    // Emit ride completed event via socket.io
    const io = req.app.get('io');
    io.to(`ride:${ride._id}`).emit('ride-completed', {
      rideId: ride._id,
      endedAt: ride.endedAt
    });
    
    res.json({
      message: 'Ride completed successfully',
      ride
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};