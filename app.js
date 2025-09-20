const express = require('express');
const path = require('path');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const cors = require('cors');

const servidor = express();
const porta = process.env.PORT || 3000;

// Configurar CORS
servidor.use(cors({
    origin: 'http://localhost:3000', // URL do frontend
    credentials: true
}));

servidor.use(cookieParser());

// Configurar EJS
servidor.set('view engine', 'ejs');
servidor.set('views', path.join(__dirname, 'views'));
servidor.use(express.static(path.join(__dirname, 'public')));
servidor.use(express.json());

// Rota principal
servidor.use('/', require('./server/api/main'));

// Iniciar servidor Express
servidor.listen(porta, () => {
    console.log(`Servidor rodando em http://localhost:${porta}`);
});