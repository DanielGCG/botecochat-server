const express = require('express');
const path = require('path');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const cors = require('cors');
const http = require('http');
const session = require('express-session');
const { Server } = require('socket.io');
const pool = require('./server/config/bd');
const authMiddleware = require('./server/middlewares/authMiddleware');

const app = express();
const porta = process.env.PORT || 4040;

// ==================== Sessão ====================
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'umaChaveSecretaQualquer',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 1000 * 60 * 60 * 24
    }
});

// ==================== Middlewares ====================
// CORS liberado para qualquer IP na rede local
app.use(cors({
    origin: (origin, callback) => callback(null, true), // qualquer origem
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(cookieParser());
app.use(sessionMiddleware);
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); 
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
app.use('/', require('./server/api/main'));
const ChatsRouter = require('./server/api/chats');
const { setupSocketHandlers } = ChatsRouter;
app.use('/chats', ChatsRouter);

// ==================== Socket.IO ====================
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => callback(null, true), // qualquer origem
        methods: ['GET','POST'],
        credentials: true
    }
});

// Middleware helper para Socket.IO usar middlewares Express
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

io.use(wrap(cookieParser()));        // lê cookies
io.use(wrap(sessionMiddleware));     // lê sessão
io.use(wrap(authMiddleware));        // popula req.user

// Checa autenticação
io.use((socket, next) => {
    if (!socket.request.user) return next(new Error('Usuário não autenticado'));
    socket.userId = socket.request.user.id;
    next();
});

// ==================== Configura Socket.IO Handlers ====================
setupSocketHandlers(io);

// ==================== Inicia servidor ====================
httpServer.listen(porta, '0.0.0.0', () => {
    console.log(`Servidor rodando na rede local: http://${process.env.HOST || 'localhost'}:${porta} com Socket.IO`);
});
