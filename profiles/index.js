// profiles/index.js
const express = require('express');
const profileRoutes = require('./routes/profile.routes');
const Profile = require('./models/profile');

/**
 * Initialisiert das Profilmodul und registriert die Routen am Express-Server
 * @param {Object} app - Express-Anwendung
 * @param {string} baseUrl - Basis-URL für Profil-Routen
 */
const initProfileModule = (app, baseUrl = '/api/profiles') => {
  // Profil-Routen registrieren
  app.use(baseUrl, profileRoutes);
  
  // Statischen Ordner für Profilbilder verfügbar machen
  const path = require('path');
  const uploadsDir = path.join(__dirname, '../uploads/profileImages');
  app.use('/uploads/profileImages', express.static(uploadsDir));
  
  console.log(`Profilmodul initialisiert. Routen verfügbar unter ${baseUrl}`);
  
  return {
    routes: profileRoutes,
    model: Profile
  };
};

module.exports = {
  initProfileModule,
  profileRoutes,
  Profile
};