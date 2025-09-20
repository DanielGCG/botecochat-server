const express = require('express');
const router = express.Router();

const UsersRouter = require("./users");
const ChatsRouter = require("./chats")

// Rota perfil
router.use("/users", UsersRouter);

// Rota chats
router.use("/chats", ChatsRouter);

module.exports = router;