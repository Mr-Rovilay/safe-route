import mongoose from "mongoose";
import "dotenv/config";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("MongoDB Connected to database");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

export default connectDB;