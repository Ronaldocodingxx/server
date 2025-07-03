// WebSocket/websocket.js
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

// Globale Variable für Socket.IO Instanz
let ioInstance = null;

// WebSocket-Server initialisieren
function initWebSocket(server) {
  console.log('WebSocket-Server initialisiert');
  
  const io = socketIO(server, {
    cors: {
      origin: function (origin, callback) {
        // Erlaubte Origins (gleiche wie in server.js)
        const allowedOrigins = [
          'http://localhost:4200',
          'https://neufrontend-ptfjz.ondigitalocean.app',
          'https://supperchat.com',
          'https://www.supperchat.com',
          'https://deepepoch.ai',
          'https://www.deepepoch.ai',
          'http://localhost:8080',
          'http://10.0.2.2:8080',
          'http://localhost:*',
          'file://',
          'http://localhost',
          'https://localhost',
          'https://localhost:*'
        ];
        
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.some(allowed => {
          if (allowed.includes('*')) {
            const pattern = allowed.replace('*', '.*');
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(origin);
          }
          return origin === allowed || origin.startsWith(allowed);
        })) {
          return callback(null, true);
        }
        
        if (process.env.NODE_ENV === 'development') {
          return callback(null, true);
        }
        
        console.log('WebSocket CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // WICHTIG: Speichere die IO Instanz
  ioInstance = io;

  // Authentifizierungs-Middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Kein Token vorhanden'));
      }
      
      // Token verifizieren
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id || decoded.userId || decoded._id;
      socket.username = decoded.username || decoded.email || 'Unknown';
      
      console.log(`User authentifiziert: ${socket.username} (${socket.userId})`);
      next();
      
    } catch (error) {
      console.error('Auth-Fehler:', error.message);
      next(new Error('Authentifizierung fehlgeschlagen'));
    }
  });

  // Verbindungs-Events
  io.on('connection', (socket) => {
    console.log(`Neue WebSocket-Verbindung: ${socket.id}`);
    console.log(`User: ${socket.username} (${socket.userId})`);

    // Join personal room
    socket.join(`user:${socket.userId}`);

    // Chat-Room beitreten
    socket.on('joinChat', (chatId) => {
      console.log(`User ${socket.userId} tritt Chat ${chatId} bei`);
      socket.join(chatId);
      socket.emit('joinedChat', { chatId });
    });

    // Chat-Room verlassen
    socket.on('leaveChat', (chatId) => {
      console.log(`User ${socket.userId} verlässt Chat ${chatId}`);
      socket.leave(chatId);
    });

    // Nachricht senden (altes System - bleibt für Kompatibilität)
    socket.on('sendMessage', async (data) => {
      console.log('Nachricht empfangen:', data);
      
      const { chatId, text } = data;
      
      if (!chatId || !text) {
        return socket.emit('error', { message: 'ChatId und Text erforderlich' });
      }

      // Nachricht an alle im Chat senden
      io.to(chatId).emit('newMessage', {
        chatId,
        userId: socket.userId,
        username: socket.username,
        text,
        timestamp: new Date()
      });
    });

    // Typing-Indikator
    socket.on('typing', (data) => {
      const { chatId, isTyping } = data;
      socket.to(chatId).emit('userTyping', {
        userId: socket.userId,
        username: socket.username,
        isTyping
      });
    });

    // Disconnection
    socket.on('disconnect', () => {
      console.log(`User ${socket.username} disconnected`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket-Fehler:', error);
    });
  });

  return io;
}

// NEU: Getter Funktion für andere Module
function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO wurde noch nicht initialisiert!');
  }
  return ioInstance;
}

// Exportiere BEIDE Funktionen
module.exports = {
  initWebSocket,
  getIO  // NEU: Diese Funktion wird von chat.controller.js benötigt!
};