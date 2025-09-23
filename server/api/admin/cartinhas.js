const express = require("express");
const AdminCartinhasRouter = express.Router();
const pool = require("../../config/bd");
const authMiddleware = require("../../middlewares/authMiddleware");

// Helper para proteger rotas (apenas admin nível 1)
const protect = (minRole = 1) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Utilitários ====================

// Função para aplicar filtros de status nas queries
function buildStatusFilter(status) {
    switch (status) {
        case 'nao_lida':
            return 'AND c.lida = FALSE';
        case 'lida':
            return 'AND c.lida = TRUE';
        case 'favorita':
            return 'AND c.favoritada = TRUE';
        default:
            return '';
    }
}

// ==================== Endpoints ====================

// GET /admin/cartinhas/estatisticas - Estatísticas gerais
AdminCartinhasRouter.get('/estatisticas', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [stats] = await connection.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN lida = FALSE THEN 1 ELSE 0 END) as nao_lidas,
                SUM(CASE WHEN lida = TRUE THEN 1 ELSE 0 END) as lidas,
                SUM(CASE WHEN favoritada = TRUE THEN 1 ELSE 0 END) as favoritas
            FROM cartinhas
        `);

        connection.release();
        res.json(stats[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar estatísticas" });
    }
}));

// GET /admin/cartinhas/usuarios - Listar usuários com estatísticas de cartinhas
AdminCartinhasRouter.get('/usuarios', protect(1)(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const usuario = req.query.usuario; // ID do usuário para filtrar
    const status = req.query.status;   // nao_lida, lida, favorita
    const search = req.query.search;   // busca por username

    const offset = (page - 1) * limit;

    try {
        const connection = await pool.getConnection();

        // Construir filtros
        let whereConditions = [];
        let queryParams = [];

        if (usuario) {
            whereConditions.push('u.id = ?');
            queryParams.push(usuario);
        }

        if (search && search.trim() !== '') {
            whereConditions.push('u.username LIKE ?');
            queryParams.push(`%${search}%`);
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ') 
            : '';

        // Monta filtro de status (deve retornar "" ou "AND c.lida = TRUE", etc.)
        const statusFilter = buildStatusFilter(status);

        // Query principal
        const sqlQuery = `
            SELECT 
                u.id,
                u.username,
                u.profile_image,
                COUNT(c.id) as total_cartinhas,
                SUM(CASE WHEN c.lida = FALSE THEN 1 ELSE 0 END) as nao_lidas,
                SUM(CASE WHEN c.lida = TRUE THEN 1 ELSE 0 END) as lidas,
                SUM(CASE WHEN c.favoritada = TRUE THEN 1 ELSE 0 END) as favoritas
            FROM users u
            LEFT JOIN cartinhas c ON u.id = c.destinatario_id ${statusFilter}
            ${whereClause}
            GROUP BY u.id, u.username, u.profile_image
            HAVING total_cartinhas > 0
            ORDER BY total_cartinhas DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const [usuarios] = await connection.execute(sqlQuery, queryParams);

        // Query de contagem total
        const countQuery = `
            SELECT COUNT(DISTINCT u.id) as total
            FROM users u
            LEFT JOIN cartinhas c ON u.id = c.destinatario_id ${statusFilter}
            ${whereClause}
            HAVING COUNT(c.id) > 0
        `;
        const [countResult] = await connection.execute(countQuery, queryParams);

        const totalItems = countResult[0]?.total || 0;
        const totalPages = Math.ceil(totalItems / limit);

        connection.release();

        res.json({
            usuarios: usuarios || [],
            currentPage: page,
            totalPages,
            totalItems
        });

    } catch (err) {
        res.status(500).json({ message: "Erro ao carregar usuários e estatísticas" });
    }
}));

// GET /admin/cartinhas/usuario/:userId - Listar cartinhas de um usuário específico
AdminCartinhasRouter.get('/usuario/:userId', protect(1)(async (req, res) => {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const status = req.query.status;
    const search = req.query.search;

    const offset = (page - 1) * limit;

    try {
        const connection = await pool.getConnection();

        // Construir filtros
        let whereConditions = ['c.destinatario_id = ?'];
        let queryParams = [userId];

        const statusFilter = buildStatusFilter(status);
        if (statusFilter) {
            whereConditions.push(statusFilter.replace('AND ', ''));
        }

        if (search) {
            whereConditions.push('(c.titulo LIKE ? OR c.conteudo LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = 'WHERE ' + whereConditions.join(' AND ');

        // Buscar cartinhas com LIMIT/OFFSET interpolados
        const [cartinhas] = await connection.execute(`
            SELECT 
                c.id,
                c.titulo,
                c.conteudo,
                c.data_envio,
                c.lida,
                c.favoritada,
                c.remetente_id,
                r.username as remetente_username
            FROM cartinhas c
            JOIN users r ON c.remetente_id = r.id
            ${whereClause}
            ORDER BY c.data_envio DESC
            LIMIT ${limit} OFFSET ${offset}
        `, queryParams);

        // Contar total para paginação
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as total
            FROM cartinhas c
            ${whereClause}
        `, queryParams);

        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        connection.release();
        res.json({
            cartinhas,
            currentPage: page,
            totalPages,
            totalItems
        });

    } catch (err) {
        console.error('[API] Erro ao carregar cartinhas do usuário:', err);
        res.status(500).json({ message: "Erro ao carregar cartinhas do usuário" });
    }
}));

// GET /admin/cartinhas/:cartinhaId - Obter detalhes de uma cartinha específica
AdminCartinhasRouter.get('/:cartinhaId', protect(1)(async (req, res) => {
    const cartinhaId = req.params.cartinhaId;

    try {
        const connection = await pool.getConnection();

        const [cartinhas] = await connection.execute(`
            SELECT 
                c.id,
                c.titulo,
                c.conteudo,
                c.data_envio,
                c.data_lida as data_leitura,
                c.lida,
                c.favoritada,
                c.remetente_id,
                r.username as remetente_username,
                c.destinatario_id,
                d.username as destinatario_username
            FROM cartinhas c
            JOIN users r ON c.remetente_id = r.id
            JOIN users d ON c.destinatario_id = d.id
            WHERE c.id = ?
        `, [cartinhaId]);

        if (cartinhas.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Cartinha não encontrada" });
        }

        connection.release();
        res.json(cartinhas[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar detalhes da cartinha" });
    }
}));

// DELETE /admin/cartinhas/remover - Remover cartinhas selecionadas
AdminCartinhasRouter.delete('/remover', protect(1)(async (req, res) => {
    const { cartinhaIds } = req.body;

    if (!cartinhaIds || !Array.isArray(cartinhaIds) || cartinhaIds.length === 0) {
        return res.status(400).json({ message: "IDs de cartinhas são obrigatórios" });
    }

    try {
        const connection = await pool.getConnection();

        // Converter IDs para integers e filtrar valores válidos
        const validIds = cartinhaIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));

        if (validIds.length === 0) {
            connection.release();
            return res.status(400).json({ message: "Nenhum ID válido fornecido" });
        }

        // Criar placeholders para a query
        const placeholders = validIds.map(() => '?').join(',');

        const [result] = await connection.execute(`
            DELETE FROM cartinhas WHERE id IN (${placeholders})
        `, validIds);

        connection.release();
        res.json({
            removidas: result.affectedRows,
            message: "Cartinhas removidas com sucesso"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao remover cartinhas" });
    }
}));

// POST /admin/cartinhas/limpeza - Executar limpeza automática
AdminCartinhasRouter.post('/limpeza', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Limpa apenas cartinhas lidas e não favoritadas com mais de 3 dias
        const [result] = await connection.execute(`
            DELETE FROM cartinhas 
            WHERE lida = TRUE 
            AND favoritada = FALSE 
            AND data_lida < DATE_SUB(NOW(), INTERVAL 3 DAY)
        `);

        connection.release();
        res.json({
            removidas: result.affectedRows,
            message: "Limpeza automática executada com sucesso"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao executar limpeza automática" });
    }
}));

module.exports = AdminCartinhasRouter;