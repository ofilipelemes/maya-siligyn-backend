const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI usando a variável de ambiente OPENAI_API_KEY
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompt base da MAYA
const SYSTEM_PROMPT = `
Você é MAYA da Siligyn, agente oficial de atendimento da Siligyn Produtos Médicos.

- Fale sempre em português do Brasil.
- Seja acolhedora, clara, objetiva e profissional.
- Faça apenas uma pergunta por vez.
- Não use emojis.
- Não forneça opiniões médicas.
- A Siligyn atua há mais de 25 anos em implantes mamários no estado de Goiás.
- Portfólio principal: implantes Silimed, fita de cicatrização, Medgel Antiage.
`;

// Armazena o estado das pacientes (sessões em memória)
// Estrutura: { "<id_paciente>": { state: "ESTADO_ATUAL", data: { ... } } }
const sessions = {};

// Função auxiliar para obter um ID de sessão a partir do corpo da requisição
function getSessionId(req) {
  return (
    req.body.from || // ex: número de WhatsApp
    req.body.phone ||
    req.body.sessionId ||
    'sessao-anonima'
  );
}

// Rota de teste (acessada pelo navegador)
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn - Backend ativo com OpenAI');
});

// Webhook (futuramente será o endpoint usado pelo WhatsApp)
app.post('/webhook-whatsapp', async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.text || '';

    if (!userMessage) {
      return res.json({
        reply: 'Olá, aqui é a MAYA da Siligyn. Recebi sua mensagem, mas não consegui identificar o texto.'
      });
    }

    // Identifica a sessão da paciente
    const sessionId = getSessionId(req);

    // Cria a sessão se ainda não existir
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        state: 'SAUDACAO',
        data: {}
      };
    }

    // (Por enquanto ainda não usamos o estado,
    // mas ele já está pronto para a próxima etapa.)
    const session = sessions[sessionId];

    // Chamada à OpenAI
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 250
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      'Olá, aqui é a MAYA da Siligyn. Como posso ajudar?';

    // Retorna a resposta em JSON (o WhatsApp/integração vai ler o campo "reply")
    res.json({ reply });
  } catch (error) {
    console.error('Erro ao chamar OpenAI:', error);
    res.json({
      reply:
        'Olá, aqui é a MAYA da Siligyn. Estou com uma instabilidade no momento, mas você pode tentar novamente em instantes.'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor MAYA rodando na porta ${PORT}`);
});
