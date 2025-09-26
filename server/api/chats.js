const express = require("express");
const ChatsRouter = express.Router();
const pool = require("../config/bd");
const authMiddleware = require("../middlewares/authMiddleware");

// Helper para proteger rotas
const protect = (minRole = 0) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Funções Auxiliares ====================

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

// ==================== Endpoints de Mensagens ====================

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

        // REMOVIDO: Não marca automaticamente como lida pelo remetente
        // O remetente só deve marcar como lida quando realmente visualizar

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

// ==================== Endpoints de Gerenciamento de Chats ====================

// GET /chats - Lista todas as DMs do usuário
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
                WHERE cm.chat_id = ?
                AND cm.id > COALESCE((
                    SELECT last_read_message_id
                    FROM chat_reads
                    WHERE chat_id = ? AND user_id = ?
                ), 0)`,
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

// GET /chats/users - Lista todos os usuários disponíveis para DM
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
                JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = u.id
                JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
                WHERE c.tipo = 'dm'
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

// POST /chats/dm - Criar uma nova DM
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

// ==================== Socket.IO Handlers ====================

// Função helper específica para Socket.IO (mais simples que a de cima)
async function verifyChatAccessSocket(connection, chatId, userId) {
    const [rows] = await connection.execute(
        `SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?`,
        [chatId, userId]
    );
    return rows.length > 0;
}

// Configura os eventos Socket.IO para chats
function setupSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log(`✅ Usuário conectado: ${socket.username} (${socket.userId})`);

        // Entrar em um chat
        socket.on('joinChat', async (chatId) => {
            try {
                const connection = await pool.getConnection();
                
                // Verificar se tem acesso ao chat
                const hasAccess = await verifyChatAccessSocket(connection, chatId, socket.userId);
                if (!hasAccess) {
                    connection.release();
                    return socket.emit('error', { message: 'Acesso negado ao chat' });
                }

                // Entrar na sala
                socket.join(`chat_${chatId}`);
                console.log(`👥 ${socket.username} entrou no chat ${chatId}`);

                // Marcar mensagens como lidas
                const [lastMsg] = await connection.execute(
                    `SELECT id FROM chat_messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1`,
                    [chatId]
                );

                if (lastMsg.length > 0) {
                    await connection.execute(
                        `INSERT INTO chat_reads (chat_id, user_id, last_read_message_id)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE last_read_message_id = ?`,
                        [chatId, socket.userId, lastMsg[0].id, lastMsg[0].id]
                    );

                    // Notificar outros participantes sobre a leitura
                    socket.to(`chat_${chatId}`).emit('updateLastRead', {
                        chatId: chatId,
                        userId: socket.userId,
                        lastReadMessageId: lastMsg[0].id
                    });
                }

                connection.release();
                socket.emit('joinedChat', { chatId, success: true });

            } catch (err) {
                console.error('Erro ao entrar no chat:', err);
                socket.emit('error', { message: 'Erro ao entrar no chat' });
            }
        });

        // Enviar mensagem
        socket.on('sendMessage', async ({ chatId, mensagem }) => {
            if (!chatId || !mensagem || mensagem.trim() === '') {
                return socket.emit('error', { message: 'Dados inválidos' });
            }

            try {
                const connection = await pool.getConnection();

                // Verificar acesso
                const hasAccess = await verifyChatAccessSocket(connection, chatId, socket.userId);
                if (!hasAccess) {
                    connection.release();
                    return socket.emit('error', { message: 'Acesso negado ao chat' });
                }

                // Inserir mensagem
                const [result] = await connection.execute(
                    `INSERT INTO chat_messages (chat_id, user_id, mensagem) VALUES (?, ?, ?)`,
                    [chatId, socket.userId, mensagem.trim()]
                );

                // Buscar mensagem completa
                const [msgRows] = await connection.execute(
                    `SELECT cm.id, cm.chat_id, cm.user_id, u.username, cm.mensagem, cm.created_at
                     FROM chat_messages cm
                     JOIN users u ON cm.user_id = u.id
                     WHERE cm.id = ?`,
                    [result.insertId]
                );

                const message = msgRows[0];
                
                // REMOVIDO: Não marca automaticamente como lida pelo remetente
                // O remetente só deve marcar como lida quando realmente visualizar

                connection.release();

                // Estrutura da mensagem que o frontend espera
                const messageData = {
                    id: message.id,
                    userId: message.user_id,
                    username: message.username,
                    text: message.mensagem,
                    created_at: message.created_at,
                    seen: false // Mensagem não é marcada como vista até ser visualizada
                };

                // Emitir no formato que o frontend espera
                io.to(`chat_${chatId}`).emit('newMessage', {
                    chatId: chatId,
                    message: messageData,
                    lastMessage: message.mensagem,
                    lastMessageAt: message.created_at,
                    unreadCount: 1 // Para outros usuários
                });

                // REMOVIDO: Não emite evento de leitura automaticamente
                // O evento de leitura só deve ser emitido quando realmente visualizar

                console.log(`💬 Nova mensagem no chat ${chatId}: ${socket.username}`);

            } catch (err) {
                console.error('Erro ao enviar mensagem:', err);
                socket.emit('error', { message: 'Erro ao enviar mensagem' });
            }
        });

        // Sair do chat
        socket.on('leaveChat', (chatId) => {
            socket.leave(`chat_${chatId}`);
            console.log(`👋 ${socket.username} saiu do chat ${chatId}`);
        });

        // Desconexão
        socket.on('disconnect', (reason) => {
            console.log(`❌ ${socket.username} desconectado: ${reason}`);
        });

        // Tratamento de erros
        socket.on('error', (error) => {
            console.error(`Erro no socket ${socket.username}:`, error);
        });
    });
}

// Export principal para compatibilidade
module.exports = ChatsRouter;

// Export adicional para o Socket.IO
module.exports.setupSocketHandlers = setupSocketHandlers;
