const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const verifyToken = require('../middleware/auth'); // Importieren der Middleware

// Rate-Limiter für Verifizierungsanfragen (pro IP)
const verificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    max: 5, // max 5 Anfragen pro IP pro Stunde
    message: {
        message: 'Zu viele Verifizierungsanfragen von dieser IP. Bitte versuchen Sie es später erneut.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate-Limiter für Login (Schutz vor Brute-Force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 10, // max 10 Anfragen pro IP in 15 Minuten
    message: {
        message: 'Zu viele Anmeldeversuche. Bitte versuchen Sie es in 15 Minuten erneut.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate-Limiter für Password-Reset (Schutz vor Missbrauch)
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 Stunde
    max: 3, // max 3 Anfragen pro IP in einer Stunde
    message: {
        message: 'Zu viele Passwort-Reset-Anfragen. Bitte versuchen Sie es in 1 Stunde erneut.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Cooldown-Zeit zwischen Verifizierungsanfragen in Minuten
const COOLDOWN_MINUTES = 15;

// Registrierung
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, birthDate, username, email, password, termsAccepted } = req.body;
        
        // Prüfen ob Benutzer existiert
        const existingUser = await User.findOne({
            $or: [
                { email },
                { username }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({ message: 'Benutzer mit dieser E-Mail oder diesem Benutzernamen existiert bereits' });
        }
        
        // Generiere Verifikations-Token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Neuen Benutzer erstellen
        const user = new User({
            firstName,
            lastName,
            birthDate,
            username,
            email,
            password,
            termsAccepted,
            isVerified: false,
            verificationToken,
            verificationAttempts: 1, // Erste Verifizierungs-E-Mail zählt als erster Versuch
            lastVerificationRequest: Date.now()
        });
        
        await user.save();
        
        // Überprüfe E-Mail-Konfiguration
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('E-Mail-Konfiguration fehlt. Benutzerregistrierung erfolgt ohne E-Mail-Verifizierung.');
            
            // Alternativ: In der Entwicklungsumgebung Auto-Verifizierung
            if (process.env.NODE_ENV !== 'production') {
                user.isVerified = true;
                user.verificationToken = null;
                await user.save();
                
                return res.status(201).json({
                    message: 'Benutzer registriert und automatisch verifiziert (Entwicklungsmodus).',
                    verificationRequired: false
                });
            } else {
                // In Produktion mit fehlender E-Mail-Konfiguration
                return res.status(500).json({
                    message: 'Serverfehler: E-Mail-Dienst nicht konfiguriert. Bitte kontaktieren Sie den Administrator.'
                });
            }
        }
        
        // Sende Verifikations-E-Mail mit Hash in der URL
        const verificationUrl = `https://frontend-r4x5k.ondigitalocean.app/#/verify-email?token=${verificationToken}`;
        
        // Wenn E-Mail-Konfiguration vorhanden, dann normal fortfahren
        try {
            // Entfernen der Leerzeichen im Passwort
            const emailPass = process.env.EMAIL_PASS.replace(/\s+/g, '');
            
            // Nodemailer-Konfiguration
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT),
                secure: false, // true für 465, false für andere Ports
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: emailPass
                }
            });

            // Teste die Verbindung vor dem Senden
            await transporter.verify();

            await transporter.sendMail({
                from: '"SyntheChat" <' + process.env.EMAIL_USER + '>',
                to: email,
                subject: 'E-Mail-Verifizierung für SyntheChat',
                html: `
                    <h2>Willkommen bei SyntheChat!</h2>
                    <p>Bitte klicken Sie auf den folgenden Link, um Ihre E-Mail-Adresse zu verifizieren:</p>
                    <a href="${verificationUrl}">E-Mail verifizieren</a>
                    <p>Falls Sie diese E-Mail nicht erhalten haben, können Sie innerhalb der ersten ${COOLDOWN_MINUTES} Minuten eine weitere Verifizierungs-E-Mail anfordern.</p>
                `
            });
            
            res.status(201).json({ 
                message: 'Benutzer registriert. Bitte überprüfen Sie Ihre E-Mails zur Verifizierung.' 
            });
        } catch (emailError) {
            console.error('E-Mail-Fehler:', emailError);
            
            // Fehler beim E-Mail-Versand
            res.status(500).json({
                message: 'Bei der Registrierung ist ein Fehler beim Versand der Verifizierungs-E-Mail aufgetreten.',
                error: emailError.message
            });
        }
    } catch (error) {
        console.error('Registrierungsfehler:', error);
        res.status(500).json({ 
            message: 'Bei der Registrierung ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
            error: error.message
        });
    }
});

// Route zur E-Mail-Verifizierung
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        // Suche Benutzer mit dem Verifikations-Token
        const user = await User.findOne({ verificationToken: token });

        if (!user) {
            return res.status(400).json({ 
                message: 'Ungültiger Verifikationslink.' 
            });
        }

        // Markiere Benutzer als verifiziert
        user.isVerified = true;
        user.verificationToken = null;  // Token löschen nach Verwendung

        await user.save();

        res.status(200).json({ 
            message: 'E-Mail erfolgreich verifiziert!' 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Login-Route mit Ratenbegrenzung
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Ungültige Anmeldedaten' });
        }
        
        // Passwort vergleichen
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Ungültige Anmeldedaten' });
        }

        // Überprüfen, ob E-Mail verifiziert ist
        if (!user.isVerified) {
            return res.status(403).json({ 
                message: 'Bitte verifizieren Sie zuerst Ihre E-Mail-Adresse.',
                isVerified: false
            });
        }
        
        // JWT erstellen
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );
        
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Route für erneute Verifizierung mit angepasster Ratenbegrenzung
router.post('/resend-verification', verificationLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        // Benutzer finden
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        
        if (user.isVerified) {
            return res.status(400).json({ message: 'Diese E-Mail-Adresse ist bereits verifiziert.' });
        }
        
        // Zähle Verifizierungsversuche
        if (!user.verificationAttempts) {
            user.verificationAttempts = 1; // Falls aus irgendeinem Grund nicht gesetzt
        }
        
        const now = Date.now();
        const lastRequestTime = user.lastVerificationRequest ? user.lastVerificationRequest.getTime() : null;
        
        // Erlaubt 2 E-Mails: eine bei Registrierung und eine innerhalb der ersten 15 Minuten
        if (user.verificationAttempts >= 2 && lastRequestTime && (now - lastRequestTime < COOLDOWN_MINUTES * 60 * 1000)) {
            const minutesLeft = Math.ceil((lastRequestTime + COOLDOWN_MINUTES * 60 * 1000 - now) / (60 * 1000));
            return res.status(429).json({ 
                message: `Sie haben bereits 2 Verifizierungs-E-Mails erhalten. Bitte warten Sie ${minutesLeft} Minuten, bevor Sie eine neue anfordern.` 
            });
        }
        
        // Begrenze auf maximal 10 Versuche insgesamt pro Konto
        if (user.verificationAttempts >= 10) {
            return res.status(403).json({ 
                message: 'Maximale Anzahl an Verifizierungsversuchen erreicht. Bitte kontaktieren Sie den Support.' 
            });
        }
        
        user.verificationAttempts += 1;
        
        // Neuen Verifikations-Token generieren
        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        
        // Speichere Zeitpunkt der letzten Anfrage
        user.lastVerificationRequest = now;
        
        await user.save();
        
        // Sende Verifikations-E-Mail mit Hash in der URL
        const verificationUrl = `https://frontend-r4x5k.ondigitalocean.app/#/verify-email?token=${verificationToken}`;
        
        // Überprüfe E-Mail-Konfiguration
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('E-Mail-Konfiguration fehlt. Verifizierungs-E-Mail kann nicht gesendet werden.');
            
            // Alternativ: In der Entwicklungsumgebung Auto-Verifizierung
            if (process.env.NODE_ENV !== 'production') {
                user.isVerified = true;
                user.verificationToken = null;
                await user.save();
                
                return res.status(200).json({
                    message: 'Benutzer automatisch verifiziert (Entwicklungsmodus).',
                    verificationRequired: false
                });
            } else {
                // In Produktion mit fehlender E-Mail-Konfiguration
                return res.status(500).json({
                    message: 'Serverfehler: E-Mail-Dienst nicht konfiguriert. Bitte kontaktieren Sie den Administrator.'
                });
            }
        }
        
        try {
            // Entfernen der Leerzeichen im Passwort
            const emailPass = process.env.EMAIL_PASS.replace(/\s+/g, '');
            
            // Nodemailer-Konfiguration
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT),
                secure: false, // true für 465, false für andere Ports
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: emailPass
                }
            });

            // Teste die Verbindung vor dem Senden
            await transporter.verify();

            await transporter.sendMail({
                from: '"SyntheChat" <' + process.env.EMAIL_USER + '>',
                to: email,
                subject: 'E-Mail-Verifizierung für SyntheChat',
                html: `
                    <h2>Willkommen bei SyntheChat!</h2>
                    <p>Bitte klicken Sie auf den folgenden Link, um Ihre E-Mail-Adresse zu verifizieren:</p>
                    <a href="${verificationUrl}">E-Mail verifizieren</a>
                    <p>Aus Sicherheitsgründen können Sie maximal 2 Verifizierungs-E-Mails innerhalb von ${COOLDOWN_MINUTES} Minuten anfordern.</p>
                `
            });
            
            // Nachricht anpassen je nach Versuch
            let message = 'Verifizierungs-E-Mail wurde erneut gesendet. Bitte überprüfen Sie Ihr E-Mail-Postfach.';
            if (user.verificationAttempts >= 2) {
                message += ' Nach 2 E-Mails gilt eine Wartezeit.';
            }
            
            res.status(200).json({ 
                message: message,
                cooldownMinutes: COOLDOWN_MINUTES,
                remainingAttempts: 10 - user.verificationAttempts
            });
        } catch (emailError) {
            console.error('Fehler beim E-Mail-Versand:', emailError);
            
            // Bei Entwicklungsumgebung, Benutzer automatisch verifizieren
            if (process.env.NODE_ENV !== 'production') {
                // Benutzer automatisch verifizieren im Entwicklungsmodus
                user.isVerified = true;
                user.verificationToken = null;
                await user.save();
                
                return res.status(200).json({
                    message: 'Benutzer automatisch verifiziert (E-Mail-Versand fehlgeschlagen, aber Entwicklungsmodus aktiviert).',
                    errorDetails: emailError.message
                });
            }
            
            // Fehler beim E-Mail-Versand
            res.status(500).json({
                message: 'Ein Fehler ist beim Versand der Verifizierungs-E-Mail aufgetreten.',
                error: emailError.message
            });
        }
    } catch (error) {
        console.error('Fehler beim erneuten Senden der Verifizierungs-E-Mail:', error);
        res.status(500).json({ 
            message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
            error: error.message
        });
    }
});

// DELETE-Route für Kontolöschung
router.delete('/delete-account/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Überprüfen, ob der eingeloggte Benutzer sein eigenes Konto löscht
        if (req.userId !== userId) {
            return res.status(403).json({ 
                message: 'Sie sind nicht berechtigt, dieses Konto zu löschen.' 
            });
        }
        
        // Benutzer in der Datenbank finden und löschen
        const deletedUser = await User.findByIdAndDelete(userId);
        
        if (!deletedUser) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden.' });
        }
        
        res.status(200).json({ 
            success: true,
            message: 'Konto erfolgreich gelöscht.' 
        });
    } catch (error) {
        console.error('Fehler beim Löschen des Kontos:', error);
        res.status(500).json({ 
            message: 'Ein Fehler ist beim Löschen des Kontos aufgetreten.',
            error: error.message
        });
    }
});

// Route für "Passwort vergessen"
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        // Überprüfe, ob der Benutzer existiert
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'Benutzer mit dieser E-Mail-Adresse wurde nicht gefunden.' });
        }
        
        // Generiere einen einmaligen Token
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Speichere den Token mit Ablaufzeit in der Datenbank
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 Stunde gültig
        await user.save();
        
        // Sende eine E-Mail mit dem Reset-Link mit Hash in der URL
        const resetUrl = `https://frontend-r4x5k.ondigitalocean.app/#/reset-password?token=${resetToken}`;
        
        // Überprüfe E-Mail-Konfiguration
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return res.status(500).json({
                message: 'Serverfehler: E-Mail-Dienst nicht konfiguriert. Bitte kontaktieren Sie den Administrator.'
            });
        }
        
        try {
            // Entfernen der Leerzeichen im Passwort
            const emailPass = process.env.EMAIL_PASS.replace(/\s+/g, '');
            
            // Nodemailer-Konfiguration
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT),
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: emailPass
                }
            });

            await transporter.verify();

            await transporter.sendMail({
                from: '"SyntheChat" <' + process.env.EMAIL_USER + '>',
                to: email,
                subject: 'Passwort zurücksetzen für SyntheChat',
                html: `
                    <h2>Passwort zurücksetzen</h2>
                    <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.</p>
                    <p>Bitte klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:</p>
                    <a href="${resetUrl}">Passwort zurücksetzen</a>
                    <p>Dieser Link ist nur für eine Stunde gültig.</p>
                    <p>Falls Sie keine Anfrage zum Zurücksetzen Ihres Passworts gestellt haben, können Sie diese E-Mail ignorieren.</p>
                `
            });
            
            res.status(200).json({ 
                message: 'Ein Link zum Zurücksetzen des Passworts wurde an Ihre E-Mail-Adresse gesendet.' 
            });
        } catch (emailError) {
            console.error('Fehler beim E-Mail-Versand:', emailError);
            res.status(500).json({
                message: 'Ein Fehler ist beim Versand der Passwort-Reset-E-Mail aufgetreten.',
                error: emailError.message
            });
        }
    } catch (error) {
        console.error('Fehler beim Passwort-Reset:', error);
        res.status(500).json({ 
            message: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
            error: error.message
        });
    }
});

// Route zur Validierung des Reset-Tokens
router.get('/reset-password/validate', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ message: 'Token ist erforderlich.' });
        }

        // Suche Benutzer mit dem Reset-Token und prüfe, ob er noch gültig ist
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ 
                message: 'Der Token zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.' 
            });
        }

        res.status(200).json({ 
            message: 'Token ist gültig.',
            email: user.email 
        });
    } catch (error) {
        console.error('Fehler bei der Token-Validierung:', error);
        res.status(500).json({ message: error.message });
    }
});

// Route zum Zurücksetzen des Passworts
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token und neues Passwort sind erforderlich.' });
        }

        // Suche Benutzer mit dem Reset-Token und prüfe, ob er noch gültig ist
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ 
                message: 'Der Token zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.' 
            });
        }

        // Setze neues Passwort
        // Hinweis: Das Hashing geschieht durch das pre-save Middleware im User-Modell
        user.password = newPassword;
        
        // Token und Ablaufzeit löschen
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        res.status(200).json({ 
            message: 'Passwort erfolgreich zurückgesetzt.' 
        });
    } catch (error) {
        console.error('Fehler beim Zurücksetzen des Passworts:', error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;