# 🚀 Boteco Chat Server - Documentação da API

API completa para o sistema de chat com usuários, mensagens diretas (DMs) e cartinhas. Sistema construído com Node.js, Express e MySQL.

## 📋 Índice

- [🔐 Autenticação](#-autenticação)
- [👥 Usuários](#-usuários)
- [💬 Chats](#-chats)
- [📬 Cartinhas](#-cartinhas)
- [🛡️ Administração](#️-administração)
- [📊 Códigos de Status](#-códigos-de-status)
- [🔧 Configuração](#-configuração)

---

## 🔐 Autenticação

O sistema utiliza cookies de sessão para autenticação. Todas as rotas protegidas requerem um cookie válido.

### Níveis de Usuário
- **0**: Usuário comum
- **1**: Administrador

---

## 👥 Usuários

### 🌐 Rotas Públicas

#### **POST** `/api/users/validate-session`
Valida uma sessão de usuário.

**Body:**
```json
{
  "cookie": "valor_do_cookie_de_sessao"
}
```

**Response Success (200):**
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "@usuario123",
    "role": 0
  }
}
```

**Response Invalid (200):**
```json
{
  "valid": false
}
```

---

#### **POST** `/api/users/register`
Registra um novo usuário.

**Body:**
```json
{
  "username": "usuario123",
  "password": "minhasenha123",
  "bio": "Minha bio opcional"
}
```

**Regras:**
- Username: máximo 13 caracteres, será convertido para minúsculo e prefixado com `@`
- Password: obrigatório
- Bio: opcional, máximo 160 caracteres

**Response Success (201):**
```json
{
  "message": "Conta criada com sucesso",
  "username": "@usuario123"
}
```

**Response Error (409):**
```json
{
  "message": "Username já existe"
}
```

---

#### **POST** `/api/users/login`
Faz login no sistema.

**Body:**
```json
{
  "username": "@usuario123",
  "password": "minhasenha123"
}
```

**Response Success (200):**
```json
{
  "message": "Login realizado com sucesso",
  "cookie": "valor_do_cookie_de_sessao",
  "expiresAt": "2025-09-29T10:30:00.000Z"
}
```

**Headers:** Cookie `session` será definido automaticamente.

**Response Error (401):**
```json
{
  "message": "Credenciais inválidas"
}
```

---

#### **POST** `/api/users/logout`
Faz logout e invalida a sessão.

**Response (200):**
```json
{
  "message": "Logout realizado com sucesso"
}
```

---

### 🔒 Rotas Protegidas (Requer Autenticação)

#### **GET** `/api/users/me`
Busca informações do usuário logado.

**Response (200):**
```json
{
  "id": 1,
  "username": "@usuario123",
  "role": 0,
  "background_image": "url_imagem",
  "profile_image": "url_imagem",
  "bio": "Minha bio"
}
```

---

#### **PUT** `/api/users/me`
Atualiza perfil do usuário logado.

**Body:**
```json
{
  "username": "novousuario",
  "background_image": "url_nova_imagem",
  "profile_image": "url_nova_imagem",
  "bio": "Nova bio"
}
```

**Response (200):**
```json
{
  "message": "Perfil atualizado com sucesso",
  "username": "@novousuario"
}
```

---

#### **PUT** `/api/users/me/password`
Atualiza senha do usuário logado.

**Body:**
```json
{
  "currentPassword": "senhaatual123",
  "newPassword": "novasenha123"
}
```

**Response (200):**
```json
{
  "message": "Senha atualizada com sucesso"
}
```

---

## 💬 Chats

Todas as rotas de chat requerem autenticação (nível 0 ou superior).

#### **GET** `/api/chats`
Lista todos os chats do usuário (DMs).

**Response (200):**
```json
[
  {
    "id": 1,
    "nome": null,
    "tipo": "dm",
    "participants": [
      {
        "id": 1,
        "username": "@usuario1",
        "isMine": true
      },
      {
        "id": 2,
        "username": "@usuario2",
        "isMine": false
      }
    ],
    "lastMessage": "Última mensagem...",
    "lastMessageAt": "2025-09-22T10:30:00.000Z",
    "unreadCount": 3
  }
]
```

---

#### **GET** `/api/chats/users`
Lista usuários disponíveis para criar DM.

**Response (200):**
```json
[
  {
    "id": 2,
    "username": "@usuario2"
  },
  {
    "id": 3,
    "username": "@usuario3"
  }
]
```

---

#### **POST** `/api/chats/dm`
Cria uma nova DM com outro usuário.

**Body:**
```json
{
  "username": "@usuario2"
}
```

**Response Success (201):**
```json
{
  "message": "DM criada",
  "chatId": 5
}
```

**Response Existing (409):**
```json
{
  "message": "DM já existe",
  "chatId": 3
}
```

---

#### **GET** `/api/chats/:chatId/messages`
Busca mensagens de um chat específico.

**Query Parameters:**
- `page` (optional): Página (padrão: 1)

**Response (200):**
```json
{
  "page": 1,
  "messages": [
    {
      "id": 15,
      "username": "@usuario2",
      "mensagem": "Olá! Como você está?",
      "isMine": false,
      "createdAt": "2025-09-22T10:30:00.000Z"
    },
    {
      "id": 16,
      "username": "@usuario1",
      "mensagem": "Oi! Estou bem, obrigado!",
      "isMine": true,
      "createdAt": "2025-09-22T10:35:00.000Z"
    }
  ]
}
```

---

#### **POST** `/api/chats/:chatId/messages`
Envia uma mensagem para um chat.

**Body:**
```json
{
  "mensagem": "Minha mensagem aqui!"
}
```

**Response (200):**
```json
{
  "id": 17,
  "mensagem": "Minha mensagem aqui!",
  "username": "@usuario1",
  "isMine": true,
  "createdAt": "2025-09-22T10:40:00.000Z"
}
```

---

## 📬 Cartinhas

Sistema de cartas/bilhetes entre usuários. Todas as rotas requerem autenticação.

#### **GET** `/api/cartinhas/recebidas`
Lista cartinhas não lidas recebidas.

**Response (200):**
```json
[
  {
    "id": 1,
    "titulo": "Olá querido amigo!",
    "conteudo": "Espero que você esteja bem...",
    "data_envio": "2025-09-22T10:30:00.000Z",
    "lida": false,
    "favoritada": false,
    "remetente_username": "@amigo123",
    "remetente_avatar": "url_avatar"
  }
]
```

---

#### **GET** `/api/cartinhas/favoritas`
Lista cartinhas marcadas como favoritas.

**Response (200):**
```json
[
  {
    "id": 2,
    "titulo": "Mensagem especial",
    "conteudo": "Esta é uma mensagem muito especial...",
    "data_envio": "2025-09-22T09:00:00.000Z",
    "data_lida": "2025-09-22T09:30:00.000Z",
    "data_favoritada": "2025-09-22T09:35:00.000Z",
    "remetente_username": "@amigoespecial",
    "remetente_avatar": "url_avatar"
  }
]
```

---

#### **GET** `/api/cartinhas/:cartinhaId`
Busca detalhes de uma cartinha específica.

**Response (200):**
```json
{
  "id": 1,
  "titulo": "Olá querido amigo!",
  "conteudo": "Espero que você esteja bem. Queria te dizer que...",
  "data_envio": "2025-09-22T10:30:00.000Z",
  "data_lida": "2025-09-22T11:00:00.000Z",
  "lida": true,
  "favoritada": false,
  "remetente_id": 2,
  "remetente_username": "@amigo123",
  "remetente_avatar": "url_avatar",
  "destinatario_id": 1,
  "destinatario_username": "@eu",
  "destinatario_avatar": "url_avatar"
}
```

---

#### **POST** `/api/cartinhas` ou **POST** `/api/cartinhas/enviar`
Envia uma nova cartinha.

**Body:**
```json
{
  "destinatario_username": "@amigo123",
  "titulo": "Olá querido amigo!",
  "conteudo": "Espero que você esteja bem! Queria te dizer que sinto muito a sua falta..."
}
```

**Limites:**
- Título: máximo 40 caracteres
- Conteúdo: máximo 560 caracteres

**Response Success (201):**
```json
{
  "message": "Cartinha enviada com sucesso",
  "cartinhaId": 15
}
```

**Response Error (400):**
```json
{
  "message": "O título deve ter no máximo 40 caracteres"
}
```

---

#### **PUT** `/api/cartinhas/:cartinhaId/lida`
Marca uma cartinha como lida.

**Response (200):**
```json
{
  "message": "Cartinha marcada como lida com sucesso"
}
```

---

#### **PUT** `/api/cartinhas/:cartinhaId/favoritar`
Marca uma cartinha como favorita.

**Response (200):**
```json
{
  "message": "Cartinha favoritada com sucesso"
}
```

---

#### **DELETE** `/api/cartinhas/:cartinhaId/desfavoritar`
Remove uma cartinha dos favoritos.

**Response (200):**
```json
{
  "message": "Cartinha desfavoritada com sucesso"
}
```

---

## 🛡️ Administração

Todas as rotas administrativas requerem nível de usuário 1 (admin).

### 👥 Usuários Admin

#### **GET** `/api/admin/users`
Lista todos os usuários do sistema.

**Response (200):**
```json
[
  {
    "id": 1,
    "username": "@admin",
    "role": 1,
    "profile_image": "url_imagem",
    "created_at": "2025-09-22T08:00:00.000Z",
    "last_access": "2025-09-22T12:00:00.000Z"
  }
]
```

---

#### **POST** `/api/admin/users`
Cria um novo usuário.

**Body:**
```json
{
  "username": "@novousuario",
  "password": "senha123",
  "role": 0
}
```

**Response (201):**
```json
{
  "message": "Usuário criado com sucesso"
}
```

---

#### **PUT** `/api/admin/users/:id`
Atualiza um usuário específico.

**Body:**
```json
{
  "username": "@usuarioatualizado",
  "role": 1,
  "bio": "Nova bio"
}
```

**Response (200):**
```json
{
  "message": "Usuário atualizado com sucesso",
  "username": "@usuarioatualizado"
}
```

---

#### **DELETE** `/api/admin/users/:id`
Deleta um usuário.

**Response (200):**
```json
{
  "message": "Usuário deletado com sucesso"
}
```

---

#### **PUT** `/api/admin/users/:id/reset-password`
Reseta a senha de um usuário para "12345".

**Response (200):**
```json
{
  "message": "Senha resetada para 12345"
}
```

---

### 📬 Cartinhas Admin

#### **GET** `/api/admin/cartinhas/estatisticas`
Estatísticas gerais de cartinhas.

**Response (200):**
```json
{
  "total": 150,
  "nao_lidas": 45,
  "lidas": 85,
  "favoritas": 20
}
```

---

#### **GET** `/api/admin/cartinhas/usuarios`
Lista usuários com estatísticas de cartinhas.

**Query Parameters:**
- `page` (int): Página atual (padrão: 1)
- `limit` (int): Itens por página (padrão: 20)
- `usuario` (string): Filtrar por ID do usuário
- `status` (string): Filtrar por status ('nao_lida', 'lida', 'favorita')
- `search` (string): Buscar por username

**Response (200):**
```json
{
  "usuarios": [
    {
      "id": 1,
      "username": "@usuario1",
      "profile_image": "url_imagem",
      "total_cartinhas": 15,
      "nao_lidas": 5,
      "lidas": 8,
      "favoritas": 2
    }
  ],
  "currentPage": 1,
  "totalPages": 3,
  "totalItems": 45
}
```

---

#### **GET** `/api/admin/cartinhas/usuario/:userId`
Lista cartinhas de um usuário específico.

**Query Parameters:**
- `page` (int): Página atual (padrão: 1)
- `limit` (int): Itens por página (padrão: 15)
- `status` (string): Filtrar por status
- `search` (string): Buscar por título/conteúdo

**Response (200):**
```json
{
  "cartinhas": [
    {
      "id": 1,
      "titulo": "Título da cartinha",
      "conteudo": "Conteúdo da cartinha...",
      "data_envio": "2025-09-22T10:30:00.000Z",
      "lida": true,
      "favoritada": false,
      "remetente_id": 2,
      "remetente_username": "@remetente1"
    }
  ],
  "currentPage": 1,
  "totalPages": 2,
  "totalItems": 25
}
```

---

#### **GET** `/api/admin/cartinhas/:cartinhaId`
Detalhes de uma cartinha específica.

**Response (200):**
```json
{
  "id": 1,
  "titulo": "Título da cartinha",
  "conteudo": "Conteúdo completo da cartinha...",
  "data_envio": "2025-09-22T10:30:00.000Z",
  "data_leitura": "2025-09-22T15:45:00.000Z",
  "lida": true,
  "favoritada": false,
  "remetente_id": 2,
  "remetente_username": "@remetente1",
  "destinatario_id": 1,
  "destinatario_username": "@destinatario1"
}
```

---

#### **DELETE** `/api/admin/cartinhas/remover`
Remove múltiplas cartinhas.

**Body:**
```json
{
  "cartinhaIds": [1, 2, 3, 5, 8]
}
```

**Response (200):**
```json
{
  "removidas": 5,
  "message": "Cartinhas removidas com sucesso"
}
```

---

#### **POST** `/api/admin/cartinhas/limpeza`
Executa limpeza automática (remove cartinhas lidas há mais de 30 dias, exceto favoritas).

**Response (200):**
```json
{
  "removidas": 12,
  "message": "Limpeza automática executada com sucesso"
}
```

---

### 💬 Chats Admin

#### **GET** `/api/admin/chats/estatisticas`
Estatísticas gerais de chats.

**Response (200):**
```json
{
  "total_chats": 50,
  "total_dms": 45,
  "total_publicos": 5,
  "total_mensagens": 1250,
  "usuarios_ativos": 30
}
```

---

#### **GET** `/api/admin/chats`
Lista todos os chats com informações detalhadas.

**Query Parameters:**
- `page` (int): Página atual (padrão: 1)
- `limit` (int): Itens por página (padrão: 20)
- `tipo` (string): Filtrar por tipo ('dm', 'public')
- `search` (string): Buscar por nome ou participantes

**Response (200):**
```json
{
  "chats": [
    {
      "id": 1,
      "nome": null,
      "tipo": "dm",
      "created_at": "2025-09-22T10:00:00.000Z",
      "criado_por_username": "@usuario1",
      "total_participantes": 2,
      "total_mensagens": 15,
      "ultima_mensagem": "2025-09-22T12:00:00.000Z",
      "participantes": [
        {
          "id": 1,
          "username": "@usuario1"
        },
        {
          "id": 2,
          "username": "@usuario2"
        }
      ]
    }
  ],
  "currentPage": 1,
  "totalPages": 3,
  "totalItems": 50
}
```

---

#### **GET** `/api/admin/chats/:chatId`
Detalhes de um chat específico.

**Response (200):**
```json
{
  "id": 1,
  "nome": null,
  "tipo": "dm",
  "created_at": "2025-09-22T10:00:00.000Z",
  "criado_por": 1,
  "criado_por_username": "@usuario1",
  "participantes": [
    {
      "id": 1,
      "username": "@usuario1",
      "profile_image": "url_imagem"
    },
    {
      "id": 2,
      "username": "@usuario2",
      "profile_image": "url_imagem"
    }
  ],
  "estatisticas_mensagens": {
    "total_mensagens": 15,
    "primeira_mensagem": "2025-09-22T10:05:00.000Z",
    "ultima_mensagem": "2025-09-22T12:00:00.000Z"
  }
}
```

---

#### **DELETE** `/api/admin/chats/:chatId`
Deleta um chat.

**Response (200):**
```json
{
  "message": "Chat deletado com sucesso"
}
```

---

#### **GET** `/api/admin/chats/:chatId/mensagens`
Lista mensagens de um chat específico.

**Query Parameters:**
- `page` (int): Página atual (padrão: 1)
- `limit` (int): Itens por página (padrão: 50)
- `search` (string): Buscar por conteúdo da mensagem

**Response (200):**
```json
{
  "mensagens": [
    {
      "id": 15,
      "mensagem": "Olá! Como você está?",
      "created_at": "2025-09-22T10:30:00.000Z",
      "user_id": 2,
      "username": "@usuario2"
    }
  ],
  "currentPage": 1,
  "totalPages": 2,
  "totalItems": 75
}
```

---

#### **DELETE** `/api/admin/chats/mensagens/remover`
Remove múltiplas mensagens.

**Body:**
```json
{
  "mensagemIds": [15, 16, 17, 20]
}
```

**Response (200):**
```json
{
  "removidas": 4,
  "message": "Mensagens removidas com sucesso"
}
```

---

#### **POST** `/api/admin/chats/limpeza`
Executa limpeza automática de chats inativos (remove DMs sem mensagens há mais de 30 dias).

**Response (200):**
```json
{
  "removidos": 8,
  "message": "Limpeza automática de chats executada com sucesso"
}
```

---

### 🔧 Utilitários Admin

#### **GET** `/api/admin/usuarios`
Lista simples de usuários para filtros.

**Response (200):**
```json
[
  {
    "id": 1,
    "username": "@usuario1"
  },
  {
    "id": 2,
    "username": "@usuario2"
  }
]
```

---

## 📊 Códigos de Status

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso |
| 201 | Criado com sucesso |
| 400 | Dados inválidos |
| 401 | Não autorizado / Credenciais inválidas |
| 403 | Acesso negado / Permissões insuficientes |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: username já existe) |
| 500 | Erro interno do servidor |

---

## 🔧 Configuração

### Base URL
```
http://localhost:3000/api
```

### Headers Obrigatórios
```
Content-Type: application/json
```

### Autenticação
As rotas protegidas utilizam cookies de sessão. Após o login, o cookie `session` será automaticamente incluído nas requisições.

### Exemplo de Uso (JavaScript)
```javascript
// Login
const response = await fetch('/api/users/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    username: '@usuario123',
    password: 'minhasenha'
  }),
  credentials: 'include' // Importante para cookies
});

// Usar API autenticada
const profile = await fetch('/api/users/me', {
  credentials: 'include' // Inclui o cookie automaticamente
});
```

---

## 🏗️ Estrutura do Projeto

```
server/
├── api/
│   ├── main.js          # Roteador principal
│   ├── users.js         # Rotas de usuários
│   ├── chats.js         # Rotas de chats
│   ├── cartinhas.js     # Rotas de cartinhas
│   └── admin/
│       ├── index.js     # Agregador admin
│       ├── users.js     # Admin de usuários
│       ├── chats.js     # Admin de chats
│       └── cartinhas.js # Admin de cartinhas
├── config/
│   └── bd.js           # Configuração do banco
└── middlewares/
    └── authMiddleware.js # Middleware de autenticação
```

---

**Developed with ❤️ by DanielGCG**