// authMiddleware.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = 'clave_super_segura'; // Asegúrate de que coincida con el de auth.js

const authMiddleware = (req, res, next) => {
  // ✨ CAMBIO CLAVE AQUÍ: Leer el token de las cookies
  const token = req.cookies.authToken; // Asegúrate de tener 'cookie-parser' configurado en tu app.js

  if (!token) {
    console.log(`No se proporcionó token para: ${req.originalUrl}`);
    return res.status(401).json({ mensaje: 'Acceso denegado. No se proporcionó un token de autenticación.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded; // Adjuntar el usuario decodificado al objeto de solicitud
    next(); // Continuar con la siguiente función de middleware o controlador
  } catch (error) {
    console.error('Error al verificar el token:', error);
    return res.status(403).json({ mensaje: 'Token inválido o expirado.' });
  }
};

module.exports = authMiddleware;