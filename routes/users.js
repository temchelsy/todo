import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import dotenv from "dotenv";
import registerValidator from "../utils/registerValidator.js";
import loginValidator from "../utils/loginValidator.js";
import auth from "../middleware/auth.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import passport from "passport";

dotenv.config();
const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post("/register", registerValidator, async (req, res, next) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email address." });
    }

    const verificationToken = crypto.randomBytes(20).toString("hex");
    const verificationTokenExpires = Date.now() + 3600000;

    const user = new User({
      username,
      email,
      password,
      verificationToken,
      verificationTokenExpires,
    });

    await user.save();

    const verificationUrl = `https://todo-fn88.onrender.com/verify-email/${verificationToken}`;

    await transporter.sendMail({
      to: user.email,
      subject: "Verify Your Email Address",
      html: `<h2>Welcome to Our Platform</h2>
             <p>Click the link below to verify your email:</p>
             <p><a href="${verificationUrl}">Verify Email</a></p>`,
    });

    res.status(201).json({
      message: "Registration successful! Check your email to verify your account.",
    });
  } catch (err) {
    console.error("Registration error:", err);
    next(err);
  }
});

router.post('/verify-email/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'The verification token is invalid or has expired. Please request a new one.',
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    const payload = { user: { id: user.id } };
    const jwtToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      success: true,
      message: 'Your email has been successfully verified!',
      token: jwtToken,
    });
  } catch (error) {
    console.error('Verification error:', error);
    next(error);
  }
});

router.post("/resend-verification-code", async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email address." });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Your email is already verified." });
    }

    const verificationToken = crypto.randomBytes(20).toString("hex");
    const verificationTokenExpires = Date.now() + 3600000;
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    const verificationUrl = `https://todo-client-ashen.vercel.app/verify-email/${verificationToken}`;

    await transporter.sendMail({
      to: user.email,
      subject: "Verify Your Email Address",
      html: `<h2>Email Verification</h2>
             <p>Click the link below to verify your email:</p>
             <p><a href="${verificationUrl}">Verify Email</a></p>`,
    });

    res.json({ message: "A new verification email has been sent to your inbox." });
  } catch (error) {
    console.error("Error resending verification code:", error);
    next(error);
  }
});

router.post("/login", loginValidator, async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Incorrect email or password." });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect email or password." });
    }

    const payload = { user: { id: user.id } };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    user.refreshToken = refreshToken;
    await user.save();

    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error("Login error:", err);
    next(err);
  }
});

router.post("/refresh-token", async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: "A refresh token is required." });
  }

  try {
    const user = await User.findOne({ refreshToken });
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }

    jwt.verify(refreshToken, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Invalid refresh token." });
      }

      const payload = { user: { id: decoded.user.id } };
      const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "7h",
      });

      res.json({ accessToken: newAccessToken });
    });
  } catch (err) {
    console.error("Token refresh error:", err);
    next(err);
  }
});

router.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    message: err.message || "An unexpected error occurred. Please try again later.",
  });
});

export default router;
