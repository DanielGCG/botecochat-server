-- ==========================
-- TABELA DE NOTIFICAÇÕES PERSISTENTES
-- ==========================
-- Adicione este código ao final do seu arquivo 01.sql

CREATE TABLE IF NOT EXISTS notifications (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL COMMENT 'Destinatário da notificação',
    type ENUM('NEW_MESSAGE', 'NEW_DM', 'NEW_LETTER', 'MENTION', 'SYSTEM', 'GLOBAL') NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSON NULL COMMENT 'Dados adicionais da notificação',
    read_at TIMESTAMP NULL COMMENT 'Quando foi marcada como lida',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL COMMENT 'Quando a notificação expira (opcional)',
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Índices para performance
    INDEX idx_user_unread (user_id, read_at),
    INDEX idx_created_at (created_at),
    INDEX idx_expires_at (expires_at)
);

-- Trigger para limpeza automática de notificações antigas (opcional)
-- Remove notificações lidas com mais de 30 dias
CREATE EVENT IF NOT EXISTS cleanup_old_notifications
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM notifications 
  WHERE read_at IS NOT NULL 
  AND read_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Remove notificações não lidas com mais de 90 dias
CREATE EVENT IF NOT EXISTS cleanup_expired_notifications  
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM notifications 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);