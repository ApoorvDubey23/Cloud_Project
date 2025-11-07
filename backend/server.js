// =============================================================
// VehicleTrack Cloud - Full System
// Real-time Tracking + Permission Flow + AWS S3 Storage
// =============================================================

import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import 'dotenv/config';
import cors from 'cors';

// -------------------- CONFIG --------------------
const PORT = process.env.PORT || 8000;
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const S3_BUCKET = process.env.S3_BUCKET;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";


if (!S3_BUCKET) {
  console.error("❌ ERROR: S3_BUCKET not set in environment.");
  process.exit(1);
}

const s3 = new S3Client({ region: AWS_REGION });

// -------------------- HELPERS --------------------
function streamToString(streamBody) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const s = streamBody instanceof Readable ? streamBody : Readable.from(streamBody);
    s.on("data", (c) => chunks.push(Buffer.from(c)));
    s.on("error", reject);
    s.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function putJSON(key, data) {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
}

async function getJSON(key, fallback = {}) {
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return JSON.parse(await streamToString(obj.Body));
  } catch {
    return fallback;
  }
}

const paths = {
  current: (v) => `vehicles/${v}/current.json`,
  history: (v, ts) => {
    const d = new Date(ts);
    return `vehicles/${v}/history/${d.getUTCFullYear()}/${String(
      d.getUTCMonth() + 1
    ).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${ts}.json`;
  },
  userPerm: (u) => `permissions/user/${u}.json`,
  vehPerm: (v) => `permissions/vehicle/${v}.json`,
};

// -------------------- AUTH HELPERS --------------------
function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
const atob = (str) => Buffer.from(str, "base64").toString("utf8");
function decodeFakeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

// -------------------- EXPRESS --------------------
const app = express();
app.use(bodyParser.json());
app.use(cors());
// -------------------- SOCKET.IO --------------------
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: "*" }, path: "/ws" });
const ns = io.of("/track");

// -------------------- PERMISSION HELPERS --------------------
async function updatePermission(vehicleId, userId, status) {
  const veh = await getJSON(paths.vehPerm(vehicleId), { pending: [], accepted: [] });
  const usr = await getJSON(paths.userPerm(userId), { pending: [], accepted: [] });

  if (status === "pending") {
    if (!veh.pending.includes(userId)) veh.pending.push(userId);
    if (!usr.pending.includes(vehicleId)) usr.pending.push(vehicleId);
  } else if (status === "accepted") {
    veh.pending = veh.pending.filter((u) => u !== userId);
    usr.pending = usr.pending.filter((v) => v !== vehicleId);
    if (!veh.accepted.includes(userId)) veh.accepted.push(userId);
    if (!usr.accepted.includes(vehicleId)) usr.accepted.push(vehicleId);
  }

  await putJSON(paths.vehPerm(vehicleId), veh);
  await putJSON(paths.userPerm(userId), usr);
  return { veh, usr };
}

// -------------------- SOCKET AUTH --------------------
ns.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  let payload = token && verifyJwt(token);
  if (!payload) payload = decodeFakeJwt(token);
  if (!payload || !payload.role || !payload.sub)
    return next(new Error("Unauthorized"));

  if (payload.role === "user")
    socket.data = { role: "user", userId: payload.sub };
  else socket.data = { role: "device", vehicleId: payload.sub };
  next();
});

// -------------------- SOCKET HANDLERS --------------------
const userSockets = new Map();
const vehicleSockets = new Map();

ns.on("connection", (socket) => {
  const role = socket.data.role;
  console.log("🔌 Connected:", socket.data);

  if (role === "user") {
    const uid = socket.data.userId;
    socket.join(`user:${uid}`);
    if (!userSockets.has(uid)) userSockets.set(uid, new Set());
    userSockets.get(uid).add(socket.id);
  } else if (role === "device") {
    const vid = socket.data.vehicleId;
    socket.join(`vehicle:${vid}`);
    if (!vehicleSockets.has(vid)) vehicleSockets.set(vid, new Set());
    vehicleSockets.get(vid).add(socket.id);
  }

  // === Device sends location update ===
  socket.on("location:update", async (data, ack) => {
    try {
      if (role !== "device") throw new Error("Only devices can send");
      const { vehicleId, lat, lng, speed } = data;
      const ts = Date.now();
      const payload = { vehicleId, lat, lng, speed, ts };

      await putJSON(paths.current(vehicleId), payload);
      await putJSON(paths.history(vehicleId, ts), payload);

      // notify all accepted users
      const vehPerm = await getJSON(paths.vehPerm(vehicleId));
      for (const uid of vehPerm.accepted || [])
        ns.to(`user:${uid}`).emit("location:live", payload);

      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // === User requests permission ===
  socket.on("location:request", async (data, ack) => {
    try {
      if (role !== "user") throw new Error("Only users can request");
      const { vehicleId } = data;
      if (!vehicleId) throw new Error("vehicleId required");

      await updatePermission(vehicleId, socket.data.userId, "pending");

      // notify the device
      ns.to(`vehicle:${vehicleId}`).emit("user:locationPermission", {
        userId: socket.data.userId,
        vehicleId,
        ts: Date.now(),
      });
      console.log("asking permission");
      
      ack?.({ ok: true, msg: "Permission request sent" });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  // === Device grants permission ===
  socket.on("permission:granted", async (data, ack) => {
    try {
      if (role !== "device") throw new Error("Only devices can approve");
      const { userId, vehicleId } = data;
      await updatePermission(vehicleId, userId, "accepted");
      ns.to(`user:${userId}`).emit("permission:granted", { vehicleId, userId });
      ack?.({ ok: true });
      console.log("granted permission");
      
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on("disconnect", () => {
    if (role === "user") userSockets.get(socket.data.userId)?.delete(socket.id);
    if (role === "device") vehicleSockets.get(socket.data.vehicleId)?.delete(socket.id);
  });
});
// -------------------- HISTORY FETCH --------------------
// Get vehicle location history (from S3)
app.get("/api/history/:vehicleId", async (req, res) => {
  console.log("📜 History request:", req.params, req.query);
  try {
    const { vehicleId } = req.params;
    const from = req.query.from ? Number(req.query.from) : null;
    const to = req.query.to ? Number(req.query.to) : null;

    const prefix = `vehicles/${vehicleId}/history/`;
    const keys = [];
    let token;

    do {
      const out = await s3.send(
        new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        })
      );

      for (const obj of out.Contents ?? []) {
        const match = obj.Key.match(/\/(\d+)\.json$/);
        if (match) {
          const ts = Number(match[1]);
          if ((!from || ts >= from) && (!to || ts <= to)) {
            keys.push({ key: obj.Key, ts });
          }
        }
      }

      token = out.IsTruncated ? out.NextContinuationToken : null;
    } while (token);

    keys.sort((a, b) => a.ts - b.ts);
    const results = [];
    for (const { key } of keys.slice(-2000)) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const text = await streamToString(obj.Body);
      results.push(JSON.parse(text));
    }
    console.log(`📜 History fetched: ${results.length} records, ${JSON.stringify(results.slice(-5), null, 2)}`);

    res.json({ ok: true, count: results.length, data: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// -------------------- REST APIs --------------------

// Health
app.get("/health", (_, res) => res.json({ ok: true }));

// Get user permissions
app.get("/api/user/:userId/permissions", async (req, res) => {
  const data = await getJSON(paths.userPerm(req.params.userId));
  res.json(data);
});

// Get vehicle permissions
app.get("/api/vehicle/:vehicleId/permissions", async (req, res) => {
  const data = await getJSON(paths.vehPerm(req.params.vehicleId));
  res.json(data);
});

// -------------------- START SERVER --------------------
server.listen(PORT, () =>
  console.log(`✅ VehicleTrack Cloud running on :${PORT}`)
);
