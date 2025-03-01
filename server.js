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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    }
  }
})); // Setzt Sicherheitsheader aber erlaubt inline Scripts für unsere Test-UI
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

// MongoDB Verbindung mit Wiederverbindungslogik
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://doadmin:N2tc591wjX436D0f@mongodb-4c0ff5ca.mongo.ondigitalocean.com/admin?retryWrites=true&w=majority';

// Verbindungsfunktion, die wiederverwendet werden kann
const connectToMongoDB = () => {
  mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    logger.info('MongoDB erfolgreich verbunden');
    // Server ist betriebsbereit mit Datenbank
  })
  .catch(err => {
    logger.error('MongoDB Verbindungsfehler:', err);
    logger.info('Server läuft weiter, versuche in 30 Sekunden erneut zu verbinden...');
    // Nach 30 Sekunden erneut versuchen zu verbinden
    setTimeout(connectToMongoDB, 30000);
  });
};

// Erste Verbindung herstellen
connectToMongoDB();

// Eventhandler für Verbindungsprobleme hinzufügen
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB getrennt. Versuche erneut zu verbinden...');
  setTimeout(connectToMongoDB, 10000);
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB Verbindungsfehler während des Betriebs:', err);
  // NICHT process.exit(1) aufrufen - lassen Sie den Server weiterlaufen
});

// MongoDB-Status-Endpunkt
app.get('/db-status', (req, res) => {
  const readyState = mongoose.connection.readyState;
  const states = {
    0: 'Getrennt',
    1: 'Verbunden',
    2: 'Verbindung wird hergestellt',
    3: 'Trennung wird durchgeführt'
  };
  
  res.json({
    status: readyState,
    statusText: states[readyState] || 'Unbekannt',
    connected: readyState === 1
  });
});

// Globaler unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unbehandelte Promise-Ablehnung:', reason);
  // Server NICHT beenden
});

process.on('uncaughtException', (error) => {
  logger.error('Nicht abgefangene Ausnahme:', error);
  // In Produktionsumgebungen könnte ein Neustart durch einen Process Manager (wie PM2) sinnvoll sein
  // Server läuft jedoch weiter
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

// API-Endpunkte mit verbesserter Fehlerbehandlung und try-catch
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

// HTML-Testoberfläche für MongoDB-Tests
app.get('/mongo-test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MongoDB Test-Interface</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          line-height: 1.6;
        }
        .container {
          display: flex;
          gap: 20px;
        }
        .panel {
          flex: 1;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          background-color: #f9f9f9;
        }
        h1 {
          color: #333;
          border-bottom: 2px solid #0077cc;
          padding-bottom: 10px;
        }
        h2 {
          color: #0077cc;
          margin-top: 0;
        }
        input, textarea, button {
          width: 100%;
          padding: 10px;
          margin: 8px 0;
          border-radius: 4px;
          border: 1px solid #ddd;
          box-sizing: border-box;
        }
        button {
          background-color: #0077cc;
          color: white;
          border: none;
          cursor: pointer;
          font-weight: bold;
        }
        button:hover {
          background-color: #005fa3;
        }
        #messages {
          margin-top: 20px;
          max-height: 400px;
          overflow-y: auto;
        }
        .message {
          background-color: white;
          border-left: 4px solid #0077cc;
          padding: 10px;
          margin-bottom: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .message-date {
          color: #777;
          font-size: 0.8em;
        }
        .status {
          padding: 10px;
          margin: 10px 0;
          border-radius: 4px;
        }
        .status.connected {
          background-color: #d4edda;
          border-left: 4px solid #28a745;
        }
        .status.disconnected {
          background-color: #f8d7da;
          border-left: 4px solid #dc3545;
        }
        .loading {
          text-align: center;
          padding: 20px;
        }
        #statusContainer {
          margin-bottom: 20px;
        }
      </style>
    </head>
    <body>
      <h1>MongoDB Test-Interface</h1>
      <div id="statusContainer"></div>
      
      <div class="container">
        <div class="panel">
          <h2>Nachricht senden</h2>
          <form id="messageForm">
            <label for="messageText">Nachrichtentext:</label>
            <textarea id="messageText" rows="4" required placeholder="Geben Sie Ihre Nachricht ein..."></textarea>
            <button type="submit">Nachricht senden</button>
          </form>
          <div id="sendStatus"></div>
        </div>
        
        <div class="panel">
          <h2>Nachrichten abrufen</h2>
          <button id="refreshButton">Nachrichten aktualisieren</button>
          <div id="messages">
            <div class="loading">Klicken Sie auf "Nachrichten aktualisieren", um Daten zu laden</div>
          </div>
        </div>
      </div>
      
      <script>
        // Funktion zur Überprüfung des Datenbankstatus
        async function checkDbStatus() {
          try {
            const response = await fetch('/db-status');
            const data = await response.json();
            
            const statusDiv = document.getElementById('statusContainer');
            if (data.connected) {
              statusDiv.innerHTML = '<div class="status connected">✅ Datenbankstatus: ' + data.statusText + '</div>';
            } else {
              statusDiv.innerHTML = '<div class="status disconnected">❌ Datenbankstatus: ' + data.statusText + '</div>';
            }
          } catch (error) {
            document.getElementById('statusContainer').innerHTML = 
              '<div class="status disconnected">❌ Fehler beim Abrufen des Datenbankstatus: ' + error.message + '</div>';
          }
        }
        
        // Funktion zum Senden einer Nachricht
        document.getElementById('messageForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const messageText = document.getElementById('messageText').value;
          document.getElementById('sendStatus').innerHTML = '<div class="loading">Nachricht wird gesendet...</div>';
          
          try {
            const response = await fetch('/api/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ text: messageText })
            });
            
            const result = await response.json();
            
            if (response.ok) {
              document.getElementById('sendStatus').innerHTML = 
                '<div class="status connected">✅ Nachricht erfolgreich gespeichert!</div>';
              document.getElementById('messageText').value = '';
              // Nachrichten nach dem Senden aktualisieren
              fetchMessages();
            } else {
              document.getElementById('sendStatus').innerHTML = 
                '<div class="status disconnected">❌ Fehler: ' + result.message + '</div>';
            }
          } catch (error) {
            document.getElementById('sendStatus').innerHTML = 
              '<div class="status disconnected">❌ Fehler beim Senden: ' + error.message + '</div>';
          }
        });
        
        // Funktion zum Abrufen von Nachrichten
        async function fetchMessages() {
          document.getElementById('messages').innerHTML = '<div class="loading">Nachrichten werden geladen...</div>';
          
          try {
            const response = await fetch('/api/messages');
            const messages = await response.json();
            
            if (response.ok) {
              if (messages.length === 0) {
                document.getElementById('messages').innerHTML = '<div>Keine Nachrichten vorhanden</div>';
                return;
              }
              
              let html = '';
              messages.forEach(message => {
                const date = new Date(message.createdAt).toLocaleString('de-DE');
                html += '<div class="message">';
                html += '<div>' + escapeHtml(message.text) + '</div>';
                html += '<div class="message-date">Erstellt am: ' + date + '</div>';
                html += '</div>';
              });
              
              document.getElementById('messages').innerHTML = html;
            } else {
              document.getElementById('messages').innerHTML = 
                '<div class="status disconnected">❌ Fehler beim Abrufen der Nachrichten: ' + 
                (messages.message || 'Unbekannter Fehler') + '</div>';
            }
          } catch (error) {
            document.getElementById('messages').innerHTML = 
              '<div class="status disconnected">❌ Fehler beim Abrufen der Nachrichten: ' + error.message + '</div>';
          }
        }
        
        // Funktion zum Escapen von HTML
        function escapeHtml(unsafe) {
          return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
        
        // Event-Listener für den Refresh-Button
        document.getElementById('refreshButton').addEventListener('click', fetchMessages);
        
        // Initialer Check beim Laden der Seite
        checkDbStatus();
        // Status alle 30 Sekunden aktualisieren
        setInterval(checkDbStatus, 30000);
      </script>
    </body>
    </html>
  `);
});

// Basisroute für API-Test
app.get('/', (req, res) => {
  res.json({
    message: 'API ist betriebsbereit',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Health-Check-Endpunkt für DigitalOcean hinzufügen
app.get('/health', (req, res) => {
  res.status(200).send('OK');  // Einfache Textantwort mit 200-Status
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
      // Entfernt: process.exit(0); - wird automatisch beendet
    });
  });
});