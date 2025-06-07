// profiles/models/profile.js
const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  profileImage: {
    type: String,                     // Pfad zur Bilddatei oder Base64-String
    default: null
  },
  profileText: {
    type: String,
    default: 'NEU',
    maxlength: [2000, 'Der Profiltext darf maximal 2000 Zeichen lang sein.'] // Maximallänge hinzugefügt
  },
  chats: {
    type: Number,
    default: 0
  },
  followers: {
    type: Number,
    default: 0
  },
  following: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Vor dem Speichern lastUpdated aktualisieren
profileSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

// Methode zum Zählen der Chats eines Benutzers 
// (kann mit der Chat-Collection verbunden werden)
profileSchema.methods.updateChatCount = async function() {
  try {
    // Hier könnte die Anzahl der Chats aus der Chat-Collection abgerufen werden
    // const count = await mongoose.model('Chat').countDocuments({ user: this.user });
    // this.chats = count;
    // await this.save();
    // return this.chats;
  } catch (error) {
    throw new Error('Fehler beim Aktualisieren der Chat-Anzahl');
  }
};

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;