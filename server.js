// server.js (Mismo código de la respuesta anterior, ya está listo para manejar likes en cualquier post, incluyendo respuestas.)
require('dotenv').config();

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const Post = require('./models/post');

const app = express();
const server = http.createServer(app);

// --- CONFIGURACIÓN DE MULTER (Subida de Archivos) ---
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
});
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR)); 

// --- Configuración de Sesión ---
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'default-secret-dev',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
});
app.use(sessionMiddleware);

const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json()); 

// --- CONEXIÓN A MONGODB ATLAS ---
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('❌ ERROR: MONGODB_URI no definida'); process.exit(1); }
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas con éxito'))
  .catch(err => { console.error('❌ Error fatal al conectar a MongoDB:', err.message); process.exit(1); });


// --- RUTAS DE VERIFICACIÓN DE USUARIO ---
app.post('/api/login', (req, res) => {
    const { author } = req.body;
    if (!author || author.length < 3) return res.status(400).json({ error: 'Nombre requerido.' });
    
    req.session.author = author.trim();
    res.json({ success: true, author: req.session.author });
});

app.get('/api/user', (req, res) => {
    res.json({ author: req.session.author || null });
});


// --- RUTAS DE PUBLICACIONES Y MULTIMEDIA ---
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Post.find({ $or: [{ type: 'post' }, { type: 'repost' }] })
                               .sort({ createdAt: -1 })
                               .populate('repostOfId');
        res.json(posts);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener publicaciones' });
    }
});

// NUEVA RUTA: Obtener respuestas para un post específico
app.get('/api/posts/:id/replies', async (req, res) => {
    try {
        const replies = await Post.find({ replyToId: req.params.id }).sort({ createdAt: 1 });
        res.json(replies);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener respuestas' });
    }
});

// Ruta para crear publicación (Maneja FormData de Multer)
app.post('/api/posts', upload.single('media'), async (req, res) => {
    const { content, type, replyToId, repostOfId } = req.body;
    const currentAuthor = req.session.author;
    
    // Verificaciones
    if (!currentAuthor) return res.status(401).json({ error: 'Debe iniciar sesión para publicar.' });
    if (!content && !req.file && type !== 'repost') return res.status(400).json({ error: 'Contenido o multimedia son obligatorios.' });
    if (content && content.length > 280) return res.status(400).json({ error: 'Máximo 280 caracteres.' });
    
    try {
        let postData = { author: currentAuthor, content: content || '' , type: type || 'post' };
        
        // Manejar Archivos Subidos
        if (req.file) {
            postData.mediaUrl = '/uploads/' + req.file.filename;
            postData.mediaType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        }

        // Manejar Estructura
        if (type === 'reply' && replyToId) postData.replyToId = replyToId;
        if (type === 'repost' && repostOfId) postData.repostOfId = repostOfId;

        const newPost = new Post(postData);
        await newPost.save();
        
        // Solo emitir a Socket.io si es un post o repost (para el feed principal)
        if (newPost.type === 'post' || newPost.type === 'repost') {
            const populatedPost = await Post.findById(newPost._id).populate('repostOfId');
            io.emit('newPost', populatedPost);
        } else if (newPost.type === 'reply' && newPost.replyToId) {
            // Notificamos para actualizar la vista de respuestas si está abierta
            io.emit('replyUpdate', { replyToId: newPost.replyToId });
        }
        
        res.status(201).json(newPost);
    } catch (err) {
        console.error('Error al crear publicación:', err);
        res.status(500).json({ error: 'Error al crear publicación' });
    }
});


// Ruta para dar "me gusta"
app.post('/api/posts/:id/like', async (req, res) => {
    const currentAuthor = req.session.author;
    if (!currentAuthor) return res.status(401).json({ error: 'Debe iniciar sesión para dar like.' });
    
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: 'Publicación no encontrada' });

        const hasLiked = post.likedBy.includes(currentAuthor);

        if (hasLiked) {
            post.likes -= 1;
            post.likedBy = post.likedBy.filter(author => author !== currentAuthor);
        } else {
            post.likes += 1;
            post.likedBy.push(currentAuthor);
        }

        await post.save();
        
        // Notificación en tiempo real
        io.emit('likeUpdate', { id: post._id, likes: post.likes, isLiked: !hasLiked });
        
        res.json({ likes: post.likes, isLiked: !hasLiked });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar likes' });
    }
});


// --- SOCKET.IO ---
io.on('connection', (socket) => {
    // console.log('👤 Usuario conectado:', socket.id);
    socket.on('disconnect', () => {
        // console.log('🚪 Usuario desconectado:', socket.id);
    });
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});