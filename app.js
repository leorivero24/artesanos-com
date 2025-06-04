const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser'); // ✨ NUEVO: Importar cookie-parser

const app = express();

// Configurar motor de vistas Pug
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middlewares para parsear el cuerpo de las peticiones
app.use(express.urlencoded({ extended: true })); // Para formularios HTML tradicionales (URL-encoded)
app.use(express.json()); // Para parsear cuerpos de petición JSON (como el de tu login con fetch)

app.use(cookieParser()); // ✨ NUEVO: Middleware para parsear cookies. ¡Importante para JWT en cookies!

app.use(express.static(path.join(__dirname, 'public')));

// Configurar sesión (la mantenemos por ahora, pero las rutas con JWT no la usarán para autenticación)
app.use(session({
  secret: 'clave_secreta_segura',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 } // 1 hora
}));

// Middleware para hacer disponible el usuario en las vistas (si aún usas sesiones en algunas vistas)
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  next();
});

// Importar rutas de autenticación
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// Importar el middleware de autenticación
const authMiddleware = require('./middlewares/authMiddleware');

// Aplicar el middleware 'authMiddleware' a la ruta /dashboard
// Ahora, para acceder a /dashboard, se necesitará un token JWT válido en la cookie
app.get('/dashboard', authMiddleware, (req, res) => {
  // Si llegamos aquí, significa que authMiddleware verificó el token
  // y adjuntó los datos del usuario a req.usuario
  res.render('dashboard', {
    nombreUsuario: req.usuario.nombre, // Pasamos el nombre desde el token decodificado
    emailUsuario: req.usuario.email    // Pasamos el email desde el token decodificado
  });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});