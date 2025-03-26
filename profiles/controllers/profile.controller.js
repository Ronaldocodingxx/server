// profiles/controllers/profile.controller.js
const Profile = require('../models/profile');
const fs = require('fs');
const path = require('path');

// Konstante für die maximale Textlänge
const MAX_PROFILE_TEXT_LENGTH = 2000;

/**
 * Profil eines Benutzers abrufen
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.params.userId || req.userId;
    
    // Profil suchen oder erstellen, wenn keines existiert
    let profile = await Profile.findOne({ user: userId });
    
    if (!profile) {
      profile = new Profile({
        user: userId
      });
      await profile.save();
    }
    
    // Pfad zu URL konvertieren, falls Bild vorhanden
    if (profile.profileImage && !profile.profileImage.startsWith('http') && !profile.profileImage.startsWith('data:')) {
      const imagePath = profile.profileImage;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      profile = profile.toObject();
      profile.profileImage = `${baseUrl}/uploads/profileImages/${path.basename(imagePath)}`;
    }
    
    res.status(200).json(profile);
  } catch (error) {
    console.error('Fehler beim Abrufen des Profils:', error);
    res.status(500).json({ message: 'Serverfehler beim Abrufen des Profils' });
  }
};

/**
 * Profilbild hochladen
 */
exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Keine Datei hochgeladen' });
    }
    
    const userId = req.userId;
    
    // Profil suchen oder erstellen
    let profile = await Profile.findOne({ user: userId });
    
    if (!profile) {
      profile = new Profile({
        user: userId
      });
    }
    
    // Altes Profilbild löschen, falls vorhanden
    if (profile.profileImage && !profile.profileImage.startsWith('data:') && !profile.profileImage.startsWith('http')) {
      const oldImagePath = profile.profileImage;
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    // Neues Profilbild speichern
    profile.profileImage = req.file.path;
    profile.lastUpdated = Date.now();
    await profile.save();
    
    // Pfad zu URL konvertieren für die Antwort
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/profileImages/${path.basename(req.file.path)}`;
    
    res.status(200).json({
      message: 'Profilbild erfolgreich hochgeladen',
      profileImage: imageUrl
    });
  } catch (error) {
    console.error('Fehler beim Hochladen des Profilbilds:', error);
    res.status(500).json({ message: 'Serverfehler beim Hochladen des Profilbilds' });
  }
};

/**
 * Hochladen eines Profilbilds als Base64-String
 */
exports.uploadProfileImageBase64 = async (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ message: 'Kein Bild-Daten übermittelt' });
    }
    
    if (!imageData.startsWith('data:image/')) {
      return res.status(400).json({ message: 'Ungültiges Bildformat. Nur Base64-Bilder sind erlaubt.' });
    }
    
    const userId = req.userId;
    
    // Profil suchen oder erstellen
    let profile = await Profile.findOne({ user: userId });
    
    if (!profile) {
      profile = new Profile({
        user: userId
      });
    }
    
    // Altes Profilbild löschen, falls vorhanden und es ist ein Dateipfad
    if (profile.profileImage && !profile.profileImage.startsWith('data:') && !profile.profileImage.startsWith('http')) {
      const oldImagePath = profile.profileImage;
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    // Base64-String direkt speichern
    profile.profileImage = imageData;
    profile.lastUpdated = Date.now();
    await profile.save();
    
    res.status(200).json({
      message: 'Profilbild erfolgreich hochgeladen',
      profileImage: imageData
    });
  } catch (error) {
    console.error('Fehler beim Hochladen des Base64-Profilbilds:', error);
    res.status(500).json({ message: 'Serverfehler beim Hochladen des Profilbilds' });
  }
};

/**
 * Profilbild löschen
 */
exports.deleteProfileImage = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Profil suchen
    const profile = await Profile.findOne({ user: userId });
    
    if (!profile) {
      return res.status(404).json({ message: 'Profil nicht gefunden' });
    }
    
    // Bild löschen, falls es ein Dateipfad ist
    if (profile.profileImage && !profile.profileImage.startsWith('data:') && !profile.profileImage.startsWith('http')) {
      const imagePath = profile.profileImage;
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    // Profilbild-Referenz zurücksetzen
    profile.profileImage = null;
    profile.lastUpdated = Date.now();
    await profile.save();
    
    res.status(200).json({ message: 'Profilbild erfolgreich gelöscht' });
  } catch (error) {
    console.error('Fehler beim Löschen des Profilbilds:', error);
    res.status(500).json({ message: 'Serverfehler beim Löschen des Profilbilds' });
  }
};

/**
 * Profiltext aktualisieren
 */
exports.updateProfileText = async (req, res) => {
  try {
    const { profileText } = req.body;
    const userId = req.userId;
    
    if (!profileText) {
      return res.status(400).json({ message: 'Kein Profiltext übermittelt' });
    }
    
    // NEUE ÜBERPRÜFUNG: Textlänge überprüfen
    if (profileText.length > MAX_PROFILE_TEXT_LENGTH) {
      return res.status(400).json({ 
        message: `Profiltext zu lang. Maximal ${MAX_PROFILE_TEXT_LENGTH} Zeichen erlaubt.`,
        current: profileText.length,
        max: MAX_PROFILE_TEXT_LENGTH
      });
    }
    
    // Profil suchen oder erstellen
    let profile = await Profile.findOne({ user: userId });
    
    if (!profile) {
      profile = new Profile({
        user: userId
      });
    }
    
    // Profiltext aktualisieren
    profile.profileText = profileText;
    profile.lastUpdated = Date.now();
    
    try {
      await profile.save();
      res.status(200).json({
        message: 'Profiltext erfolgreich aktualisiert',
        profileText: profile.profileText
      });
    } catch (validationError) {
      // Mongoose-Validierungsfehler abfangen (z.B. wenn maxlength überschritten wird)
      if (validationError.name === 'ValidationError') {
        return res.status(400).json({
          message: validationError.message,
          errors: validationError.errors
        });
      }
      throw validationError; // Andere Fehler weiterwerfen
    }
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Profiltexts:', error);
    res.status(500).json({ message: 'Serverfehler beim Aktualisieren des Profiltexts' });
  }
};