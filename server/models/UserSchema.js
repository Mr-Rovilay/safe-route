import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Please enter a valid email",
    ],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [8, "Password must be at least 8 characters"],
    match: [
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      "Password must include uppercase, lowercase, number, and special character",
    ],
    select: false,
  },
  username: {
    type: String,
    required: [true, "Username is required"],
    trim: true,
  },

  // Gender (for ride-sharing preference)
  gender: { type: String, enum: ["male", "female", "other"] },

  phoneNumber: {
    type: String,
    match: [/^\+?\d{10,14}$/, "Please enter a valid phone number"],
  },
  profilePicture: {
    type: String,
    default: null,
  },

  // Safety + KYC
  isVerified: { type: Boolean, default: false },
  verificationDocument: { type: String }, // e.g. link to ID stored in cloud

  // Location tracking
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], index: "2dsphere" }, // [lng, lat]
  },
  // In the userSchema, add this field
  searchHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Search" }],

  // Ride-hailing / Carpool fields
  isOnTrip: { type: Boolean, default: false }, // whether currently in a ride
  currentRideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ride",
    default: null,
  }, // reference to Ride collection

  // Optional user settings
  preferences: {
    notifications: { type: Boolean, default: true },
    darkMode: { type: Boolean, default: false },
  },

  createdAt: { type: Date, default: Date.now },
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model("User", userSchema);
export default User;
