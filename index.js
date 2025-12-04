const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI usando variável de ambiente
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Prompt base da MAYA
const SYSTEM_PROMPT = `
Você é MAYA da Siligyn, agente oficial de atendimento da Siligyn Produtos Médicos.

- Fale sempre em português do Brasil.
- Seja acolhedora, clara, objetiva e profissional.
- Apenas uma pergunta por vez.
- Não use emojis.
- Não forneça opiniões médicas.
- Siligyn atua há mais de 25 anos em implantes mamários no estado de Goiás.
- Portfólio principal: implantes Silimed, fita de cicatrização, Medgel Antiage.
`;

// Rota de teste
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn - Backend ativo com OpenAI');
});

// Webhook (futuramente usado pelo WhatsApp)
app.post('/webhook-whatsapp', async (req, res) => {
  try {
    const userMessage = req.body.message || req.body.text || '';

    if (!userMessage) {
      return res.json({
        reply: 'Olá, aqui é a MAYA da Siligyn. Recebi sua mensagem, mas não consegui identificar o texto.'
      });
    }

    // Chamada à OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage }
      ],
      max_tokens: 250
    });

    const reply = completion.choices?.[0]?.message?.content || 
                  "Olá, aqui é a MAYA da Siligyn. Como posso ajudar?";

    res.json({ reply });

  } catch (error) {
    console.error("Erro ao chamar OpenAI:", error);
    res.json({
      reply: "No momento estou com uma instabilidade, mas você pode tentar novamente em instantes."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor MAYA rodando porta ${PORT}`);
});
