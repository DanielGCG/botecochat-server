const express = require("express");
const CartinhasRouter = express.Router();
const pool = require("../config/bd");
const authMiddleware = require("../middlewares/authMiddleware");

// Helper para proteger rotas
const protect = (minRole = 0) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Auxiliares ====================

// Verifica se o usuário tem acesso à cartinha (remetente, destinatário ou admin)
async function verifyCartinhaAccess(connection, cartinhaId, userId, userRole) {
    const [cartinha] = await connection.execute(
        `SELECT remetente_id, destinatario_id FROM cartinhas WHERE id = ?`,
        [cartinhaId]
    );

    if (cartinha.length === 0) return false;

    // Admin sempre tem acesso
    if (userRole >= 1) return true;

    // Usuário deve ser remetente ou destinatário
    const { remetente_id, destinatario_id } = cartinha[0];
    return remetente_id === userId || destinatario_id === userId;
}

// ==================== Rotas ====================

// GET /cartinhas/recebidas - Carregar cartinhas não lidas recebidas
CartinhasRouter.get('/recebidas', protect(0)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [cartinhas] = await connection.execute(
            `SELECT 
                c.id,
                c.titulo,
                c.conteudo,
                c.data_envio,
                c.lida,
                c.favoritada,
                r.username as remetente_username,
                r.profile_image as remetente_avatar
             FROM cartinhas c
             JOIN users r ON c.remetente_id = r.id
             WHERE c.destinatario_id = ? AND c.lida = FALSE
             ORDER BY c.data_envio DESC`,
            [req.user.id]
        );

        connection.release();
        res.json(cartinhas);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar cartinhas recebidas" });
    }
}));

// GET /cartinhas/favoritas - Carregar cartinhas favoritas
CartinhasRouter.get('/favoritas', protect(0)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [cartinhas] = await connection.execute(
            `SELECT 
                c.id,
                c.titulo,
                c.conteudo,
                c.data_envio,
                c.data_lida,
                c.data_favoritada,
                r.username as remetente_username,
                r.profile_image as remetente_avatar
             FROM cartinhas c
             JOIN users r ON c.remetente_id = r.id
             WHERE c.destinatario_id = ? AND c.favoritada = TRUE
             ORDER BY c.data_favoritada DESC`,
            [req.user.id]
        );

        connection.release();
        res.json(cartinhas);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar cartinhas favoritas" });
    }
}));

// GET /cartinhas/:cartinhaId - Carregar conteúdo de uma cartinha específica
CartinhasRouter.get('/:cartinhaId', protect(0)(async (req, res) => {
    const cartinhaId = req.params.cartinhaId;

    try {
        const connection = await pool.getConnection();

        // Verifica se o usuário tem acesso à cartinha
        const hasAccess = await verifyCartinhaAccess(connection, cartinhaId, req.user.id, req.user.role);
        if (!hasAccess) {
            connection.release();
            return res.status(403).json({ message: "Você não tem permissão para acessar esta cartinha" });
        }

        const [cartinhas] = await connection.execute(
            `SELECT 
                c.*,
                r.username as remetente_username,
                r.profile_image as remetente_avatar,
                d.username as destinatario_username,
                d.profile_image as destinatario_avatar
             FROM cartinhas c
             JOIN users r ON c.remetente_id = r.id
             JOIN users d ON c.destinatario_id = d.id
             WHERE c.id = ?`,
            [cartinhaId]
        );

        if (cartinhas.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Cartinha não encontrada" });
        }

        connection.release();
        res.json(cartinhas[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar cartinha" });
    }
}));

// PUT /cartinhas/:cartinhaId/lida - Marcar cartinha como lida
CartinhasRouter.put('/:cartinhaId/lida', protect(0)(async (req, res) => {
    const cartinhaId = req.params.cartinhaId;

    try {
        const connection = await pool.getConnection();

        // Verifica se a cartinha existe e se o usuário é o destinatário
        const [cartinha] = await connection.execute(
            `SELECT destinatario_id, lida FROM cartinhas WHERE id = ?`,
            [cartinhaId]
        );

        if (cartinha.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Cartinha não encontrada" });
        }

        // Apenas o destinatário pode marcar como lida (admin não faz sentido aqui)
        if (cartinha[0].destinatario_id !== req.user.id) {
            connection.release();
            return res.status(403).json({ message: "Apenas o destinatário pode marcar a cartinha como lida" });
        }

        // Se já está lida, não faz nada
        if (cartinha[0].lida) {
            connection.release();
            return res.json({ message: "Cartinha já estava marcada como lida" });
        }

        // Marca como lida (o trigger vai atualizar a data_lida automaticamente)
        await connection.execute(
            `UPDATE cartinhas SET lida = TRUE WHERE id = ?`,
            [cartinhaId]
        );

        connection.release();
        res.json({ message: "Cartinha marcada como lida com sucesso" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao marcar cartinha como lida" });
    }
}));

// PUT /cartinhas/:cartinhaId/favoritar - Favoritar uma cartinha
CartinhasRouter.put('/:cartinhaId/favoritar', protect(0)(async (req, res) => {
    const cartinhaId = req.params.cartinhaId;

    try {
        const connection = await pool.getConnection();

        // Verifica se a cartinha existe e se o usuário é o destinatário
        const [cartinha] = await connection.execute(
            `SELECT destinatario_id, favoritada FROM cartinhas WHERE id = ?`,
            [cartinhaId]
        );

        if (cartinha.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Cartinha não encontrada" });
        }

        // Apenas o destinatário pode favoritar
        if (cartinha[0].destinatario_id !== req.user.id) {
            connection.release();
            return res.status(403).json({ message: "Apenas o destinatário pode favoritar a cartinha" });
        }

        // Se já está favoritada, não faz nada
        if (cartinha[0].favoritada) {
            connection.release();
            return res.json({ message: "Cartinha já estava favoritada" });
        }

        // Favorita (o trigger vai atualizar a data_favoritada automaticamente)
        await connection.execute(
            `UPDATE cartinhas SET favoritada = TRUE WHERE id = ?`,
            [cartinhaId]
        );

        connection.release();
        res.json({ message: "Cartinha favoritada com sucesso" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao favoritar cartinha" });
    }
}));

// DELETE /cartinhas/:cartinhaId/desfavoritar - Desfavoritar uma cartinha
CartinhasRouter.delete('/:cartinhaId/desfavoritar', protect(0)(async (req, res) => {
    const cartinhaId = req.params.cartinhaId;

    try {
        const connection = await pool.getConnection();

        // Verifica se a cartinha existe e se o usuário é o destinatário
        const [cartinha] = await connection.execute(
            `SELECT destinatario_id, favoritada FROM cartinhas WHERE id = ?`,
            [cartinhaId]
        );

        if (cartinha.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Cartinha não encontrada" });
        }

        // Apenas o destinatário pode desfavoritar
        if (cartinha[0].destinatario_id !== req.user.id) {
            connection.release();
            return res.status(403).json({ message: "Apenas o destinatário pode desfavoritar a cartinha" });
        }

        // Se não está favoritada, não faz nada
        if (!cartinha[0].favoritada) {
            connection.release();
            return res.json({ message: "Cartinha não estava favoritada" });
        }

        // Desfavorita (o trigger vai atualizar a data_favoritada automaticamente)
        await connection.execute(
            `UPDATE cartinhas SET favoritada = FALSE WHERE id = ?`,
            [cartinhaId]
        );

        connection.release();
        res.json({ message: "Cartinha desfavoritada com sucesso" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao desfavoritar cartinha" });
    }
}));

// POST /cartinhas - Enviar uma nova cartinha
CartinhasRouter.post('/', protect(0)(async (req, res) => {
    const { destinatario_username, titulo, conteudo } = req.body;

    if (!destinatario_username || !titulo || !conteudo) {
        return res.status(400).json({ message: "Destinatário, título e conteúdo são obrigatórios" });
    }

    // Validação de limites de caracteres
    if (titulo.length > 40) {
        return res.status(400).json({ message: "O título deve ter no máximo 40 caracteres" });
    }

    if (conteudo.length > 560) {
        return res.status(400).json({ message: "O conteúdo deve ter no máximo 560 caracteres" });
    }

    try {
        const connection = await pool.getConnection();

        // Busca o ID do destinatário
        const [destinatario] = await connection.execute(
            `SELECT id FROM users WHERE username = ?`,
            [destinatario_username]
        );

        if (destinatario.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Destinatário não encontrado" });
        }

        const destinatarioId = destinatario[0].id;

        // Não pode enviar cartinha para si mesmo
        if (destinatarioId === req.user.id) {
            connection.release();
            return res.status(400).json({ message: "Você não pode enviar uma cartinha para si mesmo" });
        }

        // Insere a cartinha
        const [result] = await connection.execute(
            `INSERT INTO cartinhas (remetente_id, destinatario_id, titulo, conteudo) VALUES (?, ?, ?, ?)`,
            [req.user.id, destinatarioId, titulo, conteudo]
        );

        connection.release();
        res.status(201).json({ 
            message: "Cartinha enviada com sucesso", 
            cartinhaId: result.insertId 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao enviar cartinha" });
    }
}));

module.exports = CartinhasRouter;