const express = require("express");
const UsersRouter = express.Router();
const pool = require("../config/bd");
const authMiddleware = require("../middlewares/authMiddleware");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// Helper para proteger rotas
const protect = (minRole = 0) => (handler) => {
    return (req, res, next) => authMiddleware(minRole)(req, res, () => handler(req, res, next));
};

// ==================== Rotas públicas ====================

// POST /users/validate-session
UsersRouter.post('/validate-session', async (req, res) => {
    let cookie = req.body?.cookie;
    if (!cookie && req.headers.cookie) {
        const match = req.headers.cookie.match(/session=([^;]+)/);
        if (match) cookie = match[1];
    }

    if (!cookie) return res.status(400).json({ valid: false });

    try {
        const connection = await pool.getConnection();
        const [sessions] = await connection.execute(
            `SELECT u.id, u.username, u.role
             FROM user_sessions us
             JOIN users u ON u.id = us.user_id
             WHERE us.cookie_value = ? AND us.expires_at > NOW()`,
            [cookie]
        );
        connection.release();

        if (sessions.length === 0) return res.json({ valid: false });

        res.json({ 
            valid: true, 
            user: { id: sessions[0].id, username: sessions[0].username, role: sessions[0].role } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ valid: false });
    }
});

// Registro público
UsersRouter.post('/register', async (req, res) => {
    let { username, password, bio } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username e senha são obrigatórios" });

    // Normaliza o username: garante @, máximo 13 caracteres e minúsculo
    username = username.trim();
    if (!username.startsWith('@')) {
        username = '@' + username;
    }
    if (username.length > 13) {
        username = username.slice(0, 13);
    }
    username = username.toLowerCase();

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const connection = await pool.getConnection();
        const [existing] = await connection.execute("SELECT id FROM users WHERE username = ?", [username]);

        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ message: "Username já existe" });
        }

        await connection.execute(
            "INSERT INTO users (username, password_hash, bio) VALUES (?, ?, ?)", 
            [username, hashedPassword, bio || ""]
        );
        connection.release();
        res.status(201).json({ message: "Conta criada com sucesso", username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar conta" });
    }
});

// Login público
UsersRouter.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username e senha são obrigatórios" });

    try {
        const connection = await pool.getConnection();
        const [users] = await connection.execute("SELECT id, password_hash FROM users WHERE username = ?", [username]);

        if (users.length === 0 || !(await bcrypt.compare(password, users[0].password_hash))) {
            connection.release();
            return res.status(401).json({ message: "Credenciais inválidas" });
        }

        const userId = users[0].id;
        const expiresAt = new Date(Date.now() + 7*24*60*60*1000); // 7 dias

        const [sessions] = await connection.execute(
            "SELECT id, cookie_value FROM user_sessions WHERE user_id = ? AND expires_at > NOW()",
            [userId]
        );

        let cookieValue;
        if (sessions.length > 0) {
            cookieValue = sessions[0].cookie_value;
            await connection.execute("UPDATE user_sessions SET expires_at = ? WHERE id = ?", [expiresAt, sessions[0].id]);
        } else {
            cookieValue = crypto.randomBytes(32).toString('hex');
            await connection.execute("INSERT INTO user_sessions (user_id, cookie_value, expires_at) VALUES (?, ?, ?)",
                [userId, cookieValue, expiresAt]);
        }

        connection.release();
        res.cookie('session', cookieValue, { httpOnly: true, maxAge: 7*24*60*60*1000 });
        res.json({ message: "Login realizado com sucesso", cookie: cookieValue, expiresAt });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao fazer login" });
    }
});

// ==================== Rotas protegidas ====================

// Logout
UsersRouter.post('/logout', protect(0)(async (req, res) => {
    const cookieValue = req.cookies?.['session'];
    if (!cookieValue) {
        return res.status(400).json({ message: "Sessão não encontrada" });
    }
    try {
        const connection = await pool.getConnection();
        // Garante que só apaga a sessão do usuário autenticado
        await connection.execute(
            "DELETE FROM user_sessions WHERE cookie_value = ? AND user_id = ?",
            [cookieValue, req.user.id]
        );
        connection.release();
    } catch (err) {
        console.error(err);
    }
    res.clearCookie('session');
    res.json({ message: "Logout realizado com sucesso" });
}));

// Perfil próprio
UsersRouter.get('/me', protect(0)(async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            "SELECT id, username, role, background_image, profile_image, bio FROM users WHERE id = ?",
            [req.user.id]
        );
        connection.release();

        if(rows.length === 0) return res.status(404).json({ message: "Usuário não encontrado" });

        res.json(rows[0]);
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao carregar perfil" });
    }
}));

// Atualizar perfil próprio
UsersRouter.put('/me', protect(0)(async (req, res) => {
    let { username, background_image, profile_image, bio } = req.body;

    if (!username) return res.status(400).json({ message: "Username é obrigatório" });

    // Força @ no início
    if (!username.startsWith('@')) {
        username = '@' + username;
    }

    // Limita para no máximo 13 caracteres
    if (username.length > 13) {
        username = username.slice(0, 13);
    }

    // Converte para caixa baixa
    username = username.toLowerCase();

    try {
        const connection = await pool.getConnection();

        // Verifica se já existe outro usuário com esse username
        const [existing] = await connection.execute(
            "SELECT id FROM users WHERE username = ? AND id != ?",
            [username, req.user.id]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ message: "Username já está em uso" });
        }

        await connection.execute(
            "UPDATE users SET username = ?, background_image = ?, profile_image = ?, bio = ? WHERE id = ?",
            [username, background_image, profile_image, bio, req.user.id]
        );

        connection.release();
        res.json({ message: "Perfil atualizado com sucesso", username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao atualizar perfil" });
    }
}));

// Atualizar senha do próprio usuário
UsersRouter.put('/me/password', protect(0)(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if(!currentPassword || !newPassword){
    return res.status(400).json({ message: "Senha atual e nova são obrigatórias" });
  }

  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      "SELECT password_hash FROM users WHERE id = ?",
      [req.user.id]
    );

    if(rows.length === 0){
      connection.release();
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if(!valid){
      connection.release();
      return res.status(401).json({ message: "Senha atual incorreta" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await connection.execute(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [hash, req.user.id]
    );

    connection.release();
    res.json({ message: "Senha atualizada com sucesso" });
  } catch(err){
    console.error(err);
    res.status(500).json({ message: "Erro ao atualizar senha" });
  }
}));


// ==================== Rotas de admin ====================


// Listar todos usuários (admin)
UsersRouter.get('/', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            "SELECT id, username, role, profile_image, created_at, last_access FROM users"
        );
        connection.release();
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao listar usuários" });
    }
}));

// Atualizar qualquer usuário (admin)
UsersRouter.put('/:id', protect(1)(async (req, res) => {
    const userId = req.params.id;
    const { username, role, bio } = req.body;

    if (!username) return res.status(400).json({ message: "Username é obrigatório" });

    // Normaliza o username
    let nomeUser = username.trim();
    if (!nomeUser.startsWith('@')) nomeUser = '@' + nomeUser;
    if (nomeUser.length > 13) nomeUser = nomeUser.slice(0, 13);
    nomeUser = nomeUser.toLowerCase();

    try {
        const connection = await pool.getConnection();

        // Verifica se já existe outro usuário com esse username
        const [existing] = await connection.execute(
            "SELECT id FROM users WHERE username = ? AND id != ?",
            [nomeUser, userId]
        );

        if (existing.length > 0) {
            connection.release();
            return res.status(409).json({ message: "Username já está em uso" });
        }

        await connection.execute(
            "UPDATE users SET username = ?, role = ?, bio = ? WHERE id = ?",
            [nomeUser, role, bio, userId]
        );

        connection.release();
        res.json({ message: "Usuário atualizado com sucesso", username: nomeUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
}));

// Criar usuário (admin)
UsersRouter.post('/', protect(1)(async (req, res) => {
    const { username, password, role = 0 } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Username e senha obrigatórios" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const connection = await pool.getConnection();
        await connection.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", 
            [username, hashedPassword, role]);
        connection.release();
        res.status(201).json({ message: "Usuário criado com sucesso" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao criar usuário" });
    }
}));

// Deletar usuário (admin)
UsersRouter.delete('/:id', protect(1)(async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.execute("DELETE FROM users WHERE id = ?", [req.params.id]);
        connection.release();
        res.json({ message: "Usuário deletado com sucesso" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao deletar usuário" });
    }
}));

// Reset de senha para 12345 (admin)
UsersRouter.put('/:id/reset-password', protect(1)(async (req, res) => {
    const userId = req.params.id;

    try {
        const senhaPadrao = "12345";
        const hash = await bcrypt.hash(senhaPadrao, 10);

        const connection = await pool.getConnection();
        await connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            [hash, userId]
        );
        connection.release();

        res.json({ message: "Senha resetada para 12345" });
    } catch(err) {
        console.error(err);
        res.status(500).json({ message: "Erro ao resetar senha" });
    }
}));

module.exports = UsersRouter;
