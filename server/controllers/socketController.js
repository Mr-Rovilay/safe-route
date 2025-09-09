import axios from "axios";
import dotenv from "dotenv";
import { z } from "zod";
import { socketAuthenticate } from "../middleware/auth.js";
import Flood from "../models/FloodSchema.js";
import Alert from "../models/AlertSchema.js";
import Trip from "../models/TripSchema.js";
import Ride from "../models/RideSchema.js";

dotenv.config();

// Store active intervals and user locations
const activeIntervals = new Map();
const userLocations = new Map();

// Zod schemas for validation
const floodReportSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  description: z.string(),
  severity: z.enum(["low", "moderate", "high"]),
  lga: z.string(),
});

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  lga: z.string().optional(),
});

const hotspotSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number().default(5000),
  lga: z.string().optional(),
});

export const initSockets = (io) => {
  io.use(socketAuthenticate);

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.user.userId}`);
    socket.join(`user:${socket.user.userId}`);

    // Join LGA room if provided later via update-location
    socket.on("update-location", async (data) => {
      try {
        const { latitude, longitude, lga } = locationSchema.parse(data);
        userLocations.set(socket.user.userId, { latitude, longitude, lga });

        if (lga) socket.join(lga);

        const latGrid = Math.floor(latitude / 0.01);
        const lngGrid = Math.floor(longitude / 0.01);
        socket.join(`location:${latGrid}:${lngGrid}`);

        console.log(`User ${socket.user.userId} at ${latitude}, ${longitude}, LGA: ${lga || "none"}`);

        // Check for nearby alerts
        await sendProximityAlerts(io, { latitude, longitude, lga }, socket.user.userId);
      } catch (error) {
        const message = error instanceof z.ZodError ? error.errors.map((e) => e.message).join(", ") : error.message;
        console.error(`Update location error for ${socket.user.userId}:`, message);
        socket.emit("error", { message: "Failed to update location", error: message });
      }
    });

    // Submit flood report
    socket.on("submit-flood-report", async (data) => {
      try {
        const { latitude, longitude, description, severity, lga } = floodReportSchema.parse(data);

        const flood = new Flood({
          userId: socket.user.userId,
          lga,
          locationName: data.locationName || "Unknown",
          coordinates: { type: "Point", coordinates: [longitude, latitude] },
          severity,
          advisoryMessage: description,
          affectedRoads: [],
          recordedAt: new Date(),
        });

        await flood.save();

        const alert = new Alert({
          createdBy: socket.user.userId,
          lga,
          type: "flood",
          description: `Flood reported: ${description}`,
          location: { type: "Point", coordinates: [longitude, latitude] },
          severity,
          distanceTrigger: 1000,
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await alert.save();
        await alert.populate("createdBy", "username email");

        io.to(lga || "Lagos Mainland").emit("alertCreated", { alert });
        await sendProximityAlerts(io, { latitude, longitude, lga, alertId: alert._id }, socket.user.userId);

        socket.emit("reportConfirmed", {
          message: "Flood report submitted and alert created",
          reportId: flood._id,
          alertId: alert._id,
        });
      } catch (error) {
        const message = error instanceof z.ZodError ? error.errors.map((e) => e.message).join(", ") : error.message;
        console.error(`Flood report error for ${socket.user.userId}:`, message);
        socket.emit("error", { message: "Failed to submit flood report", error: message });
      }
    });

    // Get nearby flood hotspots
    socket.on("get-nearby-hotspots", async (data) => {
      try {
        const { latitude, longitude, radius, lga } = hotspotSchema.parse(data);

        const alerts = await Alert.find({
          location: {
            $near: {
              $geometry: { type: "Point", coordinates: [longitude, latitude] },
              $maxDistance: radius,
            },
          },
          type: "flood",
          triggered: false,
          $or: [{ validUntil: { $gt: new Date() } }, { validUntil: { $exists: false } }],
          ...(lga && { lga }),
        })
          .populate("createdBy", "username email")
          .sort({ severity: -1 })
          .limit(10);

        socket.emit("nearbyHotspots", {
          message: "Nearby flood hotspots retrieved successfully",
          hotspots: alerts,
        });
      } catch (error) {
        const message = error instanceof z.ZodError ? error.errors.map((e) => e.message).join(", ") : error.message;
        console.error(`Nearby hotspots error for ${socket.user.userId}:`, message);
        socket.emit("error", { message: "Failed to fetch nearby hotspots", error: message });
      }
    });

    // Admin broadcast for system alerts
    socket.on("admin-broadcast", async (data) => {
      try {
        const { message, severity, lga, adminToken } = z
          .object({
            message: z.string(),
            severity: z.enum(["low", "medium", "high"]).default("medium"),
            lga: z.string(),
            adminToken: z.string(),
          })
          .parse(data);

        if (adminToken !== process.env.ADMIN_TOKEN) {
          return socket.emit("error", { message: "Invalid admin token" });
        }

        const alert = new Alert({
          createdBy: socket.user.userId,
          lga,
          type: "route",
          description: message,
          location: { type: "Point", coordinates: [3.3792, 6.5244] }, // Default to Lagos center
          severity,
          distanceTrigger: 5000,
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        await alert.save();
        io.to(lga).emit("alertCreated", { alert });
      } catch (error) {
        const message = error instanceof z.ZodError ? error.errors.map((e) => e.message).join(", ") : error.message;
        console.error(`Admin broadcast error for ${socket.user.userId}:`, message);
        socket.emit("error", { message: "Failed to broadcast alert", error: message });
      }
    });

    // Periodic weather alerts
    const rainInterval = setInterval(async () => {
      try {
        const userLocation = userLocations.get(socket.user.userId);
        if (!userLocation) return;

        const { latitude, longitude, lga } = userLocation;
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`
        );

        const forecast = response.data.list[0];
        const rain = forecast.rain ? forecast.rain["3h"] : 0;

        if (rain > 1) {
          const alert = {
            message: `Rain expected (${rain}mm in next 3 hours) in ${lga || "Lagos"}`,
            severity: rain > 5 ? "high" : "medium",
            timestamp: new Date(),
          };
          socket.emit("rainAlertUpdate", alert);

          const dbAlert = new Alert({
            createdBy: socket.user.userId,
            lga: lga || "Lagos Mainland",
            type: "weather",
            description: alert.message,
            location: { type: "Point", coordinates: [longitude, latitude] },
            severity: alert.severity,
            distanceTrigger: 1000,
            validUntil: new Date(Date.now() + 3 * 60 * 60 * 1000),
          });
          await dbAlert.save();
          io.to(lga || "Lagos Mainland").emit("alertCreated", { alert: dbAlert });
        }
      } catch (error) {
        console.error(`Periodic rain alert error for ${socket.user.userId}:`, error.message);
      }
    }, 300000);

    activeIntervals.set(socket.id, rainInterval);

    socket.on("disconnect", () => {
      const interval = activeIntervals.get(socket.id);
      if (interval) {
        clearInterval(interval);
        activeIntervals.delete(socket.id);
      }
      userLocations.delete(socket.user.userId);
      console.log(`User disconnected: ${socket.user.userId}`);
    });
  });

  // Cleanup stale user locations
  setInterval(() => {
    const threshold = Date.now() - 30 * 60 * 1000; // 30 minutes
    for (const [userId, location] of userLocations.entries()) {
      if (!location.lastUpdated || location.lastUpdated < threshold) {
        userLocations.delete(userId);
      }
    }
  }, 600000); // 10 minutes
};

// Helper function to send proximity alerts
async function sendProximityAlerts(io, { latitude, longitude, lga, alertId }, currentUserId) {
  const reportCoords = [longitude, latitude];
  const alerts = alertId
    ? await Alert.findById(alertId).populate("createdBy", "username email")
    : await Alert.find({
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: reportCoords },
            $maxDistance: 5000,
          },
        },
        triggered: false,
        $or: [{ validUntil: { $gt: new Date() } }, { validUntil: { $exists: false } }],
        ...(lga && { lga }),
      })
        .populate("createdBy", "username email")
        .sort({ severity: -1 });

  for (const [userId, userLocation] of userLocations.entries()) {
    if (userId === currentUserId) continue;

    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      reportCoords[1],
      reportCoords[0]
    ) * 1000; // Convert to meters

    if (distance <= 5000) {
      const alertData = Array.isArray(alerts) ? alerts.find((a) => a.severity === "high") || alerts[0] : alerts;
      if (alertData) {
        io.to(`user:${userId}`).emit("proximityFloodAlert", {
          alert: alertData,
          distance,
          message: `Flood alert ${distance.toFixed(2)} meters from your location`,
        });

        // Notify active trips
        const trips = await Trip.find({
          userId,
          status: "active",
          lga: lga || { $exists: true },
        });
        for (const trip of trips) {
          trip.alerts.push({
            message: `Flood alert near ${alertData.description}: ${distance.toFixed(2)} meters away`,
            type: "flood",
            severity: alertData.severity,
            timestamp: new Date(),
          });
          await trip.save();
          io.to(`trip:${trip._id}`).emit("tripAlerts", { tripId: trip._id, alerts: [alertData] });
        }

        // Notify active rides
        const rides = await Ride.find({
          $or: [
            { createdBy: userId },
            { passengers: userId },
            { driver: userId },
          ],
          status: { $in: ["accepted", "in_progress"] },
          lga: lga || { $exists: true },
        });
        for (const ride of rides) {
          io.to(`ride:${ride._id}`).emit("rideAlerts", {
            rideId: ride._id,
            alerts: [
              {
                message: `Flood alert near ${alertData.description}: ${distance.toFixed(2)} meters away`,
                type: "flood",
                severity: alertData.severity,
                timestamp: new Date(),
              },
            ],
          });
        }
      }
    }
  }
}

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}