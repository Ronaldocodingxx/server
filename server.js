const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Env-Variablen laden
dotenv.config();

// Überprüfe wichtige Umgebungsvariablen
const checkRequiredEnvVars = () => {
  const requiredVars = [
    'JWT_SECRET',
    'MONGO_URI',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'GOOGLE_CLIENT_ID'  // Neue Variable für Google OAuth
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`WARNUNG: Fehlende Umgebungsvariablen: ${missingVars.join(', ')}`);
    return false;
  }
  
  return true;
};

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

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Root-Route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'API Server läuft',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/api/auth/*',
      '/api/messages/*'
    ]
  });
});

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

// API-Routen
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/google-auth'); // Neue Zeile für Google Auth
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes); // Neue Zeile für Google Auth

// Neue Messages-Routen hinzufügen
const messagesRoutes = require('./routes/messages');
app.use('/api/messages', messagesRoutes);

// Statischen Ordner für Frontend-Dateien (falls benötigt)
if (process.env.NODE_ENV === 'production') {
  // Statische Dateien bereitstellen
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Catch-All Route nach allen anderen definierten Routen
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
} else {
  // Catch-All für nicht definierte Routen im Entwicklungsmodus
  app.use((req, res) => {
    res.status(404).json({
      message: 'Route nicht gefunden',
      path: req.originalUrl
    });
  });
}

// Server starten
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Umgebung: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health-Check verfügbar unter: /health`);
  
  // Überprüfe Umgebungsvariablen
  const envCheck = checkRequiredEnvVars();
  if (!envCheck) {
    console.warn('Server läuft, aber einige Funktionen könnten aufgrund fehlender Umgebungsvariablen nicht richtig funktionieren.');
  }
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM empfangen. Server wird heruntergefahren...');
  server.close(() => {
    console.log('Server beendet.');
    mongoose.connection.close(false, () => {
      console.log('MongoDB-Verbindung geschlossen.');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT empfangen. Server wird heruntergefahren...');
  server.close(() => {
    console.log('Server beendet.');
    mongoose.connection.close(false, () => {
      console.log('MongoDB-Verbindung geschlossen.');
      process.exit(0);
    });
  });
});