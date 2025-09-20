const express = require("express");
const ChatsRouter = express.Router();
const pool = require("../config/bd");
const authMiddleware = require("../middlewares/authMiddleware");

// Helper para proteger rotas
const protect = (minRole = 0) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// Função auxiliar para verificar acesso ao chat
async function verifyChatAccess(connection, chatId, userId) {
    const [chat] = await connection.execute(
        `SELECT tipo FROM chats WHERE id = ?`,
        [chatId]
    );

    if (chat.length === 0) return false;

    if (chat[0].tipo === 'dm') {
        // DM: deve ter exatamente 2 participantes, incluindo o usuário
        const [participants] = await connection.execute(
            `SELECT user_id FROM chat_participants WHERE chat_id = ?`,
            [chatId]
        );
        const participantIds = participants.map(p => p.user_id);
        if (participantIds.length !== 2 || !participantIds.includes(userId)) {
            return false;
        }
    } else {
        // Chat público: só verifica se o usuário participa
        const [participants] = await connection.execute(
            `SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
            [chatId, userId]
        );
        if (participants.length === 0) return false;
    }

    return true;
}

// ==================== Mensagens ====================

// GET /chats/:chatId/messages?page=1
ChatsRouter.get('/:chatId/messages', protect(0)(async (req, res) => {
    const chatId = req.params.chatId;
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;

    try {
        const connection = await pool.getConnection();

        // Verifica acesso ao chat (DM ou público)
        const canAccess = await verifyChatAccess(connection, chatId, req.user.id);
        if (!canAccess) {
            connection.release();
            return res.status(403).json({ message: "Você não pode acessar este chat" });
        }

        // Busca mensagens mais recentes
        const [messages] = await connection.execute(
            `SELECT cm.id, cm.user_id, u.username, cm.mensagem, cm.created_at
             FROM chat_messages cm
             JOIN users u ON cm.user_id = u.id
             WHERE cm.chat_id = ?
             ORDER BY cm.created_at DESC
             LIMIT ? OFFSET ?`,
            [chatId, limit, offset]
        );

        // Atualiza última mensagem lida
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
        res.json({ page, messages: messages.reverse() });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar mensagens" });
    }
}));

// POST /chats/:chatId/messages
ChatsRouter.post('/:chatId/messages', protect(0)(async (req, res) => {
  const chatId = req.params.chatId;
  const { mensagem } = req.body;

  if (!mensagem || mensagem.trim() === '') 
    return res.status(400).json({ message: "Mensagem não pode ser vazia" });

  try {
    const connection = await pool.getConnection();

    // Verifica acesso ao chat (DM ou público)
    const canAccess = await verifyChatAccess(connection, chatId, req.user.id);
    if (!canAccess) {
      connection.release();
      return res.status(403).json({ message: "Você não pode enviar mensagens para este chat" });
    }

    // Insere a mensagem
    const [result] = await connection.execute(
      `INSERT INTO chat_messages (chat_id, user_id, mensagem) VALUES (?, ?, ?)`,
      [chatId, req.user.id, mensagem]
    );

    // Recupera a mensagem inserida com username
    const [rows] = await connection.execute(
      `SELECT cm.id, cm.mensagem, u.username 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.id = ?`,
      [result.insertId]
    );

    connection.release();

    // Retorna exatamente o que o frontend espera
    res.json({
      id: rows[0].id,
      mensagem: rows[0].mensagem,
      username: rows[0].username
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erro ao enviar mensagem" });
  }
}));

// ==================== Criação de chats ====================

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
    const { otherUserId, creatorId } = req.body;

    if (!otherUserId || !creatorId) 
        return res.status(400).json({ message: "IDs dos usuários são obrigatórios" });

    // Usuário comum só pode criar DM envolvendo ele mesmo
    if (req.user.role !== 1 && creatorId != req.user.id) {
        return res.status(403).json({ message: "Você só pode criar DM em seu próprio nome" });
    }

    if (creatorId === otherUserId)
        return res.status(400).json({ message: "Não é possível criar DM consigo mesmo" });

    try {
        const connection = await pool.getConnection();

        // Verifica se já existe DM entre esses dois usuários
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

        // Cria a DM
        const [result] = await connection.execute(
            `INSERT INTO chats (tipo, criado_por, nome) VALUES ('dm', ?, NULL)`,
            [creatorId]
        );
        const chatId = result.insertId;

        // Insere os dois participantes
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

        // Busca chats públicos e DMs do usuário
        const [chats] = await connection.execute(
            `SELECT c.id, c.nome, c.tipo, c.criado_por, c.created_at,
                    cm.id AS lastMessageId,
                    cm.mensagem AS lastMessage, cm.created_at AS lastMessageAt,
                    u.username AS lastMessageUser
             FROM chats c
             JOIN chat_participants cp ON c.id = cp.chat_id
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
                     SELECT chat_id 
                     FROM chat_participants 
                     WHERE user_id = ?
                 ))
             ORDER BY lastMessageAt DESC, c.created_at DESC`,
            [req.user.id]
        );

        // Busca participantes e unreadCount
        for (const chat of chats) {
            const [participants] = await connection.execute(
                `SELECT u.id, u.username
                 FROM chat_participants cp
                 JOIN users u ON cp.user_id = u.id
                 WHERE cp.chat_id = ?`,
                [chat.id]
            );
            chat.participants = participants;

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

// GET /chats/users (somente admin)
ChatsRouter.get('/users', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [users] = await connection.execute(
            `SELECT id, username FROM users ORDER BY username`
        );
        connection.release();
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao listar usuários" });
    }
}));


module.exports = ChatsRouter;