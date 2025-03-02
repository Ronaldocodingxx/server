const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const verifyToken = require('../middleware/auth'); // Diese Middleware wird separat erstellt

// Schema für Nachrichten
const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Modell erstellen, wenn es noch nicht existiert
let Message;
try {
    Message = mongoose.model('Message');
} catch (error) {
    Message = mongoose.model('Message', messageSchema);
}

// Neue Nachricht erstellen
router.post('/', verifyToken, async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ message: 'Nachrichteninhalt erforderlich' });
        }

        const message = new Message({
            sender: req.userId, // Vom Token
            content
        });

        await message.save();
        
        res.status(201).json({
            message: 'Nachricht gesendet',
            data: message
        });
    } catch (error) {
        console.error('Fehler beim Senden der Nachricht:', error);
        res.status(500).json({ 
            message: 'Fehler beim Senden der Nachricht',
            error: error.message
        });
    }
});

// Alle Nachrichten abrufen
router.get('/', verifyToken, async (req, res) => {
    try {
        const messages = await Message.find()
            .populate('sender', 'username name')
            .sort({ timestamp: -1 });
            
        res.json(messages);
    } catch (error) {
        console.error('Fehler beim Abrufen der Nachrichten:', error);
        res.status(500).json({ 
            message: 'Fehler beim Abrufen der Nachrichten',
            error: error.message 
        });
    }
});

module.exports = router;