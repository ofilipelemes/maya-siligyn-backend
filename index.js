const express = require('express');
const app = express();

app.use(express.json());

// Rota básica para teste
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn - Backend ativo');
});

// Endpoint que futuramente será conectado ao WhatsApp
app.post('/webhook-whatsapp', (req, res) => {
  console.log('Mensagem recebida:', req.body);
  res.json({ reply: 'Olá, aqui é a MAYA da Siligyn. Mensagem recebida com sucesso.' });
});

// Render usa PORT automaticamente
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
