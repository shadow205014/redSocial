// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');

// --- Modelos ---
const Post = require('./models/Post');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Sirve el frontend (index.html, app.js, style.css)
// Sirve los archivos subidos (fotos de perfil)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Configuración de Multer (para subir archivos) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Guarda los archivos en la carpeta 'uploads'
  },
  filename: (req, file, cb) => {
    // Genera un nombre de archivo único
    cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Aceptar solo imágenes
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// --- Conexión a MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err.message));

// ===============================================
// === 1. RUTAS DE AUTENTICACIÓN ===
// ===============================================
function createToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
}
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' });
    }
    const newUser = new User({ username, password, displayName });
    await newUser.save();
    const token = createToken(newUser._id);
    res.status(201).json({ token, user: {
      username: newUser.username,
      displayName: newUser.displayName,
      profilePictureUrl: newUser.profilePictureUrl
    }});
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar usuario', details: err.message });
  }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = createToken(user._id);
    res.status(200).json({ token, user: {
      username: user.username,
      displayName: user.displayName,
      profilePictureUrl: user.profilePictureUrl
    }});
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// ===============================================
// === 2. MIDDLEWARE DE AUTENTICACIÓN ===
// ===============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"
  if (token == null) {
    return res.status(401).json({ error: 'Acceso denegado' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, userPayload) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = userPayload; 
    next();
  });
};

// ===============================================
// === 3. RUTAS DE POSTS ===
// ===============================================
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', 'username displayName profilePictureUrl') // <-- Se añade profilePictureUrl
      .populate({ 
          path: 'originalPost',
          populate: { path: 'author', select: 'username displayName profilePictureUrl' } 
      })
      .sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});
app.post('/api/posts', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'El contenido es obligatorio' });
    }
    const newPost = new Post({
      author: req.user.id, 
      content: content
    });
    await newPost.save();
    const populatedPost = await newPost.populate('author', 'username displayName profilePictureUrl');
    io.emit('newPost', populatedPost);
    res.status(201).json(populatedPost);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear publicación' });
  }
});
app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Publicación no encontrada' });
    post.likes += 1;
    await post.save();
    io.emit('likeUpdate', { id: post._id, likes: post.likes });
    res.json({ likes: post.likes });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar likes' });
  }
});
app.post('/api/posts/:id/repost', authenticateToken, async (req, res) => {
  try {
    const originalPostId = req.params.id;
    const authorId = req.user.id;
    const originalPost = await Post.findById(originalPostId);
    if (!originalPost) {
      return res.status(404).json({ error: 'Publicación original no encontrada' });
    }
    const repost = new Post({
      author: authorId,
      content: null,
      originalPost: originalPostId
    });
    await repost.save();
    const populatedRepost = await repost
      .populate('author', 'username displayName profilePictureUrl')
      .populate({
          path: 'originalPost',
          populate: { path: 'author', select: 'username displayName profilePictureUrl' } 
      });
    io.emit('newPost', populatedRepost);
    res.status(201).json(populatedRepost);
  } catch (err) {
    res.status(500).json({ error: 'Error al hacer repost' });
  }
});

// ===============================================
// === 4. RUTAS DE PERFIL DE USUARIO ===
// ===============================================

// Ruta para obtener el perfil del usuario autenticado
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password'); // No enviar la contraseña
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Ruta para subir foto de perfil
app.post('/api/users/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }
    // El path.join es para corregir las barras en Windows (\)
    const filePath = path.join('uploads', req.file.filename).replace(/\\/g, '/');

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePictureUrl: filePath }, // Guarda la ruta relativa
      { new: true } // Devuelve el documento actualizado
    ).select('-password');

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Error al subir la imagen', details: err.message });
  }
});

// Ruta pública para ver el perfil y posts de un usuario
app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const posts = await Post.find({ author: user._id })
      .populate('author', 'username displayName profilePictureUrl')
      .populate({
          path: 'originalPost',
          populate: { path: 'author', select: 'username displayName profilePictureUrl' } 
      })
      .sort({ createdAt: -1 });

    res.json({ user, posts });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener posts del usuario' });
  }
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('🚪 Usuario desconectado:', socket.id);
  });
});

// --- Iniciar servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});