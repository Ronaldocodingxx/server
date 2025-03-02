const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const UserSchema = new mongoose.Schema({
    // Persönliche Informationen
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    birthDate: {
        type: Date,
        required: true,
        get: function(date) {
            // Nur Datum zurückgeben, nicht Zeit
            return date ? date.toISOString().split('T')[0] : null;
        }
    },
    
    // Konto-Informationen
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    
    // Sicherheitsinformationen
    password: {
        type: String,
        required: true
    },
    termsAccepted: {
        type: Boolean,
        required: true,
        default: false
    },
        
    // E-Mail-Verifizierung
    isVerified: {
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
            return `${this.firstName} ${this.lastName}`;
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
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('User', UserSchema);