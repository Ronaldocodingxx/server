const Chat = require('../models/chat.model');
const User = require('../../models/User'); // Korrigierter Pfad zum User-Modell

// Chat erstellen
exports.createChat = async (req, res) => {
  try {
    const userId = req.userId; // Annahme: userId wird von der Auth-Middleware gesetzt
    
    // Erstelle neuen Chat
    const newChat = new Chat({
      title: req.body.title,
      description: req.body.description,
      topic: req.body.topic || 'Sonstiges',
      creator: userId,
      isPublic: req.body.isPublic !== undefined ? req.body.isPublic : true,
      hasAI: req.body.hasAI || false,
      apiToken: req.body.apiToken,
      participants: [userId] // Ersteller als ersten Teilnehmer hinzufügen
    });

    await newChat.save();

    // Sende erfolgreiche Antwort
    res.status(201).json({
      success: true,
      message: 'Chat erfolgreich erstellt',
      chat: {
        _id: newChat._id,
        title: newChat.title,
        topic: newChat.topic,
        description: newChat.description,
        isPublic: newChat.isPublic,
        hasAI: newChat.hasAI,
        createdAt: newChat.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Erstellen des Chats',
      error: error.message
    });
  }
};

// Alle öffentlichen Chats abrufen
exports.getPublicChats = async (req, res) => {
  try {
    const chats = await Chat.find({ isPublic: true })
      .select('title topic description creator participants createdAt hasAI')
      .populate('creator', 'username')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: chats.length,
      chats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Chats',
      error: error.message
    });
  }
};

// Eigene Chats abrufen (erstellt vom Benutzer)
exports.getMyChats = async (req, res) => {
  try {
    const userId = req.userId;
    
    const chats = await Chat.find({ creator: userId })
      .select('title topic description isPublic hasAI apiToken participants createdAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: chats.length,
      chats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen deiner Chats',
      error: error.message
    });
  }
};

// Einen einzelnen Chat mit Details abrufen
exports.getChatById = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.userId;

    const chat = await Chat.findById(chatId)
      .populate('creator', 'username')
      .populate('participants', 'username');

    // Überprüfen, ob der Chat existiert
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Wenn der Chat nicht öffentlich ist, überprüfen, ob der Benutzer berechtigt ist
    if (!chat.isPublic && chat.creator.toString() !== userId && !chat.participants.some(p => p._id.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung für diesen Chat'
      });
    }

    // Nachrichten vorbereiten und Benutzernamen hinzufügen
    const messagesWithUserDetails = await Promise.all(
      chat.messages.map(async (msg) => {
        // Nur nicht gelöschte Nachrichten oder wenn der Benutzer der Ersteller ist
        if (!msg.isDeleted || chat.creator.toString() === userId) {
          // Benutzer für jede Nachricht abrufen
          const user = await User.findById(msg.userId, 'username');
          return {
            _id: msg._id,
            userId: msg.userId,
            username: user ? user.username : 'Unbekannter Benutzer',
            text: msg.isDeleted ? 'Diese Nachricht wurde gelöscht.' : msg.text,
            isAI: msg.isAI,
            isDeleted: msg.isDeleted,
            timestamp: msg.timestamp
          };
        }
      }).filter(Boolean) // Entferne null/undefined Werte
    );

    res.status(200).json({
      success: true,
      chat: {
        _id: chat._id,
        title: chat.title,
        topic: chat.topic,
        description: chat.description,
        creator: chat.creator,
        isPublic: chat.isPublic,
        hasAI: chat.hasAI,
        apiToken: chat.creator.toString() === userId ? chat.apiToken : undefined, // Token nur für Ersteller
        participants: chat.participants,
        participantCount: chat.participants.length,
        messages: messagesWithUserDetails,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen des Chats',
      error: error.message
    });
  }
};

// NEUE FUNKTION: Ältere Nachrichten zu einem Chat abrufen
exports.getMessages = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.userId;
    const { beforeMessageId, limit = 20 } = req.query;

    // Chat abrufen
    const chat = await Chat.findById(chatId);

    // Überprüfen, ob der Chat existiert
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Überprüfen, ob der Benutzer berechtigt ist, die Nachrichten zu sehen
    if (!chat.isPublic && chat.creator.toString() !== userId && !chat.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung für diesen Chat'
      });
    }

    // Nachrichten filtern (vor einer bestimmten Nachricht)
    let filteredMessages = chat.messages;
    
    if (beforeMessageId) {
      const referenceMessage = chat.messages.id(beforeMessageId);
      if (!referenceMessage) {
        return res.status(404).json({
          success: false,
          message: 'Referenznachricht nicht gefunden'
        });
      }
      
      // Nur Nachrichten nehmen, die vor der Referenznachricht liegen
      filteredMessages = chat.messages.filter(msg => 
        msg.timestamp < referenceMessage.timestamp
      );
    }
    
    // Sortieren und limitieren
    filteredMessages = filteredMessages
      .sort((a, b) => b.timestamp - a.timestamp) // Neueste zuerst
      .slice(0, parseInt(limit));
    
    // Benutzernamen für jede Nachricht abrufen
    const messagesWithUserDetails = await Promise.all(
      filteredMessages.map(async (msg) => {
        // Nur nicht gelöschte Nachrichten oder wenn der Benutzer der Ersteller ist
        if (!msg.isDeleted || chat.creator.toString() === userId) {
          // Benutzer für jede Nachricht abrufen
          const user = await User.findById(msg.userId, 'username');
          return {
            id: msg._id,
            chatId: chatId,
            userId: msg.userId,
            username: user ? user.username : 'Unbekannter Benutzer',
            message: msg.isDeleted ? 'Diese Nachricht wurde gelöscht.' : msg.text,
            isAI: msg.isAI || false,
            timestamp: msg.timestamp
          };
        }
      }).filter(Boolean) // Entferne null/undefined Werte
    );

    res.status(200).json({
      success: true,
      messages: messagesWithUserDetails
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Abrufen der Nachrichten',
      error: error.message
    });
  }
};

// Nachricht zu einem Chat hinzufügen
exports.addMessage = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.userId;
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Nachricht darf nicht leer sein'
      });
    }

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Überprüfen, ob der Benutzer im Chat ist oder der Chat öffentlich ist
    if (!chat.isPublic && !chat.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung, Nachrichten in diesem Chat zu senden'
      });
    }

    // Benutzer zu den Teilnehmern hinzufügen, falls noch nicht dabei
    if (!chat.participants.includes(userId)) {
      chat.participants.push(userId);
    }

    // Nachricht hinzufügen
    const newMessage = {
      userId,
      text,
      timestamp: new Date()
    };

    chat.messages.push(newMessage);
    await chat.save();

    // Benutzername für die Antwort abrufen
    const user = await User.findById(userId, 'username');

    // Antwort senden
    res.status(201).json({
      success: true,
      message: {
        _id: chat.messages[chat.messages.length - 1]._id,
        userId,
        username: user ? user.username : 'Unbekannter Benutzer',
        text,
        timestamp: newMessage.timestamp
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Senden der Nachricht',
      error: error.message
    });
  }
};

// Chat aktualisieren (nur der Ersteller)
exports.updateChat = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.userId;
    const updateData = req.body;

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Überprüfen, ob der Benutzer der Ersteller ist
    if (chat.creator.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Ersteller kann den Chat bearbeiten'
      });
    }

    // Felder aktualisieren
    const allowedFields = ['title', 'description', 'topic', 'isPublic', 'hasAI', 'apiToken'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        chat[field] = updateData[field];
      }
    });

    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Chat erfolgreich aktualisiert',
      chat: {
        _id: chat._id,
        title: chat.title,
        topic: chat.topic,
        description: chat.description,
        isPublic: chat.isPublic,
        hasAI: chat.hasAI,
        updatedAt: chat.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Aktualisieren des Chats',
      error: error.message
    });
  }
};

// Chat löschen (nur der Ersteller)
exports.deleteChat = async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.userId;

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Überprüfen, ob der Benutzer der Ersteller ist
    if (chat.creator.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Ersteller kann den Chat löschen'
      });
    }

    await chat.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Chat erfolgreich gelöscht'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen des Chats',
      error: error.message
    });
  }
};

// Nachricht löschen (nur der Ersteller des Chats)
exports.deleteMessage = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messageId = req.params.messageId;
    const userId = req.userId;

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Überprüfen, ob der Benutzer der Ersteller ist
    if (chat.creator.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Ersteller kann Nachrichten löschen'
      });
    }

    // Nachricht finden und als gelöscht markieren
    const message = chat.messages.id(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Nachricht nicht gefunden'
      });
    }

    message.isDeleted = true;
    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Nachricht erfolgreich gelöscht'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen der Nachricht',
      error: error.message
    });
  }
};

// Benutzer aus einem Chat sperren (Moderation)
exports.banUserFromChat = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const bannedUserId = req.params.userId;
    const userId = req.userId;

    const chat = await Chat.findById(chatId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat nicht gefunden'
      });
    }

    // Überprüfen, ob der anfragende Benutzer der Ersteller ist
    if (chat.creator.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Nur der Ersteller kann Benutzer sperren'
      });
    }

    // Nicht den Ersteller sperren
    if (chat.creator.toString() === bannedUserId) {
      return res.status(400).json({
        success: false,
        message: 'Der Ersteller kann nicht gesperrt werden'
      });
    }

    // Benutzer zu gesperrten Benutzern hinzufügen
    if (!chat.bannedUsers.includes(bannedUserId)) {
      chat.bannedUsers.push(bannedUserId);
    }

    // Benutzer aus der Teilnehmerliste entfernen
    chat.participants = chat.participants.filter(
      participant => participant.toString() !== bannedUserId
    );

    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Benutzer erfolgreich gesperrt'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Fehler beim Sperren des Benutzers',
      error: error.message
    });
  }
};