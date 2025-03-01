// server.js - Node.js Server mit MongoDB-Anbindung (für DigitalOcean optimiert)
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// Express App erstellen
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Verbindung mit Umgebungsvariable
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://doadmin:N2tc591wjX436D0f@mongodb-4c0ff5ca.mongo.ondigitalocean.com/admin?retryWrites=true&w=majority';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB verbunden'))
  .catch(err => console.error('MongoDB Verbindungsfehler:', err));

// Schema und Modell für Messages
const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model('Message', messageSchema);

// API-Endpunkte
// GET - Alle Nachrichten abrufen
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Serverfehler' });
  }
});

// POST - Neue Nachricht erstellen
app.post('/api/messages', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Nachrichtentext ist erforderlich' });
    }
    
    const message = new Message({ text });
    await message.save();
    
    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Serverfehler' });
  }
});

// GET - Basisroute für API-Test
app.get('/', (req, res) => {
  res.json({ 
    message: 'API ist betriebsbereit',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Umgebung: ${process.env.NODE_ENV || 'development'}`);
});