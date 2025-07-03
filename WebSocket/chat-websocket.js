// WebSocket/chat-websocket.js - Erweitertes WebSocket System V2
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// WICHTIG: Importiere die Models mit den richtigen Pfaden!
const Chat = require('../chats/models/chat.model');
const User = require('../models/User');

// Separater Namespace für das neue System
let chatNamespace;

/**
 * Initialisiert das erweiterte Chat-WebSocket-System
 * Läuft PARALLEL zum bestehenden System auf einem anderen Namespace
 * @param {object} io - Socket.io-Server-Instanz vom Hauptsystem
 */
function initChatWebSocketV2(io) {
  console.log('🚀 Initialisiere erweitertes Chat-WebSocket-System V2...');
  
  // Erstelle separaten Namespace für V2
  chatNamespace = io.of('/chat-v2');
  
  // Authentifizierung für V2 Namespace
  chatNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Kein Token vorhanden'));
      }
      
      // Token verifizieren
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id || decoded.userId || decoded._id;
      
      // Lade User-Daten
      try {
        const user = await User.findById(socket.userId);
        if (user) {
          socket.username = user.username || user.name || user.email || 'Unknown';
        }
      } catch (error) {
        socket.username = 'Unknown';
      }
      
      console.log(`✅ V2 User authentifiziert: ${socket.username} (${socket.userId})`);
      next();
      
    } catch (error) {
      console.error('V2 Auth Fehler:', error.message);
      next(new Error('Authentifizierung fehlgeschlagen'));
    }
  });

  // V2 Connection Handler
  chatNamespace.on('connection', async (socket) => {
    console.log(`=== NEUE V2 VERBINDUNG ===`);
    console.log(`Socket ID: ${socket.id}`);
    console.log(`User: ${socket.username} (${socket.userId})`);

    // === CHAT ROOM MANAGEMENT ===
    socket.on('joinChat', async (chatId) => {
      try {
        console.log(`📌 V2: User ${socket.userId} joining Chat ${chatId}`);
        
        // Validiere Chat-Zugriff
        const chat = await Chat.findById(chatId);
        if (!chat) {
          return socket.emit('error', { message: 'Chat nicht gefunden' });
        }
        
        // Prüfe Berechtigung
        const isParticipant = chat.participants.some(p => p.toString() === socket.userId);
        if (!isParticipant && !chat.isPublic) {
          return socket.emit('error', { message: 'Kein Zugriff auf diesen Chat' });
        }
        
        // Join room
        socket.join(chatId);
        socket.emit('joinedChat', { chatId, success: true });
        
        console.log(`✅ V2: User joined Chat ${chatId}`);
        
      } catch (error) {
        console.error('V2 Join Error:', error);
        socket.emit('error', { message: 'Fehler beim Beitreten' });
      }
    });

    socket.on('leaveChat', (chatId) => {
      console.log(`📤 V2: User ${socket.userId} leaving Chat ${chatId}`);
      socket.leave(chatId);
    });

    // === NEUE NACHRICHT MIT TEMPID SUPPORT ===
    socket.on('sendMessage', async (data) => {
      console.log('=== V2 NACHRICHT EMPFANGEN ===');
      console.log('Von:', socket.username);
      console.log('Data:', JSON.stringify(data, null, 2));
      
      const { chatId, text, tempId } = data;
      
      // Validierung
      if (!chatId || !text || !tempId) {
        return socket.emit('messageError', { 
          tempId,
          error: 'Fehlende Daten (chatId, text oder tempId)' 
        });
      }

      try {
        // 1. Chat laden und validieren
        const chat = await Chat.findById(chatId);
        if (!chat) {
          return socket.emit('messageError', { 
            tempId,
            error: 'Chat nicht gefunden' 
          });
        }

        // 2. Berechtigung prüfen
        const isParticipant = chat.participants.some(p => p.toString() === socket.userId);
        if (!isParticipant && !chat.isPublic) {
          return socket.emit('messageError', { 
            tempId,
            error: 'Keine Berechtigung für diesen Chat' 
          });
        }

        // 3. Neue Nachricht erstellen
        const newMessage = {
          userId: socket.userId,
          text: text.trim(),
          isAI: false,
          isDeleted: false,
          timestamp: new Date()
        };

        // 4. In DB speichern
        chat.messages.push(newMessage);
        await chat.save();
        
        // Die gespeicherte Nachricht mit MongoDB _id
        const savedMessage = chat.messages[chat.messages.length - 1];

        console.log(`✅ V2: Nachricht gespeichert: ${savedMessage._id}`);

        // Nachricht mit vollständigen Details für Broadcast
        const broadcastMessage = {
          _id: savedMessage._id,
          sender: {
            _id: socket.userId,
            username: socket.username,
            profilePicture: null // TODO: Aus User laden wenn nötig
          },
          text: savedMessage.text,
          timestamp: savedMessage.timestamp,
          isAI: false,
          isDeleted: false
        };

        // 5. An alle im Chat senden (MIT tempId!)
        chatNamespace.to(chatId).emit('newMessage', {
          chatId: chatId,
          message: broadcastMessage,
          tempId: tempId // KRITISCH: Frontend braucht das zum Ersetzen!
        });

        // 6. Bestätigung an Sender
        socket.emit('messageSent', {
          chatId,
          messageId: savedMessage._id.toString(),
          tempId,
          timestamp: savedMessage.timestamp
        });

        console.log(`📤 V2: Nachricht an alle gesendet mit tempId: ${tempId}`);

      } catch (error) {
        console.error('❌ V2 Message Error:', error);
        socket.emit('messageError', { 
          tempId,
          error: error.message || 'Fehler beim Senden' 
        });
      }
    });

    // === NACHRICHT LÖSCHEN ===
    socket.on('deleteMessage', async (data) => {
      const { chatId, messageId } = data;
      
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) {
          return socket.emit('error', { message: 'Chat nicht gefunden' });
        }

        const message = chat.messages.id(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Nachricht nicht gefunden' });
        }

        // Nur eigene Nachrichten löschen
        if (message.userId.toString() !== socket.userId) {
          return socket.emit('error', { message: 'Keine Berechtigung' });
        }

        // Als gelöscht markieren
        message.isDeleted = true;
        message.text = '[Nachricht gelöscht]';
        await chat.save();

        // Alle informieren
        chatNamespace.to(chatId).emit('messageUpdate', {
          chatId,
          messageId,
          update: { isDeleted: true }
        });

        console.log(`🗑️ V2: Nachricht ${messageId} gelöscht`);

      } catch (error) {
        console.error('V2 Delete Error:', error);
        socket.emit('error', { message: 'Fehler beim Löschen' });
      }
    });

    // === TYPING INDICATOR ===
    socket.on('typing', (data) => {
      const { chatId, isTyping } = data;
      
      // An alle ANDEREN im Chat
      socket.to(chatId).emit('userTyping', {
        userId: socket.userId,
        username: socket.username,
        isTyping
      });
    });

    // === DISCONNECT ===
    socket.on('disconnect', () => {
      console.log(`❌ V2: User ${socket.username} disconnected`);
    });

    // === ERROR HANDLING ===
    socket.on('error', (error) => {
      console.error('V2 Socket Error:', error);
    });
  });

  console.log('✅ Chat-WebSocket V2 System initialisiert auf /chat-v2');
  return chatNamespace;
}

// Export
module.exports = { initChatWebSocketV2 };