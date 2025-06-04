const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../models/db');
const crypto = require('crypto');

const JWT_SECRET = 'clave_super_segura'; // 🔒 Recomendado mover a .env
const BASE_URL = 'http://localhost:3000'; // Cambiar en producción

// 👉 Configurar transporte Nodemailer con Gmail y clave de app
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'leo.exerivero@gmail.com', // ✅ TU EMAIL GMAIL AQUÍ
    pass: 'otpqdkydoixxnzhm'     // ✅ CONTRASEÑA DE APLICACIÓN (sin espacios)
  }
});

// Mostrar login
router.get('/login', (req, res) => {
  res.render('login');
});

// Procesar login (AHORA BASADO EN TOKEN)
router.post('/login', async (req, res) => {
  const { email, contrasena } = req.body;

  if (!email || !contrasena) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
  }

  try {
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
      if (err) {
        console.error('Error al consultar la base de datos durante el login:', err);
        return res.status(500).json({ mensaje: 'Error interno del servidor. Inténtalo de nuevo más tarde.' });
      }

      if (results.length === 0) {
        return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
      }

      const user = results[0];

      if (user.activo === 0) {
        return res.status(403).json({ mensaje: 'Tu cuenta no ha sido activada. Por favor, revisa tu correo electrónico.' });
      }

      const passwordMatch = await bcrypt.compare(contrasena, user.contrasena);

      if (passwordMatch) {
        const token = jwt.sign(
          { id: user.id, email: user.email, nombre: user.nombre, apellido: user.apellido },
          JWT_SECRET,
          { expiresIn: '1h' }
        );

        // ✨ CAMBIO CLAVE AQUÍ: Establecer el token como una cookie HttpOnly
        res.cookie('authToken', token, {
          httpOnly: true, // No accesible desde JavaScript del lado del cliente
          secure: process.env.NODE_ENV === 'production', // Solo enviar en HTTPS en producción
          sameSite: 'Lax', // Protección CSRF básica
          maxAge: 3600000 // 1 hora en milisegundos (misma duración que el token)
        });

        // Excluir la contraseña del objeto de usuario
        const { contrasena: userPassword, ...userData } = user;

        res.status(200).json({
          mensaje: 'Inicio de sesión exitoso',
          // Ya no enviamos el 'token' directamente en el JSON, ya va en la cookie
          usuario: userData // Datos del usuario sin la contraseña
        });

      } else {
        return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
      }
    });
  } catch (error) {
    console.error('Error general en login:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor al procesar el login.' });
  }
});

// 👉 Mostrar formulario para solicitar restablecimiento de contraseña
router.get('/olvide-contrasena', (req, res) => {
  res.render('olvide-contrasena');
});

// 👉 Ruta para solicitar el restablecimiento de contraseña
router.post('/solicitar-restablecimiento', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ mensaje: 'Por favor, introduce tu correo electrónico.' });
  }

  // 1. Buscar al usuario por email
  db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error('Error al buscar usuario para restablecimiento:', err);
      return res.status(500).json({ mensaje: 'Error del servidor. Inténtalo de nuevo más tarde.' });
    }

    const user = results[0];

    // Importante: Por seguridad, siempre da un mensaje genérico
    // para evitar que un atacante sepa si el email existe o no.
    if (!user) {
      return res.status(200).json({ mensaje: 'Si el correo electrónico está registrado, recibirás un enlace para restablecer tu contraseña.' });
    }

    // 2. Generar un token único y seguro
    const resetToken = crypto.randomBytes(32).toString('hex'); // Token de 64 caracteres hexadecimales
    const expires = Date.now() + 3600000; // El token expira en 1 hora (3600000 ms)

    // 3. Guardar el token y su expiración en la base de datos
    // Usaremos la columna 'token_validacion' y una nueva 'token_expiracion' (si no existe, la crearemos)
    // Es CRÍTICO que el campo de la base de datos sea lo suficientemente largo para almacenar este token (VARCHAR(255) o TEXT)
    // La columna 'token_expiracion' debe ser de tipo BIGINT o DATETIME
    db.query(
      'UPDATE usuarios SET token_validacion = ?, token_expiracion = ? WHERE id = ?',
      [resetToken, expires, user.id],
      async (updateErr, updateResult) => {
        if (updateErr) {
          console.error('Error al guardar token de restablecimiento:', updateErr);
          return res.status(500).json({ mensaje: 'Error del servidor al procesar la solicitud.' });
        }

        // 4. Enviar un correo electrónico al usuario con el enlace
        const resetUrl = `${BASE_URL}/restablecer-contrasena?token=${resetToken}`;

        const mailOptions = {
          from: 'leo.exerivero@gmail.com', // Tu email de Gmail
          to: user.email,
          subject: 'Restablecer tu contraseña de artesanos.com',
          html: `
            <p>Hola ${user.nombre},</p>
            <p>Has solicitado restablecer tu contraseña para tu cuenta de artesanos.com.</p>
            <p>Por favor, haz clic en el siguiente enlace para restablecer tu contraseña:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>Este enlace expirará en 1 hora.</p>
            <p>Si no solicitaste un restablecimiento de contraseña, por favor ignora este correo.</p>
            <p>Gracias,</p>
            <p>El equipo de artesanos.com</p>
          `
        };

        try {
          await transporter.sendMail(mailOptions);
          res.status(200).json({ mensaje: 'Se ha enviado un enlace de restablecimiento a tu correo electrónico. Por favor, revisa tu bandeja de entrada.' });
        } catch (mailError) {
          console.error('Error al enviar correo de restablecimiento:', mailError);
          res.status(500).json({ mensaje: 'Error al enviar el correo de restablecimiento. Inténtalo de nuevo más tarde.' });
        }
      }
    );
  });
});


// 👉 Procesar el restablecimiento de contraseña
router.post('/restablecer-contrasena', async (req, res) => {
  const { token, nuevaContrasena } = req.body;

  if (!token || !nuevaContrasena) {
    return res.status(400).json({ mensaje: 'Token y nueva contraseña son obligatorios.' });
  }

  // 1. Buscar al usuario por el token de restablecimiento y verificar expiración
  db.query(
    'SELECT id, email, token_expiracion FROM usuarios WHERE token_validacion = ?',
    [token],
    async (err, results) => {
      if (err) {
        console.error('Error al buscar usuario por token:', err);
        return res.status(500).json({ mensaje: 'Error del servidor. Inténtalo de nuevo más tarde.' });
      }

      const user = results[0];

      if (!user) {
        return res.status(400).json({ mensaje: 'Token inválido o ya ha sido utilizado.' });
      }

      // Verificar si el token ha expirado
      if (user.token_expiracion < Date.now()) {
        // Opcional: Limpiar el token expirado de la base de datos
        db.query('UPDATE usuarios SET token_validacion = NULL, token_expiracion = NULL WHERE id = ?', [user.id]);
        return res.status(400).json({ mensaje: 'El token ha expirado. Por favor, solicita un nuevo enlace de restablecimiento.' });
      }

      // 2. Hashear la nueva contraseña
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(nuevaContrasena, saltRounds);

      // 3. Actualizar la contraseña del usuario y limpiar los campos del token
      db.query(
        'UPDATE usuarios SET contrasena = ?, token_validacion = NULL, token_expiracion = NULL WHERE id = ?',
        [hashedPassword, user.id],
        (updateErr, updateResult) => {
          if (updateErr) {
            console.error('Error al actualizar contraseña:', updateErr);
            return res.status(500).json({ mensaje: 'Error del servidor al restablecer la contraseña.' });
          }

          res.status(200).json({ mensaje: 'Contraseña restablecida exitosamente.' });
        }
      );
    }
  );
});




// 👉 Mostrar formulario para restablecer contraseña (con el token de la URL)
router.get('/restablecer-contrasena', (req, res) => {
  const { token } = req.query; // Obtiene el token de la URL

  if (!token) {
    // Si no hay token en la URL, redirigir o mostrar un error
    return res.status(400).send('Token de restablecimiento no proporcionado.');
  }
  
  // Pasar el token a la vista para que el formulario lo incluya
  res.render('restablecer-contrasena', { token: token });
});


// Mostrar registro
router.get('/registro', (req, res) => {
  res.render('registro');
});

// Procesar registro
router.post('/registro', async (req, res) => {
  const { nombre, apellido, email, contrasena } = req.body;

  if (!nombre || !apellido || !email || !contrasena) {
    return res.send('Todos los campos son obligatorios.');
  }

  try {
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
      if (err) return res.send('Error de base de datos.');

      if (results.length > 0) {
        return res.render('registro', {
          mensaje: 'Este correo ya está registrado.',
          tipo: 'error',
          nombre: req.body.nombre,    // Pasa el nombre de vuelta
          apellido: req.body.apellido, // Pasa el apellido de vuelta
          email: req.body.email      // Pasa el email de vuelta
        });
      }

      const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });

      const insertQuery = `
        INSERT INTO usuarios (nombre, apellido, email, contrasena, activo, token_activacion)
        VALUES (?, ?, ?, ?, 0, ?)
      `;

      db.query(insertQuery, [nombre, apellido, email, hashedPassword, token], async (err) => {
        if (err) {
          console.error(err);
          return res.send('Error al registrar.');
        }

        const link = `${BASE_URL}/activar?token=${token}`;

        const mailOptions = {
          from: 'Artesanos <no-reply@artesanos.com>', // Debe coincidir con el user del transporter
          to: email,
          subject: 'Activa tu cuenta',
          html: `<p>Hola ${nombre},</p>
                 <p>Gracias por registrarte. Activa tu cuenta haciendo clic en el siguiente enlace:</p>
                 <a href="${link}">Activar cuenta</a><br/>
                 <small>Este enlace expirará en 15 minutos.</small>`
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('📧 Correo enviado a', email);

            res.send(`
              <html>
                <head>
                  <meta charset="UTF-8">
                  <title>Registro exitoso</title>
                  <style>
                    body { font-family: sans-serif; text-align: center; padding: 50px; background-color: #f4f4f4; }
                    .mensaje { color: green; font-size: 18px; }
                  </style>
                  <script>
                    setTimeout(() => {
                      window.location.href = "/login";
                    }, 3000);
                  </script>
                </head>
                <body>
                  <div class="mensaje">
                    <p>✅ Registro exitoso.</p>
                    <p>📧 Correo enviado a <strong>${email}</strong></p>
                    <p>Redirigiendo en 3 segundos...</p>
                  </div>
                </body>
              </html>
            `);
        } catch (mailError) {
            console.error('Error al enviar correo de activación:', mailError);
            res.send('Registro exitoso, pero hubo un problema al enviar el correo de activación. Por favor, contáctanos.');
        }
      });
    });
  } catch (error) {
    console.error(error);
    res.send('Error al procesar tu registro.');
  }
});


// Activación de cuenta
router.get('/activar', (req, res) => {
  const { token } = req.query;

  if (!token) return res.send('Token no proporcionado.');

  try {
    console.log('Token recibido:', token);
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decodificado:', decoded);

    const email = decoded.email;

    db.query('UPDATE usuarios SET activo = 1 WHERE email = ?', [email], (err, result) => {
      if (err) return res.send('Error al activar la cuenta.');

      if (result.affectedRows === 0) {
        return res.send('La cuenta ya estaba activada o no se encontró.');
      }

      res.send('Cuenta activada correctamente. Ya puedes iniciar sesión.');
    });
  } catch (error) {
    console.error('Error al verificar el token:', error);
    return res.send('Token inválido o expirado.');
  }
});

// Redirección raíz
router.get('/', (req, res) => {
  res.redirect('/login');
});


router.get('/logout', (req, res) => {
  // Eliminar la cookie 'authToken' configurando su expiración en el pasado
  res.cookie('authToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    expires: new Date(0) // Expira inmediatamente (fecha en el pasado)
  });

  // También podrías limpiar req.usuario si lo usas más adelante en la misma solicitud (aunque el redirect lo cortará)
  req.usuario = null;

  // Redirigir al usuario a la página de login
  res.redirect('/login');
});

module.exports = router;