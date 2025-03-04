const { OAuth2Client } = require('google-auth-library');
const User = require('./models/User'); // Passe den Pfad an, falls nötig

// Google OAuth2 Client erstellen
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifiziert das Google-Token und gibt die Nutzerdaten zurück
 * @param {string} token - Das Google ID-Token vom Frontend
 * @returns {Object} Die verifizierten Nutzerdaten
 */
async function verifyGoogleToken(token) {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    
    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      googleId: payload.sub,
      emailVerified: payload.email_verified
    };
  } catch (error) {
    console.error('Fehler bei der Google-Token-Verifizierung:', error);
    throw new Error('Ungültiges Google-Token');
  }
}

/**
 * Verarbeitet den Google-Login oder erstellt einen neuen Nutzer
 * @param {Object} googleUserData - Die verifizierten Google-Nutzerdaten
 * @returns {Object} Nutzerdaten mit JWT-Token
 */
async function processGoogleLogin(googleUserData) {
  try {
    // Prüfen, ob der Nutzer bereits in der Datenbank existiert
    let user = await User.findOne({ email: googleUserData.email });
    
    if (!user) {
      // Neuen Nutzer erstellen, wenn er nicht existiert
      user = new User({
        email: googleUserData.email,
        name: googleUserData.name,
        profilePicture: googleUserData.picture,
        googleId: googleUserData.googleId,
        emailVerified: googleUserData.emailVerified,
        authProvider: 'google'
      });
      
      await user.save();
    } else {
      // Aktualisiere Google-ID, falls der Nutzer sich zum ersten Mal mit Google anmeldet
      if (!user.googleId) {
        user.googleId = googleUserData.googleId;
        user.authProvider = user.authProvider || 'google';
        await user.save();
      }
    }
    
    // JWT-Token generieren (nutze deine bestehende Methode)
    const token = user.generateAuthToken ? user.generateAuthToken() : null;
    
    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture
      },
      token
    };
  } catch (error) {
    console.error('Fehler bei der Verarbeitung des Google-Logins:', error);
    throw error;
  }
}

module.exports = {
  verifyGoogleToken,
  processGoogleLogin
};