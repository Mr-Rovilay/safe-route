import express from 'express';
import { register, login, getMe, updateProfile, updateLocation, uploadProfilePicture, setCurrentRide, clearCurrentRide } from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';
import { uploadSingleImage } from '../middleware/upload.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', async (req, res) => {
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
  res.status(200).json({ message: 'Logged out successfully' });
});
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/location', protect, updateLocation);
router.post('/upload-profile-picture', protect, uploadSingleImage, uploadProfilePicture);
router.put('/current-ride', protect, setCurrentRide);
router.delete('/current-ride', protect, clearCurrentRide);

export default router;