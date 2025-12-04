const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI (por enquanto não estamos usando nas respostas,
// mas já deixamos configurado para o futuro)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompt base da MAYA (para uso futuro com OpenAI, se quisermos)
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

// Memória de sessões em RAM
// Estrutura: { "<id>": { state: "...", data: { ... } } }
const sessions = {};

// Pega um identificador de sessão a partir do corpo (ajustaremos depois para WhatsApp)
function getSessionId(req) {
  return (
    req.body.from || // ex: número de WhatsApp
    req.body.phone ||
    req.body.sessionId ||
    'sessao-anonima'
  );
}

// Helpers simples para interpretar "sim" e "não"
function isYes(text) {
  const t = text.toLowerCase();
  return t.includes('sim') || t === 's';
}

function isNo(text) {
  const t = text.toLowerCase();
  return t.includes('não') || t.includes('nao') || t === 'n';
}

// Rota de teste (navegador)
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn - Backend ativo com fluxo básico.');
});

// Webhook principal (futuramente chamado pelo WhatsApp)
app.post('/webhook-whatsapp', async (req, res) => {
  try {
    const rawMessage = req.body.message || req.body.text || '';
    const userMessage = rawMessage.trim();
    const msgLower = userMessage.toLowerCase();

    if (!userMessage) {
      return res.json({
        reply:
          'Olá, aqui é a MAYA da Siligyn. Recebi sua mensagem, mas não consegui identificar o texto.'
      });
    }

    const sessionId = getSessionId(req);

    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        state: 'SAUDACAO',
        data: {}
      };
    }

    const session = sessions[sessionId];
    let reply = '';

    // =========================
    // FLUXO PRINCIPAL
    // =========================

    switch (session.state) {
      // 0) SAUDAÇÃO
      case 'SAUDACAO':
        reply =
          'Olá! Eu sou a MAYA da Siligyn.\n' +
          'Sou especializada em ajudar você com informações sobre nossos produtos.\n' +
          'Há mais de 25 anos, a Siligyn apoia médicos e pacientes em Goiás com confiança, segurança e qualidade.\n' +
          'Com qual produto posso te ajudar hoje?';
        session.state = 'DETECTAR_INTENCAO';
        break;

      // 1) DETECÇÃO DE INTENÇÃO
      case 'DETECTAR_INTENCAO': {
        const querImplante =
          msgLower.includes('implante') ||
          msgLower.includes('prótese') ||
          msgLower.includes('protese') ||
          msgLower.includes('silimed') ||
          msgLower.includes('silicone');

        const querMedgel = msgLower.includes('medgel');
        const querFita =
          msgLower.includes('fita') || msgLower.includes('cicatriz') || msgLower.includes('cicatrização') || msgLower.includes('cicatrizacao');

        if (querImplante) {
          session.state = 'PERGUNTA_ZERO';
          reply =
            'Perfeito, vou te ajudar com os implantes Silimed.\n' +
            'Você já recebeu do seu cirurgião a indicação para os implantes Silimed?';
        } else if (querMedgel) {
          session.state = 'INTERESSE_MEDGEL';
          reply =
            'Entendi, você quer saber sobre o Medgel Antiage.\n' +
            'Você já utiliza algum produto para prevenção de rugas ou cuidados diários com a pele do rosto?';
        } else if (querFita) {
          session.state = 'INTERESSE_FITA';
          reply =
            'Entendi, você quer saber sobre a fita de cicatrização.\n' +
            'Sua cirurgia já foi realizada ou ainda será realizada?';
        } else {
          session.state = 'INTERESSE_OUTROS';
          reply =
            'Perfeito. Trabalhamos com implantes mamários Silimed, fita de cicatrização, Medgel Antiage e outros produtos.\n' +
            'Você pode me dizer, com suas palavras, o que está buscando agora?';
        }
        break;
      }

      // 2) PERGUNTA ZERO (implantes)
      case 'PERGUNTA_ZERO':
        if (isYes(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          reply = 'Ótimo. Vamos organizar seus dados da cirurgia.\nQual é o nome do cirurgião responsável pela sua cirurgia?';
        } else if (isNo(msgLower)) {
          reply =
            'Perfeito, isso é mais comum do que parece.\n' +
            'Quando o seu cirurgião passar a indicação do implante, posso te ajudar com a compra e com todas as condições.\n' +
            'Posso te ajudar com mais alguma informação por enquanto?';
          session.state = 'FINALIZADO';
        } else {
          reply =
            'Só para eu conseguir seguir corretamente, você já recebeu do seu cirurgião a indicação para os implantes Silimed? Responda com sim ou não.';
        }
        break;

      // =========================
      // ETAPA 1 — DADOS DA CIRURGIA
      // =========================
      case 'ETAPA1_CIRURGIA_NOME':
        session.data.cirurgiao = userMessage;
        session.state = 'ETAPA1_CIRURGIA_DATA';
        reply = 'Qual será a data da cirurgia?';
        break;

      case 'ETAPA1_CIRURGIA_DATA':
        session.data.dataCirurgia = userMessage;
        session.state = 'ETAPA1_CIRURGIA_LOCAL';
        reply = 'Em qual hospital ou clínica a cirurgia será realizada?';
        break;

      case 'ETAPA1_CIRURGIA_LOCAL':
        session.data.localCirurgia = userMessage;
        session.state = 'ETAPA1_CONFIRMAR';
        reply =
          'Só confirmando os dados da cirurgia:\n' +
          `Cirurgião: ${session.data.cirurgiao}\n` +
          `Data: ${session.data.dataCirurgia}\n` +
          `Local: ${session.data.localCirurgia}\n` +
          'Essas informações estão corretas?';
        break;

      case 'ETAPA1_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'ETAPA2_DADOS_NOME';
          reply = 'Perfeito. Agora vou precisar dos seus dados para a nota fiscal.\nQual é o seu nome completo?';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          reply =
            'Sem problemas, vamos refazer os dados da cirurgia desde o início.\n' +
            'Qual é o nome do cirurgião responsável pela sua cirurgia?';
        } else {
          reply = 'As informações da cirurgia estão corretas? Responda com sim ou não.';
        }
        break;

      // =========================
      // ETAPA 2 — DADOS DA PACIENTE
      // =========================
      case 'ETAPA2_DADOS_NOME':
        session.data.nomePaciente = userMessage;
        session.state = 'ETAPA2_DADOS_CPF';
        reply = 'Qual é o seu CPF?';
        break;

      case 'ETAPA2_DADOS_CPF':
        session.data.cpfPaciente = userMessage;
        session.state = 'ETAPA2_DADOS_ENDERECO';
        reply = 'Qual é o seu endereço completo com CEP?';
        break;

      case 'ETAPA2_DADOS_ENDERECO':
        session.data.enderecoPaciente = userMessage;
        session.state = 'ETAPA2_DADOS_EMAIL';
        reply = 'Qual é o seu e-mail?';
        break;

      case 'ETAPA2_DADOS_EMAIL':
        session.data.emailPaciente = userMessage;
        session.state = 'ETAPA2_CONFIRMAR';
        reply =
          'Só confirmando seus dados pessoais:\n' +
          `Nome: ${session.data.nomePaciente}\n` +
          `CPF: ${session.data.cpfPaciente}\n` +
          `Endereço: ${session.data.enderecoPaciente}\n` +
          `E-mail: ${session.data.emailPaciente}\n` +
          'Essas informações estão corretas?';
        break;

      case 'ETAPA2_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'ETAPA3_INDICACAO';
          reply =
            'Perfeito. Agora preciso da indicação do seu cirurgião.\n' +
            'A sua médica(o) informou qual modelo ou revestimento do implante Silimed que será utilizado?';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA2_DADOS_NOME';
          reply =
            'Sem problemas, vamos refazer seus dados pessoais desde o início.\n' +
            'Qual é o seu nome completo?';
        } else {
          reply = 'As informações pessoais estão corretas? Responda com sim ou não.';
        }
        break;

      // =========================
      // ETAPA 3 — INDICAÇÃO MÉDICA
      // =========================
      case 'ETAPA3_INDICACAO':
        session.data.indicacaoMedica = userMessage;
        session.state = 'ETAPA3_CONFIRMAR';
        reply =
          'Só confirmando a indicação que você recebeu:\n' +
          `${session.data.indicacaoMedica}\n` +
          'Está correto?';
        break;

      case 'ETAPA3_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'AGUARDANDO_VALIDACAO';
          reply =
            'Perfeito. Registrei todas as informações da cirurgia, seus dados e a indicação do implante.\n' +
            'Vou aguardar uma validação do sistema antes de prosseguirmos. Assim que estiver tudo certo, continuo daqui com você para falarmos da forma de pagamento.';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA3_INDICACAO';
          reply =
            'Sem problemas, vamos refazer a indicação.\n' +
            'A sua médica(o) informou qual modelo ou revestimento do implante Silimed que será utilizado?';
        } else {
          reply = 'A indicação informada está correta? Responda com sim ou não.';
        }
        break;

      // =========================
      // ESTADO APÓS ETAPAS (Aguardando validação humana)
      // =========================
      case 'AGUARDANDO_VALIDACAO':
        reply =
          'Já registrei todas as suas informações e aguardo apenas uma validação do sistema.\n' +
          'Assim que estiver tudo confirmado, volto a falar com você para seguirmos com a forma de pagamento.';
        break;

      // =========================
      // FLUXOS SECUNDÁRIOS (MEDGEL, FITA, OUTROS)
      // =========================
      case 'INTERESSE_MEDGEL':
        reply =
          'O Medgel Antiage é voltado para prevenção e melhora de linhas finas e textura da pele do rosto.\n' +
          'Você busca mais prevenção ou já percebe algumas linhas e deseja suavizá-las?';
        session.state = 'INTERESSE_MEDGEL_DETALHE';
        break;

      case 'INTERESSE_MEDGEL_DETALHE':
        reply =
          'Entendi. O Medgel Antiage atua exatamente nesse tipo de necessidade, ajudando na qualidade da pele.\n' +
          'Se você quiser, posso te explicar como utilizar e depois te passar as condições de compra.';
        session.state = 'FINALIZADO';
        break;

      case 'INTERESSE_FITA':
        reply =
          'A fita de cicatrização é utilizada no pós-operatório para ajudar na qualidade estética da cicatriz.\n' +
          'Sua cirurgia já tem data marcada ou você ainda está planejando?';
        session.state = 'INTERESSE_FITA_DETALHE';
        break;

      case 'INTERESSE_FITA_DETALHE':
        reply =
          'Perfeito. A fita costuma ser utilizada após a retirada dos curativos iniciais, de acordo com a orientação do seu cirurgião.\n' +
          'Se você quiser, posso te orientar sobre como adquirir a fita conosco.';
        session.state = 'FINALIZADO';
        break;

      case 'INTERESSE_OUTROS':
        reply =
          'Certo, recebi o que você me contou.\n' +
          'Trabalhamos com implantes Silimed, fita de cicatrização, Medgel Antiage e outros produtos para suporte cirúrgico.\n' +
          'Se puder detalhar um pouco mais o que precisa, eu direciono melhor o atendimento.';
        session.state = 'FINALIZADO';
        break;

      // =========================
      // FINALIZADO OU ESTADOS DESCONHECIDOS
      // =========================
      default:
        reply =
          'Certo, recebi a sua mensagem. Em breve este passo do fluxo estará completo para eu te ajudar ainda melhor.\n' +
          'Se quiser, você pode me dizer se o seu interesse principal é implantes, Medgel, fita de cicatrização ou outro produto.';
        session.state = 'DETECTAR_INTENCAO';
        break;
    }

    return res.json({ reply });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.json({
      reply:
        'Olá, aqui é a MAYA da Siligyn. Estou com uma instabilidade no momento, mas você pode tentar novamente em instantes.'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor MAYA rodando na porta ${PORT}`);
});
