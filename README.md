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

## 💬 Chats & DMs em Tempo Real

Todas as rotas de chat requerem autenticação (nível 0 ou superior).

### 🔔 Novidade: Suporte a Socket.IO para Chats e DMs

Agora, todas as conversas (públicas e DMs) funcionam em tempo real usando Socket.IO!

#### Como funciona:
- Cada chat (incluindo DMs) possui uma sala Socket.IO identificada por `chat_<chatId>`.
- Ao entrar em um chat, o frontend deve emitir o evento `joinChat` com o `chatId`.
- Ao enviar uma mensagem, o frontend deve emitir o evento `sendMessage` com `{ chatId, mensagem }`.
- Todos os participantes do chat recebem o evento `newMessage` em tempo real.

#### Eventos Socket.IO

**Entrar em um chat (DM ou público):**
```js
socket.emit('joinChat', chatId);
```

**Enviar mensagem:**
```js
socket.emit('sendMessage', { chatId, mensagem: 'Olá!' });
```

**Receber nova mensagem:**
```js
socket.on('newMessage', (msg) => {
  // msg: { id, chatId, userId, text, username, createdAt, ... }
});
```

**Exemplo de fluxo para DMs:**
1. O usuário entra na DM: `socket.emit('joinChat', chatIdDM)`
2. Envia mensagem: `socket.emit('sendMessage', { chatId: chatIdDM, mensagem: 'Oi!' })`
3. Recebe em tempo real: `socket.on('newMessage', ...)`

#### Endpoints REST continuam disponíveis:

- **GET** `/api/chats` — Lista todos os chats do usuário (inclui DMs)
- **GET** `/api/chats/users` — Lista usuários disponíveis para criar DM
- **POST** `/api/chats/dm` — Cria uma nova DM
- **GET** `/api/chats/:chatId/messages` — Busca mensagens de um chat
- **POST** `/api/chats/:chatId/messages` — Envia mensagem para um chat

**Todos os chats e DMs podem ser usados tanto via REST quanto via Socket.IO para comunicação em tempo real.**

---

## 📬 Cartinhas

Sistema de cartas/bilhetes entre usuários. Todas as rotas requerem autenticação.

#### **GET** `/api/cartinhas/recebidas`
Lista cartinhas recebidas, agrupadas por remetente.

**Observações:**
- Inclui cartinhas não lidas
- Inclui cartinhas lidas recentes (últimos 3 dias)
- Organizadas por remetente para melhor visualização

**Response (200):**
```json
[
  {
    "userId": 2,
    "username": "@amigo123",
    "avatar": "url_avatar",
    "cartinhas": [
      {
        "id": 1,
        "titulo": "Olá querido amigo!",
        "conteudo": "Espero que você esteja bem...",
        "dataEnvio": "2023-09-22T10:30:00.000Z",
        "lida": false,
        "favoritada": false
      },
      {
        "id": 3,
        "titulo": "Novidades",
        "conteudo": "Tenho novidades para contar...",
        "dataEnvio": "2023-09-22T15:30:00.000Z",
        "lida": true,
        "favoritada": false
      }
    ]
  },
  {
    "userId": 3,
    "username": "@maria",
    "avatar": "url_avatar",
    "cartinhas": [
      {
        "id": 2,
        "titulo": "Lembrete",
        "conteudo": "Não esqueça nosso compromisso...",
        "dataEnvio": "2023-09-21T08:00:00.000Z",
        "lida": false,
        "favoritada": false
      }
    ]
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
    "data_envio": "2023-09-22T09:00:00.000Z",
    "data_lida": "2023-09-22T09:30:00.000Z",
    "data_favoritada": "2023-09-22T09:35:00.000Z",
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
  "data_envio": "2023-09-22T10:30:00.000Z",
  "data_lida": "2023-09-22T11:00:00.000Z",
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

#### **POST** `/api/cartinhas/:cartinhaId/toggle-favorito`
Alterna o status favorito de uma cartinha (favorita ou desfavorita).

**Observações:**
- Endpoint único para favoritar e desfavoritar
- Retorna o novo status após a alteração

**Response (200):**
```json
{
  "message": "Cartinha favoritada com sucesso", 
  "status": "success",
  "favoritada": true,
  "data_favoritada": "2023-09-22T14:30:00.000Z"
}
```

**OU**

```json
{
  "message": "Cartinha desfavoritada com sucesso", 
  "status": "success",
  "favoritada": false,
  "data_favoritada": null
}
```

---

#### **DELETE** `/api/cartinhas/:cartinhaId`
Exclui uma cartinha enviada pelo usuário.

**Observações:**
- Apenas o remetente pode excluir a cartinha
- Administradores podem excluir qualquer cartinha
- Cartinhas já lidas pelo destinatário não podem ser excluídas (exceto por administradores)

**Response (200):**
```json
{
  "message": "Cartinha excluída com sucesso",
  "status": "success"
}
```

**Response Error (403/400):**
```json
{
  "message": "Você não tem permissão para excluir esta cartinha"
}
```

**OU**

```json
{
  "message": "Não é possível excluir cartinhas que já foram lidas pelo destinatário"
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