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
        sameSite: 'lax',   // 'lax' permite teste sem HTTPS
        secure: false,      // HTTPS não é necessário
        maxAge: 1000 * 60 * 60 * 24 // 1 dia
    }
});

// ==================== Middlewares ====================
// CORS liberado para qualquer IP na rede local
app.use(cors({
    origin: (origin, callback) => {
        // Permite qualquer IP da rede local
        callback(null, true);
    },
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(cookieParser());
app.use(sessionMiddleware);
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas
app.use('/', require('./server/api/main'));
app.use('/chats', require('./server/api/chats'));

// ==================== Socket.IO ====================
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => callback(null, true), // qualquer IP
        credentials: true,
        methods: ['GET','POST']
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

// ==================== Helpers ====================
async function verifyChatAccess(connection, chatId, userId) {
    const [rows] = await connection.execute(
        `SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
        [chatId, userId]
    );
    return rows.length > 0;
}

// ==================== Helpers ====================
async function verifyChatAccess(connection, chatId, userId) {
    const [rows] = await connection.execute(
        `SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
        [chatId, userId]
    );
    return rows.length > 0;
}

// ==================== Eventos Socket.IO ====================
io.on('connection', (socket) => {
    console.log(`Usuário conectado: ${socket.id}, userId: ${socket.userId}`);

    socket.on('joinChat', (chatId) => {
        socket.join(`chat_${chatId}`);
        console.log(`Usuário ${socket.userId} entrou na sala chat_${chatId}`);
    });

    socket.on('sendMessage', async ({ chatId, mensagem }) => {
        const userId = socket.userId;
        if (!chatId || !mensagem) return;

        try {
            const connection = await pool.getConnection();

            const canAccess = await verifyChatAccess(connection, chatId, userId);
            if (!canAccess) {
                connection.release();
                return socket.emit('errorMessage', 'Você não tem acesso a este chat');
            }

            const [result] = await connection.execute(
                `INSERT INTO chat_messages (chat_id, user_id, mensagem) VALUES (?, ?, ?)`,
                [chatId, userId, mensagem]
            );

            const [rows] = await connection.execute(
                `SELECT cm.id, cm.chat_id, cm.user_id, u.username, cm.mensagem, cm.created_at
                 FROM chat_messages cm
                 JOIN users u ON cm.user_id = u.id
                 WHERE cm.id = ?`,
                [result.insertId]
            );

            const msgData = {
                id: rows[0].id,
                chatId: rows[0].chat_id,
                userId: rows[0].user_id,
                text: rows[0].mensagem,
                username: rows[0].username,
                createdAt: rows[0].created_at,
                seen: true
            };

            await connection.execute(
                `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE last_read_message_id = ?`,
                [chatId, userId, msgData.id, msgData.id]
            );

            const [participants] = await connection.execute(
                `SELECT user_id FROM chat_participants WHERE chat_id = ? AND user_id != ?`,
                [chatId, userId]
            );

            for (const p of participants) {
                await connection.execute(
                    `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
                     VALUES (?, ?, 0)
                     ON DUPLICATE KEY UPDATE last_read_message_id = last_read_message_id`,
                    [chatId, p.user_id]
                );
            }

            connection.release();

            io.to(`chat_${chatId}`).emit('newMessage', {
                ...msgData,
                lastMessage: msgData.text,
                lastMessageAt: msgData.createdAt,
                unreadCount: 1
            });

        } catch (err) {
            console.error(err);
            socket.emit('errorMessage', 'Erro ao enviar mensagem');
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuário desconectado: ${socket.id}`);
    });
});

// ==================== Inicia servidor ====================
httpServer.listen(porta, '0.0.0.0', () => {
    console.log(`Servidor rodando na rede local: http://${process.env.HOST || 'localhost'}:${porta} com Socket.IO`);
});
