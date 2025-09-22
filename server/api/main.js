const express = require('express');
const router = express.Router();

const UsersRouter = require("./users");
const ChatsRouter = require("./chats");
const CartinhasRouter = require("./cartinhas");
const AdminRouter = require("./admin/index");

// Rotas públicas e protegidas dos usuários
router.use("/users", UsersRouter);

// Rotas de chats
router.use("/chats", ChatsRouter);

// Rotas de cartinhas
router.use("/cartinhas", CartinhasRouter);

// Todas as rotas administrativas organizadas
router.use("/admin", AdminRouter);

module.exports = router;