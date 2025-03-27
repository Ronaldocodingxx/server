// profiles/routes/profile.routes.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const upload = require('../middleware/upload.middleware');
const path = require('path');
const Profile = require('../models/profile');

// Korrigierter Import der Auth-Middleware (Standard-Import, nicht destructured)
const verifyToken = require('../../middleware/auth');

// Profilrouten mit Authentifizierung
// Eigenes Profil abrufen
router.get('/me', verifyToken, profileController.getProfile);

// Profil eines bestimmten Benutzers abrufen
router.get('/:userId', profileController.getProfile);

// NEU: Nur das Profilbild eines Benutzers abrufen (öffentlich)
router.get('/avatar/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Profil suchen
    const profile = await Profile.findOne({ user: userId });
    
    if (!profile || !profile.profileImage) {
      return res.status(404).json({ message: 'Kein Profilbild gefunden' });
    }
    
    // Pfad zu URL konvertieren, falls nötig
    let imageUrl = profile.profileImage;
    
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      imageUrl = `${baseUrl}/uploads/profileImages/${path.basename(imageUrl)}`;
    }
    
    // Cache-Header setzen (24 Stunden)
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // Nur das Bild zurückgeben, keine anderen Profilinformationen
    res.status(200).json({ profileImage: imageUrl });
  } catch (error) {
    console.error('Fehler beim Abrufen des Profilbilds:', error);
    res.status(500).json({ message: 'Serverfehler beim Abrufen des Profilbilds' });
  }
});

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