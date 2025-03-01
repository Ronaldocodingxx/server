const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet'); // Zusätzliche Sicherheitsheader
const winston = require('winston'); // Verbessertes Logging

// Express App erstellen
const app = express();
const PORT = process.env.PORT || 3000;

// Fortschrittliche Logging-Konfiguration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Middleware
app.use(helmet()); // Setzt Sicherheitsheader
app.use(cors({
  origin: [
    'http://localhost:4200', 
    'https://server-uv6jp.ondigitalocean.app',
    // Fügen Sie hier weitere erlaubte Origins hinzu
    /\.ondigitalocean\.app$/  // Regex für DigitalOcean-Subdomains
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Globale Fehler-Middleware
app.use((err, req, res, next) => {
  logger.error(`Unbehandelter Fehler: ${err.message}`);
  res.status(500).json({
    message: 'Ein interner Serverfehler ist aufgetreten',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// MongoDB Verbindung mit verbesserter Fehlerbehandlung
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://doadmin:N2tc591wjX436D0f@mongodb-4c0ff5ca.mongo.ondigitalocean.com/admin?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => logger.info('MongoDB erfolgreich verbunden'))
.catch(err => {
  logger.error('MongoDB Verbindungsfehler:', err);
  process.exit(1); // Beendet den Prozess bei Verbindungsfehler
});

// Verbesserte Schema-Definition
const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Nachrichtentext ist erforderlich'],
    trim: true,
    minlength: [1, 'Nachricht muss mindestens 1 Zeichen lang sein'],
    maxlength: [500, 'Nachricht darf maximal 500 Zeichen lang sein']
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true // Verhindert Änderungen am Erstellungsdatum
  },
  // Optional: Metadaten hinzufügen
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true, // Fügt automatisch createdAt und updatedAt hinzu
  optimisticConcurrency: true // Verbesserte Nebenläufigkeitskontrolle
});

// Validierungsmiddleware
messageSchema.pre('save', function(next) {
  // Zusätzliche Validierungen können hier hinzugefügt werden
  next();
});

const Message = mongoose.model('Message', messageSchema);

// API-Endpunkte mit verbesserter Fehlerbehandlung
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .limit(50); // Begrenzt die Anzahl der zurückgegebenen Nachrichten
    
    logger.info(`Nachrichten abgerufen: ${messages.length}`);
    res.json(messages);
  } catch (err) {
    logger.error('Fehler beim Abrufen von Nachrichten:', err);
    res.status(500).json({ 
      message: 'Fehler beim Abrufen der Nachrichten',
      error: process.env.NODE_ENV !== 'production' ? err.message : {}
    });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { text } = req.body;
    
    // Erweiterte Validierung
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Nachrichtentext ist erforderlich und darf nicht leer sein' 
      });
    }

    const message = new Message({ 
      text: text.trim(),
      metadata: {
        source: req.get('origin') || 'unknown',
        userAgent: req.get('User-Agent')
      }
    });

    await message.save();
    
    logger.info(`Neue Nachricht gespeichert: ${message._id}`);
    res.status(201).json({
      message: 'Nachricht erfolgreich gespeichert',
      data: message
    });
  } catch (err) {
    logger.error('Fehler beim Speichern der Nachricht:', err);
    
    // Differenzierte Fehlerbehandlung
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validierungsfehler',
        errors: Object.values(err.errors).map(e => e.message)
      });
    }

    res.status(500).json({ 
      message: 'Fehler beim Speichern der Nachricht',
      error: process.env.NODE_ENV !== 'production' ? err.message : {}
    });
  }
});

// Basisroute für API-Test
app.get('/', (req, res) => {
  res.json({
    message: 'API ist betriebsbereit',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Behandlung nicht gefundener Routen
app.use((req, res, next) => {
  res.status(404).json({
    message: 'Route nicht gefunden',
    path: req.path
  });
});

// Server starten
const server = app.listen(PORT, () => {
  logger.info(`Server läuft auf Port ${PORT}`);
  logger.info(`Umgebung: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM empfangen. Server wird heruntergefahren...');
  server.close(() => {
    logger.info('HTTP-Server geschlossen');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB-Verbindung geschlossen');
      process.exit(0);
    });
  });
});