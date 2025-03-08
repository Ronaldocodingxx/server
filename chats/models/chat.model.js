const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Chat-Nachrichten Schema
const MessageSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  isAI: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Haupt-Chat-Schema
const ChatSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Titel ist erforderlich'],
    minlength: [3, 'Titel muss mindestens 3 Zeichen lang sein'],
    maxlength: [100, 'Titel darf maximal 100 Zeichen lang sein'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Beschreibung ist erforderlich'],
    minlength: [10, 'Beschreibung muss mindestens 10 Zeichen lang sein'],
    maxlength: [1000, 'Beschreibung darf maximal 1000 Zeichen lang sein'],
    trim: true
  },
  topic: {
    type: String,
    enum: ['Politik', 'Reisen', 'Fitness', 'Technologie', 'Gaming', 'Kultur', 'Sonstiges'],
    default: 'Sonstiges'
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  hasAI: {
    type: Boolean,
    default: false
  },
  apiToken: {
    type: String,
    required: function() {
      return this.hasAI === true;
    }
  },
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  bannedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  messages: [MessageSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtuelle Eigenschaft: Teilnehmeranzahl
ChatSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Methode: Nachricht hinzufügen
ChatSchema.methods.addMessage = function(userId, text, isAI = false) {
  this.messages.push({
    userId,
    text,
    isAI,
    timestamp: new Date()
  });
  return this.save();
};

// Methode: Teilnehmer hinzufügen
ChatSchema.methods.addParticipant = function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }
  return this.save();
};

// Stellt sicher, dass bei Erstellung eines Chats der Ersteller auch als Teilnehmer hinzugefügt wird
ChatSchema.pre('save', function(next) {
  if (this.isNew && !this.participants.includes(this.creator)) {
    this.participants.push(this.creator);
  }
  next();
});

// Exportiere das Chat-Modell
module.exports = mongoose.model('Chat', ChatSchema);