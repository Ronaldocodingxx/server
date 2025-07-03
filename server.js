const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http'); // HTTP-Modul für WebSockets
const { initWebSocket } = require('./WebSocket/websocket'); // Bestehendes WebSocket-Modul
const { initChatWebSocketV2 } = require('./WebSocket/chat-websocket'); // NEU: V2 WebSocket-Modul

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

// CORS-Konfiguration - AKTUALISIERT FÜR CORDOVA
app.use(cors({
  origin: function (origin, callback) {
    // Liste erlaubter Origins
    const allowedOrigins = [
      'http://localhost:4200',
      'https://neufrontend-ptfjz.ondigitalocean.app',
      'https://supperchat.com',
      'https://www.supperchat.com',
      'https://deepepoch.ai',
      'https://www.deepepoch.ai',
      'http://localhost:8080',  // Cordova Browser
      'http://10.0.2.2:8080',   // Android Emulator
      'http://localhost:*',      // Alle localhost Ports
      'file://',                 // Cordova File Protocol
      'http://localhost',        // Cordova iOS
      'https://localhost',       // ← NEU HINZUGEFÜGT! Cordova Android HTTPS
      'https://localhost:*'      // ← NEU! Alle HTTPS localhost Ports
    ];
    
    // Cordova sendet manchmal keinen Origin-Header
    if (!origin) return callback(null, true);
    
    // Prüfe ob Origin erlaubt ist
    if (allowedOrigins.some(allowed => {
      // Exakte Übereinstimmung oder Wildcard-Check
      if (allowed.includes('*')) {
        // Ersetze * mit einem Regex-Pattern
        const pattern = allowed.replace('*', '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return origin === allowed || origin.startsWith(allowed);
    })) {
      return callback(null, true);
    }
    
    // Für Entwicklung: Alle Origins erlauben
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // Log für Debugging in Production
    console.log('CORS blocked origin:', origin);
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true  // Wichtig für Cookies/Sessions
}));

// JSON- und URL-kodierte Bodies verarbeiten
app.use(express.json({ limit: '10mb' })); // Erhöhtes Limit für Base64-Bilder
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    websocket: {
      v1: 'active',
      v2: 'active on /chat-v2'
    }
  });
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
      '/api/chats/*',
      '/api/profiles/*'
    ],
    websocket: {
      v1: 'Standard WebSocket System',
      v2: 'Erweitertes Chat System auf /chat-v2'
    }
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
const googleAuthRoutes = require('./routes/google-auth');
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);

// Messages-Routen
const messagesRoutes = require('./routes/messages');
app.use('/api/messages', messagesRoutes);

// Chat-Routen
const chatRoutes = require('./chats/routes/chat.routes');
app.use('/api/chats', tokenLogger, chatRoutes);

// NEU: Profil-Routen hinzufügen
const profileRoutes = require('./profiles/routes/profile.routes');
app.use('/api/profiles', tokenLogger, profileRoutes);

// NEU: Statischen Ordner für Profilbilder bereitstellen
app.use('/uploads/profileImages', express.static(path.join(__dirname, 'uploads/profileImages')));

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

// Server mit HTTP-Modul erstellen (statt app.listen direkt)
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// === WEBSOCKET INITIALISIERUNG ===
// 1. Bestehendes WebSocket-System (bleibt unverändert)
const io = initWebSocket(server);

// 2. NEU: Erweitertes Chat-WebSocket V2 System
try {
  const chatNamespaceV2 = initChatWebSocketV2(io);
  console.log('✅ Chat-WebSocket V2 System aktiviert');
} catch (error) {
  console.error('❌ Fehler beim Initialisieren von Chat-WebSocket V2:', error);
}

// Server starten (mit server.listen statt app.listen)
server.listen(PORT, '0.0.0.0', () => {
  console.log('===========================================');
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  console.log(`📍 Umgebung: ${process.env.NODE_ENV || 'development'}`);
  console.log(`❤️  Health-Check: http://localhost:${PORT}/health`);
  console.log('===========================================');
  console.log('📡 WebSocket Systeme:');
  console.log('   ✅ V1 (Standard): ws://localhost:' + PORT);
  console.log('   ✅ V2 (Erweitert): ws://localhost:' + PORT + '/chat-v2');
  console.log('===========================================');
  console.log('🖼️  Profilbild-System ist aktiv');
  console.log('===========================================');
  
  // Überprüfe Umgebungsvariablen
  const envCheck = checkRequiredEnvVars();
  if (!envCheck) {
    console.warn('⚠️  Server läuft, aber einige Funktionen könnten aufgrund fehlender Umgebungsvariablen nicht richtig funktionieren.');
  }
});

// Variable um mehrfache Shutdowns zu verhindern
let isShuttingDown = false;

// Graceful Shutdown - KORRIGIERT
process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\nSIGTERM empfangen. Server wird heruntergefahren...');
  
  // Timeout für erzwungenes Beenden nach 10 Sekunden
  setTimeout(() => {
    console.error('Erzwungenes Beenden nach Timeout');
    process.exit(1);
  }, 10000);
  
  server.close(async () => {
    console.log('HTTP Server geschlossen.');
    
    try {
      await mongoose.connection.close();
      console.log('MongoDB Verbindung geschlossen.');
      console.log('Server beendet.');
      process.exit(0);
    } catch (error) {
      console.error('Fehler beim Schließen:', error);
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('\nSIGINT empfangen. Server wird heruntergefahren...');
  
  // Timeout für erzwungenes Beenden nach 10 Sekunden
  setTimeout(() => {
    console.error('Erzwungenes Beenden nach Timeout');
    process.exit(1);
  }, 10000);
  
  server.close(async () => {
    console.log('HTTP Server geschlossen.');
    
    try {
      await mongoose.connection.close();
      console.log('MongoDB Verbindung geschlossen.');
      console.log('Server beendet.');
      process.exit(0);
    } catch (error) {
      console.error('Fehler beim Schließen:', error);
      process.exit(1);
    }
  });
});

// Unhandled Rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Server nicht sofort beenden, nur loggen
});

// Uncaught Exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});