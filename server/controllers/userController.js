import bcrypt from 'bcryptjs';
import User from '../models/UserSchema.js';
import dotenv from 'dotenv';
import { generateToken } from '../utils/generateToken.js';
import { uploadToCloudinary } from '../middleware/upload.js';
import mongoose from 'mongoose';

dotenv.config();

// Register
export const register = async (req, res) => {
  const { email, password, username, gender, phoneNumber } = req.body;
  
  try {
    // Validate required fields
    if (!email || !password || !username) {
      return res.status(400).json({ 
        message: 'Please provide email, password, and username' 
      });  
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Check if username is taken
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: 'Username is already taken' });
    }
    
    // Create new user with all provided fields
    const user = new User({ 
      email, 
      password,
      username,
      gender,
      phoneNumber
    });
    
    await user.save();
    
    // Generate token and set cookie
    generateToken(res, user._id);
    
    // Return user data without sensitive information
    res.status(201).json({ 
      message: 'User registered successfully',
      user: { 
        _id: user._id, 
        email: user.email,
        username: user.username,
        gender: user.gender,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        preferences: user.preferences,
        location: user.location,
        isOnTrip: user.isOnTrip,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: err.message });
  }
};

// Login
export const login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }
    
    // Find user and explicitly select password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate token and set cookie
    generateToken(res, user._id);
    
    // Return user data without sensitive information
    res.status(200).json({
      message: 'Login successful',
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        gender: user.gender,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        preferences: user.preferences,
        location: user.location,
        isOnTrip: user.isOnTrip,
        currentRideId: user.currentRideId,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Upload profile picture
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Upload image to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer);
    
    // Find user
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Delete old profile picture if exists
    if (user.profilePicture) {
      const publicId = user.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`saferoute/profile_pictures/${publicId}`);
    }
    
    // Update user with new profile picture URL
    user.profilePicture = result.secure_url;
    await user.save();
    
    res.json({
      message: 'Profile picture uploaded successfully',
      profilePicture: user.profilePicture
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ message: 'Error uploading profile picture' });
  }
};

// Update the getMe function to include profile picture
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      _id: user._id,
      email: user.email,
      username: user.username,
      gender: user.gender,
      phoneNumber: user.phoneNumber,
      isVerified: user.isVerified,
      verificationDocument: user.verificationDocument,
      profilePicture: user.profilePicture, // Added profile picture
      preferences: user.preferences,
      location: user.location,
      isOnTrip: user.isOnTrip,
      currentRideId: user.currentRideId,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const { username, gender, phoneNumber, preferences } = req.body;
    
    // Find user
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update fields if provided
    if (username) {
      // Check if username is taken by another user
      if (username !== user.username) {
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
          return res.status(400).json({ message: 'Username is already taken' });
        }
        user.username = username;
      }
    }
    
    if (gender) user.gender = gender;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };
    
    await user.save();
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        gender: user.gender,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        preferences: user.preferences,
        location: user.location,
        isOnTrip: user.isOnTrip,
        currentRideId: user.currentRideId,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: err.message });
  }
};

// Update user location
export const updateLocation = async (req, res) => {
  try {
    const { coordinates } = req.body; // [lng, lat]
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ 
        message: 'Please provide valid coordinates [longitude, latitude]' 
      });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    user.location = {
      type: 'Point',
      coordinates
    };
    
    await user.save();
    
    res.json({
      message: 'Location updated successfully',
      location: user.location
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update user to set current ride
export const setCurrentRide = async (req, res) => {
  try {
    const { rideId } = req.body;
    
    if (!rideId) {
      return res.status(400).json({ message: 'Ride ID is required' });
    }
    
    // Verify the ride exists and user is part of it
    const Ride = mongoose.model('Ride'); // Dynamic import to avoid circular dependency
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if user is creator, passenger, or driver of the ride
    const isParticipant = 
      ride.createdBy.toString() === req.user._id.toString() ||
      ride.passengers.some(p => p.toString() === req.user._id.toString()) ||
      (ride.driver && ride.driver.toString() === req.user._id.toString());
    
    if (!isParticipant) {
      return res.status(403).json({ message: 'User is not a participant in this ride' });
    }
    
    // Update user's current ride and trip status
    const user = await User.findById(req.user._id);
    user.currentRideId = rideId;
    user.isOnTrip = true;
    await user.save();
    
    res.json({
      message: 'Current ride updated successfully',
      currentRideId: user.currentRideId,
      isOnTrip: user.isOnTrip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Clear user's current ride (when ride ends)
export const clearCurrentRide = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.currentRideId) {
      return res.status(400).json({ message: 'User is not currently on a ride' });
    }
    
    // Clear current ride and trip status
    const previousRideId = user.currentRideId;
    user.currentRideId = null;
    user.isOnTrip = false;
    await user.save();
    
    res.json({
      message: 'Current ride cleared successfully',
      previousRideId,
      isOnTrip: user.isOnTrip
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};