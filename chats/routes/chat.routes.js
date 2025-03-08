const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const authMiddleware = require('../../middleware/auth'); // Korrigierter Pfad zur Auth-Middleware

// Middleware für alle Chat-Routen - stellt sicher, dass der Benutzer authentifiziert ist
router.use(authMiddleware);

// Chat-Routen
router.post('/', chatController.createChat);              // Erstellt einen neuen Chat
router.get('/public', chatController.getPublicChats);     // Holt alle öffentlichen Chats
router.get('/my-chats', chatController.getMyChats);       // Holt alle Chats des Benutzers
router.get('/:id', chatController.getChatById);           // Holt einen bestimmten Chat mit Details
router.put('/:id', chatController.updateChat);            // Aktualisiert einen Chat (nur Ersteller)
router.delete('/:id', chatController.deleteChat);         // Löscht einen Chat (nur Ersteller)

// Chat-Nachrichten-Routen
router.post('/:id/messages', chatController.addMessage);                    // Fügt eine Nachricht hinzu
router.delete('/:chatId/messages/:messageId', chatController.deleteMessage); // Löscht eine Nachricht (nur Ersteller)

// Benutzer sperren
router.post('/:chatId/ban/:userId', chatController.banUserFromChat);        // Sperrt einen Benutzer (nur Ersteller)

module.exports = router;