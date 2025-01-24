import jwt from 'jsonwebtoken';  
import User from "../models/user.js";

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    const token = authHeader ? authHeader.replace("Bearer ", "") : null;

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    console.log("Received token:", token); 

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.user.id);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Authentication error:", err);
    return res.status(401).json({
      error: "Invalid token",
      details: err.message,
      type: err.name
    });
  }
};

export default auth;
