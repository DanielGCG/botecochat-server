const express = require("express");
const AdminChatsRouter = express.Router();
const pool = require("../../config/bd");
const authMiddleware = require("../../middlewares/authMiddleware");

// Helper para proteger rotas (apenas admin nível 1)
const protect = (minRole = 1) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Endpoints Administrativos de Chats ====================

// GET /admin/chats/estatisticas - Estatísticas gerais de chats
AdminChatsRouter.get('/estatisticas', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [stats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_chats,
                SUM(CASE WHEN tipo = 'dm' THEN 1 ELSE 0 END) as total_dms,
                SUM(CASE WHEN tipo = 'public' THEN 1 ELSE 0 END) as total_publicos,
                (SELECT COUNT(*) FROM chat_messages) as total_mensagens,
                (SELECT COUNT(DISTINCT user_id) FROM chat_participants) as usuarios_ativos
            FROM chats
        `);

        connection.release();
        res.json(stats[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar estatísticas de chats" });
    }
}));

// GET /admin/chats - Listar todos os chats com informações detalhadas
AdminChatsRouter.get('/', protect(1)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const tipo = req.query.tipo; // 'dm' ou 'public'
    const search = req.query.search; // busca por nome ou participantes

    const offset = (page - 1) * limit;

    try {
        const connection = await pool.getConnection();

        // Construir filtros
        let whereConditions = [];
        let queryParams = [];

        if (tipo) {
            whereConditions.push('c.tipo = ?');
            queryParams.push(tipo);
        }

        if (search && search.trim() !== '') {
            whereConditions.push(`(
                c.nome LIKE ? 
                OR EXISTS (
                    SELECT 1 
                    FROM chat_participants cp 
                    JOIN users u ON cp.user_id = u.id 
                    WHERE cp.chat_id = c.id 
                    AND u.username LIKE ?
                )
            )`);
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ') 
            : '';

        // Query principal
        const sqlQuery = `
            SELECT 
                c.id,
                c.nome,
                c.tipo,
                c.created_at,
                uc.username as criado_por_username,
                (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) as total_participantes,
                (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) as total_mensagens,
                (SELECT created_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as ultima_mensagem
            FROM chats c
            JOIN users uc ON c.criado_por = uc.id
            ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [chats] = await connection.execute(sqlQuery, queryParams);

        // Buscar participantes para cada chat
        for (let chat of chats) {
            const [participantes] = await connection.execute(`
                SELECT u.id, u.username
                FROM chat_participants cp
                JOIN users u ON cp.user_id = u.id
                WHERE cp.chat_id = ?
            `, [chat.id]);
            
            chat.participantes = participantes;
        }

        // Contar total para paginação
        const countQuery = `
            SELECT COUNT(*) as total
            FROM chats c
            ${whereClause}
        `;
        const [countResult] = await connection.execute(countQuery, queryParams);

        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        connection.release();

        res.json({
            chats,
            currentPage: page,
            totalPages,
            totalItems
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar chats" });
    }
}));

// GET /admin/chats/:chatId - Detalhes de um chat específico
AdminChatsRouter.get('/:chatId', protect(1)(async (req, res) => {
    const chatId = req.params.chatId;

    try {
        const connection = await pool.getConnection();

        // Buscar informações do chat
        const [chatInfo] = await connection.execute(`
            SELECT 
                c.*,
                uc.username as criado_por_username
            FROM chats c
            JOIN users uc ON c.criado_por = uc.id
            WHERE c.id = ?
        `, [chatId]);

        if (chatInfo.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Chat não encontrado" });
        }

        // Buscar participantes
        const [participantes] = await connection.execute(`
            SELECT u.id, u.username, u.profile_image
            FROM chat_participants cp
            JOIN users u ON cp.user_id = u.id
            WHERE cp.chat_id = ?
        `, [chatId]);

        // Buscar estatísticas de mensagens
        const [msgStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_mensagens,
                MIN(created_at) as primeira_mensagem,
                MAX(created_at) as ultima_mensagem
            FROM chat_messages
            WHERE chat_id = ?
        `, [chatId]);

        connection.release();

        res.json({
            ...chatInfo[0],
            participantes,
            estatisticas_mensagens: msgStats[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar detalhes do chat" });
    }
}));

// DELETE /admin/chats/:chatId - Deletar um chat
AdminChatsRouter.delete('/:chatId', protect(1)(async (req, res) => {
    const chatId = req.params.chatId;

    try {
        const connection = await pool.getConnection();

        // Verificar se o chat existe
        const [chatExists] = await connection.execute('SELECT id FROM chats WHERE id = ?', [chatId]);
        
        if (chatExists.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Chat não encontrado" });
        }

        // Deletar chat (CASCADE vai deletar mensagens e participantes)
        await connection.execute('DELETE FROM chats WHERE id = ?', [chatId]);

        connection.release();
        res.json({ message: "Chat deletado com sucesso" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao deletar chat" });
    }
}));

// GET /admin/chats/:chatId/mensagens - Listar mensagens de um chat (admin)
AdminChatsRouter.get('/:chatId/mensagens', protect(1)(async (req, res) => {
    const chatId = req.params.chatId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search; // busca por conteúdo da mensagem

    const offset = (page - 1) * limit;

    try {
        const connection = await pool.getConnection();

        // Verificar se o chat existe
        const [chatExists] = await connection.execute('SELECT id FROM chats WHERE id = ?', [chatId]);
        
        if (chatExists.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Chat não encontrado" });
        }

        // Construir filtros
        let whereConditions = ['cm.chat_id = ?'];
        let queryParams = [chatId];

        if (search) {
            whereConditions.push('cm.mensagem LIKE ?');
            queryParams.push(`%${search}%`);
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        // Buscar mensagens
        const [mensagens] = await connection.execute(`
            SELECT 
                cm.id,
                cm.mensagem,
                cm.created_at,
                u.id as user_id,
                u.username
            FROM chat_messages cm
            JOIN users u ON cm.user_id = u.id
            ${whereClause}
            ORDER BY cm.created_at DESC
            LIMIT ? OFFSET ?
        `, [...queryParams, limit, offset]);

        // Contar total para paginação
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM chat_messages cm
            ${whereClause}
        `, queryParams);

        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        connection.release();
        res.json({
            mensagens,
            currentPage: page,
            totalPages,
            totalItems
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar mensagens" });
    }
}));

// DELETE /admin/chats/mensagens/remover - Remover mensagens selecionadas
AdminChatsRouter.delete('/mensagens/remover', protect(1)(async (req, res) => {
    const { mensagemIds } = req.body;

    if (!mensagemIds || !Array.isArray(mensagemIds) || mensagemIds.length === 0) {
        return res.status(400).json({ message: "IDs de mensagens são obrigatórios" });
    }

    try {
        const connection = await pool.getConnection();

        // Converter IDs para integers e filtrar valores válidos
        const validIds = mensagemIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));

        if (validIds.length === 0) {
            connection.release();
            return res.status(400).json({ message: "Nenhum ID válido fornecido" });
        }

        // Criar placeholders para a query
        const placeholders = validIds.map(() => '?').join(',');

        const [result] = await connection.execute(`
            DELETE FROM chat_messages WHERE id IN (${placeholders})
        `, validIds);

        connection.release();
        res.json({
            removidas: result.affectedRows,
            message: "Mensagens removidas com sucesso"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao remover mensagens" });
    }
}));

// POST /admin/chats/public - Criar chat público (apenas admin)
AdminChatsRouter.post('/public', protect(1)(async (req, res) => {
    const { nome } = req.body;

    if (!nome || typeof nome !== "string" || nome.length < 3 || nome.length > 50) {
        return res.status(400).json({ message: "Nome do chat público deve ter entre 3 e 50 caracteres." });
    }

    try {
        const connection = await pool.getConnection();

        // Verifica se já existe um chat público com esse nome
        const [exists] = await connection.execute(
            "SELECT id FROM chats WHERE nome = ? AND tipo = 'public'",
            [nome]
        );
        if (exists.length > 0) {
            connection.release();
            return res.status(409).json({ message: "Já existe um chat público com esse nome." });
        }

        // Cria o chat público
        await connection.execute(
            "INSERT INTO chats (nome, tipo, criado_por, created_at) VALUES (?, 'public', ?, NOW())",
            [nome, req.user.id]
        );

        connection.release();
        res.status(201).json({ message: "Chat público criado com sucesso." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar chat público." });
    }
}));

// POST /admin/chats/dm - Criar DM entre dois usuários (apenas admin)
AdminChatsRouter.post('/dm', protect(1)(async (req, res) => {
    const { user1Id, user2Id } = req.body;

    if (!user1Id || !user2Id || user1Id === user2Id) {
        return res.status(400).json({ message: "IDs de usuários válidos e diferentes são obrigatórios." });
    }

    try {
        const connection = await pool.getConnection();

        // Verifica se ambos os usuários existem
        const [users] = await connection.execute(
            "SELECT id FROM users WHERE id IN (?, ?)",
            [user1Id, user2Id]
        );
        if (users.length !== 2) {
            connection.release();
            return res.status(404).json({ message: "Um ou ambos os usuários não existem." });
        }

        // Verifica se já existe uma DM entre esses usuários
        const [dmExists] = await connection.execute(`
            SELECT c.id
            FROM chats c
            JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
            JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
            WHERE c.tipo = 'dm'
        `, [user1Id, user2Id]);
        if (dmExists.length > 0) {
            connection.release();
            return res.status(409).json({ message: "Já existe uma DM entre esses usuários." });
        }

        // Cria o chat DM
        const [chatResult] = await connection.execute(
            "INSERT INTO chats (nome, tipo, criado_por, created_at) VALUES (?, 'dm', ?, NOW())",
            [`DM: ${user1Id} & ${user2Id}`, req.user.id]
        );
        const chatId = chatResult.insertId;

        // Adiciona participantes
        await connection.execute(
            "INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)",
            [chatId, user1Id, chatId, user2Id]
        );

        connection.release();
        res.status(201).json({ message: "DM criada com sucesso!", chatId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar DM." });
    }
}));

// PUT /admin/chats/:chatId - Editar DM (nome e participantes, apenas admin)
AdminChatsRouter.put('/:chatId', protect(1)(async (req, res) => {
    const chatId = req.params.chatId;
    const { nome, participants } = req.body;

    if (!nome || typeof nome !== "string" || nome.length < 3 || nome.length > 50) {
        return res.status(400).json({ message: "Nome do chat deve ter entre 3 e 50 caracteres." });
    }

    try {
        const connection = await pool.getConnection();

        // Verifica se o chat existe e é DM
        const [chatInfo] = await connection.execute(
            "SELECT tipo FROM chats WHERE id = ?",
            [chatId]
        );
        if (chatInfo.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Chat não encontrado." });
        }
        if (chatInfo[0].tipo !== 'dm') {
            connection.release();
            return res.status(400).json({ message: "Só é possível editar DMs por este endpoint." });
        }

        // Atualiza nome
        await connection.execute(
            "UPDATE chats SET nome = ? WHERE id = ?",
            [nome, chatId]
        );

        // Atualiza participantes se fornecido
        if (Array.isArray(participants) && participants.length === 2) {
            const [user1, user2] = participants;
            if (user1 === user2) {
                connection.release();
                return res.status(400).json({ message: "Participantes devem ser diferentes." });
            }

            // Verifica se ambos os usuários existem
            const [users] = await connection.execute(
                "SELECT id FROM users WHERE id IN (?, ?)",
                [user1, user2]
            );
            if (users.length !== 2) {
                connection.release();
                return res.status(404).json({ message: "Um ou ambos os usuários não existem." });
            }

            // Remove participantes antigos
            await connection.execute(
                "DELETE FROM chat_participants WHERE chat_id = ?",
                [chatId]
            );

            // Adiciona novos participantes
            await connection.execute(
                "INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)",
                [chatId, user1, chatId, user2]
            );
        }

        connection.release();
        res.json({ message: "DM atualizada com sucesso." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao atualizar DM." });
    }
}));

// POST /admin/chats/limpeza - Limpeza automática de chats inativos
AdminChatsRouter.post('/limpeza', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Estratégia: remover chats DM sem mensagens há mais de 30 dias
        const [result] = await connection.execute(`
            DELETE FROM chats 
            WHERE tipo = 'dm' 
            AND id NOT IN (
                SELECT DISTINCT chat_id 
                FROM chat_messages 
                WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
            )
            AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        connection.release();
        res.json({
            removidos: result.affectedRows,
            message: "Limpeza automática de chats executada com sucesso"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao executar limpeza automática" });
    }
}));

module.exports = AdminChatsRouter;