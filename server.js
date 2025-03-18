const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http'); // NEU: HTTP-Modul für WebSockets
const { initWebSocket } = require('./WebSocket/websocket'); // NEU: WebSocket-Modul importieren


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
// CORS-Konfiguration
app.use(cors({
  origin: [
    'http://localhost:4200',                     // Lokale Entwicklung
    'https://frontend-r4x5k.ondigitalocean.app', // Digital Ocean Frontend
    'https://supperchat.com',                    // Eigene Domain
    'https://www.supperchat.com',                // Mit www-Präfix
    'https://deepepoch.ai',                      // Neue Domain - hinzufügen
    'https://www.deepepoch.ai'                   // Neue Domain mit www - hinzufügen
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
      '/api/messages/*',
      '/api/chats/*'  // Neuer Chat-Endpunkt hinzugefügt
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

// Token-Logging Middleware für Debugging
const tokenLogger = (req, res, next) => {
  console.log('---- TOKEN LOGGER MIDDLEWARE ----');
  console.log('Request URL:', req.url);
  console.log('Request Method:', req.method);
  
  // Authorization Header überprüfen
  const authHeader = req.headers.authorization;
  console.log('Authorization Header vorhanden:', !!authHeader);
  
  if (authHeader) {
    // Token extrahieren (ohne es zu modifizieren)
    const parts = authHeader.split(' ');
    console.log('Authorization Header Format:', parts.length === 2 ? 'Korrekt (Bearer + Token)' : 'Inkorrekt');
    
    if (parts.length === 2) {
      const [bearer, token] = parts;
      console.log('Prefix:', bearer);
      
      // Nur die ersten und letzten 10 Zeichen des Tokens anzeigen (Sicherheit)
      if (token.length > 20) {
        const tokenPreview = token.substring(0, 10) + '...' + token.substring(token.length - 10);
        console.log('Token (Ausschnitt):', tokenPreview);
        console.log('Token Länge:', token.length);
      } else {
        console.log('Token zu kurz:', token.length);
      }
      
      // Optionaler Teil: Basisanalyse des Tokens ohne Verifizierung
      try {
        if (token.split('.').length === 3) {
          // Sieht wie ein JWT aus
          const [header, payload] = token.split('.').slice(0, 2).map(part => {
            // Basis64-URL zu Basis64 konvertieren (für Buffer.from)
            const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
            // Padding hinzufügen wenn nötig
            const paddedBase64 = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
            return JSON.parse(Buffer.from(paddedBase64, 'base64').toString());
          });
          console.log('Token Header:', header);
          console.log('Token Payload (ohne Verifizierung):', payload);
          
          // Ablaufdatum prüfen
          if (payload.exp) {
            const expDate = new Date(payload.exp * 1000);
            console.log('Token Ablaufdatum:', expDate);
            console.log('Token abgelaufen?', expDate < new Date());
          }
          
          // ID prüfen
          console.log('Enthält id:', !!payload.id);
          console.log('Enthält userId:', !!payload.userId);
        }
      } catch (e) {
        console.log('Token-Analyse fehlgeschlagen:', e.message);
      }
    }
  }
  
  console.log('-------------------------');
  // Wichtig: next() aufrufen, um mit der nächsten Middleware fortzufahren
  next();
};

// API-Routen
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/google-auth'); // Neue Zeile für Google Auth
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes); // Neue Zeile für Google Auth

// Neue Messages-Routen hinzufügen
const messagesRoutes = require('./routes/messages');
app.use('/api/messages', messagesRoutes);

// Chat-Routen hinzufügen (NEU) - mit Token-Logger Middleware
const chatRoutes = require('./chats/routes/chat.routes');
app.use('/api/chats', tokenLogger, chatRoutes); // Token-Logger vor Chat-Routen

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

// NEU: Server mit HTTP-Modul erstellen (statt app.listen direkt)
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// NEU: WebSocket-Server initialisieren durch Import des Moduls
const io = initWebSocket(server);

// NEU: Server starten (mit server.listen statt app.listen)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Umgebung: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health-Check verfügbar unter: /health`);
  console.log('WebSocket-Server ist aktiv'); // NEU: WebSocket-Info
  
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