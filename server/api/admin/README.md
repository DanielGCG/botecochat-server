# 📁 Estrutura Administrativa - Endpoints

Esta pasta contém todos os endpoints administrativos do sistema, organizados por funcionalidade e separados dos endpoints públicos.

## 🗂️ Estrutura de Arquivos

```
/server/api/admin/
├── index.js        # Agregador principal de rotas administrativas
├── users.js        # Gerenciamento administrativo de usuários
├── cartinhas.js    # Gerenciamento administrativo de cartinhas
└── chats.js        # Gerenciamento administrativo de chats
```

## 🔐 Autenticação

**Todos os endpoints administrativos requerem:**
- Cookie de sessão válido
- Nível de usuário = 1 (admin)

## 📋 Endpoints Disponíveis

### **👥 Usuários (/api/admin/users)**
- `GET /api/admin/users` - Listar todos os usuários
- `POST /api/admin/users` - Criar novo usuário
- `PUT /api/admin/users/:id` - Atualizar usuário específico
- `DELETE /api/admin/users/:id` - Deletar usuário
- `PUT /api/admin/users/:id/reset-password` - Resetar senha para "12345"

### **📬 Cartinhas (/api/admin/cartinhas)**
- `GET /api/admin/cartinhas/estatisticas` - Estatísticas gerais
- `GET /api/admin/cartinhas/usuarios` - Usuários com estatísticas de cartinhas
- `GET /api/admin/cartinhas/usuario/:userId` - Cartinhas de usuário específico
- `GET /api/admin/cartinhas/:cartinhaId` - Detalhes de cartinha específica
- `DELETE /api/admin/cartinhas/remover` - Remover múltiplas cartinhas
- `POST /api/admin/cartinhas/limpeza` - Limpeza automática

### **💬 Chats (/api/admin/chats)**
- `GET /api/admin/chats/estatisticas` - Estatísticas gerais de chats
- `GET /api/admin/chats` - Listar todos os chats com paginação
- `GET /api/admin/chats/:chatId` - Detalhes de chat específico
- `DELETE /api/admin/chats/:chatId` - Deletar chat
- `GET /api/admin/chats/:chatId/mensagens` - Mensagens de um chat
- `DELETE /api/admin/chats/mensagens/remover` - Remover múltiplas mensagens
- `POST /api/admin/chats/limpeza` - Limpeza automática de chats inativos

### **🔧 Utilitários (/api/admin)**
- `GET /api/admin/usuarios` - Lista simples de usuários (para filtros)

## 🚀 Migração Realizada

### **Antes:**
- Endpoints de admin misturados em `/api/users`
- Endpoints de cartinhas admin em `/api/admin/cartinhas`
- Chats sem endpoints administrativos
- Estrutura inconsistente

### **Depois:**
- **Todos** os endpoints de admin organizados em `/api/admin/`
- Separação clara por funcionalidade (users, cartinhas, chats)
- Estrutura consistente e escalável
- Arquivos principais focados apenas em rotas públicas/usuário

## 💡 Benefícios

1. **Organização**: Endpoints administrativos claramente separados
2. **Manutenibilidade**: Fácil localização e modificação
3. **Escalabilidade**: Estrutura preparada para novos módulos admin
4. **Segurança**: Isolamento claro entre funcionalidades públicas e administrativas
5. **Clareza**: Desenvolvedores sabem exatamente onde encontrar cada tipo de endpoint

## 🔄 Compatibilidade

A reestruturação mantém **100% de compatibilidade** com o frontend:
- Todas as URLs dos endpoints permanecem inalteradas
- Mesmos parâmetros, respostas e comportamentos
- Zero breaking changes