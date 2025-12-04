const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI (preparado para uso futuro, se quisermos)
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompt base da MAYA (não está sendo usado por enquanto, fluxo é 100% controlado)
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
  return t.includes('sim') || t.trim() === 's';
}

function isNo(text) {
  const t = text.toLowerCase();
  return t.includes('não') || t.includes('nao') || t.trim() === 'n';
}

// Normaliza a descrição da data da cirurgia para a consolidação
function formatDataCirurgia(text) {
  const t = text.toLowerCase();
  if (
    t.includes('a definir') ||
    t.includes('vou definir') ||
    t.includes('ainda vou definir') ||
    t.includes('não sei') ||
    t.includes('nao sei') ||
    t.includes('sem data')
  ) {
    return 'A definir';
  }
  return text;
}

// Rota de teste (navegador)
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn - Backend ativo com fluxo refinado.');
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
      // 0) SAUDAÇÃO INICIAL
      case 'SAUDACAO':
        reply =
          'Olá! Eu sou a MAYA da Siligyn.\n' +
          'Sou especializada em ajudar você com informações sobre nossos produtos.\n' +
          'Há mais de 25 anos, a Siligyn apoia médicos e pacientes em Goiás com confiança, segurança e qualidade.\n' +
          'Para eu te orientar da melhor forma, com qual produto posso te ajudar hoje?';
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
          msgLower.includes('fita') ||
          msgLower.includes('cicatriz') ||
          msgLower.includes('cicatrização') ||
          msgLower.includes('cicatrizacao');

        if (querImplante) {
          session.state = 'CONSULTA_IMPLANTE';
          reply =
            'Perfeito, vou te ajudar com os implantes Silimed.\n' +
            'Só para eu entender em que momento você está: você já passou em consulta com o seu cirurgião plástico para essa cirurgia?';
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
            'Você pode me contar, com suas palavras, o que está buscando agora? Assim eu consigo direcionar melhor o atendimento.';
        }
        break;
      }

      // 2) VERIFICA SE JÁ PASSOU EM CONSULTA (IMPLANTES)
      case 'CONSULTA_IMPLANTE':
        if (isYes(msgLower)) {
          // Já passou em consulta → inicia Etapa 1 explicando o porquê dos dados
          session.state = 'ETAPA1_CIRURGIA_NOME';
          reply =
            'Perfeito, isso ajuda muito.\n' +
            'Agora vou precisar de alguns dados da sua cirurgia para agendar o seu atendimento no sistema.\n' +
            'Os implantes serão entregues diretamente no centro cirúrgico, no nome do médico responsável e com o seu nome como paciente. Por isso, precisamos deixar tudo muito certinho para não haver erro.\n' +
            'Para começarmos, qual é o nome do cirurgião plástico responsável pela sua cirurgia?';
        } else if (isNo(msgLower)) {
          // Ainda não passou em consulta
          reply =
            'Entendo, isso é bem comum.\n' +
            'A compra dos implantes é feita sempre após a avaliação do cirurgião plástico, que define o que é mais indicado para você.\n' +
            'Assim que você passar em consulta e o seu médico te orientar sobre os implantes Silimed, posso te ajudar com a organização da compra e das condições.\n' +
            'Se quiser, posso te explicar um pouco mais sobre os implantes ou sobre o nosso processo.';
          session.state = 'FINALIZADO';
        } else {
          reply =
            'Só para eu conseguir seguir direitinho: você já passou em consulta com o seu cirurgião plástico para essa cirurgia? Pode me responder com sim ou não.';
        }
        break;

      // =========================
      // ETAPA 1 — DADOS DA CIRURGIA
      // =========================
      case 'ETAPA1_CIRURGIA_NOME':
        session.data.cirurgiao = userMessage;
        session.state = 'ETAPA1_CIRURGIA_DATA';
        reply =
          'Obrigada, registrei o nome do cirurgião.\n' +
          'Se já tiver, me informe a data da cirurgia. Se ainda estiver definindo, pode me dizer que a data está em aberto que seguimos do mesmo jeito.';
        break;

      case 'ETAPA1_CIRURGIA_DATA':
        session.data.dataCirurgia = userMessage;
        session.state = 'ETAPA1_CIRURGIA_LOCAL';
        reply =
          'Perfeito, anotei aqui.\n' +
          'Em qual hospital ou clínica a cirurgia será realizada (ou está prevista para ser realizada)?';
        break;

      case 'ETAPA1_CIRURGIA_LOCAL':
        session.data.localCirurgia = userMessage;
        session.state = 'ETAPA1_CONFIRMAR';

        const dataFormatada = formatDataCirurgia(session.data.dataCirurgia);

        reply =
          'Só para garantir que o agendamento e a entrega dos implantes no centro cirúrgico fiquem corretos, vou recapitular os dados da cirurgia:\n' +
          `Cirurgião: ${session.data.cirurgiao}\n` +
          `Data da cirurgia: ${dataFormatada}\n` +
          `Hospital/Clínica: ${session.data.localCirurgia}\n` +
          'Essas informações estão corretas?';
        break;

      case 'ETAPA1_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'ETAPA2_DADOS_NOME';
          reply =
            'Ótimo, obrigado pela confirmação.\n' +
            'Agora vou precisar dos seus dados pessoais para a emissão da nota fiscal.\n' +
            'A nota fiscal é emitida após o procedimento cirúrgico, com as informações dos implantes que foram utilizados em você. Por isso, pedimos até 2 dias úteis após a cirurgia para emissão, e ela será enviada automaticamente para o e-mail que você informar.\n' +
            'Vamos começar: qual é o seu nome completo?';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          reply =
            'Sem problema, vamos ajustar com calma.\n' +
            'Vou refazer os dados da cirurgia desde o início para garantir que tudo fique correto.\n' +
            'Qual é o nome do cirurgião plástico responsável pela sua cirurgia?';
        } else {
          reply = 'As informações da cirurgia estão corretas? Você pode me responder com sim ou não.';
        }
        break;

      // =========================
      // ETAPA 2 — DADOS DA PACIENTE (NOTA FISCAL)
      // =========================
      case 'ETAPA2_DADOS_NOME':
        session.data.nomePaciente = userMessage;
        session.state = 'ETAPA2_DADOS_CPF';
        reply =
          'Obrigada, registrei seu nome completo.\n' +
          'Qual é o seu CPF?';
        break;

      case 'ETAPA2_DADOS_CPF':
        session.data.cpfPaciente = userMessage;
        session.state = 'ETAPA2_DADOS_ENDERECO';
        reply =
          'Perfeito.\n' +
          'Agora, por favor, me informe o seu endereço completo, incluindo rua, número, complemento (se houver), bairro, cidade e, se souber, o CEP.';
        break;

      case 'ETAPA2_DADOS_ENDERECO':
        session.data.enderecoPaciente = userMessage;
        session.state = 'ETAPA2_DADOS_EMAIL';
        reply =
          'Certo, registrei o endereço.\n' +
          'Para finalizar essa parte, qual é o seu e-mail? É nele que você receberá a nota fiscal após o procedimento.';
        break;

      case 'ETAPA2_DADOS_EMAIL':
        session.data.emailPaciente = userMessage;
        session.state = 'ETAPA2_CONFIRMAR';
        reply =
          'Vou recapitular seus dados pessoais para garantir que a nota fiscal seja emitida corretamente:\n' +
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
            'Perfeito, obrigada por conferir com atenção.\n' +
            'Agora, para finalizar a qualificação, preciso registrar a indicação do seu cirurgião.\n' +
            'A sua médica(o) informou qual modelo ou revestimento do implante Silimed que será utilizado? Se puder, me diga o que ele(a) te orientou.';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA2_DADOS_NOME';
          reply =
            'Sem problema, vamos ajustar com calma.\n' +
            'Vou começar novamente pelos seus dados pessoais.\n' +
            'Qual é o seu nome completo?';
        } else {
          reply = 'Essas informações pessoais estão corretas? Você pode me responder com sim ou não.';
        }
        break;

      // =========================
      // ETAPA 3 — INDICAÇÃO MÉDICA
      // =========================
      case 'ETAPA3_INDICACAO':
        session.data.indicacaoMedica = userMessage;
        session.state = 'ETAPA3_CONFIRMAR';
        reply =
          'Só confirmando a indicação que você recebeu do seu cirurgião:\n' +
          `${session.data.indicacaoMedica}\n` +
          'Está correto?';
        break;

      case 'ETAPA3_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'AGUARDANDO_VALIDACAO';
          reply =
            'Perfeito, registrei todas as informações da cirurgia, seus dados pessoais e a indicação do implante.\n' +
            'Agora vou aguardar uma validação interna do sistema para garantirmos que está tudo alinhado antes de seguir para a forma de pagamento.\n' +
            'Assim que estiver tudo confirmado, eu volto a falar com você daqui para frente.';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA3_INDICACAO';
          reply =
            'Sem problema, vamos ajustar a indicação com calma.\n' +
            'Pode me informar novamente o que o seu cirurgião orientou em relação ao implante Silimed?';
        } else {
          reply = 'A indicação que registrei está correta? Você pode me responder com sim ou não.';
        }
        break;

      // =========================
      // ESTADO APÓS ETAPAS (Aguardando validação humana)
      // =========================
      case 'AGUARDANDO_VALIDACAO':
        reply =
          'Já registrei todas as suas informações e estou aguardando apenas uma validação interna.\n' +
          'Assim que estiver tudo confirmado, sigo com você para combinarmos a forma de pagamento e os próximos passos.';
        break;

      // =========================
      // FLUXOS SECUNDÁRIOS (MEDGEL, FITA, OUTROS)
      // =========================
      case 'INTERESSE_MEDGEL':
        reply =
          'O Medgel Antiage é indicado para prevenção e melhora de linhas finas e textura da pele do rosto.\n' +
          'Você busca mais prevenção ou já percebe algumas linhas e deseja suavizá-las?';
        session.state = 'INTERESSE_MEDGEL_DETALHE';
        break;

      case 'INTERESSE_MEDGEL_DETALHE':
        reply =
          'Entendi, obrigada por compartilhar.\n' +
          'O Medgel Antiage atua exatamente nesse tipo de necessidade, ajudando na qualidade da pele.\n' +
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
          'Perfeito, obrigada por me contar.\n' +
          'A fita costuma ser utilizada após a fase inicial de curativos, seguindo a orientação do seu cirurgião.\n' +
          'Se você quiser, posso te orientar sobre como adquirir a fita conosco.';
        session.state = 'FINALIZADO';
        break;

      case 'INTERESSE_OUTROS':
        reply =
          'Certo, recebi o que você me contou.\n' +
          'Trabalhamos com implantes Silimed, fita de cicatrização, Medgel Antiage e outros produtos para suporte cirúrgico.\n' +
          'Se puder detalhar um pouco mais o que você precisa, eu direciono melhor o atendimento.';
        session.state = 'FINALIZADO';
        break;

      // =========================
      // FINALIZADO OU ESTADOS DESCONHECIDOS
      // =========================
      case 'FINALIZADO':
      default:
        reply =
          'Certo, recebi a sua mensagem.\n' +
          'Se você quiser, posso retomar o atendimento focando em implantes, Medgel Antiage, fita de cicatrização ou outro produto específico. É só me dizer com o que deseja seguir.';
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
