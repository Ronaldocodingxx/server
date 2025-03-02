const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Env-Variablen laden
dotenv.config();

// Express-App erstellen
const app = express();

// CORS-Konfiguration
app.use(cors({
  origin: [
    'http://localhost:4200',                     // Lokale Entwicklung
    'https://frontend-r4x5k.ondigitalocean.app', // Digital Ocean Frontend
    'https://supperchat.com',                    // Eigene Domain
    'https://www.supperchat.com'                 // Mit www-Präfix
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON- und URL-kodierte Bodies verarbeiten
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route - WICHTIG: Dies muss VOR der Catch-All-Route stehen
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// API-Routen
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// MongoDB-Verbindung
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auth-app';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB verbunden'))
  .catch(err => {
    console.error('MongoDB Verbindungsfehler:', err);
    // Versuche wieder zu verbinden
    setTimeout(() => {
      mongoose.connect(MONGO_URI);
    }, 5000);
  });

// Statischen Ordner für Frontend-Dateien (falls benötigt)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Catch-All Route NACH Health-Check und API-Routen
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Umgebung: ${process.env.NODE_ENV || 'development'}`);
});