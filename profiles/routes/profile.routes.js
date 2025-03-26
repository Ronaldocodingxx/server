// profiles/routes/profile.routes.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const upload = require('../middleware/upload.middleware');

// Korrigierter Import der Auth-Middleware (Standard-Import, nicht destructured)
const verifyToken = require('../../middleware/auth');

// Profilrouten mit Authentifizierung
// Eigenes Profil abrufen
router.get('/me', verifyToken, profileController.getProfile);

// Profil eines bestimmten Benutzers abrufen
router.get('/:userId', profileController.getProfile);

// Profilbild hochladen (Datei-Upload)
router.post(
  '/image/upload',
  verifyToken,
  upload.single('profileImage'),
  profileController.uploadProfileImage
);

// Profilbild hochladen (Base64)
router.post(
  '/image/upload/base64',
  verifyToken,
  profileController.uploadProfileImageBase64
);

// Profilbild löschen
router.delete(
  '/image',
  verifyToken,
  profileController.deleteProfileImage
);

// Profiltext aktualisieren
router.put(
  '/text',
  verifyToken,
  profileController.updateProfileText
);

module.exports = router;