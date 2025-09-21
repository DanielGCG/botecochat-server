const express = require("express");
const ChatsRouter = express.Router();
const pool = require("../config/bd");
const authMiddleware = require("../middlewares/authMiddleware");

// Helper para proteger rotas
const protect = (minRole = 0) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Funções auxiliares ====================

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

        // Verifica se o usuário tem acesso ao chat
        const canAccess = await verifyChatAccess(connection, chatIdentifier, req.user.id);
        if (!canAccess) {
            connection.release();
            return res.status(403).json({ message: "Você não pode acessar este chat" });
        }

        // Obtém o ID do chat
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

        // Busca mensagens
        const [messages] = await connection.execute(
            `SELECT cm.id, cm.user_id, u.username, cm.mensagem, cm.created_at
             FROM chat_messages cm
             JOIN users u ON cm.user_id = u.id
             WHERE cm.chat_id = ?
             ORDER BY cm.created_at DESC
             LIMIT ? OFFSET ?`,
            [chatId, limit, offset]
        );

        // Formata mensagens
        const formattedMessages = messages.map(m => ({
            id: m.id,
            username: m.username,
            mensagem: m.mensagem,
            isMine: m.user_id === req.user.id,
            created_at: m.created_at
        }));

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

        // Obtém last_read_message_id do outro participante (para DMs)
        const [readRows] = await connection.execute(
            `SELECT last_read_message_id FROM chat_reads WHERE chat_id = ? AND user_id = ?`,
            [chatId, req.user.id]
        );
        const lastReadMessageId = readRows.length ? readRows[0].last_read_message_id : 0;

        connection.release();

        // Retorna mensagens + lastReadMessageId
        res.json({
            page,
            messages: formattedMessages.reverse(),
            lastReadMessageId
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

        const canAccess = await verifyChatAccess(connection, chatId, req.user.id);
        if (!canAccess) {
            connection.release();
            return res.status(403).json({ message: "Você não pode enviar mensagens para este chat" });
        }

        const [result] = await connection.execute(
            `INSERT INTO chat_messages (chat_id, user_id, mensagem) VALUES (?, ?, ?)`,
            [chatId, req.user.id, mensagem]
        );

        const [rows] = await connection.execute(
            `SELECT cm.id, cm.mensagem, u.username, cm.user_id, cm.created_at
             FROM chat_messages cm 
             JOIN users u ON cm.user_id = u.id 
             WHERE cm.id = ?`,
            [result.insertId]
        );

        connection.release();

        res.json({
            id: rows[0].id,
            mensagem: rows[0].mensagem,
            username: rows[0].username,
            isMine: rows[0].user_id === req.user.id,
            createdAt: rows[0].created_at,
            seen: false
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao enviar mensagem" });
    }
}));

// ==================== Criação de chats & DMs ====================

// POST /chats/public
ChatsRouter.post('/public', protect(0)(async (req, res) => {
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ message: "Nome do chat é obrigatório" });

    try {
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            `INSERT INTO chats (nome, tipo, criado_por) VALUES (?, 'public', ?)`,
            [nome.trim(), req.user.id]
        );
        const chatId = result.insertId;

        await connection.execute(
            `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)`,
            [chatId, req.user.id]
        );

        connection.release();
        res.status(201).json({ message: "Chat público criado", chatId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar chat público" });
    }
}));

// POST /chats/dm
ChatsRouter.post('/dm', protect(0)(async (req, res) => {
    const { username } = req.body;
    const creatorId = req.user.id;

    if (!username) return res.status(400).json({ message: "Username do outro usuário é obrigatório" });

    try {
        const connection = await pool.getConnection();
        const otherUserId = await getUserIdByUsername(connection, username);

        if (!otherUserId) {
            connection.release();
            return res.status(404).json({ message: "Usuário não encontrado" });
        }

        if (creatorId === otherUserId) {
            connection.release();
            return res.status(400).json({ message: "Não é possível criar DM consigo mesmo" });
        }

        const [existing] = await connection.execute(
            `SELECT c.id
             FROM chats c
             JOIN chat_participants cp1 ON c.id = cp1.chat_id
             JOIN chat_participants cp2 ON c.id = cp2.chat_id
             WHERE c.tipo = 'dm' AND cp1.user_id = ? AND cp2.user_id = ?`,
            [creatorId, otherUserId]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ message: "DM já existe", chatId: existing[0].id });
        }

        const [result] = await connection.execute(
            `INSERT INTO chats (tipo, criado_por, nome) VALUES ('dm', ?, NULL)`,
            [creatorId]
        );
        const chatId = result.insertId;

        await connection.execute(
            `INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)`,
            [chatId, creatorId, chatId, otherUserId]
        );

        connection.release();
        res.status(201).json({ message: "DM criada com sucesso", chatId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar DM" });
    }
}));

// ==================== Listagem de chats ====================

// GET /chats
ChatsRouter.get('/', protect(0)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [chats] = await connection.execute(
            `SELECT c.id, c.nome, c.tipo, c.criado_por, c.created_at,
                cm.id AS lastMessageId,
                cm.mensagem AS lastMessage, cm.created_at AS lastMessageAt,
                u.username AS lastMessageUser
            FROM chats c
            LEFT JOIN chat_messages cm ON cm.id = (
                SELECT cm2.id
                FROM chat_messages cm2
                WHERE cm2.chat_id = c.id
                ORDER BY cm2.created_at DESC
                LIMIT 1
            )
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE 
                c.tipo = 'public'
                OR (c.tipo = 'dm' AND c.id IN (
                    SELECT chat_id FROM chat_participants WHERE user_id = ?
                ))
            ORDER BY lastMessageAt DESC, c.created_at DESC`,
            [req.user.id]
        );

        for (const chat of chats) {
            const [participants] = await connection.execute(
                `SELECT u.username, u.id FROM chat_participants cp
                 JOIN users u ON cp.user_id = u.id
                 WHERE cp.chat_id = ?`,
                [chat.id]
            );
            chat.participants = participants.map(p => ({
                username: p.username,
                isMine: p.id === req.user.id
            }));

            const [unread] = await connection.execute(
                `SELECT COUNT(*) AS unreadCount
                 FROM chat_messages cm
                 LEFT JOIN chat_reads cr ON cr.chat_id = cm.chat_id AND cr.user_id = ?
                 WHERE cm.chat_id = ? AND (cr.last_read_message_id IS NULL OR cm.id > cr.last_read_message_id)`,
                [req.user.id, chat.id]
            );
            chat.unreadCount = unread[0].unreadCount;
        }

        connection.release();
        res.json(chats);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao listar chats" });
    }
}));

// GET /chats/users
ChatsRouter.get('/users', protect(0)(async (req, res) => {
    const userId = req.user.id;
    try {
        const connection = await pool.getConnection();

        const [users] = await connection.execute(
            `SELECT u.username
             FROM users u
             WHERE u.id != ?
               AND u.id NOT IN (
                   SELECT CASE 
                       WHEN cp1.user_id = ? THEN cp2.user_id
                       ELSE cp1.user_id
                   END AS other_user_id
                   FROM chat_participants cp1
                   JOIN chat_participants cp2 ON cp1.chat_id = cp2.chat_id
                   JOIN chats c ON cp1.chat_id = c.id
                   WHERE c.tipo = 'dm' AND (cp1.user_id = ? OR cp2.user_id = ?)
               )
             ORDER BY u.username`,
            [userId, userId, userId, userId]
        );

        connection.release();
        res.json(users.map(u => ({ username: u.username })));

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao listar usuários" });
    }
}));

module.exports = ChatsRouter;