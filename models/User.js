const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Stelle sicher, dass jsonwebtoken installiert ist

const UserSchema = new mongoose.Schema({
    // Persönliche Informationen
    firstName: {
        type: String,
        required: function() {
            // Nur erforderlich, wenn nicht über Google angemeldet
            return !this.googleId;
        }
    },
    lastName: {
        type: String,
        required: function() {
            // Nur erforderlich, wenn nicht über Google angemeldet
            return !this.googleId;
        }
    },
    birthDate: {
        type: Date,
        required: function() {
            // Nur erforderlich, wenn nicht über Google angemeldet
            return !this.googleId;
        },
        get: function(date) {
            // Nur Datum zurückgeben, nicht Zeit
            return date ? date.toISOString().split('T')[0] : null;
        }
    },
    
    // Konto-Informationen
    username: {
        type: String,
        required: function() {
            // Nur erforderlich, wenn nicht über Google angemeldet
            return !this.googleId;
        },
        unique: true,
        sparse: true // Erlaubt null/undefined bei Eindeutigkeitseinschränkung
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    
    // Google Auth Felder
    googleId: {
        type: String,
        unique: true,
        sparse: true // Erlaubt null/undefined bei Eindeutigkeitseinschränkung
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    profilePicture: {
        type: String,
        default: ''
    },
    
    // Sicherheitsinformationen
    password: {
        type: String,
        required: function() {
            // Passwort ist nur erforderlich, wenn nicht über Google angemeldet
            return !this.googleId;
        }
    },
    termsAccepted: {
        type: Boolean,
        required: function() {
            // Nur erforderlich, wenn nicht über Google angemeldet
            return !this.googleId;
        },
        default: false
    },
        
    // E-Mail-Verifizierung
    isVerified: {
        type: Boolean,
        default: false
    },
    emailVerified: { // Zweites Feld für Google Auth
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String
    },
    verificationAttempts: {
        type: Number,
        default: 0
    },
    lastVerificationRequest: {
        type: Date
    },
    
    // Passwort-Reset-Felder
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    
    // Weitere Metadaten
    name: {
        type: String,
        default: function() {
            if (this.firstName && this.lastName) {
                return `${this.firstName} ${this.lastName}`;
            } else {
                return this.name || '';
            }
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    // Damit der getter für birthDate berücksichtigt wird
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Passwort vor dem Speichern hashen
UserSchema.pre('save', async function(next) {
    // Wenn Passwort nicht geändert wurde oder Google-Anmeldung
    if (!this.isModified('password') || this.googleId) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Methode zum Generieren eines JWT-Tokens
UserSchema.methods.generateAuthToken = function() {
    const token = jwt.sign(
        { 
            id: this._id,
            email: this.email,
            name: this.name || `${this.firstName} ${this.lastName}`
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }  // Token läuft nach 7 Tagen ab
    );
    
    return token;
};

// Methode zum Überprüfen des Passworts
UserSchema.methods.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', UserSchema);