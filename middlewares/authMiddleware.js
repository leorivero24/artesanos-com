// middlewares/authMiddleware.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = 'clave_super_segura'; // ¡Asegúrate de que esta clave coincida con la de auth.js!

const authMiddleware = (req, res, next) => {
  // ✨ CAMBIO CLAVE AQUÍ: Leer el token de las cookies
  const token = req.cookies.authToken; // Asegúrate de tener 'cookie-parser' configurado en tu app.js

  if (!token) {
    console.log(`No se proporcionó token en cookies para: ${req.originalUrl}`);
    // Si no hay token, redirige al login. Para APIs, podrías enviar un 401.
    return res.status(401).redirect('/login'); // Redirige directamente al login si no hay token
  }

  try {
    // Verificar el token usando la clave secreta
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded; // Adjuntar el usuario decodificado al objeto de solicitud
    next(); // Continuar con la siguiente función de middleware o el controlador de la ruta
  } catch (error) {
    console.error('Error al verificar el token desde cookies:', error);
    // Un token inválido o expirado debe borrar la cookie y redirigir al login
    res.clearCookie('authToken'); // Borra la cookie inválida
    return res.status(403).redirect('/login'); // Redirige al login
  }
};

module.exports = authMiddleware;


