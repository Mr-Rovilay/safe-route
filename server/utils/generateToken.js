import jwt from "jsonwebtoken";

export const generateToken = (res, userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || true, // Force secure in dev for sameSite: "none"
    sameSite: process.env.NODE_ENV === "production" ? "none" : "none", // Use "none" for cross-origin
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/", // Ensure cookie is available across all routes
  });

  return token; // Optionally return token for response body if needed
};