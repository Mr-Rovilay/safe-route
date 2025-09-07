import multer from 'multer';
import pkg from 'cloudinary';
import { cloudinary } from '../config/cloudinary.js';

// Create a memory storage for multer
const storage = multer.memoryStorage();
const { DataBuffer } = pkg;

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Initialize multer with storage and file filter
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter,
});

// Function to upload image to Cloudinary
export const uploadToCloudinary = async (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'saferoute/profile_pictures',
        transformation: [
          { width: 500, height: 500, crop: 'limit' },
          { quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    
    uploadStream.end(buffer);
  });
};

// Middleware to handle single image upload
export const uploadSingleImage = upload.single('profilePicture');

export default upload;