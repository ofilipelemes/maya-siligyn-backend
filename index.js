const express = require('express');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Cliente da OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Sessões em memória
const sessions = {};

function getSessionId(req) {
  return req.body.from || req.body.phone || req.body.sessionId || "sessao-desconhecida";
}

function isYes(text) {
  const t = text.toLowerCase();
  return t.includes("sim") || t.trim() === "s";
}

function isNo(text) {
  const t = text.toLowerCase();
  return t.includes("não") || t.includes("nao") || t.trim() === "n";
}

function formatDataCirurgia(text) {
  const t = text.toLowerCase();
  if (
    t.includes("a definir") ||
    t.includes("vou definir") ||
    t.includes("ainda vou definir") ||
    t.includes("não sei") ||
    t.includes("nao sei")
  ) {
    return "A definir";
  }
  return text;
}

// IA empática refinando mensagens
async function enhance(baseReply, session) {
  if (!process.env.OPENAI_API_KEY) return baseReply;

  try {
    const sistema = `
Você é MAYA da Siligyn.  
Atendimento humano, acolhedor, profissional e empático.  
Nunca use emojis.  
Use linguagem natural, amigável e objetiva.  
Sempre faça apenas UMA pergunta por mensagem.  
Não sugira tipo, modelo ou tamanho de implante.  
Você só reformula a mensagem base, NUNCA altera sentido, ordem ou etapas.  
`;

    const userPrompt = `
Reescreva a mensagem abaixo de forma mais acolhedora, natural e humana, mantendo o conteúdo e apenas UMA pergunta no final.

Mensagem base:
"${baseReply}"
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    return baseReply;
  }
}

// ================================
// ROTAS
// ================================
app.get("/", (req, res) => {
  res.send("MAYA da Siligyn — Backend ativo.");
});

app.post("/webhook-whatsapp", async (req, res) => {
  try {
    const msg = (req.body.message || "").trim();
    const msgLower = msg.toLowerCase();
    const sessionId = getSessionId(req);

    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        state: "SAUDACAO",
        data: {}
      };
    }

    const session = sessions[sessionId];
    let baseReply = "";

    // ================================
    // FLUXO
    // ================================

    switch (session.state) {

      // 0 — Saudação inicial
      case "SAUDACAO":
        baseReply =
          "Olá! Eu sou a MAYA da Siligyn. É um prazer falar com você. A Siligyn atua há mais de 25 anos acompanhando médicos e pacientes em Goiás com segurança e qualidade. Para eu te orientar da melhor forma, você poderia me dizer com qual produto deseja ajuda hoje?";
        session.state = "DETECTAR_INTENCAO";
        break;

      case "DETECTAR_INTENCAO": {
        const querImplante =
          msgLower.includes("implante") ||
          msgLower.includes("prótese") ||
          msgLower.includes("protese") ||
          msgLower.includes("silimed") ||
          msgLower.includes("silicone");

        if (querImplante) {
          session.state = "CONSULTA_IMPLANTE";
          baseReply =
            "Entendi. Antes de seguirmos, você já passou por consulta com o seu cirurgião plástico para essa cirurgia?";
        } else {
          session.state = "INTERESSE_OUTROS";
          baseReply =
            "Claro, posso te ajudar com outros produtos também. Para eu direcionar melhor o atendimento, você pode me contar com qual produto ou necessidade gostaria de falar?";
        }
        break;
      }

      // Confirma consulta
      case "CONSULTA_IMPLANTE":
        if (isYes(msgLower)) {
          session.state = "ETAPA1_CIRURGIA_NOME";
          baseReply =
            "Perfeito. Para organizarmos seu atendimento no sistema e garantir que os implantes sejam entregues corretamente no centro cirúrgico, preciso registrar alguns dados da sua cirurgia. Qual é o nome do cirurgião plástico responsável pelo procedimento?";
        } else if (isNo(msgLower)) {
          session.state = "FINALIZADO";
          baseReply =
            "Sem problemas. O ideal é que a compra dos implantes seja feita após orientação médica. Quando você passar pela consulta, posso te ajudar novamente.";
        } else {
          baseReply =
            "Só para eu confirmar: você já passou em consulta com o seu cirurgião plástico?";
        }
        break;

      // ================================
      // ETAPA 1 — CIRURGIA
      // ================================
      case "ETAPA1_CIRURGIA_NOME":
        session.data.cirurgiao = msg;
        session.state = "ETAPA1_CIRURGIA_DATA";
        baseReply =
          "Obrigada. Agora preciso registrar a data da cirurgia. Caso ainda esteja indefinida, posso registrar como 'a definir'. Qual é a data da cirurgia?";
        break;

      case "ETAPA1_CIRURGIA_DATA":
        session.data.dataCirurgia = formatDataCirurgia(msg);
        session.state = "ETAPA1_CIRURGIA_LOCAL";
        baseReply =
          "Certo. Agora me informe, por favor, em qual hospital ou clínica será realizada a cirurgia.";
        break;

      case "ETAPA1_CIRURGIA_LOCAL":
        session.data.localCirurgia = msg;
        session.state = "ETAPA2_INDICACAO";
        baseReply =
          "Perfeito. Agora preciso registrar a orientação cirúrgica. O que o seu cirurgião te informou sobre os implantes Silimed que serão utilizados?";
        break;

      // ================================
      // ETAPA 2 — INDICAÇÃO MÉDICA
      // ================================
      case "ETAPA2_INDICACAO":
        session.data.indicacaoMedica = msg;
        session.state = "ETAPA3_DADOS_NOME";
        baseReply =
          "Obrigada. Agora vamos registrar seus dados no sistema. Isso é necessário para organizarmos seu atendimento e garantir a entrega correta dos implantes no centro cirúrgico. Para começarmos, qual é o seu nome completo?";
        break;

      // ================================
      // ETAPA 3 — DADOS DA PACIENTE
      // ================================
      case "ETAPA3_DADOS_NOME":
        session.data.nomePaciente = msg;
        session.state = "ETAPA3_DADOS_CPF";
        baseReply =
          "Perfeito. Agora me informe seu CPF, por favor.";
        break;

      case "ETAPA3_DADOS_CPF":
        session.data.cpfPaciente = msg;
        session.state = "ETAPA3_DADOS_ENDERECO";
        baseReply =
          "Certo. Agora preciso do seu endereço completo.";
        break;

      case "ETAPA3_DADOS_ENDERECO":
        session.data.enderecoPaciente = msg;
        session.state = "ETAPA3_DADOS_EMAIL";
        baseReply =
          "Obrigada. Para finalizar, me informe o seu e-mail.";
        break;

      case "ETAPA3_DADOS_EMAIL":
        session.data.emailPaciente = msg;
        session.state = "CONFIRMACAO_FINAL";

        baseReply =
          "Antes de seguirmos para a validação interna, vou te apresentar o resumo de todas as informações registradas:\n\n" +
          `• Cirurgião: ${session.data.cirurgiao}\n` +
          `• Data da cirurgia: ${session.data.dataCirurgia}\n` +
          `• Local: ${session.data.localCirurgia}\n` +
          `• Indicação médica: ${session.data.indicacaoMedica}\n` +
          `• Nome da paciente: ${session.data.nomePaciente}\n` +
          `• CPF: ${session.data.cpfPaciente}\n` +
          `• Endereço: ${session.data.enderecoPaciente}\n` +
          `• E-mail: ${session.data.emailPaciente}\n\n` +
          "Por favor, confirme se todas as informações acima estão corretas.";
        break;

      // CONFIRMAÇÃO ÚNICA
      case "CONFIRMACAO_FINAL":
        if (isYes(msgLower)) {
          session.state = "AGUARDANDO_VALIDACAO";
          baseReply =
            "Perfeito, obrigada pela confirmação. Agora vou aguardar a validação interna para continuarmos com a etapa de pagamento. Assim que estiver tudo certo, eu retorno por aqui.";
        } else if (isNo(msgLower)) {
          session.state = "ETAPA1_CIRURGIA_NOME";
          baseReply =
            "Sem problema. Vamos corrigir tudo com calma. Vamos começar novamente pela cirurgia. Qual o nome do seu cirurgião?";
        } else {
          baseReply = "Você poderia me confirmar se as informações estão corretas?";
        }
        break;

      // Após fluxo
      case "AGUARDANDO_VALIDACAO":
        baseReply =
          "As informações já foram registradas e agora estou aguardando a validação interna para seguirmos para a etapa de pagamento. Em breve retorno com os próximos passos.";
        break;

      default:
        baseReply =
          "Certo, posso te ajudar novamente. Qual produto você deseja adquirir?";
        session.state = "DETECTAR_INTENCAO";
    }

    const reply = await enhance(baseReply, session);
    return res.json({ reply });

  } catch (error) {
    console.error("Erro:", error);
    return res.json({
      reply: "Tive uma instabilidade no momento. Pode tentar novamente?"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor rodando."));
