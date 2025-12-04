const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Função para deixar a resposta mais humana usando OpenAI
async function enhanceWithAI(baseReply, session) {
  // Se não houver API key, devolve a mensagem base
  if (!process.env.OPENAI_API_KEY) {
    return baseReply;
  }

  try {
    const sistema = `
Você é MAYA da Siligyn, agente oficial de atendimento da Siligyn Produtos Médicos.

Regras:
- Fale sempre em português do Brasil.
- Seja acolhedora, empática, clara, profissional e objetiva.
- Mantenha SEMPRE apenas UMA pergunta por mensagem.
- Não use emojis.
- Não forneça opiniões médicas.
- Não sugira tipo, volume, tamanho ou modelo de implante.
- Não mude o sentido técnico da mensagem base, apenas a forma de falar.
- Não invente informações, preços, promoções ou políticas que não estejam implícitas na mensagem base.
- Use um tom próximo de uma atendente humana atenciosa, mas profissional.
`;

    const contexto = `
Dados atuais da paciente (não cite literalmente, use apenas como contexto interno):
${JSON.stringify(session?.data || {}, null, 2)}
`;

    const userPrompt = `
Reescreva a mensagem abaixo de forma mais empática, acolhedora e natural, mantendo o mesmo sentido e apenas UMA pergunta no final. Não use emojis.

Mensagem base:
"${baseReply}"

${contexto}
`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() || baseReply;

    return reply;
  } catch (err) {
    console.error('Erro ao chamar OpenAI para refinar resposta:', err);
    // Em caso de erro na IA, devolve a mensagem base
    return baseReply;
  }
}

// Rota de teste (navegador)
app.get('/', (req, res) => {
  res.send('MAYA da Siligyn - Backend ativo com fluxo e IA empática.');
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
    let baseReply = '';

    // =========================
    // FLUXO PRINCIPAL
    // =========================

    switch (session.state) {
      // 0) SAUDAÇÃO INICIAL
      case 'SAUDACAO':
        baseReply =
          'Olá! Eu sou a MAYA da Siligyn. Sou especializada em ajudar você com informações sobre nossos produtos. Há mais de 25 anos, a Siligyn apoia médicos e pacientes em Goiás com confiança, segurança e qualidade. Para eu te orientar da melhor forma, com qual produto posso te ajudar hoje?';
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
          baseReply =
            'Entendi, você está buscando os implantes Silimed para a sua cirurgia. Só para eu entender em que momento você está nesse processo: você já passou em consulta com o seu cirurgião plástico para essa cirurgia?';
        } else if (querMedgel) {
          session.state = 'INTERESSE_MEDGEL';
          baseReply =
            'Certo, você tem interesse no Medgel Antiage. Eu consigo te explicar como ele funciona e como pode te ajudar na rotina de cuidado com a pele. Antes disso, me conta: hoje você costuma usar algum produto para prevenção de rugas ou cuidados diários com a pele do rosto?';
        } else if (querFita) {
          session.state = 'INTERESSE_FITA';
          baseReply =
            'Perfeito, você quer saber mais sobre a fita de cicatrização. Ela é muito utilizada no pós-operatório para ajudar na qualidade estética da cicatriz. Me conta, por favor: a sua cirurgia já foi realizada ou ainda está programada para acontecer?';
        } else {
          session.state = 'INTERESSE_OUTROS';
          baseReply =
            'Entendi, obrigada por compartilhar. Nós trabalhamos com implantes mamários Silimed, fita de cicatrização, Medgel Antiage e outros produtos de suporte cirúrgico. Para eu direcionar melhor o atendimento, você pode me contar com um pouco mais de detalhes o que está buscando agora?';
        }
        break;
      }

      // 2) VERIFICA SE JÁ PASSOU EM CONSULTA (IMPLANTES)
      case 'CONSULTA_IMPLANTE':
        if (isYes(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          baseReply =
            'Perfeito, isso ajuda bastante. Agora vou precisar de alguns dados da sua cirurgia para agendar o seu atendimento no sistema. Os implantes serão entregues diretamente no centro cirúrgico, no nome do médico responsável pela cirurgia e com o seu nome como paciente. Por isso, precisamos deixar tudo muito certinho para não haver erro. Para começarmos, qual é o nome do cirurgião plástico responsável pela sua cirurgia?';
        } else if (isNo(msgLower)) {
          session.state = 'FINALIZADO';
          baseReply =
            'Entendo, e isso é bem comum. A compra dos implantes é feita sempre após a avaliação do cirurgião plástico, que define o que é mais indicado para você. Assim que você passar em consulta e o seu médico te orientar sobre os implantes Silimed, posso te ajudar com toda a organização da compra e das condições. Enquanto isso, se você quiser, eu posso te explicar um pouco mais sobre os implantes ou sobre como funciona o processo com a Siligyn. Gostaria?';
        } else {
          baseReply =
            'Só para eu conseguir seguir direitinho e te ajudar da melhor forma: você já passou em consulta com o seu cirurgião plástico para essa cirurgia? Pode me responder com sim ou não?';
        }
        break;

      // =========================
      // ETAPA 1 — DADOS DA CIRURGIA
      // =========================
      case 'ETAPA1_CIRURGIA_NOME':
        session.data.cirurgiao = userMessage;
        session.state = 'ETAPA1_CIRURGIA_DATA';
        baseReply =
          'Obrigada, já registrei o nome do seu cirurgião. Se você já tiver a data da cirurgia definida, pode me informar agora. Se ainda estiver em definição, fique à vontade para me dizer que a data está em aberto que seguimos normalmente. Qual é a data da cirurgia ou se ela ainda está a definir?';
        break;

      case 'ETAPA1_CIRURGIA_DATA':
        session.data.dataCirurgia = userMessage;
        session.state = 'ETAPA1_CIRURGIA_LOCAL';
        baseReply =
          'Certo, anotei a informação sobre a data da cirurgia. Agora preciso registrar em qual hospital ou clínica a sua cirurgia será realizada, ou está prevista para ser realizada. Você pode me informar o nome do hospital ou da clínica?';
        break;

      case 'ETAPA1_CIRURGIA_LOCAL':
        session.data.localCirurgia = userMessage;
        session.state = 'ETAPA1_CONFIRMAR';

        const dataFormatada = formatDataCirurgia(session.data.dataCirurgia);

        baseReply =
          'Para garantir que o agendamento e a entrega dos implantes no centro cirúrgico fiquem corretos, vou recapitular os dados da cirurgia que registrei até aqui:\n' +
          `Cirurgião: ${session.data.cirurgiao}\n` +
          `Data da cirurgia: ${dataFormatada}\n` +
          `Hospital/Clínica: ${session.data.localCirurgia}\n` +
          'Quero ter certeza de que está tudo certinho. Essas informações estão corretas?';
        break;

      case 'ETAPA1_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'ETAPA2_DADOS_NOME';
          baseReply =
            'Ótimo, obrigada por conferir comigo. Agora vou precisar dos seus dados pessoais para a emissão da nota fiscal. A nota fiscal é emitida após o procedimento cirúrgico, com as informações dos implantes que foram utilizados em você. Por isso, pedimos até dois dias úteis após a cirurgia para emissão, e ela será enviada automaticamente para o e-mail que você informar. Para começarmos essa parte, você pode me informar o seu nome completo?';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA1_CIRURGIA_NOME';
          baseReply =
            'Sem problema, é muito importante que esses dados estejam corretos. Vamos ajustar com calma. Vou refazer os dados da cirurgia desde o início. Você pode me informar novamente o nome do cirurgião plástico responsável pela sua cirurgia?';
        } else {
          baseReply =
            'Só para eu conseguir seguir corretamente: as informações da cirurgia que te passei estão corretas? Você pode me responder com sim ou não?';
        }
        break;

      // =========================
      // ETAPA 2 — DADOS DA PACIENTE (NOTA FISCAL)
      // =========================
      case 'ETAPA2_DADOS_NOME':
        session.data.nomePaciente = userMessage;
        session.state = 'ETAPA2_DADOS_CPF';
        baseReply =
          'Obrigada, já registrei o seu nome completo. Agora, para seguir com o cadastro para emissão da nota fiscal, você pode me informar o seu CPF?';
        break;

      case 'ETAPA2_DADOS_CPF':
        session.data.cpfPaciente = userMessage;
        session.state = 'ETAPA2_DADOS_ENDERECO';
        baseReply =
          'Perfeito, CPF registrado. Agora preciso do seu endereço completo, incluindo rua, número, complemento se houver, bairro, cidade e, se você souber, o CEP. Você pode me passar essas informações?';
        break;

      case 'ETAPA2_DADOS_ENDERECO':
        session.data.enderecoPaciente = userMessage;
        session.state = 'ETAPA2_DADOS_EMAIL';
        baseReply =
          'Certo, já registrei o seu endereço. Para finalizar essa etapa, preciso do e-mail em que você deseja receber a nota fiscal após a cirurgia. Qual é o seu e-mail?';
        break;

      case 'ETAPA2_DADOS_EMAIL':
        session.data.emailPaciente = userMessage;
        session.state = 'ETAPA2_CONFIRMAR';
        baseReply =
          'Vou recapitular os seus dados pessoais para garantir que a nota fiscal seja emitida corretamente:\n' +
          `Nome: ${session.data.nomePaciente}\n` +
          `CPF: ${session.data.cpfPaciente}\n` +
          `Endereço: ${session.data.enderecoPaciente}\n` +
          `E-mail: ${session.data.emailPaciente}\n` +
          'Quero ter certeza de que está tudo correto. Essas informações estão certas?';
        break;

      case 'ETAPA2_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'ETAPA3_INDICACAO';
          baseReply =
            'Perfeito, obrigada por conferir com atenção. Agora, para finalizar a qualificação, preciso registrar a indicação do seu cirurgião. A sua médica ou o seu médico te informou qual modelo ou revestimento do implante Silimed será utilizado? Se puder, me conte com as suas palavras o que ele ou ela orientou.';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA2_DADOS_NOME';
          baseReply =
            'Tudo bem, é importante que esses dados estejam corretos para a emissão da nota fiscal. Vamos ajustar juntos. Vou começar novamente pelos seus dados pessoais. Você pode me informar de novo o seu nome completo?';
        } else {
          baseReply =
            'Só para eu confirmar direitinho: essas informações pessoais que recapitulei estão corretas? Você pode me responder com sim ou não?';
        }
        break;

      // =========================
      // ETAPA 3 — INDICAÇÃO MÉDICA
      // =========================
      case 'ETAPA3_INDICACAO':
        session.data.indicacaoMedica = userMessage;
        session.state = 'ETAPA3_CONFIRMAR';
        baseReply =
          'Para garantir que eu registrei corretamente, vou repetir a indicação que você me passou do seu cirurgião:\n' +
          `${session.data.indicacaoMedica}\n` +
          'Quero ter certeza de que está exatamente como foi orientado. Essa informação está correta?';
        break;

      case 'ETAPA3_CONFIRMAR':
        if (isYes(msgLower)) {
          session.state = 'AGUARDANDO_VALIDACAO';
          baseReply =
            'Perfeito, registrei os dados da cirurgia, os seus dados pessoais e a indicação do implante conforme orientação do seu cirurgião. Agora, vou aguardar uma validação interna para garantirmos que está tudo alinhado antes de seguir para a parte de forma de pagamento. Assim que essa validação estiver concluída, eu retomo o contato com você para combinarmos os próximos passos. Tudo bem para você?';
        } else if (isNo(msgLower)) {
          session.state = 'ETAPA3_INDICACAO';
          baseReply =
            'Sem problema, vamos ajustar essa informação com calma. Você pode me informar novamente o que o seu cirurgião orientou em relação ao implante Silimed?';
        } else {
          baseReply =
            'Só para eu ter certeza: a indicação que eu repeti para você está correta? Você pode me responder com sim ou não?';
        }
        break;

      // =========================
      // ESTADO APÓS ETAPAS (Aguardando validação humana)
      // =========================
      case 'AGUARDANDO_VALIDACAO':
        baseReply =
          'Todas as informações importantes sobre a sua cirurgia e os implantes já foram registradas. Agora estou aguardando apenas uma validação interna para confirmar que está tudo certo. Assim que essa etapa estiver concluída, eu volto a falar com você para combinarmos a forma de pagamento e seguir com a organização da sua compra. Posso continuar te acompanhando por aqui assim que essa validação for concluída?';
        break;

      // =========================
      // FLUXOS SECUNDÁRIOS (MEDGEL, FITA, OUTROS)
      // =========================
      case 'INTERESSE_MEDGEL':
        baseReply =
          'O Medgel Antiage é indicado para prevenção e melhora de linhas finas e da textura da pele do rosto. Ele costuma ser usado como parte de uma rotina de cuidados para quem quer prevenir o envelhecimento ou suavizar sinais que já aparecem. Pensando em você hoje, você está mais focada em prevenção ou em suavizar linhas que já percebeu?';
        session.state = 'INTERESSE_MEDGEL_DETALHE';
        break;

      case 'INTERESSE_MEDGEL_DETALHE':
        baseReply =
          'Entendi, obrigada por compartilhar comigo. O Medgel Antiage atua justamente nesse tipo de necessidade, ajudando na qualidade da pele ao longo do uso contínuo. Se você quiser, eu posso te explicar em mais detalhes como ele é aplicado e, em seguida, te passar as condições de compra para que você avalie com calma. Você gostaria que eu te explicasse melhor o modo de uso agora?';
        session.state = 'FINALIZADO';
        break;

      case 'INTERESSE_FITA':
        baseReply =
          'A fita de cicatrização é utilizada no pós-operatório para contribuir com a qualidade estética da cicatriz ao longo do tempo. Ela costuma ser introduzida após a fase inicial de curativos, sempre conforme a orientação do seu cirurgião. Me conta: a sua cirurgia já tem data marcada ou você ainda está na fase de planejamento?';
        session.state = 'INTERESSE_FITA_DETALHE';
        break;

      case 'INTERESSE_FITA_DETALHE':
        baseReply =
          'Perfeito, obrigada por me contar em que momento você está. A fita de cicatrização entra como um cuidado complementar, depois da liberação médica, para ajudar no resultado final da cicatriz. Se você quiser, posso te orientar sobre como adquirir a fita conosco e quais são as opções disponíveis. Você gostaria que eu te explicasse como funciona a compra da fita?';
        session.state = 'FINALIZADO';
        break;

      case 'INTERESSE_OUTROS':
        baseReply =
          'Certo, entendi o que você trouxe. Nós trabalhamos com implantes Silimed, fita de cicatrização, Medgel Antiage e outros produtos que dão suporte ao procedimento cirúrgico e ao pós-operatório. Se você puder detalhar um pouco mais o que está buscando ou qual é a sua maior dúvida neste momento, eu consigo direcionar o atendimento da forma mais adequada para o que você precisa. O que você sente que é mais importante esclarecer agora?';
        session.state = 'FINALIZADO';
        break;

      // =========================
      // FINALIZADO OU ESTADOS DESCONHECIDOS
      // =========================
      case 'FINALIZADO':
      default:
        baseReply =
          'Certo, recebi a sua mensagem. Se você quiser, posso retomar o atendimento focando em implantes mamários, no Medgel Antiage, na fita de cicatrização ou em outro produto específico do nosso portfólio. Com qual desses assuntos você prefere que eu te ajude agora?';
        session.state = 'DETECTAR_INTENCAO';
        break;
    }

    const reply = await enhanceWithAI(baseReply, session);
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
