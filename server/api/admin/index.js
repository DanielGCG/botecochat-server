const express = require("express");
const AdminRouter = express.Router();

// Importar todos os roteadores administrativos
const AdminUsersRouter = require("./users");
const AdminCartinhasRouter = require("./cartinhas");
const AdminChatsRouter = require("./chats");

// ==================== Rotas Administrativas ====================

// Rotas de usuários administrativos
AdminRouter.use("/users", AdminUsersRouter);

// Rotas de cartinhas administrativas  
AdminRouter.use("/cartinhas", AdminCartinhasRouter);

// Rotas de chats administrativos
AdminRouter.use("/chats", AdminChatsRouter);

// GET /admin/usuarios - Endpoint simples para listagem (mantido para compatibilidade)
const pool = require("../../config/bd");
const authMiddleware = require("../../middlewares/authMiddleware");

const protect = (minRole = 1) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

AdminRouter.get('/usuarios', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();

        const [usuarios] = await connection.execute(`
            SELECT id, username 
            FROM users 
            ORDER BY username ASC
        `);

        connection.release();
        res.json(usuarios);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao listar usuários" });
    }
}));

module.exports = AdminRouter;