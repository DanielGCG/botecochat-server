const express = require("express");
const ChatsRouter = express.Router();
const pool = require("../config/bd");
const authMiddleware = require("../middlewares/authMiddleware");

// Helper para proteger rotas
const protect = (minRole = 0) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Auxiliares ====================

// Verifica se o usuário tem acesso ao chat (ID ou nome)
async function verifyChatAccess(connection, chatIdentifier, userId) {
    let query, param;

    if (isNaN(chatIdentifier)) { // nome do chat
        query = `SELECT id, tipo FROM chats WHERE nome = ?`;
        param = [chatIdentifier];
    } else { // ID
        query = `SELECT id, tipo FROM chats WHERE id = ?`;
        param = [chatIdentifier];
    }

    const [chat] = await connection.execute(query, param);
    if (chat.length === 0) return false;

    if (chat[0].tipo === 'dm') {
        const [participants] = await connection.execute(
            `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
            [chat[0].id]
        );
        const participantIds = participants.map(p => p.user_id);
        if (participantIds.length !== 2 || !participantIds.includes(userId)) return false;
    }

    return true;
}

// Obtém ID do usuário pelo username
async function getUserIdByUsername(connection, username) {
    const [rows] = await connection.execute(`SELECT id FROM users WHERE username = ?`, [username]);
    if (rows.length === 0) return null;
    return rows[0].id;
}

// ==================== Mensagens ====================

// GET /chats/:chatIdentifier/messages?page=1
ChatsRouter.get('/:chatIdentifier/messages', protect(0)(async (req, res) => {
    const chatIdentifier = req.params.chatIdentifier;
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    try {
        const connection = await pool.getConnection();

        // Obtém ID do chat
        let chatId;
        if (isNaN(chatIdentifier)) {
            const [chatRows] = await connection.execute(
                `SELECT id FROM chats WHERE nome = ?`,
                [chatIdentifier]
            );
            if (chatRows.length === 0) {
                connection.release();
                return res.status(404).json({ message: "Chat não encontrado" });
            }
            chatId = chatRows[0].id;
        } else {
            chatId = parseInt(chatIdentifier, 10);
        }

        // Verifica acesso
        const canAccess = await verifyChatAccess(connection, chatId, req.user.id);
        if (!canAccess) {
            connection.release();
            return res.status(403).json({ message: "Você não pode acessar este chat" });
        }

        console.log(`${chatId}, ${limit}, ${offset}`);

        // Busca mensagens (LIMIT e OFFSET via template literal)
        const [messages] = await connection.execute(
            `SELECT cm.id, cm.user_id, u.username, cm.mensagem, cm.created_at
             FROM chat_messages cm
             JOIN users u ON cm.user_id = u.id
             WHERE cm.chat_id = ?
             ORDER BY cm.created_at ASC
             LIMIT ${limit} OFFSET ${offset}`,
            [chatId]
        );

        // Atualiza last_read_message_id para o usuário
        if (messages.length > 0) {
            const lastMessageId = messages[messages.length - 1].id;
            await connection.execute(
                `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE last_read_message_id = ?`,
                [chatId, req.user.id, lastMessageId, lastMessageId]
            );
        }

        connection.release();

        res.json({
            page,
            messages: messages.map(m => ({
                id: m.id,
                username: m.username,
                mensagem: m.mensagem,
                isMine: m.user_id === req.user.id,
                createdAt: m.created_at
            }))
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar mensagens" });
    }
}));

// POST /chats/:chatIdentifier/messages
ChatsRouter.post('/:chatIdentifier/messages', protect(0)(async (req, res) => {
    const chatIdentifier = req.params.chatIdentifier;
    const { mensagem } = req.body;

    if (!mensagem || mensagem.trim() === '')
        return res.status(400).json({ message: "Mensagem não pode ser vazia" });

    try {
        const connection = await pool.getConnection();

        // Obtém ID do chat
        let chatId;
        if (isNaN(chatIdentifier)) {
            const [chatRows] = await connection.execute(`SELECT id FROM chats WHERE nome = ?`, [chatIdentifier]);
            if (chatRows.length === 0) {
                connection.release();
                return res.status(404).json({ message: "Chat não encontrado" });
            }
            chatId = chatRows[0].id;
        } else {
            chatId = chatIdentifier;
        }

        // Verifica acesso
        const canAccess = await verifyChatAccess(connection, chatId, req.user.id);
        if (!canAccess) {
            connection.release();
            return res.status(403).json({ message: "Você não pode enviar mensagens para este chat" });
        }

        // Insere mensagem
        const [result] = await connection.execute(
            `INSERT INTO chat_messages (chat_id, user_id, mensagem) VALUES (?, ?, ?)`,
            [chatId, req.user.id, mensagem]
        );

        // Busca mensagem recém-criada
        const [rows] = await connection.execute(
            `SELECT cm.id, cm.mensagem, u.username, cm.user_id, cm.created_at
             FROM chat_messages cm 
             JOIN users u ON cm.user_id = u.id 
             WHERE cm.id = ?`,
            [result.insertId]
        );

        // Atualiza last_read_message_id do remetente
        await connection.execute(
            `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE last_read_message_id = ?`,
            [chatId, req.user.id, rows[0].id, rows[0].id]
        );

        connection.release();

        res.json({
            id: rows[0].id,
            mensagem: rows[0].mensagem,
            username: rows[0].username,
            isMine: true,
            createdAt: rows[0].created_at
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao enviar mensagem" });
    }
}));

// ---------------- Lista todas as DMs do usuário ----------------
ChatsRouter.get('/', protect(0)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Busca chats do usuário
        const [chats] = await connection.execute(
            `SELECT c.id, c.nome, c.tipo
             FROM chats c
             JOIN chat_participants cp ON c.id = cp.chat_id
             WHERE cp.user_id = ?`,
            [req.user.id]
        );

        const chatList = [];

        for (const chat of chats) {
            // Participantes do chat
            const [participants] = await connection.execute(
                `SELECT u.id, u.username
                 FROM chat_participants cp
                 JOIN users u ON cp.user_id = u.id
                 WHERE cp.chat_id = ?`,
                [chat.id]
            );

            const participantsInfo = participants.map(p => ({
                id: p.id,
                username: p.username,
                isMine: p.id === req.user.id
            }));

            // Última mensagem
            const [lastMsgRows] = await connection.execute(
                `SELECT mensagem, created_at FROM chat_messages
                 WHERE chat_id = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [chat.id]
            );

            const lastMessage = lastMsgRows[0]?.mensagem || null;
            const lastMessageAt = lastMsgRows[0]?.created_at || null;

            // Contagem não lidas
            const [unreadRows] = await connection.execute(
                `SELECT COUNT(*) AS unreadCount
                 FROM chat_messages cm
                 LEFT JOIN chat_reads cr ON cm.id = cr.last_read_message_id AND cr.user_id = ?
                 WHERE cm.chat_id = ? AND (cr.last_read_message_id IS NULL OR cm.id > cr.last_read_message_id)`,
                [req.user.id, chat.id]
            );

            chatList.push({
                id: chat.id,
                nome: chat.nome,
                tipo: chat.tipo,
                participants: participantsInfo,
                lastMessage,
                lastMessageAt,
                unreadCount: unreadRows[0].unreadCount
            });
        }

        connection.release();
        res.json(chatList);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar chats" });
    }
}));

// ---------------- Lista todos os usuários disponíveis ----------------
ChatsRouter.get('/users', protect(0)(async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const userId = req.user.id;

        const [users] = await connection.execute(
            `SELECT u.id, u.username
             FROM users u
             WHERE u.id != ?
               AND NOT EXISTS (
                   SELECT 1
                   FROM chats c
                   JOIN chat_participants cp ON c.id = cp.chat_id
                   WHERE c.tipo = 'dm'
                     AND cp.user_id = u.id
                     AND c.id IN (
                         SELECT chat_id
                         FROM chat_participants
                         WHERE user_id = ?
                     )
               )`,
            [userId, userId]
        );

        console.log('Usuários retornados:', users);
        connection.release();
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar usuários" });
    }
}));

// ---------------- Criar uma nova DM ----------------
ChatsRouter.post('/dm', protect(0)(async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "Informe o username do outro usuário" });

    try {
        const connection = await pool.getConnection();

        // ID do usuário destinatário
        const [users] = await connection.execute(
            `SELECT id FROM users WHERE username = ?`,
            [username]
        );
        if (!users.length) {
            connection.release();
            return res.status(404).json({ message: "Usuário não encontrado" });
        }
        const otherUserId = users[0].id;

        // Verifica se já existe DM entre os dois
        const [existingChats] = await connection.execute(
            `SELECT c.id FROM chats c
             JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
             JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
             WHERE c.tipo = 'dm'`,
            [req.user.id, otherUserId]
        );

        if (existingChats.length > 0) {
            connection.release();
            return res.status(409).json({ message: "DM já existe", chatId: existingChats[0].id });
        }

        // Cria novo chat DM
        const [result] = await connection.execute(
            `INSERT INTO chats (tipo) VALUES ('dm')`
        );
        const chatId = result.insertId;

        // Insere participantes
        await connection.execute(
            `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)`,
            [chatId, req.user.id, chatId, otherUserId]
        );

        connection.release();
        res.status(201).json({ message: "DM criada", chatId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar DM" });
    }
}));


module.exports = ChatsRouter;
