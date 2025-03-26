// profiles/middleware/upload.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Erstelle den Upload-Ordner, falls er nicht existiert
const uploadDir = path.join(__dirname, '../../uploads/profileImages');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Konfiguration für die Speicherung von Dateien
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    // Dateiname: userID + Zeitstempel + originale Dateierweiterung
    const userId = req.user.id; // Annahme: req.user wird von der Auth-Middleware gesetzt
    const timestamp = Date.now();
    const fileExt = path.extname(file.originalname);
    cb(null, `${userId}_${timestamp}${fileExt}`);
  }
});

// Filter für Dateitypen (nur Bilder zulassen)
const fileFilter = (req, file, cb) => {
  // Erlaubte MIME-Typen
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Ungültiges Dateiformat. Nur JPG, PNG, GIF und WEBP sind erlaubt.'), false);
  }
};

// Multer-Upload-Konfiguration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB Maximale Dateigröße
  }
});

module.exports = upload;