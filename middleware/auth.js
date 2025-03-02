const jwt = require('jsonwebtoken');

// Middleware zur Überprüfung des JWT Tokenss
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Kein Token vorhanden, Authentifizierung fehlgeschlagen' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Ungültiges Token, Authentifizierung fehlgeschlagen' });
    }
};

module.exports = verifyToken;