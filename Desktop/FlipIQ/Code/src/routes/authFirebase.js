// backend/src/routes/authFirebase.js
"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const { adminAuth } = require("../firebaseAdmin");
const User = require("../models/user"); // adapte si ton model a un autre nom/fichier

const router = express.Router();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.jwt_secret;
  if (!secret) throw new Error("JWT_SECRET manquant");
  return secret;
}

router.post("/firebase/exchange", async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: "idToken_requis" });

    const decoded = await adminAuth.verifyIdToken(idToken);

    if (!decoded.email) return res.status(400).json({ ok: false, error: "email_manquant" });
    if (decoded.email_verified === false)
      return res.status(403).json({ ok: false, error: "email_non_verifie" });

    const email = String(decoded.email).toLowerCase();

    let user = await User.findOne({ email });

    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString("hex");
      const hash = await bcrypt.hash(randomPassword, 10);

      user = await User.create({
        email,
        password: hash,
        name: decoded.name || "",
        firebaseUid: decoded.uid,
      });
    } else if (!user.firebaseUid) {
      user.firebaseUid = decoded.uid;
      await user.save();
    }

    const token = jwt.sign(
      { sub: String(user._id), email: user.email, role: user.role || "user" },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    return res.json({ ok: true, token });
  } catch (e) {
    console.error("firebase exchange error:", e);
    return res.status(401).json({ ok: false, error: "token_invalide" });
  }
});

module.exports = router;
