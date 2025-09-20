const pool = require("../config/bd");

const PUBLIC_ROUTES = ['/register', '/login', '/logout', '/validate-session']; // rotas públicas

// authMiddleware(minRole, refresh = true)
const authMiddleware = (minRole = 0, refresh = true) => {
    return async (req, res, next) => {
        try {
            if (PUBLIC_ROUTES.includes(req.path)) {
                return next(); // Rota pública, segue em frente
            }

            const cookieValue = req.cookies['session'];

            if (!cookieValue) {
                return res.status(401).json({ message: "Sessão não encontrada" });
            }

            const connection = await pool.getConnection();

            // Busca sessão válida
            const [sessions] = await connection.execute(
                `SELECT us.id AS session_id, us.user_id, u.username, u.role
                 FROM user_sessions us
                 JOIN users u ON u.id = us.user_id
                 WHERE us.cookie_value = ? AND us.expires_at > NOW()`,
                [cookieValue]
            );

            if (sessions.length === 0) {
                connection.release();
                return res.status(401).json({ message: "Sessão inválida ou expirada" });
            }

            const session = sessions[0];

            // Verifica role mínima
            if (session.role < minRole) {
                connection.release();
                return res.status(403).json({ message: "Acesso negado" });
            }

            // Atualiza expires_at se refresh ativado
            if (refresh) {
                const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
                await connection.execute(
                    "UPDATE user_sessions SET expires_at = ? WHERE id = ?",
                    [newExpires, session.session_id]
                );
            }

            // Anexa informações do usuário
            req.user = {
                id: session.user_id,
                username: session.username,
                role: session.role
            };

            connection.release();
            next();
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Erro na autenticação" });
        }
    };
};

const limparSessoesExpiradas = async () => {
    try {
        const connection = await pool.getConnection();

        const [result] = await connection.execute(
            "DELETE FROM user_sessions WHERE expires_at < NOW()"
        );

        connection.release();
        console.log(`[Sessoes] ${result.affectedRows} sessão(ões) expiradas removida(s)`);
    } catch (err) {
        console.error("Erro ao limpar sessões expiradas:", err);
    }
};

// Limpa sessões expiradas a cada hora
setInterval(() => {
    limparSessoesExpiradas();
}, 60 * 60 * 1000); // 60 minutos   

module.exports = authMiddleware;
