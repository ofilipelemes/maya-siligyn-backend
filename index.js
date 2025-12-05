const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Sessões em memória: { sessionId: { state: '...', data: { ... } } }
const sessions = {};

function getSessionId(req) {
  return req.body.from || req.body.phone || req.body.sessionId || 'sessao-desconhecida';
}

function isYes(text) {
  const t = text.toLowerCase();
  return t.includes('sim') || t.trim() === 's';
}

function isNo(text) {
  const t = text.toLowerCase();
  return t.includes('não') || t.includes('nao') || t.trim() === 'n';
}

function formatDataCirurgia(text) {
  const t = text.toLowerCase();
  if (
    t.includes('a definir') ||
    t.includes('vou definir') ||
    t.includes('ainda vou definir') ||
    t.includes('não sei') ||
    t.includes('nao sei')
  ) {
    return 'A definir';
  }
  return text;
}

// IA para deixar a mensagem mais humana (sem mudar o sentido)
async function enhance(baseReply) {
  if (!process.env.OPENAI_API_KEY) return baseReply;
  try {
    const sistema = `
Você é MAYA da Siligyn.
Reescreve mensagens de forma humana, acolhedora e profissional.

Regras:
- Português do Brasil.
- Sem emojis.
- Apenas UMA pergunta por mensagem.
- Não invente informações.
- Não mude o sentido, só a forma.
- Não sugira tipo, modelo ou tamanho de implante.
- Não dê opinião médica.
`;
    const userPrompt = `
Reescreva a mensagem abaixo de forma acolhedora, natural e profissional, mantendo o conteúdo e deixando apenas UMA pergunta no final.

Mensagem base:
"${baseReply}"
`;
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('Erro ao refinar com OpenAI:', err);
    return baseReply;
  }
}

// ================================
// ROTAS PÚBLICAS
// ================================
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn — Backend ativo com painel de validação humana.');
});

// PAINEL DE VALIDAÇÃO
app.get('/admin', (req, res) => {
  const pendentes = Object.entries(sessions).filter(
    ([_, s]) => s.state === 'AGUARDANDO_VALIDACAO'
  );

  let html = `
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Painel de Validação - MAYA Siligyn</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { font-size: 22px; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 14px; }
        th { background-color: #f5f5f5; }
        a.button {
          display: inline-block;
          padding: 6px 12px;
          margin-top: 4px;
          background-color: #ff8800;
          color: #fff;
          text-decoration: none;
          border-radius: 4px;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <h1>Pacientes aguardando validação</h1>
  `;

  if (pendentes.length === 0) {
    html += `<p>Nenhuma paciente aguardando validação no momento.</p>`;
  } else {
    html += `
      <table>
        <tr>
          <th>SessionId</th>
          <th>Nome</th>
          <th>Cirurgião</th>
          <th>Data</th>
          <th>Local</th>
          <th>Indicação</th>
          <th>Ação</th>
        </tr>
    `;
    for (const [sessionId, sess] of pendentes) {
      const d = sess.data || {};
      html += `
        <tr>
          <td>${sessionId}</td>
          <td>${d.nomePaciente || '-'}</td>
          <td>${d.cirurgiao || '-'}</td>
          <td>${d.dataCirurgia || '-'}</td>
          <td>${d.localCirurgia || '-'}</td>
          <td>${d.indicacaoMedica || '-'}</td>
          <td>
            <a class="button" href="/admin/validar?sessionId=${encodeURIComponent(
              sessionId
            )}">Validar e liberar pagamento</a>
          </td>
        </tr>
      `;
    }
    html += `</table>`;
  }

  html += `
    </body>
  </html>
  `;

  res.send(html);
});

// AÇÃO DO BOTÃO DE VALIDAÇÃO NO PAINEL
app.get('/admin/validar', (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId || !sessions[sessionId]) {
    return res.status(404).send('Sessão não encontrada para validação.');
  }
  sessions[sessionId].state = 'LIBERADO_PAGAMENTO';
  console.log('*** SESSÃO VALIDADA PELO PAINEL ***', sessionId);
  res.redirect('/admin');
});

// NOVA ROTA: CRIAR LEAD DE TESTE
// Exemplo: https://maya-siligyn-backend.onrender.com/criar-teste?sessionId=TESTE_MAYA
app.get('/criar-teste', (req, res) => {
  const sessionId = req.query.sessionId || 'TESTE_MAYA';
  sessions[sessionId] = {
    state: 'AGUARDANDO_VALIDACAO',
    data: {
      cirurgiao: 'Dr. Teste Cirurgião',
      dataCirurgia: 'A definir',
      localCirurgia: 'Hospital de Teste',
      indicacaoMedica: 'Implantes de poliuretano',
      nomePaciente: 'Paciente de Teste',
      cpfPaciente: '00000000000',
      enderecoPaciente: 'Rua Exemplo, 123, Centro, Goiânia',
      emailPaciente: 'teste@siligyn.com.br',
    },
  };
  console.log('*** LEAD DE TESTE CRIADO ***', sessionId);
  res.send(`Lead de teste criado: ${sessionId}. Agora acesse /admin para validar.`);
});

// ================================
// WEBHOOK PRINCIPAL (WhatsApp futuramente)
// ================================
app.post('/webhook-whatsapp', async (req, res) => {
  try {
    const msg = (req.body.message || '').trim();
    const msgLower = msg.toLowerCase();
    const sessionId = getSessionId(req);

    if (!sessions[sessionId]) {
      sessions[sessionId] = { state: 'SAUDACAO', data: {} };
    }

    const session = sessions[sessionId];
    let baseReply = '';

    if (!msg) {
      return res.json({
        reply: 'Olá, aqui é a MAYA da Siligyn. Recebi sua mensagem, mas não consegui identificar o texto.'
      });
    }

    switch (session.state) {
      case 'SAUDACAO':
        baseReply =
          'Olá! Eu sou a MAYA da Siligyn. É um prazer falar com você. A Siligyn atua há mais de 25 anos acompanhando médicos e pacientes em Goiás com segurança e qualidade. Para eu te orientar da melhor forma, você poderia me dizer com qual produto deseja ajuda hoje?';
        session.state = 'DETECTAR_INTENCAO';
        break;

      case 'DETECTAR_INTENCAO': {
        const querImplante =
          msgLower.includes('implante') ||
          msgLower.includes('prótese') ||
          msgLower.includes('protese') ||
          msgLower.includes('silimed') ||
          msgLower.includes('silicone');

        if (querImplante) {
          session.state = 'CONSULTA_IMPLANTE';
          baseReply =
            'Entendi. Antes de seguirmos com o registro, preciso saber se você já passou em consulta com o seu cirurgião plástico para essa cirurgia.';
        } else {
          session.state = 'INTERESSE_OUTROS';
          baseReply =
            'Claro, posso te ajudar com outros produtos também. Para eu direcionar melhor o atendimento, você pode me contar com qual produto ou necessidade gostaria de falar?';
        }
        break;
      }

      case 'CONSULTA_IMPLANTE':
        if (isYes(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          baseReply =
            'Perfeito. Agora vou registrar os dados da sua cirurgia no sistema. Isso é importante para organizarmos seu atendimento e garantir que os implantes sejam entregues corretamente no centro cirúrgico, no nome do seu médico e no seu. Para começarmos, qual é o nome do cirurgião plástico responsável pela sua cirurgia?';
        } else if (isNo(msgLower)) {
          session.state = 'FINALIZADO';
          baseReply =
            'Entendo. O ideal é que a compra dos implantes seja feita após a avaliação do cirurgião plástico. Quando você passar pela consulta e tiver a indicação, posso te ajudar novamente com toda a organização da compra.';
        } else {
          baseReply =
            'Só para eu confirmar e seguir da forma correta: você já passou em consulta com o seu cirurgião plástico para essa cirurgia?';
        }
        break;

      // ETAPA 1 — CIRURGIA
      case 'ETAPA1_CIRURGIA_NOME':
        session.data.cirurgiao = msg;
        session.state = 'ETAPA1_CIRURGIA_DATA';
        baseReply =
          'Obrigada. Agora preciso registrar a data da cirurgia. Se já estiver definida, pode me informar. Se ainda estiver em aberto, posso registrar como "a definir". Qual é a data da sua cirurgia?';
        break;

      case 'ETAPA1_CIRURGIA_DATA':
        session.data.dataCirurgia = formatDataCirurgia(msg);
        session.state = 'ETAPA1_CIRURGIA_LOCAL';
        baseReply =
          'Certo. Agora me informe, por favor, em qual hospital ou clínica a sua cirurgia será realizada.';
        break;

      case 'ETAPA1_CIRURGIA_LOCAL':
        session.data.localCirurgia = msg;
        session.state = 'ETAPA2_INDICACAO';
        baseReply =
          'Perfeito. Agora vou registrar a orientação do seu cirurgião. O que ele te informou sobre os implantes Silimed que serão utilizados na sua cirurgia?';
        break;

      // ETAPA 2 — INDICAÇÃO MÉDICA
      case 'ETAPA2_INDICACAO':
        session.data.indicacaoMedica = msg;
        session.state = 'ETAPA3_DADOS_NOME';
        baseReply =
          'Obrigada. Agora vamos para a última etapa de registro: seus dados pessoais. Eles são necessários para organizarmos seu atendimento no sistema e garantir que tudo esteja alinhado para a entrega correta dos implantes no dia da cirurgia. Para começarmos, qual é o seu nome completo?';
        break;

      // ETAPA 3 — DADOS DA PACIENTE
      case 'ETAPA3_DADOS_NOME':
        session.data.nomePaciente = msg;
        session.state = 'ETAPA3_DADOS_CPF';
        baseReply =
          'Perfeito. Agora me informe o seu CPF, por favor.';
        break;

      case 'ETAPA3_DADOS_CPF':
        session.data.cpfPaciente = msg;
        session.state = 'ETAPA3_DADOS_ENDERECO';
        baseReply =
          'Certo. Agora preciso do seu endereço completo.';
        break;

      case 'ETAPA3_DADOS_ENDERECO':
        session.data.enderecoPaciente = msg;
        session.state = 'ETAPA3_DADOS_EMAIL';
        baseReply =
          'Obrigada. Para finalizar o registro, me informe o seu e-mail.';
        break;

      case 'ETAPA3_DADOS_EMAIL':
        session.data.emailPaciente = msg;
        session.state = 'CONFIRMACAO_FINAL';
        baseReply =
          'Antes de seguir para a próxima etapa, vou te apresentar um resumo de tudo que registrei para garantir que está correto:\n\n' +
          `• Cirurgião: ${session.data.cirurgiao}\n` +
          `• Data da cirurgia: ${session.data.dataCirurgia}\n` +
          `• Local da cirurgia: ${session.data.localCirurgia}\n` +
          `• Indicação médica: ${session.data.indicacaoMedica}\n` +
          `• Nome da paciente: ${session.data.nomePaciente}\n` +
          `• CPF: ${session.data.cpfPaciente}\n` +
          `• Endereço: ${session.data.enderecoPaciente}\n` +
          `• E-mail: ${session.data.emailPaciente}\n\n` +
          'Essas informações estão todas corretas?';
        break;

      case 'CONFIRMACAO_FINAL':
        if (isYes(msgLower)) {
          session.state = 'AGUARDANDO_VALIDACAO';
          console.log('*** LEAD AGUARDANDO VALIDAÇÃO ***', sessionId);
          baseReply =
            'Perfeito, obrigada por confirmar. Todas as informações do seu atendimento foram registradas no sistema. Agora vou aguardar uma validação interna antes de seguirmos para a etapa de pagamento. Assim que essa validação estiver concluída, continuamos daqui.';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          baseReply =
            'Sem problema, é importante que tudo esteja correto. Vamos ajustar com calma. Vou começar novamente pelos dados da cirurgia. Qual é o nome do seu cirurgião plástico?';
        } else {
          baseReply =
            'Só para eu conseguir seguir da forma correta: as informações que te apresentei estão todas corretas? Você pode me responder com sim ou não?';
        }
        break;

      case 'AGUARDANDO_VALIDACAO':
        baseReply =
          'Todas as suas informações já estão registradas e agora estou aguardando uma validação interna. Assim que essa validação for concluída, poderemos seguir com a etapa de pagamento. Por enquanto, não preciso de novos dados seus.';
        break;

      case 'LIBERADO_PAGAMENTO':
        baseReply =
          'A validação interna já foi concluída. Agora podemos seguir para a etapa de pagamento e finalização da sua compra de implantes. Você prefere pagamento à vista ou parcelado?';
        break;

      case 'INTERESSE_OUTROS':
        baseReply =
          'Certo, entendi. Trabalhamos com implantes mamários Silimed e outros produtos relacionados ao procedimento cirúrgico. Se você puder detalhar um pouco mais o que precisa, eu direciono o atendimento da melhor forma.';
        session.state = 'FINALIZADO';
        break;

      case 'FINALIZADO':
      default:
        baseReply =
          'Recebi sua mensagem. Se quiser, posso retomar o atendimento focando em implantes mamários ou em outro produto específico do nosso portfólio. Com o que você prefere falar agora?';
        session.state = 'DETECTAR_INTENCAO';
        break;
    }

    const reply = await enhance(baseReply);
    return res.json({ reply });

  } catch (error) {
    console.error('Erro geral no webhook:', error);
    return res.json({
      reply: 'Olá, aqui é a MAYA da Siligyn. Tive uma instabilidade no momento, mas você pode tentar novamente em instantes.'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
