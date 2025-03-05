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
 * Generiere einen einzigartigen Benutzernamen basierend auf der E-Mail
 * @param {string} email - Die E-Mail-Adresse des Benutzers
 * @returns {string} Ein generierter Benutzername
 */
async function generateUniqueUsername(email, name) {
  // Basis-Benutzername erstellen
  let baseUsername = '';
  
  if (name) {
    // Wenn ein Name vorhanden ist, verwende diesen als Basis
    baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  } else {
    // Sonst verwende den Teil der E-Mail vor dem @
    baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  
  // Überprüfe, ob der Basis-Benutzername bereits existiert
  let username = baseUsername;
  let userExists = await User.findOne({ username });
  let counter = 1;
  
  // Wenn der Benutzername existiert, füge eine Zahl hinzu und erhöhe sie, bis ein freier Name gefunden wird
  while (userExists) {
    username = `${baseUsername}${counter}`;
    userExists = await User.findOne({ username });
    counter++;
  }
  
  return username;
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
      // Einen einzigartigen Benutzernamen generieren
      const username = await generateUniqueUsername(googleUserData.email, googleUserData.name);
      
      // Neuen Nutzer erstellen, wenn er nicht existiert
      user = new User({
        email: googleUserData.email,
        name: googleUserData.name,
        username: username, // Setze einen generierten Benutzernamen
        profilePicture: googleUserData.picture,
        googleId: googleUserData.googleId,
        isVerified: googleUserData.emailVerified, // Auch isVerified setzen
        emailVerified: googleUserData.emailVerified,
        authProvider: 'google'
      });
      
      await user.save();
    } else {
      // Aktualisiere Google-ID, falls der Nutzer sich zum ersten Mal mit Google anmeldet
      if (!user.googleId) {
        user.googleId = googleUserData.googleId;
        user.authProvider = user.authProvider || 'google';
        
        // Wenn der Nutzer sich zuvor lokal registriert hat und keinen Benutzernamen hat,
        // generiere einen
        if (!user.username) {
          user.username = await generateUniqueUsername(googleUserData.email, googleUserData.name);
        }
        
        await user.save();
      }
      
      // Bei einem bestehenden Nutzer setzen wir auch isVerified basierend auf Google's Email-Verifizierung
      if (googleUserData.emailVerified && !user.isVerified) {
        user.isVerified = true;
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
        profilePicture: user.profilePicture,
        isVerified: user.isVerified
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