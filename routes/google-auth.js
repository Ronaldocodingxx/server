const express = require('express');
const router = express.Router();
const { verifyGoogleToken, processGoogleLogin } = require('../google-out'); // Pfad angepasst

/**
 * Google OAuth Login Route
 * Erwartet ein Google ID-Token im Request-Body
 */
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Google-Token fehlt' 
      });
    }
    
    // Google-Token verifizieren
    const googleUserData = await verifyGoogleToken(token);
    
    // Login verarbeiten oder Nutzer erstellen
    const userData = await processGoogleLogin(googleUserData);
    
    res.status(200).json({
      success: true,
      message: 'Google-Login erfolgreich',
      data: userData
    });
  } catch (error) {
    console.error('Google-Auth-Fehler:', error);
    res.status(401).json({ 
      success: false, 
      message: error.message || 'Authentifizierung fehlgeschlagen' 
    });
  }
});

module.exports = router;