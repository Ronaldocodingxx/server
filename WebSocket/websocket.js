// WebSocket/websocket.js - Mit Benutzer-Information und Socket-ID-Tracking
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken'); // Für Token-Verifikation

// Aktive Chat-Verbindungen und Socket-zu-Benutzer-Mapping
const activeChatUsers = new Map();
const socketToUser = new Map(); // Speichert die Benutzerinformationen für jeden Socket

/**
 * Initialisiert den WebSocket-Server
 * @param {object} server - HTTP-Server-Instanz
 * @returns {object} io - Socket.io-Server-Instanz
 */
function initWebSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:4200',
        'https://frontend-r4x5k.ondigitalocean.app',
        'https://supperchat.com',
        'https://www.supperchat.com'
      ],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // WebSocket-Authentifizierung
  io.use((socket, next) => {
    try {
      // Token aus Handshake-Daten extrahieren
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        // Token verifizieren
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          // Benutzerinformationen am Socket speichern
          socket.userId = decoded.id || decoded.userId;
          socket.username = decoded.username || 'Benutzer';
          
          // In der Map speichern
          socketToUser.set(socket.id, {
            userId: socket.userId,
            username: socket.username
          });
          
          console.log(`Authentifizierter Benutzer ${socket.username} (${socket.userId}) verbunden`);
        } catch (err) {
          console.log('Ungültiges Token, setze anonymen Benutzer');
          // Bei ungültigem Token trotzdem verbinden lassen, aber als anonymen Benutzer
          socket.userId = 'anonymous';
          socket.username = 'Gast';
        }
      } else {
        // Kein Token, trotzdem verbinden lassen
        socket.userId = 'anonymous';
        socket.username = 'Gast';
      }
      next();
    } catch (error) {
      console.error('WebSocket-Authentifizierungsfehler:', error);
      next();
    }
  });

  // WebSocket-Verbindungen verarbeiten
  io.on('connection', (socket) => {
    console.log(`Neue WebSocket-Verbindung: ${socket.id} (${socket.username || 'Unbekannt'})`);
    
    // Chat beitreten
    socket.on('joinChat', ({ chatId }) => {
      if (!chatId) return;
      console.log(`Socket ${socket.id} (${socket.username}) tritt Chat ${chatId} bei`);
      socket.join(chatId);
      
      // Aktive Benutzer im Chat verfolgen
      if (!activeChatUsers.has(chatId)) {
        activeChatUsers.set(chatId, new Set());
      }
      activeChatUsers.get(chatId).add(socket.id);
      
      // Anzahl der aktiven Benutzer aktualisieren (optional)
      io.to(chatId).emit('userCount', {
        chatId,
        count: activeChatUsers.get(chatId).size
      });
    });
    
    // Chat verlassen
    socket.on('leaveChat', ({ chatId }) => {
      if (!chatId) return;
      console.log(`Socket ${socket.id} (${socket.username}) verlässt Chat ${chatId}`);
      socket.leave(chatId);
      
      // Benutzer aus aktiver Liste entfernen
      if (activeChatUsers.has(chatId)) {
        activeChatUsers.get(chatId).delete(socket.id);
        
        // Anzahl der aktiven Benutzer aktualisieren (optional)
        io.to(chatId).emit('userCount', {
          chatId,
          count: activeChatUsers.get(chatId).size
        });
      }
    });
    
    // Nachricht senden
    socket.on('message', (data) => {
      try {
        const { chatId, text, messageId } = data;
        if (!chatId || !text) return;
        
        // Nachricht an alle ANDEREN Clients im Chat senden (nicht an den Absender)
        socket.to(chatId).emit('message', {
          chatId,
          message: {
            id: messageId || 'temp-' + Date.now(),
            userId: socket.userId || 'anonymous',
            username: socket.username || 'Gast',
            text: text,
            timestamp: new Date()
          }
        });
        
        console.log(`Nachricht von ${socket.username} (${socket.userId}) an Chat ${chatId} weitergeleitet`);
      } catch (error) {
        console.error('Fehler beim Weiterleiten der Nachricht:', error);
      }
    });
    
    // Verbindung getrennt
    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} (${socket.username}) getrennt`);
      
      // Benutzerinformationen entfernen
      socketToUser.delete(socket.id);
      
      // Benutzer aus allen aktiven Chat-Räumen entfernen
      for (const [chatId, users] of activeChatUsers.entries()) {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          
          // Anzahl der aktiven Benutzer aktualisieren
          io.to(chatId).emit('userCount', {
            chatId,
            count: users.size
          });
        }
      }
    });
  });

  console.log('WebSocket-Server initialisiert');
  return io;
}

module.exports = { initWebSocket };