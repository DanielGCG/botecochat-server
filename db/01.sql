-- ==========================
-- TABELAS DE USUÁRIOS
-- ==========================
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    role TINYINT NOT NULL DEFAULT 0 COMMENT '0 = usuário comum, 1 = admin',
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    background_image VARCHAR(255),
    profile_image VARCHAR(255),
    bio VARCHAR(160),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_access TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    cookie_value VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DELIMITER //
CREATE TRIGGER first_user_admin
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
    IF (SELECT COUNT(*) FROM users) = 0 THEN
        SET NEW.role = 1;
    END IF;
END;
//
DELIMITER ;

-- Adicionar índice para buscas de usuário eficientes
ALTER TABLE users ADD INDEX idx_username_search (username);

-- ==========================
-- TABELAS DE CHATS
-- ==========================
CREATE TABLE IF NOT EXISTS chats (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) UNIQUE,
    tipo ENUM('public','dm') NOT NULL DEFAULT 'public',
    criado_por INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (criado_por) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_participants (
    chat_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chat_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    mensagem TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_reads (
    chat_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    last_read_message_id INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- ==========================
-- Observações importantes
-- ==========================
-- 1. DMs: a unicidade de chats DM entre dois usuários deve ser
--    controlada pelo backend antes de inserir na tabela 'chats'.
-- 2. Chats públicos: qualquer usuário pode ser adicionado à tabela
--    'chat_participants' normalmente.
-- 3. Cada usuário só pode aparecer uma vez por chat devido ao PRIMARY KEY.


-- ==========================
-- TABELAS DE CARTINHAS
-- ==========================

-- Tabela principal de cartinhas
CREATE TABLE IF NOT EXISTS cartinhas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    remetente_id INT UNSIGNED NOT NULL COMMENT 'Quem enviou a cartinha',
    destinatario_id INT UNSIGNED NOT NULL COMMENT 'Quem recebeu a cartinha',
    titulo VARCHAR(40) NOT NULL COMMENT 'Máximo 40 caracteres',
    conteudo VARCHAR(560) NOT NULL COMMENT 'Máximo 560 caracteres',
    data_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_lida TIMESTAMP NULL COMMENT 'Quando foi marcada como lida',
    lida BOOLEAN NOT NULL DEFAULT FALSE,
    favoritada BOOLEAN NOT NULL DEFAULT FALSE,
    data_favoritada TIMESTAMP NULL COMMENT 'Quando foi favoritada',
    
    FOREIGN KEY (remetente_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (destinatario_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Índices essenciais
    INDEX idx_destinatario_lida (destinatario_id, lida),
    INDEX idx_destinatario_favoritada (destinatario_id, favoritada)
);

-- ==========================
-- TRIGGER SIMPLES
-- ==========================

-- Trigger para atualizar data_lida quando marcar como lida
DELIMITER //
CREATE TRIGGER cartinha_lida_update
BEFORE UPDATE ON cartinhas
FOR EACH ROW
BEGIN
    -- Se está marcando como lida pela primeira vez
    IF OLD.lida = FALSE AND NEW.lida = TRUE AND OLD.data_lida IS NULL THEN
        SET NEW.data_lida = CURRENT_TIMESTAMP;
    END IF;
    
    -- Se está favoritando pela primeira vez
    IF OLD.favoritada = FALSE AND NEW.favoritada = TRUE AND OLD.data_favoritada IS NULL THEN
        SET NEW.data_favoritada = CURRENT_TIMESTAMP;
    END IF;
    
    -- Se está desfavoritando
    IF OLD.favoritada = TRUE AND NEW.favoritada = FALSE THEN
        SET NEW.data_favoritada = NULL;
    END IF;
END;
//
DELIMITER ;