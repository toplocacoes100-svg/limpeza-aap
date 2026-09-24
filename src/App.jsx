import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import {
  getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  runTransaction, writeBatch, query, orderBy, limit,
} from "firebase/firestore";

/* =========================================================
   CONFIGURAÇÃO DO FIREBASE — NÃO ALTERAR
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyDRHZKlAztSJT1j97ZllhthRhgc4Jy6yAM",
  authDomain: "app-limpeza-d818e.firebaseapp.com",
  projectId: "app-limpeza-d818e",
  storageBucket: "app-limpeza-d818e.firebasestorage.app",
  messagingSenderId: "458621417759",
  appId: "1:458621417759:web:c57370da41ceb41c64582a",
  measurementId: "G-LHZERT6HWE",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/* =========================================================
   UTILITÁRIOS
   ========================================================= */
const pad = (n, l = 2) => String(n).padStart(l, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeISO = () => toISO(new Date());
const agoraISO = () => new Date().toISOString();
const parseISO = (s) => {
  const [y, m, d] = String(s || "").slice(0, 10).split("-").map(Number);
  return new Date(y || 2000, (m || 1) - 1, d || 1);
};
const addDias = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
const addMeses = (s, n) => {
  const d = parseISO(s); const dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ult)); return toISO(d);
};
const fmtData = (s) => { if (!s) return "—"; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const hm2min = (h) => { const [a, b] = String(h || "0:0").split(":").map(Number); return (a || 0) * 60 + (b || 0); };
const digitos = (s) => String(s || "").replace(/\D/g, "");
const iniciais = (nome) => String(nome || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const normalizar = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MES_ABR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIA_ABR = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIA_NOME = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const ultimosMeses = (n) => {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ chave: `${x.getFullYear()}-${pad(x.getMonth() + 1)}`, rot: MES_ABR[x.getMonth()] });
  }
  return out;
};
const inicioSemana = (s) => { const d = parseISO(s); d.setDate(d.getDate() - d.getDay()); return toISO(d); };

const mascaraTel = (v) => {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const mascaraDoc = (v) => {
  const d = digitos(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
};
const mascaraCep = (v) => { const d = digitos(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

const cpfValido = (v) => {
  const c = digitos(v); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0; return r === +c[10];
};
const cnpjValido = (v) => {
  const c = digitos(v); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = base.split("").reduce((a, n, i) => a + +n * pesos[i], 0);
    const r = s % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(c.slice(0, 12)) === +c[12] && calc(c.slice(0, 13)) === +c[13];
};
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

const waLink = (tel, texto) => {
  let d = digitos(tel);
  if (d && d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto || "")}`;
};
const mailLink = (email, assunto, corpo) =>
  `mailto:${email || ""}?subject=${encodeURIComponent(assunto || "")}&body=${encodeURIComponent(corpo || "")}`;
const mapsLink = (end) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end || "")}`;
const enderecoCliente = (c) => {
  if (!c) return "";
  const l1 = [c.rua, c.numero].filter(Boolean).join(", ");
  const l2 = [c.complemento, c.bairro].filter(Boolean).join(" - ");
  const l3 = [c.cidade, c.uf].filter(Boolean).join("/");
  return [l1, l2, l3].filter(Boolean).join(" - ");
};
const abrirLink = (url) => window.open(url, "_blank", "noopener");

/* =========================================================
   STATUS, PAPÉIS E PERMISSÕES
   ========================================================= */
const OS_STATUS = {
  orcamento: { rot: "Orçamento", cor: "off" },
  agendado: { rot: "Agendado", cor: "info" },
  confirmado: { rot: "Confirmado", cor: "pri" },
  andamento: { rot: "Em andamento", cor: "part" },
  concluido: { rot: "Concluído", cor: "ok" },
  aguardando_pagamento: { rot: "Aguardando pagamento", cor: "warn" },
  pago: { rot: "Pago", cor: "ok" },
  cancelado: { rot: "Cancelado", cor: "bad" },
};
const OS_ABERTAS = ["orcamento", "agendado", "confirmado", "andamento"];
const OS_FEITAS = ["concluido", "aguardando_pagamento", "pago"];

const PROP_STATUS = {
  rascunho: { rot: "Rascunho", cor: "off" },
  enviada: { rot: "Enviada", cor: "info" },
  visualizada: { rot: "Visualizada", cor: "part" },
  aguardando: { rot: "Aguardando resposta", cor: "warn" },
  aprovada: { rot: "Aprovada", cor: "ok" },
  recusada: { rot: "Recusada", cor: "bad" },
  expirada: { rot: "Expirada", cor: "off" },
};
const PROP_EM_ABERTO = ["enviada", "visualizada", "aguardando"];

const FIN_STATUS = {
  pago: { rot: "Pago", cor: "ok" },
  pendente: { rot: "Pendente", cor: "warn" },
  atrasado: { rot: "Atrasado", cor: "bad" },
  cancelado: { rot: "Cancelado", cor: "off" },
  parcial: { rot: "Parcial", cor: "info" },
};
const FORMAS = ["PIX", "Dinheiro", "Cartão", "Transferência", "Boleto", "Outros"];

const PAPEIS = {
  admin: "Administrador", gerente: "Gerente", financeiro: "Financeiro",
  atendimento: "Atendimento", equipe: "Equipe", pendente: "Aguardando liberação",
};
const PERMS = {
  admin: ["inicio", "agenda", "clientes", "propostas", "os", "financeiro", "config", "usuarios", "excluir"],
  gerente: ["inicio", "agenda", "clientes", "propostas", "os", "financeiro", "config", "excluir"],
  financeiro: ["inicio", "clientes", "os", "financeiro"],
  atendimento: ["inicio", "agenda", "clientes", "propostas", "os"],
  equipe: ["agenda", "os"],
};

const pagoDe = (r) => (r?.pagamentos || []).reduce((a, p) => a + num(p.valor), 0);
const saldoDe = (r) => Math.max(0, num(r?.valor) - pagoDe(r));
const statusReceber = (r) => {
  if (r.cancelado) return "cancelado";
  const pago = pagoDe(r);
  if (pago >= num(r.valor) - 0.005 && num(r.valor) > 0) return "pago";
  if (r.vencimento && r.vencimento < hojeISO()) return "atrasado";
  if (pago > 0) return "parcial";
  return "pendente";
};
const statusProposta = (p) => {
  if (PROP_EM_ABERTO.includes(p.status) && p.validade && p.validade < hojeISO()) return "expirada";
  return p.status || "rascunho";
};
const totalProposta = (p) => {
  const bruto = (p.itens || []).reduce((a, i) => a + num(i.qtd) * num(i.valorUnit), 0);
  return Math.max(0, bruto - num(p.desconto));
};

/* =========================================================
   FIRESTORE — AJUDANTES
   ========================================================= */
async function proximoNumero(tipo) {
  const ref = doc(db, "contadores", tipo);
  const ano = new Date().getFullYear();
  const n = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    let valor = 1;
    if (snap.exists()) {
      const d = snap.data();
      valor = tipo !== "cliente" && d.ano !== ano ? 1 : (d.valor || 0) + 1;
    }
    tx.set(ref, { valor, ano });
    return valor;
  });
  if (tipo === "cliente") return `CLI-${pad(n, 5)}`;
  if (tipo === "os") return `OS-${ano}-${pad(n, 5)}`;
  return `PROP-${ano}-${pad(n, 5)}`;
}

async function registrarLog(perfil, acao, resumo) {
  try {
    await addDoc(collection(db, "logs"), {
      acao, resumo, usuario: perfil?.nome || "", uid: perfil?.uid || "", data: agoraISO(),
    });
  } catch (e) { /* log nunca bloqueia o uso */ }
}

let nomePendente = "";
async function criarPerfil(user, nome) {
  const base = {
    nome: nome || user.displayName || String(user.email || "").split("@")[0],
    email: user.email || "", criadoEm: agoraISO(),
  };
  try {
    const b = writeBatch(db);
    b.set(doc(db, "usuarios", user.uid), { ...base, papel: "admin" });
    b.set(doc(db, "config", "sistema"), { adminUid: user.uid, empresaNome: "Minha Empresa de Limpeza", criadoEm: agoraISO() });
    await b.commit();
  } catch (e) {
    await setDoc(doc(db, "usuarios", user.uid), { ...base, papel: "pendente" });
  }
}

function useColecao(nome, ativo) {
  const [dados, setDados] = useState([]);
  useEffect(() => {
    if (!ativo) { setDados([]); return undefined; }
    const unsub = onSnapshot(
      collection(db, nome),
      (s) => setDados(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error("Erro ao carregar", nome, e),
    );
    return unsub;
  }, [nome, ativo]);
  return dados;
}

/* =========================================================
   MENSAGENS PRONTAS
   ========================================================= */
const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const msgConfirmacao = (os, emp) =>
  `Olá, ${primeiroNome(os.clienteNome)}! Aqui é da ${emp}.\n\nSeu serviço está confirmado:\n• ${os.servico}\n• ${fmtData(os.data)} às ${os.hora || "--:--"}\n• ${os.endereco || ""}\n\nOrdem de serviço: ${os.numero}\nQualquer dúvida, é só responder esta mensagem.`;
const msgLembrete = (os, emp) =>
  `Olá, ${primeiroNome(os.clienteNome)}! Passando para lembrar do seu serviço de ${os.servico} em ${fmtData(os.data)} às ${os.hora || "--:--"}.\n\nNossa equipe estará no endereço: ${os.endereco || ""}.\n\n${emp}`;
const msgAgradecimento = (os, emp, linkAval) =>
  `Olá, ${primeiroNome(os.clienteNome)}! Obrigado por escolher a ${emp}. Esperamos que tenha gostado do resultado do serviço de ${os.servico}.\n\n${linkAval ? `Sua opinião ajuda muito! Se puder, deixe sua avaliação aqui: ${linkAval}\n\n` : "Se puder, conte pra gente de 1 a 5 como foi o atendimento.\n\n"}Até a próxima!`;
const msgCobranca = (r, emp, pix) =>
  `Olá, ${primeiroNome(r.clienteNome)}! Aqui é da ${emp}.\n\nConsta em aberto o valor de ${brl(saldoDe(r))} referente a ${r.descricao || "serviço"}${r.osNumero ? ` (${r.osNumero})` : ""}, com vencimento em ${fmtData(r.vencimento)}.${pix ? `\n\nChave PIX: ${pix}` : ""}\n\nSe já pagou, por favor desconsidere. Obrigado!`;
const msgProposta = (p, emp) =>
  `Olá, ${primeiroNome(p.clienteNome)}! Segue a proposta ${p.numero} da ${emp}.\n\n${(p.itens || []).map((i) => `• ${i.descricao} — ${num(i.qtd)} ${i.unidade || ""} x ${brl(i.valorUnit)}`).join("\n")}\n${num(p.desconto) ? `Desconto: ${brl(p.desconto)}\n` : ""}Total: ${brl(totalProposta(p))}\n\nValidade: ${fmtData(p.validade)}\nPrazo: ${p.prazo || "a combinar"}\nPagamento: ${p.formaPagamento || "a combinar"}\n\nFicamos à disposição para aprovar e agendar!`;

/* =========================================================
   PDF (abre página pronta para "Salvar como PDF")
   ========================================================= */
function imprimir(titulo, corpo) {
  const w = window.open("", "_blank");
  if (!w) { alert("Libere as janelas pop-up do navegador para gerar o PDF."); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}body{font-family:Figtree,Arial,Helvetica,sans-serif;color:#14232B;margin:0;padding:32px;font-size:13px;line-height:1.5}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:3px solid #0B7A6E;padding-bottom:16px;margin-bottom:20px}
.emp{display:flex;gap:14px;align-items:center}.emp img{max-height:64px;max-width:120px;object-fit:contain}
.emp h1{font-size:20px;margin:0}.muted{color:#5E6E74}.doc{text-align:right}.doc h2{margin:0;font-size:18px;color:#075E55}
.box{border:1px solid #E1E8E6;border-radius:10px;padding:12px 14px;margin-bottom:16px}.box h3{margin:0 0 8px;font-size:13px;color:#075E55}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}table{width:100%;border-collapse:collapse;margin-bottom:12px}
th{background:#E3F3EF;color:#075E55;text-align:left;padding:8px;font-size:12px}td{padding:8px;border-bottom:1px solid #E1E8E6}
.r{text-align:right}.tot{display:flex;justify-content:flex-end}.tot table{width:280px}.tot td{border:0;padding:4px 8px}
.big td{font-size:16px;font-weight:700;color:#075E55;border-top:2px solid #0B7A6E}
.ass{display:flex;gap:40px;margin-top:56px}.ass div{flex:1;border-top:1px solid #14232B;text-align:center;padding-top:6px}
.foot{margin-top:28px;font-size:11px;color:#8A9A9F;text-align:center}
@media print{body{padding:0}@page{margin:16mm}}
</style></head><body>${corpo}<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`);
  w.document.close();
}
const cabecalhoPDF = (cfg, tituloDoc, numero, data) => `
<div class="top"><div class="emp">${cfg.logo ? `<img src="${cfg.logo}" alt="">` : ""}<div>
<h1>${esc(cfg.empresaNome || "")}</h1><div class="muted">${[cfg.cnpj, cfg.telefone, cfg.email].filter(Boolean).map(esc).join(" | ")}</div>
<div class="muted">${esc(cfg.endereco || "")}</div></div></div>
<div class="doc"><h2>${esc(tituloDoc)}</h2><div><b>${esc(numero)}</b></div><div class="muted">${fmtData(data)}</div></div></div>`;
const blocoCliente = (c, nomeFallback) => `
<div class="box"><h3>Cliente</h3><div class="grid">
<div><b>${esc(c?.nome || nomeFallback || "")}</b>${c?.fantasia ? `<br>${esc(c.fantasia)}` : ""}</div>
<div>${c?.documento ? `${c.tipo === "PJ" ? "CNPJ" : "CPF"}: ${esc(c.documento)}` : ""}${c?.codigo ? `<br>Código: ${esc(c.codigo)}` : ""}</div>
<div>${esc(c?.whatsapp || c?.telefone || "")}${c?.email ? `<br>${esc(c.email)}` : ""}</div>
<div>${esc(enderecoCliente(c))}</div></div></div>`;

function pdfProposta(p, cliente, cfg) {
  const bruto = (p.itens || []).reduce((a, i) => a + num(i.qtd) * num(i.valorUnit), 0);
  imprimir(`Proposta ${p.numero}`, `${cabecalhoPDF(cfg, "Proposta comercial", p.numero, p.data)}
${blocoCliente(cliente, p.clienteNome)}
<table><thead><tr><th>Descrição</th><th class="r">Qtd</th><th>Un.</th><th class="r">Valor unit.</th><th class="r">Subtotal</th></tr></thead><tbody>
${(p.itens || []).map((i) => `<tr><td>${esc(i.descricao)}${i.detalhe ? `<br><span class="muted">${esc(i.detalhe)}</span>` : ""}</td><td class="r">${num(i.qtd)}</td><td>${esc(i.unidade || "")}</td><td class="r">${brl(i.valorUnit)}</td><td class="r">${brl(num(i.qtd) * num(i.valorUnit))}</td></tr>`).join("")}
</tbody></table>
<div class="tot"><table><tr><td>Subtotal</td><td class="r">${brl(bruto)}</td></tr>${num(p.desconto) ? `<tr><td>Desconto</td><td class="r">- ${brl(p.desconto)}</td></tr>` : ""}<tr class="big"><td>Total</td><td class="r">${brl(totalProposta(p))}</td></tr></table></div>
<div class="box"><h3>Condições</h3><div class="grid">
<div><b>Prazo de execução:</b> ${esc(p.prazo || "A combinar")}</div><div><b>Forma de pagamento:</b> ${esc(p.formaPagamento || "A combinar")}</div>
<div><b>Validade da proposta:</b> ${fmtData(p.validade)}</div></div></div>
${p.descricao ? `<div class="box"><h3>Descrição do serviço</h3>${esc(p.descricao).replace(/\n/g, "<br>")}</div>` : ""}
${p.observacoes ? `<div class="box"><h3>Observações</h3>${esc(p.observacoes).replace(/\n/g, "<br>")}</div>` : ""}
<div class="ass"><div>${esc(cfg.empresaNome || "")}</div><div>De acordo — ${esc(p.clienteNome || "Cliente")}</div></div>
<div class="foot">Documento gerado em ${fmtData(hojeISO())}</div>`);
}

function pdfOS(o, cliente, cfg) {
  imprimir(`${o.numero}`, `${cabecalhoPDF(cfg, "Ordem de serviço", o.numero, o.data)}
${blocoCliente(cliente, o.clienteNome)}
<div class="box"><h3>Serviço</h3><div class="grid">
<div><b>Serviço:</b> ${esc(o.servico)}</div><div><b>Status:</b> ${esc(OS_STATUS[o.status]?.rot || "")}</div>
<div><b>Data:</b> ${fmtData(o.data)} ${o.hora ? `às ${esc(o.hora)}` : ""}</div><div><b>Duração prevista:</b> ${num(o.duracao) || 2} h</div>
<div><b>Equipe:</b> ${esc(o.equipeNome || "—")}</div><div><b>Responsável:</b> ${esc(o.responsavel || "—")}</div>
<div style="grid-column:1/-1"><b>Endereço:</b> ${esc(o.endereco || "")}</div></div></div>
${o.descricao ? `<div class="box"><h3>Descrição</h3>${esc(o.descricao).replace(/\n/g, "<br>")}</div>` : ""}
${o.materiais ? `<div class="box"><h3>Materiais necessários</h3>${esc(o.materiais).replace(/\n/g, "<br>")}</div>` : ""}
${o.observacoes ? `<div class="box"><h3>Observações</h3>${esc(o.observacoes).replace(/\n/g, "<br>")}</div>` : ""}
<div class="box"><h3>Valores</h3><div class="grid"><div><b>Valor:</b> ${brl(o.valor)}</div><div><b>Forma de pagamento:</b> ${esc(o.formaPagamento || "A combinar")}</div></div></div>
<div class="ass"><div>Responsável — ${esc(cfg.empresaNome || "")}</div><div>Cliente — ${esc(o.clienteNome || "")}</div></div>
<div class="foot">Documento gerado em ${fmtData(hojeISO())}</div>`);
}

/* =========================================================
   ESTILOS
   ========================================================= */
const CSS = `
:root{--bg:#F2F5F4;--card:#fff;--ink:#14232B;--muted:#5E6E74;--faint:#8A9A9F;--line:#E1E8E6;
--pri:#0B7A6E;--pri-d:#075E55;--pri-s:#E3F3EF;--ok:#1E9E5A;--ok-s:#E4F5EB;--warn:#A87400;--warn-s:#FBF1D9;
--bad:#D2463C;--bad-s:#FBE6E4;--info:#2E6BD6;--info-s:#E5EEFC;--off:#4B5563;--off-s:#ECEEF0;--part:#6A56D6;--part-s:#EEEBFC;
--r:16px;--sh:0 12px 40px rgba(20,35,43,.14)}
*{box-sizing:border-box}html,body,#root{min-height:100%}
body{margin:0;font-family:'Figtree',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer}
:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
a{color:var(--pri-d)}
.shell{display:flex;min-height:100vh}
.side{display:none}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{position:sticky;top:0;z-index:30;background:rgba(242,245,244,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--line)}
.top-logo{display:flex;align-items:center;gap:8px;font-weight:700}
.page{padding:18px 16px 110px;max-width:1240px;width:100%;margin:0 auto}
.bottom{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--line);display:flex;padding:6px 4px calc(6px + env(safe-area-inset-bottom));z-index:40}
.bottom button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-weight:600;background:none;border:0;padding:6px 0;color:var(--faint);border-radius:10px}
.bottom button.on{color:var(--pri)}
@media(min-width:960px){
 .side{display:flex;flex-direction:column;width:250px;flex-shrink:0;position:sticky;top:0;height:100vh;background:#fff;border-right:1px solid var(--line);padding:20px 14px}
 .bottom{display:none}.page{padding:28px 32px 48px}.top-logo{display:none}
}
.marca{display:flex;align-items:center;gap:10px;padding:4px 8px 20px}
.marca-ic{width:40px;height:40px;border-radius:12px;background:var(--pri);color:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
.marca-ic img{width:100%;height:100%;object-fit:cover}
.marca b{display:block;font-size:15px;line-height:1.2}.marca small{color:var(--muted);font-size:12px}
.nav-i{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;border:0;background:none;width:100%;text-align:left;color:var(--muted);font-weight:600;margin-bottom:2px}
.nav-i:hover{background:var(--bg)}.nav-i.on{background:var(--pri-s);color:var(--pri-d)}
.nav-i.soon{opacity:.55}
.nav-sep{font-size:12px;color:var(--faint);padding:14px 12px 6px;font-weight:600}
.side-user{margin-top:auto;display:flex;align-items:center;gap:10px;padding:12px 8px 0;border-top:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px}
.h1{font-size:24px;font-weight:700;letter-spacing:-.02em;margin:0;line-height:1.2}
.h2{font-size:17px;font-weight:700;margin:0 0 12px;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:14px}.small{font-size:13px}.muted{color:var(--muted)}.faint{color:var(--faint)}
.ph{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.stack>*+*{margin-top:16px}.row-gap{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border-radius:12px;border:1px solid var(--line);background:#fff;font-weight:600;transition:background .15s,transform .1s,border-color .15s;white-space:nowrap;text-decoration:none;color:var(--ink)}
.btn:hover{border-color:#C9D5D2}.btn:active{transform:scale(.98)}
.btn.pri{background:var(--pri);border-color:var(--pri);color:#fff}.btn.pri:hover{background:var(--pri-d)}
.btn.ghost{background:transparent;border-color:transparent}.btn.ghost:hover{background:rgba(20,35,43,.05)}
.btn.sm{min-height:38px;padding:0 12px;font-size:14px;border-radius:10px}
.btn.danger{color:var(--bad)}.btn.wa{background:#1FAF5A;border-color:#1FAF5A;color:#fff}
.btn.block{width:100%}.btn:disabled{opacity:.5;cursor:default}
.icon-btn{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:#fff;display:inline-flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;color:var(--ink)}
.pill{position:absolute;top:-4px;right:-4px;background:var(--bad);color:#fff;font-size:11px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 5px}
.campo{display:flex;flex-direction:column;gap:6px;min-width:0}
.campo>label{font-size:13px;font-weight:600;color:var(--muted)}
.campo .dica{font-size:12px;color:var(--faint)}.campo .erro{font-size:12.5px;color:var(--bad);font-weight:600}
.inp{min-height:46px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#fff;width:100%;outline:none;transition:border .15s,box-shadow .15s}
.inp:focus{border-color:var(--pri);box-shadow:0 0 0 3px var(--pri-s)}
textarea.inp{min-height:84px;resize:vertical}select.inp{appearance:auto}
.grid{display:grid;gap:12px}.g2,.g3,.g4{grid-template-columns:1fr}
.g3,.g4{grid-template-columns:1fr 1fr}
.g3c{grid-template-columns:repeat(3,minmax(0,1fr))!important}
@media(max-width:639px){.g3c .stat{padding:11px}.g3c .stat .v{font-size:18px}.g3c .stat .l{font-size:12px;line-height:1.25}}
@media(min-width:640px){.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}}
.span2{grid-column:1/-1}
.bdg{display:inline-flex;align-items:center;align-self:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap}
.bdg::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.t-ok{color:var(--ok);background:var(--ok-s)}.t-warn{color:var(--warn);background:var(--warn-s)}.t-bad{color:var(--bad);background:var(--bad-s)}
.t-info{color:var(--info);background:var(--info-s)}.t-off{color:var(--off);background:var(--off-s)}.t-part{color:var(--part);background:var(--part-s)}.t-pri{color:var(--pri-d);background:var(--pri-s)}
.c-ok{--c:var(--ok)}.c-warn{--c:var(--warn)}.c-bad{--c:var(--bad)}.c-info{--c:var(--info)}.c-off{--c:var(--off)}.c-part{--c:var(--part)}.c-pri{--c:var(--pri)}
.chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;margin-bottom:14px}.chips::-webkit-scrollbar{display:none}
.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 14px;font-weight:600;font-size:14px;white-space:nowrap;color:var(--muted)}
.chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.lista{background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);cursor:pointer;background:#fff;width:100%;text-align:left;border-left:0;border-right:0;border-top:0}
.row:last-child{border-bottom:0}.row:hover{background:#FAFCFB}
.row-main{flex:1;min-width:0}.row-t{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-s{font-size:13px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-end{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.av{width:42px;height:42px;border-radius:12px;background:var(--pri-s);color:var(--pri-d);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:14px}
.ov{position:fixed;inset:0;background:rgba(20,35,43,.42);z-index:100;display:flex;align-items:flex-end;justify-content:center;animation:fade .15s}
.mdl{background:#fff;width:100%;max-height:94vh;border-radius:22px 22px 0 0;display:flex;flex-direction:column;animation:up .22s ease-out}
@media(min-width:720px){.ov{align-items:center;padding:24px}.mdl{max-width:640px;border-radius:22px}.mdl.lg{max-width:880px}}
.mdl-h{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}
.mdl-h h3{margin:0;font-size:18px;flex:1;letter-spacing:-.01em}
.mdl-b{padding:18px;overflow-y:auto;flex:1}
.mdl-f{display:flex;gap:10px;justify-content:flex-end;padding:12px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);flex-wrap:wrap}
@keyframes up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes fade{from{opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 18px;border-radius:12px;z-index:300;font-weight:500;box-shadow:var(--sh);animation:up .2s;max-width:calc(100% - 32px)}
.toast.erro{background:var(--bad)}
@media(min-width:960px){.toast{bottom:28px}}
.hero{background:var(--pri-d);color:#fff;border-radius:22px;padding:20px;position:relative;overflow:hidden}
.hero-top{display:flex;align-items:center;gap:14px}
.hero-logo{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
.hero-logo img{width:100%;height:100%;object-fit:cover}
.hero h1{margin:0;font-size:22px;letter-spacing:-.02em;line-height:1.15}
.hero .sub{color:rgba(255,255,255,.72)}
.hero-acts{display:flex;gap:8px;margin-top:18px;overflow-x:auto;scrollbar-width:none}.hero-acts::-webkit-scrollbar{display:none}
.hero-acts button{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:12px;padding:10px 14px;font-weight:600;white-space:nowrap}
.hero-acts button:hover{background:rgba(255,255,255,.2)}
.tl-wrap{margin-top:20px;overflow-x:auto;scrollbar-width:thin}
.tl{position:relative;min-width:680px;height:86px;margin:0 16px}
.tl-tick{position:absolute;top:0;font-size:11px;color:rgba(255,255,255,.6);transform:translateX(-50%)}
.tl-line{position:absolute;top:20px;bottom:0;width:1px;background:rgba(255,255,255,.12)}
.tl-b{position:absolute;top:26px;height:54px;border-radius:10px;background:#fff;color:var(--ink);padding:6px 9px;font-size:12px;overflow:hidden;border:0;border-left:4px solid var(--c,var(--pri));text-align:left;line-height:1.25}
.tl-b b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-b span{color:var(--muted);white-space:nowrap}
.tl-now{position:absolute;top:18px;bottom:0;width:2px;background:#FFD66B;border-radius:2px}
.tl-now::before{content:"";position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:50%;background:#FFD66B}
.tl-vazio{margin-top:18px;padding:14px;border-radius:12px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);font-size:14px}
.stat{padding:14px;border-radius:14px;background:#fff;border:1px solid var(--line);text-align:left;width:100%}
.stat .v{font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.2;margin-top:2px}
.stat .l{font-size:13px;color:var(--muted)}
.stat.link{cursor:pointer}.stat.link:hover{border-color:#C9D5D2}
.grp-t{font-size:14px;font-weight:700;color:var(--muted);margin:0 0 8px}
.bars{display:flex;align-items:flex-end;gap:10px;height:160px;padding-top:4px}
.bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end;min-width:0}
.bar i{display:block;width:100%;max-width:40px;border-radius:8px 8px 4px 4px;background:var(--c,var(--pri));min-height:3px;transition:height .5s ease-out}
.bar span{font-size:12px;color:var(--muted)}.bar b{font-size:11px;color:var(--muted);font-weight:600;white-space:nowrap}
.split{display:flex;height:14px;border-radius:999px;overflow:hidden;background:var(--line);margin:10px 0}
.split i{display:block;height:100%}
.leg{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.leg span{display:inline-flex;align-items:center;gap:6px}.leg i{width:10px;height:10px;border-radius:3px;display:inline-block}
.al{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:#fff;border:1px solid var(--line);width:100%;text-align:left}
.al:hover{border-color:#C9D5D2}.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;background:var(--c)}
.al b{font-size:18px;margin-left:auto}
.ag-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);cursor:pointer;background:none;border-left:0;border-right:0;border-top:0;width:100%;text-align:left}
.ag-item:last-child{border-bottom:0}
.ag-h{width:54px;flex-shrink:0;font-weight:700;font-size:15px}
.ag-bar{width:4px;border-radius:4px;background:var(--c,var(--pri));flex-shrink:0}
.cal-h{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;font-size:12px;color:var(--muted);text-align:center;font-weight:600}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cal-d{min-height:70px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:6px;font-size:13px;text-align:left;display:flex;flex-direction:column}
.cal-d.fora{opacity:.4}.cal-d.hoje{border-color:var(--pri);box-shadow:inset 0 0 0 1px var(--pri)}
.cal-n{font-weight:700}.cal-pts{display:flex;flex-wrap:wrap;gap:3px;margin-top:auto}
.cal-pts i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.cal-q{font-size:11px;color:var(--muted);margin-top:2px}
@media(min-width:720px){.cal-d{min-height:96px}}
.sem{display:grid;gap:10px}
@media(min-width:1000px){.sem{grid-template-columns:repeat(7,1fr)}}
.sem-col{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px;min-height:80px}
.sem-col.hoje{border-color:var(--pri)}
.sem-t{font-weight:700;font-size:14px;display:flex;justify-content:space-between}
.ev{display:block;width:100%;text-align:left;border:0;border-left:4px solid var(--c,var(--pri));background:var(--bg);border-radius:10px;padding:8px 10px;margin-top:8px;font-size:13px;line-height:1.3}
.ev b{display:block}.ev span{color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.busca{position:relative;flex:1;max-width:560px}
.busca .inp{padding-left:40px;min-height:42px}
.busca-ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--faint);pointer-events:none;display:flex}
.drop{position:absolute;top:calc(100% + 8px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);max-height:70vh;overflow:auto;z-index:60;animation:up .15s}
.drop-g{padding:10px 14px 4px;font-size:12px;font-weight:700;color:var(--faint)}
.drop-i{display:flex;gap:10px;align-items:center;padding:10px 14px;width:100%;border:0;background:none;text-align:left}
.drop-i:hover{background:var(--bg)}
.notif{position:absolute;right:0;top:calc(100% + 8px);width:min(380px,calc(100vw - 24px));background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);z-index:60;max-height:70vh;overflow:auto;animation:up .15s}
.notif-i{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);width:100%;border-left:0;border-right:0;border-top:0;background:none;text-align:left;font-size:14px}
.notif-i:last-child{border-bottom:0}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto;margin-bottom:16px;scrollbar-width:none}
.tab{padding:10px 14px;border:0;background:none;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;white-space:nowrap}
.tab.on{color:var(--pri-d);border-bottom-color:var(--pri)}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.kv small{display:block;color:var(--muted);font-size:12.5px;margin-bottom:2px}
.kv .full{grid-column:1/-1}
.acts{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
@media(min-width:640px){.acts{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1000px){.acts{grid-template-columns:repeat(6,1fr)}}
.act{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:12px;border-radius:14px;border:1px solid var(--line);background:#fff;font-weight:600;font-size:14px;text-align:left;color:var(--ink)}
.act:hover{border-color:var(--pri);background:#FAFCFB}
.act .ic{width:34px;height:34px;border-radius:10px;background:var(--pri-s);color:var(--pri-d);display:flex;align-items:center;justify-content:center}
.item-p{border:1px solid var(--line);border-radius:12px;padding:12px;background:#FAFCFB}
.tot-box{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-radius:14px;background:var(--pri-s);color:var(--pri-d);font-weight:700;font-size:18px}
.vazio{text-align:center;padding:36px 16px;color:var(--muted)}
.vazio .ic{width:56px;height:56px;border-radius:16px;background:var(--pri-s);color:var(--pri-d);display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px}
.vazio b{display:block;color:var(--ink);font-size:16px;margin-bottom:4px}
.aviso{padding:12px 14px;border-radius:12px;font-size:14px;display:flex;gap:10px;align-items:flex-start}
.aviso.bad{background:var(--bad-s);color:#8E2A22}.aviso.info{background:var(--info-s);color:#1D4A9A}.aviso.ok{background:var(--pri-s);color:var(--pri-d)}
.seg{display:inline-flex;background:#fff;border:1px solid var(--line);border-radius:12px;padding:3px}
.seg button{border:0;background:none;padding:7px 14px;border-radius:9px;font-weight:600;color:var(--muted);font-size:14px}
.seg button.on{background:var(--ink);color:#fff}
.login{min-height:100vh;display:grid;place-items:center;padding:20px;background:var(--pri-d)}
.login-card{background:#fff;border-radius:24px;padding:28px;width:100%;max-width:410px;animation:up .3s ease-out}
.login-brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.splash{min-height:100vh;display:grid;place-items:center;color:var(--muted)}
.spin{width:28px;height:28px;border:3px solid var(--line);border-top-color:var(--pri);border-radius:50%;animation:gira .8s linear infinite;margin:0 auto 12px}
@keyframes gira{to{transform:rotate(360deg)}}
.mais{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(min-width:640px){.mais{grid-template-columns:repeat(3,1fr)}}
.mais button{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:16px;border-radius:16px;border:1px solid var(--line);background:#fff;text-align:left;font-weight:600}
.mais button small{font-weight:500;color:var(--muted)}
.mais button:disabled{opacity:.55;cursor:default}
.nota{padding:12px 14px;border-radius:12px;background:var(--bg);font-size:14px}
.nota small{display:block;color:var(--faint);margin-top:4px}
.swatch{width:26px;height:26px;border-radius:8px;border:2px solid #fff;box-shadow:0 0 0 1px var(--line)}
.check{display:flex;gap:10px;align-items:center;font-weight:600;font-size:14px}
.check input{width:20px;height:20px;accent-color:var(--pri)}
.hide-m{display:none}@media(min-width:720px){.hide-m{display:initial}}
`;

/* =========================================================
   ÍCONES
   ========================================================= */
const ICONES = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  cal: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8",
  file: "M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6",
  wallet: "M3 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V6a2 2 0 0 1 2-2h11M16 13.5h.01",
  clip: "M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 12h6M9 16h4",
  menu: "M4 7h16M4 12h16M4 17h16",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4",
  bell: "M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17 19 7",
  chevL: "M15 6l-6 6 6 6",
  chevR: "M9 6l6 6-6 6",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  wa: "M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z",
  map: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  copy: "M8 8h12v12H8zM4 16V4h12",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.8-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.8 1l-2.3-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.8 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.8-1l2.3 1 2-3.5z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  mega: "M3 10v4h3l7 4V6l-7 4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  cash: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 9v.01M18 15v.01",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  back: "M19 12H5M11 6l-6 6 6 6",
  sparkle: "M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7zM19 16c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3z",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
  team: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M5 21v-1a7 7 0 0 1 14 0v1",
  tag: "M3 12V3h9l9 9-9 9zM7.5 7.5h.01",
  note: "M4 4h16v12l-4 4H4zM16 20v-4h4M8 9h8M8 13h5",
};
function Ic({ n, s = 20, w = 1.8 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[n] || ""} />
    </svg>
  );
}

/* =========================================================
   CONTEXTO E COMPONENTES BASE
   ========================================================= */
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

function Badge({ mapa, valor }) {
  const s = mapa[valor] || { rot: valor || "—", cor: "off" };
  return <span className={`bdg t-${s.cor}`}>{s.rot}</span>;
}

function Modal({ titulo, onClose, children, rodape, largo }) {
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => {
      if (e.key !== "Escape") return;
      const todos = document.querySelectorAll(".ov");
      if (todos[todos.length - 1] === ref.current) onClose();
    };
    window.addEventListener("keydown", f);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", f); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="ov" ref={ref} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`mdl ${largo ? "lg" : ""}`} role="dialog" aria-modal="true" aria-label={typeof titulo === "string" ? titulo : undefined}>
        <div className="mdl-h">
          <h3>{titulo}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Ic n="x" /></button>
        </div>
        <div className="mdl-b">{children}</div>
        {rodape && <div className="mdl-f">{rodape}</div>}
      </div>
    </div>
  );
}

function Campo({ rot, dica, erro, children, className = "" }) {
  return (
    <div className={`campo ${className}`}>
      {rot && <label>{rot}</label>}
      {children}
      {erro ? <span className="erro">{erro}</span> : dica ? <span className="dica">{dica}</span> : null}
    </div>
  );
}

function Vazio({ icone = "sparkle", titulo, texto, acao }) {
  return (
    <div className="vazio">
      <div className="ic"><Ic n={icone} s={26} /></div>
      <b>{titulo}</b>
      {texto && <div className="small">{texto}</div>}
      {acao && <div style={{ marginTop: 14 }}>{acao}</div>}
    </div>
  );
}

function Stat({ rot, valor, onClick, cor }) {
  const conteudo = (
    <>
      <div className="l">{rot}</div>
      <div className="v" style={cor ? { color: `var(--${cor})` } : undefined}>{valor}</div>
    </>
  );
  if (!onClick) return <div className="stat">{conteudo}</div>;
  return <button type="button" className="stat link" onClick={onClick} style={{ color: "inherit" }}>{conteudo}</button>;
}

function Barras({ dados, formato = (v) => v, cor }) {
  const max = Math.max(1, ...dados.map((d) => d.v));
  return (
    <div className="bars" style={cor ? { "--c": `var(--${cor})` } : undefined}>
      {dados.map((d) => (
        <div className="bar" key={d.rot} title={`${d.rot}: ${formato(d.v)}`}>
          <b>{d.v ? formato(d.v) : ""}</b>
          <i style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} />
          <span>{d.rot}</span>
        </div>
      ))}
    </div>
  );
}

function SelectCliente({ valor, onChange }) {
  const { clientes, abrir } = useApp();
  const ordenados = useMemo(() => [...clientes].sort((a, b) => String(a.nome).localeCompare(String(b.nome))), [clientes]);
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select className="inp" value={valor || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione o cliente</option>
        {ordenados.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.codigo})</option>)}
      </select>
      <button type="button" className="icon-btn" style={{ height: 46, width: 46 }} title="Cadastrar novo cliente"
        onClick={() => abrir("cliente", { aoSalvar: (id) => onChange(id) })}><Ic n="plus" /></button>
    </div>
  );
}

/* =========================================================
   LOGIN E TELAS DE ESPERA
   ========================================================= */
function Splash({ texto = "Carregando..." }) {
  return <div className="splash"><div style={{ textAlign: "center" }}><div className="spin" />{texto}</div></div>;
}

const ERROS_AUTH = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "Não existe conta com esse e-mail.",
  "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Use a opção Entrar.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão com a internet.",
};

function TelaLogin() {
  const [modo, setModo] = useState("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [carregando, setCarregando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault(); setErro(""); setInfo("");
    if (!emailValido(email)) { setErro("Digite um e-mail válido."); return; }
    if (modo !== "esqueci" && senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    if (modo === "criar" && nome.trim().length < 2) { setErro("Digite seu nome."); return; }
    setCarregando(true);
    try {
      if (modo === "entrar") await signInWithEmailAndPassword(auth, email.trim(), senha);
      else if (modo === "criar") {
        nomePendente = nome.trim();
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        await updateProfile(cred.user, { displayName: nome.trim() }).catch(() => {});
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setInfo("Enviamos um link para redefinir sua senha. Confira seu e-mail.");
      }
    } catch (err) {
      setErro(ERROS_AUTH[err.code] || "Não foi possível continuar. Tente novamente.");
    }
    setCarregando(false);
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={enviar}>
        <div className="login-brand">
          <div className="marca-ic" style={{ width: 48, height: 48 }}><Ic n="sparkle" s={24} /></div>
          <div>
            <div className="h2" style={{ margin: 0 }}>Gestão de limpeza</div>
            <div className="sub">Clientes, agenda e financeiro num só lugar</div>
          </div>
        </div>
        <div className="grid">
          {modo === "criar" && (
            <Campo rot="Seu nome"><input className="inp" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" /></Campo>
          )}
          <Campo rot="E-mail"><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Campo>
          {modo !== "esqueci" && (
            <Campo rot="Senha" dica={modo === "criar" ? "Mínimo de 6 caracteres" : undefined}>
              <input className="inp" type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === "criar" ? "new-password" : "current-password"} />
            </Campo>
          )}
          {erro && <div className="aviso bad">{erro}</div>}
          {info && <div className="aviso ok">{info}</div>}
          <button className="btn pri block" disabled={carregando}>
            {carregando ? "Aguarde..." : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link"}
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            {modo !== "entrar"
              ? <button type="button" className="btn ghost sm" onClick={() => setModo("entrar")}>Já tenho conta</button>
              : <button type="button" className="btn ghost sm" onClick={() => setModo("criar")}>Criar conta</button>}
            {modo === "entrar" && <button type="button" className="btn ghost sm" onClick={() => setModo("esqueci")}>Esqueci a senha</button>}
          </div>
          {modo === "criar" && (
            <div className="small muted">A primeira conta criada vira administradora. As próximas precisam ser liberadas pelo administrador.</div>
          )}
        </div>
      </form>
    </div>
  );
}

function TelaPendente({ perfil }) {
  return (
    <div className="login">
      <div className="login-card" style={{ textAlign: "center" }}>
        <div className="vazio" style={{ padding: "10px 0" }}>
          <div className="ic"><Ic n="shield" s={26} /></div>
          <b>Olá, {primeiroNome(perfil?.nome)}! Seu acesso está aguardando liberação</b>
          <div className="small">Peça ao administrador para liberar seu usuário em Configurações → Usuários. Assim que ele liberar, esta tela atualiza sozinha.</div>
        </div>
        <button className="btn block" onClick={() => signOut(auth)}><Ic n="logout" /> Sair</button>
      </div>
    </div>
  );
}

/* =========================================================
   BUSCA GLOBAL
   ========================================================= */
function BuscaGlobal() {
  const { clientes, os, propostas, receber, ir, abrir, pode } = useApp();
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);

  const res = useMemo(() => {
    const t = normalizar(q.trim()); const td = digitos(q);
    if (t.length < 2) return null;
    const bate = (...campos) => campos.some((c) => normalizar(c).includes(t)) ;
    const bateDig = (...campos) => td.length >= 3 && campos.some((c) => digitos(c).includes(td));
    const r = {
      clientes: pode("clientes") ? clientes.filter((c) => bate(c.nome, c.fantasia, c.codigo, c.email) || bateDig(c.documento, c.telefone, c.whatsapp)).slice(0, 6) : [],
      os: os.filter((o) => bate(o.numero, o.clienteNome, o.servico)).slice(0, 6),
      propostas: pode("propostas") ? propostas.filter((p) => bate(p.numero, p.clienteNome)).slice(0, 5) : [],
      receber: pode("financeiro") ? receber.filter((x) => bate(x.clienteNome, x.descricao, x.osNumero, x.propostaNumero)).slice(0, 5) : [],
    };
    return r;
  }, [q, clientes, os, propostas, receber, pode]);

  const escolher = (fn) => { fn(); setQ(""); setAberto(false); };
  const total = res ? res.clientes.length + res.os.length + res.propostas.length + res.receber.length : 0;

  return (
    <div className="busca" ref={ref}>
      <span className="busca-ic"><Ic n="search" s={18} /></span>
      <input className="inp" placeholder="Buscar cliente, CPF, telefone, OS, proposta..." value={q}
        onChange={(e) => { setQ(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} aria-label="Busca global" />
      {aberto && res && (
        <div className="drop">
          {total === 0 && <div className="drop-i muted">Nada encontrado para “{q}”.</div>}
          {res.clientes.length > 0 && <div className="drop-g">Clientes</div>}
          {res.clientes.map((c) => (
            <button key={c.id} className="drop-i" onClick={() => escolher(() => ir("cliente", c.id))}>
              <div className="av" style={{ width: 34, height: 34 }}>{iniciais(c.nome)}</div>
              <div className="row-main"><div className="row-t">{c.nome}</div><div className="row-s">{c.codigo} · {c.whatsapp || c.telefone || "sem telefone"}</div></div>
            </button>
          ))}
          {res.os.length > 0 && <div className="drop-g">Ordens de serviço e agendamentos</div>}
          {res.os.map((o) => (
            <button key={o.id} className="drop-i" onClick={() => escolher(() => abrir("osVer", { id: o.id }))}>
              <Ic n="clip" />
              <div className="row-main"><div className="row-t">{o.numero} — {o.clienteNome}</div><div className="row-s">{o.servico} · {fmtData(o.data)} {o.hora || ""}</div></div>
              <Badge mapa={OS_STATUS} valor={o.status} />
            </button>
          ))}
          {res.propostas.length > 0 && <div className="drop-g">Propostas</div>}
          {res.propostas.map((p) => (
            <button key={p.id} className="drop-i" onClick={() => escolher(() => abrir("propVer", { id: p.id }))}>
              <Ic n="file" />
              <div className="row-main"><div className="row-t">{p.numero} — {p.clienteNome}</div><div className="row-s">{brl(totalProposta(p))}</div></div>
              <Badge mapa={PROP_STATUS} valor={statusProposta(p)} />
            </button>
          ))}
          {res.receber.length > 0 && <div className="drop-g">Pagamentos</div>}
          {res.receber.map((x) => (
            <button key={x.id} className="drop-i" onClick={() => escolher(() => abrir("pagamentos", { id: x.id }))}>
              <Ic n="wallet" />
              <div className="row-main"><div className="row-t">{x.clienteNome} — {brl(x.valor)}</div><div className="row-s">{x.descricao} · vence {fmtData(x.vencimento)}</div></div>
              <Badge mapa={FIN_STATUS} valor={statusReceber(x)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   NOTIFICAÇÕES
   ========================================================= */
function useNotificacoes() {
  const { os, propostas, receber, pode } = useApp();
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60000); return () => clearInterval(t); }, []);
  return useMemo(() => {
    const lista = []; const hoje = hojeISO();
    const d = new Date(agora); const minAgora = d.getHours() * 60 + d.getMinutes();
    const deHoje = os.filter((o) => o.data === hoje && !["cancelado", "orcamento"].includes(o.status));
    if (deHoje.length) lista.push({ id: "hoje", cor: "info", texto: `Você possui ${deHoje.length} serviço${deHoje.length > 1 ? "s" : ""} agendado${deHoje.length > 1 ? "s" : ""} para hoje.`, acao: ["ir", "agenda"] });
    deHoje.filter((o) => ["agendado", "confirmado"].includes(o.status) && o.hora)
      .filter((o) => { const m = hm2min(o.hora); return m >= minAgora && m - minAgora <= 120; })
      .forEach((o) => lista.push({ id: `prox-${o.id}`, cor: "info", texto: `Seu serviço das ${o.hora} (${o.clienteNome}) está próximo.`, acao: ["osVer", o.id] }));
    if (pode("propostas")) {
      const ag = propostas.filter((p) => PROP_EM_ABERTO.includes(statusProposta(p)));
      if (ag.length) lista.push({ id: "prop", cor: "warn", texto: ag.length === 1 ? `Existe uma proposta aguardando resposta (${ag[0].clienteNome}).` : `Existem ${ag.length} propostas aguardando resposta.`, acao: ["ir", "propostas"] });
    }
    if (pode("financeiro")) {
      receber.filter((r) => statusReceber(r) === "atrasado").slice(0, 8).forEach((r) =>
        lista.push({ id: `atr-${r.id}`, cor: "bad", texto: `O cliente ${r.clienteNome} possui um pagamento em atraso (${brl(saldoDe(r))}).`, acao: ["pagamentos", r.id] }));
    }
    return lista;
  }, [os, propostas, receber, pode, agora]);
}

function Notificacoes() {
  const { ir, abrir } = useApp();
  const lista = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const executar = (n) => {
    setAberto(false);
    const [tipo, alvo] = n.acao;
    if (tipo === "ir") ir(alvo); else abrir(tipo, { id: alvo });
  };
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button className="icon-btn" onClick={() => setAberto(!aberto)} aria-label="Notificações">
        <Ic n="bell" />{lista.length > 0 && <span className="pill">{lista.length}</span>}
      </button>
      {aberto && (
        <div className="notif">
          <div className="drop-g">Notificações</div>
          {lista.length === 0 && <div className="notif-i muted">Tudo em dia por aqui.</div>}
          {lista.map((n) => (
            <button key={n.id} className={`notif-i c-${n.cor}`} onClick={() => executar(n)}>
              <span className="dot" style={{ marginTop: 5 }} /><span>{n.texto}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   REGRAS DE AGENDA
   ========================================================= */
const duracaoMin = (o) => Math.max(0.5, num(o.duracao) || 2) * 60;
function conflitosDe(lista, alvo, ignorarIds = []) {
  if (!alvo.equipeId || !alvo.data || !alvo.hora) return [];
  const ini = hm2min(alvo.hora); const fim = ini + duracaoMin(alvo);
  return lista.filter((o) => {
    if (ignorarIds.includes(o.id) || o.equipeId !== alvo.equipeId || o.data !== alvo.data || !o.hora) return false;
    if (["cancelado", "orcamento"].includes(o.status)) return false;
    const i = hm2min(o.hora); const f = i + duracaoMin(o);
    return ini < f && i < fim;
  });
}
const fimHora = (o) => { const m = hm2min(o.hora) + duracaoMin(o); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };

/* =========================================================
   INÍCIO / PAINEL
   ========================================================= */
function LinhaDoTempo({ itens, onAbrir }) {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 60000); return () => clearInterval(t); }, []);
  if (!itens.length) return <div className="tl-vazio">Nenhum serviço na agenda de hoje. Aproveite para confirmar os próximos ou enviar propostas.</div>;
  const inicios = itens.map((o) => hm2min(o.hora || "08:00"));
  const fins = itens.map((o) => hm2min(o.hora || "08:00") + duracaoMin(o));
  const hIni = Math.min(7, Math.floor(Math.min(...inicios) / 60));
  const hFim = Math.max(19, Math.ceil(Math.max(...fins) / 60));
  const total = (hFim - hIni) * 60;
  const pos = (m) => ((m - hIni * 60) / total) * 100;
  const horas = []; for (let h = hIni; h <= hFim; h++) horas.push(h);
  const minAgora = agora.getHours() * 60 + agora.getMinutes();
  // distribui em faixas para não sobrepor
  const faixas = []; const faixaDe = {};
  [...itens].sort((a, b) => hm2min(a.hora) - hm2min(b.hora)).forEach((o) => {
    const i = hm2min(o.hora || "08:00");
    let f = faixas.findIndex((fim) => fim <= i);
    if (f === -1) { faixas.push(0); f = faixas.length - 1; }
    faixas[f] = i + duracaoMin(o); faixaDe[o.id] = f;
  });
  const nF = Math.max(1, faixas.length);
  const altura = 30 + nF * 58;
  return (
    <div className="tl-wrap">
      <div className="tl" style={{ height: altura }}>
        {horas.map((h) => (
          <React.Fragment key={h}>
            <span className="tl-tick" style={{ left: `${pos(h * 60)}%` }}>{h}h</span>
            <span className="tl-line" style={{ left: `${pos(h * 60)}%` }} />
          </React.Fragment>
        ))}
        {itens.map((o) => {
          const i = hm2min(o.hora || "08:00");
          return (
            <button key={o.id} className={`tl-b c-${OS_STATUS[o.status]?.cor || "pri"}`} onClick={() => onAbrir(o)}
              style={{ left: `${pos(i)}%`, width: `calc(${(duracaoMin(o) / total) * 100}% - 4px)`, top: 26 + faixaDe[o.id] * 58 }}
              title={`${o.hora} ${o.clienteNome} — ${o.servico}`}>
              <b>{o.clienteNome}</b><span>{o.hora} · {o.servico}</span>
            </button>
          );
        })}
        {minAgora >= hIni * 60 && minAgora <= hFim * 60 && <span className="tl-now" style={{ left: `${pos(minAgora)}%` }} />}
      </div>
    </div>
  );
}

function PaginaInicio() {
  const { config, perfil, clientes, os, propostas, receber, ir, abrir, pode } = useApp();
  const hoje = hojeISO();
  const agora = new Date();
  const hora = agora.getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const deHoje = useMemo(() => os.filter((o) => o.data === hoje && !["cancelado", "orcamento"].includes(o.status))
    .sort((a, b) => hm2min(a.hora) - hm2min(b.hora)), [os, hoje]);

  const k = useMemo(() => {
    const semIni = inicioSemana(hoje); const semFim = addDias(semIni, 6);
    const ativos = receber.filter((r) => !r.cancelado);
    const pagamentos = ativos.flatMap((r) => (r.pagamentos || []).map((p) => ({ ...p, clienteNome: r.clienteNome })));
    const em7 = addDias(hoje, -7);
    return {
      clientes: clientes.length,
      abertas: os.filter((o) => OS_ABERTAS.includes(o.status)).length,
      concluidas: os.filter((o) => OS_FEITAS.includes(o.status)).length,
      hoje: deHoje.length,
      semana: os.filter((o) => o.data >= semIni && o.data <= semFim && !["cancelado", "orcamento"].includes(o.status)).length,
      canceladas: os.filter((o) => o.status === "cancelado").length,
      enviadas: propostas.filter((p) => p.status !== "rascunho").length,
      aguardando: propostas.filter((p) => PROP_EM_ABERTO.includes(statusProposta(p))).length,
      aprovadas: propostas.filter((p) => p.status === "aprovada").length,
      recusadas: propostas.filter((p) => p.status === "recusada").length,
      aReceber: ativos.reduce((a, r) => a + saldoDe(r), 0),
      recebido: pagamentos.reduce((a, p) => a + num(p.valor), 0),
      atrasado: ativos.filter((r) => statusReceber(r) === "atrasado").reduce((a, r) => a + saldoDe(r), 0),
      nAtrasados: ativos.filter((r) => statusReceber(r) === "atrasado").length,
      proximos: os.filter((o) => o.data > hoje && o.data <= addDias(hoje, 3) && ["agendado", "confirmado"].includes(o.status)).length,
      recebidos7: pagamentos.filter((p) => p.data >= em7).reduce((a, p) => a + num(p.valor), 0),
      pagamentos,
    };
  }, [clientes, os, propostas, receber, deHoje, hoje]);

  const meses = ultimosMeses(6);
  const fat = meses.map((m) => ({ rot: m.rot, v: k.pagamentos.filter((p) => String(p.data || "").startsWith(m.chave)).reduce((a, p) => a + num(p.valor), 0) }));
  const serv = meses.map((m) => ({ rot: m.rot, v: os.filter((o) => OS_FEITAS.includes(o.status) && String(o.data || "").startsWith(m.chave)).length }));
  const novos = meses.map((m) => ({ rot: m.rot, v: clientes.filter((c) => String(c.criadoEm || "").startsWith(m.chave)).length }));
  const totPR = k.aprovadas + k.recusadas;
  const totRP = k.recebido + k.aReceber;
  const kCompact = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v).replace(",00", ""));

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-top">
          <div className="hero-logo">{config.logo ? <img src={config.logo} alt="" /> : <Ic n="sparkle" s={26} />}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sub">{config.empresaNome || "Sua empresa"}</div>
            <h1>{saudacao}, {primeiroNome(perfil.nome)}</h1>
            <div className="sub">{DIA_NOME[agora.getDay()]}, {agora.getDate()} de {MES_NOME[agora.getMonth()]} · {deHoje.length ? `${deHoje.length} serviço${deHoje.length > 1 ? "s" : ""} hoje` : "agenda livre hoje"}</div>
          </div>
        </div>
        <LinhaDoTempo itens={deHoje} onAbrir={(o) => abrir("osVer", { id: o.id })} />
        <div className="hero-acts">
          {pode("clientes") && <button onClick={() => abrir("cliente", {})}><Ic n="users" s={18} /> Novo cliente</button>}
          {pode("propostas") && <button onClick={() => abrir("proposta", {})}><Ic n="file" s={18} /> Nova proposta</button>}
          {pode("os") && <button onClick={() => abrir("os", {})}><Ic n="cal" s={18} /> Agendar serviço</button>}
          {pode("financeiro") && <button onClick={() => ir("financeiro")}><Ic n="cash" s={18} /> Registrar pagamento</button>}
        </div>
      </section>

      <section className="grid g2">
        {pode("financeiro") && (
          <button className="al c-bad" onClick={() => ir("financeiro", "atrasado")}>
            <span className="dot" /><span><div style={{ fontWeight: 600 }}>Pagamentos atrasados</div><div className="small muted">{brl(k.atrasado)} em aberto</div></span><b>{k.nAtrasados}</b>
          </button>
        )}
        {pode("propostas") && (
          <button className="al c-warn" onClick={() => ir("propostas", "aberto")}>
            <span className="dot" /><span><div style={{ fontWeight: 600 }}>Propostas aguardando resposta</div><div className="small muted">Faça o acompanhamento</div></span><b>{k.aguardando}</b>
          </button>
        )}
        <button className="al c-info" onClick={() => ir("agenda")}>
          <span className="dot" /><span><div style={{ fontWeight: 600 }}>Serviços próximos</div><div className="small muted">Nos próximos 3 dias</div></span><b>{k.proximos}</b>
        </button>
        {pode("financeiro") && (
          <button className="al c-ok" onClick={() => ir("financeiro", "pago")}>
            <span className="dot" /><span><div style={{ fontWeight: 600 }}>Pagamentos recebidos</div><div className="small muted">Últimos 7 dias</div></span><b style={{ fontSize: 15 }}>{brl(k.recebidos7)}</b>
          </button>
        )}
      </section>

      <section>
        <h3 className="grp-t">Operação</h3>
        <div className="grid g3 g3c">
          <Stat rot="Clientes cadastrados" valor={k.clientes} onClick={pode("clientes") ? () => ir("clientes") : undefined} />
          <Stat rot="Ordens abertas" valor={k.abertas} onClick={() => ir("os", "abertas")} />
          <Stat rot="Ordens concluídas" valor={k.concluidas} onClick={() => ir("os", "concluidas")} />
          <Stat rot="Serviços hoje" valor={k.hoje} onClick={pode("agenda") ? () => ir("agenda") : undefined} />
          <Stat rot="Serviços na semana" valor={k.semana} onClick={pode("agenda") ? () => ir("agenda") : undefined} />
          <Stat rot="Serviços cancelados" valor={k.canceladas} onClick={() => ir("os", "canceladas")} />
        </div>
      </section>

      {(pode("propostas") || pode("financeiro")) && (
        <section className="grid g2">
          {pode("propostas") && (
            <div>
              <h3 className="grp-t">Vendas</h3>
              <div className="grid g3 g3c">
                <Stat rot="Enviadas" valor={k.enviadas} onClick={() => ir("propostas")} />
                <Stat rot="Aguardando" valor={k.aguardando} cor="warn" onClick={() => ir("propostas", "aberto")} />
                <Stat rot="Aprovadas" valor={k.aprovadas} cor="ok" onClick={() => ir("propostas", "aprovada")} />
              </div>
            </div>
          )}
          {pode("financeiro") && (
            <div>
              <h3 className="grp-t">Financeiro</h3>
              <div className="grid g3 g3c">
                <Stat rot="A receber" valor={kCompact(k.aReceber)} onClick={() => ir("financeiro")} />
                <Stat rot="Recebido" valor={kCompact(k.recebido)} cor="ok" onClick={() => ir("financeiro", "pago")} />
                <Stat rot="Em atraso" valor={kCompact(k.atrasado)} cor="bad" onClick={() => ir("financeiro", "atrasado")} />
              </div>
            </div>
          )}
        </section>
      )}

      <section className="grid g2">
        <div className="card">
          <div className="ph" style={{ marginBottom: 6 }}>
            <h3 className="h2" style={{ margin: 0 }}>Agenda de hoje</h3>
            {pode("agenda") && <button className="btn sm ghost" onClick={() => ir("agenda")}>Ver agenda</button>}
          </div>
          {deHoje.length === 0 && <div className="muted small" style={{ padding: "12px 0" }}>Nenhum serviço para hoje.</div>}
          {deHoje.map((o) => (
            <button key={o.id} className={`ag-item c-${OS_STATUS[o.status]?.cor}`} onClick={() => abrir("osVer", { id: o.id })}>
              <div className="ag-h">{o.hora || "--:--"}</div>
              <span className="ag-bar" />
              <div className="row-main">
                <div className="row-t">{o.clienteNome}</div>
                <div className="row-s">{o.servico} · {o.equipeNome || o.responsavel || "sem equipe"}</div>
                <div className="row-s">{o.endereco}</div>
              </div>
              <Badge mapa={OS_STATUS} valor={o.status} />
            </button>
          ))}
        </div>
        {pode("financeiro") ? (
          <div className="card">
            <h3 className="h2">Faturamento mensal</h3>
            <Barras dados={fat} formato={kCompact} />
          </div>
        ) : (
          <div className="card">
            <h3 className="h2">Serviços realizados por mês</h3>
            <Barras dados={serv} cor="info" />
          </div>
        )}
      </section>

      <section className="grid g2">
        {pode("financeiro") && (
          <div className="card">
            <h3 className="h2">Serviços realizados por mês</h3>
            <Barras dados={serv} cor="info" />
          </div>
        )}
        <div className="card">
          <h3 className="h2">Clientes novos</h3>
          <Barras dados={novos} cor="part" />
        </div>
        {pode("propostas") && (
          <div className="card">
            <h3 className="h2">Propostas aprovadas x recusadas</h3>
            <div className="split">
              <i style={{ width: `${totPR ? (k.aprovadas / totPR) * 100 : 0}%`, background: "var(--ok)" }} />
              <i style={{ width: `${totPR ? (k.recusadas / totPR) * 100 : 0}%`, background: "var(--bad)" }} />
            </div>
            <div className="leg">
              <span><i style={{ background: "var(--ok)" }} /> Aprovadas: {k.aprovadas}</span>
              <span><i style={{ background: "var(--bad)" }} /> Recusadas: {k.recusadas}</span>
              {totPR > 0 && <span>Taxa de aprovação: {Math.round((k.aprovadas / totPR) * 100)}%</span>}
            </div>
          </div>
        )}
        {pode("financeiro") && (
          <div className="card">
            <h3 className="h2">Recebido x pendente</h3>
            <div className="split">
              <i style={{ width: `${totRP ? (k.recebido / totRP) * 100 : 0}%`, background: "var(--ok)" }} />
              <i style={{ width: `${totRP ? (k.aReceber / totRP) * 100 : 0}%`, background: "var(--warn)" }} />
            </div>
            <div className="leg">
              <span><i style={{ background: "var(--ok)" }} /> Recebido: {brl(k.recebido)}</span>
              <span><i style={{ background: "var(--warn)" }} /> Pendente: {brl(k.aReceber)}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   AGENDA
   ========================================================= */
function EvCard({ o, conflito }) {
  const { abrir } = useApp();
  return (
    <button className={`ev c-${OS_STATUS[o.status]?.cor || "pri"}`} onClick={() => abrir("osVer", { id: o.id })}
      style={o.status === "cancelado" ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
      <b>{o.hora || "--:--"} · {o.clienteNome}</b>
      <span>{o.servico}</span>
      <span>{o.equipeNome || o.responsavel || "Sem equipe"}{o.recorrencia && o.recorrencia !== "nao" ? " · recorrente" : ""}</span>
      {conflito && <span style={{ color: "var(--bad)", fontWeight: 700 }}>Conflito de horário</span>}
    </button>
  );
}

function PaginaAgenda() {
  const { os, equipes, abrir, pode } = useApp();
  const [vis, setVis] = useState(() => (window.innerWidth < 720 ? "dia" : "semana"));
  const [ref, setRef] = useState(hojeISO());
  const [eq, setEq] = useState("");
  const [canc, setCanc] = useState(false);
  const hoje = hojeISO();

  const lista = useMemo(() => os.filter((o) => o.data && o.status !== "orcamento" && (!eq || o.equipeId === eq) && (canc || o.status !== "cancelado"))
    .sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || ""))), [os, eq, canc]);
  const porDia = useMemo(() => {
    const m = {}; lista.forEach((o) => { (m[o.data] = m[o.data] || []).push(o); }); return m;
  }, [lista]);
  const emConflito = useMemo(() => {
    const s = new Set();
    lista.forEach((o) => { if (o.status !== "cancelado" && conflitosDe(lista, o, [o.id]).length) s.add(o.id); });
    return s;
  }, [lista]);

  const mover = (n) => {
    if (vis === "dia") setRef(addDias(ref, n));
    else if (vis === "semana") setRef(addDias(ref, 7 * n));
    else setRef(addMeses(ref, n));
  };
  const dRef = parseISO(ref);
  const semIni = inicioSemana(ref);
  const rotulo = vis === "dia"
    ? `${DIA_NOME[dRef.getDay()]}, ${dRef.getDate()} de ${MES_NOME[dRef.getMonth()]}`
    : vis === "semana"
      ? `${fmtData(semIni).slice(0, 5)} a ${fmtData(addDias(semIni, 6)).slice(0, 5)}`
      : `${MES_NOME[dRef.getMonth()]} de ${dRef.getFullYear()}`;

  const diasMes = useMemo(() => {
    const primeiro = toISO(new Date(dRef.getFullYear(), dRef.getMonth(), 1));
    const ini = inicioSemana(primeiro);
    return Array.from({ length: 42 }, (_, i) => addDias(ini, i));
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="ph">
        <div><h1 className="h1">Agenda</h1><div className="sub" style={{ textTransform: "none" }}>{rotulo}</div></div>
        {pode("os") && <button className="btn pri" onClick={() => abrir("os", { data: vis === "dia" ? ref : undefined })}><Ic n="plus" /> Novo agendamento</button>}
      </div>
      <div className="row-gap" style={{ marginBottom: 14, justifyContent: "space-between" }}>
        <div className="seg">
          {[["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]].map(([v, r]) => (
            <button key={v} className={vis === v ? "on" : ""} onClick={() => setVis(v)}>{r}</button>
          ))}
        </div>
        <div className="row-gap">
          <button className="icon-btn" onClick={() => mover(-1)} aria-label="Anterior"><Ic n="chevL" /></button>
          <button className="btn sm" onClick={() => setRef(hoje)}>Hoje</button>
          <button className="icon-btn" onClick={() => mover(1)} aria-label="Próximo"><Ic n="chevR" /></button>
        </div>
        <div className="row-gap">
          <select className="inp" style={{ minHeight: 40, width: "auto" }} value={eq} onChange={(e) => setEq(e.target.value)} aria-label="Filtrar equipe">
            <option value="">Todas as equipes</option>
            {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={canc} onChange={(e) => setCanc(e.target.checked)} /> Cancelados</label>
        </div>
      </div>

      {vis === "dia" && (
        <div className="card">
          {(porDia[ref] || []).length === 0
            ? <Vazio icone="cal" titulo="Nenhum serviço neste dia" texto="Toque em Novo agendamento para marcar um serviço." />
            : (porDia[ref] || []).map((o) => (
              <button key={o.id} className={`ag-item c-${OS_STATUS[o.status]?.cor}`} onClick={() => abrir("osVer", { id: o.id })}>
                <div className="ag-h">{o.hora || "--:--"}<div className="small faint" style={{ fontWeight: 500 }}>até {o.hora ? fimHora(o) : "--"}</div></div>
                <span className="ag-bar" />
                <div className="row-main">
                  <div className="row-t">{o.clienteNome}</div>
                  <div className="row-s">{o.servico} · {o.equipeNome || o.responsavel || "sem equipe"}</div>
                  <div className="row-s">{o.endereco}</div>
                  {emConflito.has(o.id) && <div className="small" style={{ color: "var(--bad)", fontWeight: 700 }}>Conflito de horário com outro serviço da mesma equipe</div>}
                </div>
                <Badge mapa={OS_STATUS} valor={o.status} />
              </button>
            ))}
        </div>
      )}

      {vis === "semana" && (
        <div className="sem">
          {Array.from({ length: 7 }, (_, i) => addDias(semIni, i)).map((d) => {
            const dd = parseISO(d);
            return (
              <div key={d} className={`sem-col ${d === hoje ? "hoje" : ""}`}>
                <div className="sem-t"><span>{DIA_ABR[dd.getDay()]} {dd.getDate()}</span>
                  <button className="btn ghost sm" style={{ minHeight: 26, padding: "0 6px" }} onClick={() => { setRef(d); setVis("dia"); }}>ver</button></div>
                {(porDia[d] || []).map((o) => <EvCard key={o.id} o={o} conflito={emConflito.has(o.id)} />)}
                {!(porDia[d] || []).length && <div className="small faint" style={{ marginTop: 8 }}>Livre</div>}
              </div>
            );
          })}
        </div>
      )}

      {vis === "mes" && (
        <div>
          <div className="cal-h">{DIA_ABR.map((d) => <div key={d}>{d}</div>)}</div>
          <div className="cal">
            {diasMes.map((d) => {
              const dd = parseISO(d); const itens = porDia[d] || [];
              return (
                <button key={d} className={`cal-d ${dd.getMonth() !== dRef.getMonth() ? "fora" : ""} ${d === hoje ? "hoje" : ""}`}
                  onClick={() => { setRef(d); setVis("dia"); }}>
                  <span className="cal-n">{dd.getDate()}</span>
                  {itens.length > 0 && <span className="cal-q">{itens.length} serv.</span>}
                  <span className="cal-pts">{itens.slice(0, 6).map((o) => <i key={o.id} className={`c-${OS_STATUS[o.status]?.cor}`} />)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   CLIENTES
   ========================================================= */
const CLIENTE_VAZIO = {
  tipo: "PF", nome: "", documento: "", fantasia: "", telefone: "", whatsapp: "", mesmoWa: true, email: "",
  cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", referencia: "",
  acesso: "", pets: "", cuidados: "", observacoes: "",
};

function FormCliente({ dados, fechar }) {
  const { clientes, os, receber, perfil, avisar, pode } = useApp();
  const existente = dados.id ? clientes.find((c) => c.id === dados.id) : null;
  const [f, setF] = useState(() => {
    if (!existente) return { ...CLIENTE_VAZIO };
    const { id, ...resto } = existente; // eslint-disable-line no-unused-vars
    return { ...CLIENTE_VAZIO, ...resto };
  });
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [cepMsg, setCepMsg] = useState("");
  const set = (k) => (e) => {
    const v = e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setF((p) => ({ ...p, [k]: v }));
  };

  const buscarCep = async (cep) => {
    const d = digitos(cep); if (d.length !== 8) return;
    setCepMsg("Buscando endereço...");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) { setCepMsg("CEP não encontrado. Preencha o endereço manualmente."); return; }
      setF((p) => ({ ...p, rua: j.logradouro || p.rua, bairro: j.bairro || p.bairro, cidade: j.localidade || p.cidade, uf: j.uf || p.uf }));
      setCepMsg("Endereço preenchido. Confira e informe o número.");
    } catch { setCepMsg("Não foi possível buscar o CEP agora. Preencha manualmente."); }
  };

  const validar = () => {
    const e = {};
    if (f.nome.trim().length < 2) e.nome = "Informe o nome.";
    if (!digitos(f.telefone) && !digitos(f.whatsapp)) e.telefone = "Informe pelo menos um telefone.";
    if (f.telefone && digitos(f.telefone).length < 10) e.telefone = "Telefone incompleto (inclua o DDD).";
    if (!f.mesmoWa && f.whatsapp && digitos(f.whatsapp).length < 10) e.whatsapp = "WhatsApp incompleto (inclua o DDD).";
    if (f.documento) {
      const ok = f.tipo === "PF" ? cpfValido(f.documento) : cnpjValido(f.documento);
      if (!ok) e.documento = f.tipo === "PF" ? "CPF inválido." : "CNPJ inválido.";
      const dup = clientes.find((c) => c.id !== existente?.id && digitos(c.documento) && digitos(c.documento) === digitos(f.documento));
      if (dup) e.documento = `Já cadastrado: ${dup.nome} (${dup.codigo}).`;
    }
    if (f.email && !emailValido(f.email)) e.email = "E-mail inválido.";
    setErros(e); return Object.keys(e).length === 0;
  };

  const salvar = async () => {
    if (!validar()) return;
    setSalvando(true);
    try {
      const dadosSalvar = { ...f, nome: f.nome.trim(), whatsapp: f.mesmoWa ? f.telefone : f.whatsapp, uf: String(f.uf || "").toUpperCase().slice(0, 2) };
      if (existente) {
        await updateDoc(doc(db, "clientes", existente.id), { ...dadosSalvar, atualizadoEm: agoraISO() });
        registrarLog(perfil, "cliente_editado", `${existente.codigo} ${dadosSalvar.nome}`);
        avisar("Cliente atualizado.");
        if (dados.aoSalvar) dados.aoSalvar(existente.id);
      } else {
        const codigo = await proximoNumero("cliente");
        const ref = await addDoc(collection(db, "clientes"), { ...dadosSalvar, codigo, notas: [], criadoEm: agoraISO(), criadoPor: perfil.nome });
        registrarLog(perfil, "cliente_criado", `${codigo} ${dadosSalvar.nome}`);
        avisar(`Cliente cadastrado: ${codigo}`);
        if (dados.aoSalvar) dados.aoSalvar(ref.id);
      }
      fechar();
    } catch (e) { console.error(e); avisar("Não foi possível salvar. Verifique a conexão.", true); }
    setSalvando(false);
  };

  const excluir = async () => {
    const vinc = os.filter((o) => o.clienteId === existente.id).length + receber.filter((r) => r.clienteId === existente.id).length;
    const msg = vinc ? `Este cliente tem ${vinc} registro(s) ligados (serviços/pagamentos). Eles continuarão existindo. Excluir o cadastro mesmo assim?` : "Excluir este cliente?";
    if (!window.confirm(msg)) return;
    await deleteDoc(doc(db, "clientes", existente.id));
    registrarLog(perfil, "cliente_excluido", `${existente.codigo} ${existente.nome}`);
    avisar("Cliente excluído."); fechar();
  };

  return (
    <Modal titulo={existente ? `Editar ${existente.codigo}` : "Novo cliente"} onClose={fechar} largo
      rodape={<>
        {existente && pode("excluir") && <button className="btn danger" style={{ marginRight: "auto" }} onClick={excluir}><Ic n="trash" /> Excluir</button>}
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar cliente"}</button>
      </>}>
      <div className="grid">
        <div className="seg" style={{ justifySelf: "start" }}>
          <button className={f.tipo === "PF" ? "on" : ""} onClick={() => setF((p) => ({ ...p, tipo: "PF" }))}>Pessoa física</button>
          <button className={f.tipo === "PJ" ? "on" : ""} onClick={() => setF((p) => ({ ...p, tipo: "PJ" }))}>Pessoa jurídica</button>
        </div>
        <div className="grid g2">
          <Campo rot={f.tipo === "PF" ? "Nome completo *" : "Razão social *"} erro={erros.nome}>
            <input className="inp" value={f.nome} onChange={set("nome")} />
          </Campo>
          <Campo rot={f.tipo === "PF" ? "CPF" : "CNPJ"} erro={erros.documento}>
            <input className="inp" inputMode="numeric" value={f.documento} onChange={(e) => setF((p) => ({ ...p, documento: mascaraDoc(e.target.value) }))} />
          </Campo>
          {f.tipo === "PJ" && <Campo rot="Nome fantasia"><input className="inp" value={f.fantasia} onChange={set("fantasia")} /></Campo>}
          <Campo rot="Telefone *" erro={erros.telefone}>
            <input className="inp" inputMode="tel" value={f.telefone} onChange={(e) => setF((p) => ({ ...p, telefone: mascaraTel(e.target.value) }))} />
          </Campo>
          {!f.mesmoWa && (
            <Campo rot="WhatsApp" erro={erros.whatsapp}>
              <input className="inp" inputMode="tel" value={f.whatsapp} onChange={(e) => setF((p) => ({ ...p, whatsapp: mascaraTel(e.target.value) }))} />
            </Campo>
          )}
          <Campo rot="E-mail" erro={erros.email}><input className="inp" type="email" value={f.email} onChange={set("email")} /></Campo>
        </div>
        <label className="check"><input type="checkbox" checked={f.mesmoWa} onChange={set("mesmoWa")} /> O WhatsApp é o mesmo número do telefone</label>

        <h4 className="grp-t" style={{ marginTop: 8 }}>Endereço</h4>
        <div className="grid g3">
          <Campo rot="CEP" dica={cepMsg}>
            <input className="inp" inputMode="numeric" value={f.cep}
              onChange={(e) => { const v = mascaraCep(e.target.value); setF((p) => ({ ...p, cep: v })); if (digitos(v).length === 8) buscarCep(v); }} />
          </Campo>
          <Campo rot="Rua" className="span2"><input className="inp" value={f.rua} onChange={set("rua")} /></Campo>
          <Campo rot="Número"><input className="inp" value={f.numero} onChange={set("numero")} /></Campo>
          <Campo rot="Complemento"><input className="inp" value={f.complemento} onChange={set("complemento")} /></Campo>
          <Campo rot="Bairro"><input className="inp" value={f.bairro} onChange={set("bairro")} /></Campo>
          <Campo rot="Cidade"><input className="inp" value={f.cidade} onChange={set("cidade")} /></Campo>
          <Campo rot="Estado (UF)"><input className="inp" maxLength={2} value={f.uf} onChange={set("uf")} /></Campo>
          <Campo rot="Ponto de referência"><input className="inp" value={f.referencia} onChange={set("referencia")} /></Campo>
        </div>

        <h4 className="grp-t" style={{ marginTop: 8 }}>Preferências para a equipe</h4>
        <div className="grid g3">
          <Campo rot="Acesso ao imóvel" dica="Portaria, chave, horário permitido..."><input className="inp" value={f.acesso} onChange={set("acesso")} /></Campo>
          <Campo rot="Animais de estimação"><input className="inp" value={f.pets} onChange={set("pets")} /></Campo>
          <Campo rot="Cuidados especiais" dica="Produtos que não pode usar, superfícies delicadas..."><input className="inp" value={f.cuidados} onChange={set("cuidados")} /></Campo>
        </div>
        <Campo rot="Observações"><textarea className="inp" value={f.observacoes} onChange={set("observacoes")} /></Campo>
      </div>
    </Modal>
  );
}

function PaginaClientes() {
  const { clientes, receber, ir, abrir } = useApp();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("todos");
  const atrasoPor = useMemo(() => {
    const m = {}; receber.forEach((r) => { if (statusReceber(r) === "atrasado") m[r.clienteId] = (m[r.clienteId] || 0) + 1; }); return m;
  }, [receber]);
  const lista = useMemo(() => {
    const t = normalizar(q); const td = digitos(q);
    return clientes.filter((c) => (tipo === "todos" || c.tipo === tipo) && (!t ||
      [c.nome, c.fantasia, c.codigo, c.email, c.cidade, c.bairro].some((x) => normalizar(x).includes(t)) ||
      (td.length >= 3 && [c.documento, c.telefone, c.whatsapp].some((x) => digitos(x).includes(td)))))
      .sort((a, b) => String(b.codigo).localeCompare(String(a.codigo)));
  }, [clientes, q, tipo]);

  return (
    <div>
      <div className="ph">
        <div><h1 className="h1">Clientes</h1><div className="sub">{clientes.length} cadastrado{clientes.length !== 1 ? "s" : ""}</div></div>
        <button className="btn pri" onClick={() => abrir("cliente", { aoSalvar: (id) => ir("cliente", id) })}><Ic n="plus" /> Novo cliente</button>
      </div>
      <div className="busca" style={{ maxWidth: "none", marginBottom: 12 }}>
        <span className="busca-ic"><Ic n="search" s={18} /></span>
        <input className="inp" placeholder="Nome, código, CPF/CNPJ, telefone, bairro..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips">
        {[["todos", "Todos"], ["PF", "Pessoa física"], ["PJ", "Pessoa jurídica"]].map(([v, r]) => (
          <button key={v} className={`chip ${tipo === v ? "on" : ""}`} onClick={() => setTipo(v)}>{r}</button>
        ))}
      </div>
      {lista.length === 0 ? (
        <div className="card"><Vazio icone="users" titulo={clientes.length ? "Nenhum cliente encontrado" : "Cadastre seu primeiro cliente"}
          texto={clientes.length ? "Tente buscar por outro termo." : "Cada cliente recebe um código automático, como CLI-00001."}
          acao={!clientes.length && <button className="btn pri" onClick={() => abrir("cliente", {})}><Ic n="plus" /> Novo cliente</button>} /></div>
      ) : (
        <div className="lista">
          {lista.map((c) => (
            <button key={c.id} className="row" onClick={() => ir("cliente", c.id)}>
              <div className="av">{iniciais(c.nome)}</div>
              <div className="row-main">
                <div className="row-t">{c.nome}</div>
                <div className="row-s">{c.codigo} · {c.whatsapp || c.telefone || "sem telefone"}{c.bairro ? ` · ${c.bairro}` : ""}</div>
              </div>
              <div className="row-end">
                <span className="bdg t-off">{c.tipo}</span>
                {atrasoPor[c.id] && <span className="bdg t-bad">{atrasoPor[c.id]} em atraso</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaginaCliente({ id }) {
  const { clientes, os, propostas, receber, config, perfil, ir, abrir, avisar, pode } = useApp();
  const c = clientes.find((x) => x.id === id);
  const [aba, setAba] = useState("resumo");
  const [nota, setNota] = useState("");
  if (!c) return <div className="card"><Vazio titulo="Cliente não encontrado" acao={<button className="btn" onClick={() => ir("clientes")}>Voltar para clientes</button>} /></div>;

  const suasOS = os.filter((o) => o.clienteId === c.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const suasProps = propostas.filter((p) => p.clienteId === c.id).sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
  const seusRec = receber.filter((r) => r.clienteId === c.id).sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)));
  const contratado = suasOS.filter((o) => o.status !== "cancelado" && o.status !== "orcamento").reduce((a, o) => a + num(o.valor), 0);
  const pago = seusRec.filter((r) => !r.cancelado).reduce((a, r) => a + pagoDe(r), 0);
  const aberto = seusRec.filter((r) => !r.cancelado).reduce((a, r) => a + saldoDe(r), 0);
  const pendentes = seusRec.filter((r) => ["pendente", "atrasado", "parcial"].includes(statusReceber(r)));
  const feitos = suasOS.filter((o) => OS_FEITAS.includes(o.status));
  const tel = c.whatsapp || c.telefone;
  const end = enderecoCliente(c);
  const emp = config.empresaNome || "nossa empresa";

  const registrarPagamento = () => {
    if (pendentes.length === 1) abrir("pagar", { id: pendentes[0].id });
    else if (pendentes.length > 1) { setAba("pagamentos"); avisar("Escolha qual conta deseja receber."); }
    else abrir("receber", { clienteId: c.id });
  };
  const addNota = async () => {
    if (!nota.trim()) return;
    const notas = [...(c.notas || []), { texto: nota.trim(), data: agoraISO(), autor: perfil.nome }];
    await updateDoc(doc(db, "clientes", c.id), { notas });
    setNota(""); avisar("Anotação salva.");
  };

  const acoes = [
    pode("os") && { ic: "cal", rot: "Novo serviço", fn: () => abrir("os", { clienteId: c.id, status: "agendado" }) },
    pode("propostas") && { ic: "file", rot: "Criar proposta", fn: () => abrir("proposta", { clienteId: c.id }) },
    pode("os") && { ic: "clip", rot: "Criar ordem de serviço", fn: () => abrir("os", { clienteId: c.id }) },
    pode("financeiro") && { ic: "cash", rot: "Registrar pagamento", fn: registrarPagamento },
    tel && { ic: "wa", rot: "Enviar WhatsApp", fn: () => abrirLink(waLink(tel, `Olá, ${primeiroNome(c.nome)}! Aqui é da ${emp}.`)) },
    c.email && { ic: "mail", rot: "Enviar e-mail", fn: () => abrirLink(mailLink(c.email, emp, `Olá, ${primeiroNome(c.nome)}!\n\n`)) },
  ].filter(Boolean);

  return (
    <div className="stack">
      <button className="btn ghost sm" onClick={() => ir("clientes")} style={{ paddingLeft: 4 }}><Ic n="back" s={18} /> Clientes</button>
      <div className="card">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div className="av" style={{ width: 56, height: 56, fontSize: 18, borderRadius: 16 }}>{iniciais(c.nome)}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="row-gap"><span className="bdg t-pri">{c.codigo}</span><span className="bdg t-off">{c.tipo === "PJ" ? "Pessoa jurídica" : "Pessoa física"}</span></div>
            <h1 className="h1" style={{ marginTop: 6 }}>{c.nome}</h1>
            {c.fantasia && <div className="sub">{c.fantasia}</div>}
            <div className="sub" style={{ marginTop: 4 }}>
              {[c.documento && `${c.tipo === "PJ" ? "CNPJ" : "CPF"} ${c.documento}`, tel, c.email].filter(Boolean).join(" · ")}
            </div>
            {end && <a className="small" href={mapsLink(end)} target="_blank" rel="noreferrer" style={{ display: "inline-flex", gap: 4, alignItems: "center", marginTop: 4 }}><Ic n="map" s={15} /> {end}</a>}
            <div className="faint small" style={{ marginTop: 4 }}>Cliente desde {fmtData(c.criadoEm)}</div>
          </div>
          {pode("clientes") && <button className="btn sm" onClick={() => abrir("cliente", { id: c.id })}><Ic n="edit" s={17} /> Editar</button>}
        </div>
      </div>

      <div className="acts">
        {acoes.map((a) => (
          <button key={a.rot} className="act" onClick={a.fn}><span className="ic"><Ic n={a.ic} s={18} /></span>{a.rot}</button>
        ))}
      </div>

      <div>
        <div className="tabs">
          {[["resumo", "Resumo"], ["servicos", `Serviços (${suasOS.length})`], ["propostas", `Propostas (${suasProps.length})`], ["pagamentos", `Pagamentos (${seusRec.length})`], ["notas", `Anotações (${(c.notas || []).length})`]]
            .filter(([k]) => (k !== "propostas" || pode("propostas")) && (k !== "pagamentos" || pode("financeiro")))
            .map(([k, r]) => <button key={k} className={`tab ${aba === k ? "on" : ""}`} onClick={() => setAba(k)}>{r}</button>)}
        </div>

        {aba === "resumo" && (
          <div className="stack">
            <div className="grid g4">
              <Stat rot="Valores contratados" valor={brl(contratado)} />
              <Stat rot="Total pago" valor={brl(pago)} cor="ok" />
              <Stat rot="Em aberto" valor={brl(aberto)} cor={aberto ? "warn" : undefined} />
              <Stat rot="Serviços realizados" valor={feitos.length} />
            </div>
            {pendentes.length > 0 && pode("financeiro") && (
              <div className="card">
                <h3 className="h2">Pendências</h3>
                {pendentes.map((r) => (
                  <button key={r.id} className="ag-item" onClick={() => abrir("pagamentos", { id: r.id })}>
                    <div className="row-main"><div className="row-t">{r.descricao}</div><div className="row-s">Vence {fmtData(r.vencimento)} · saldo {brl(saldoDe(r))}</div></div>
                    <Badge mapa={FIN_STATUS} valor={statusReceber(r)} />
                  </button>
                ))}
              </div>
            )}
            <div className="card">
              <h3 className="h2">Preferências e observações</h3>
              <div className="kv">
                <div><small>Acesso ao imóvel</small>{c.acesso || "—"}</div>
                <div><small>Animais</small>{c.pets || "—"}</div>
                <div><small>Cuidados especiais</small>{c.cuidados || "—"}</div>
                <div><small>Ponto de referência</small>{c.referencia || "—"}</div>
                <div className="full"><small>Observações</small>{c.observacoes || "—"}</div>
                <div className="full"><small>Datas dos serviços realizados</small>{feitos.length ? feitos.slice(0, 12).map((o) => fmtData(o.data)).join(", ") : "—"}</div>
              </div>
            </div>
          </div>
        )}

        {aba === "servicos" && (suasOS.length ? (
          <div className="lista">{suasOS.map((o) => <LinhaOS key={o.id} o={o} semCliente />)}</div>
        ) : <div className="card"><Vazio icone="clip" titulo="Nenhum serviço ainda" acao={pode("os") && <button className="btn pri" onClick={() => abrir("os", { clienteId: c.id, status: "agendado" })}>Agendar serviço</button>} /></div>)}

        {aba === "propostas" && (suasProps.length ? (
          <div className="lista">{suasProps.map((p) => <LinhaProposta key={p.id} p={p} semCliente />)}</div>
        ) : <div className="card"><Vazio icone="file" titulo="Nenhuma proposta ainda" acao={<button className="btn pri" onClick={() => abrir("proposta", { clienteId: c.id })}>Criar proposta</button>} /></div>)}

        {aba === "pagamentos" && (seusRec.length ? (
          <div className="lista">{seusRec.map((r) => <LinhaReceber key={r.id} r={r} semCliente />)}</div>
        ) : <div className="card"><Vazio icone="wallet" titulo="Nenhum lançamento financeiro" acao={<button className="btn pri" onClick={() => abrir("receber", { clienteId: c.id })}>Novo lançamento</button>} /></div>)}

        {aba === "notas" && (
          <div className="card stack">
            <div style={{ display: "flex", gap: 8 }}>
              <input className="inp" placeholder="Registrar conversa ou observação..." value={nota} onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNota(); }} />
              <button className="btn pri" onClick={addNota}>Salvar</button>
            </div>
            {[...(c.notas || [])].reverse().map((n, i) => (
              <div className="nota" key={i}>{n.texto}<small>{n.autor} · {fmtData(n.data)} {String(n.data).slice(11, 16)}</small></div>
            ))}
            {!(c.notas || []).length && <div className="muted small">Nenhuma anotação ainda.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   PROPOSTAS
   ========================================================= */
const UNIDADES = ["serviço", "m²", "hora", "diária", "cômodo", "unidade", "mês"];
const ITEM_VAZIO = { descricao: "", detalhe: "", qtd: 1, unidade: "serviço", valorUnit: "" };

function LinhaProposta({ p, semCliente }) {
  const { abrir } = useApp();
  return (
    <button className="row" onClick={() => abrir("propVer", { id: p.id })}>
      <div className="av" style={{ background: "var(--warn-s)", color: "var(--warn)" }}><Ic n="file" s={19} /></div>
      <div className="row-main">
        <div className="row-t">{semCliente ? p.numero : p.clienteNome}</div>
        <div className="row-s">{semCliente ? "" : `${p.numero} · `}{fmtData(p.data)} · válida até {fmtData(p.validade)}</div>
      </div>
      <div className="row-end"><b>{brl(totalProposta(p))}</b><Badge mapa={PROP_STATUS} valor={statusProposta(p)} /></div>
    </button>
  );
}

function PaginaPropostas({ filtroInicial }) {
  const { propostas, abrir } = useApp();
  const [filtro, setFiltro] = useState(filtroInicial || "todas");
  const [q, setQ] = useState("");
  const filtros = [["todas", "Todas"], ["aberto", "Aguardando"], ["rascunho", "Rascunhos"], ["aprovada", "Aprovadas"], ["recusada", "Recusadas"], ["expirada", "Expiradas"]];
  const lista = propostas.filter((p) => {
    const s = statusProposta(p);
    if (filtro === "aberto" && !PROP_EM_ABERTO.includes(s)) return false;
    if (!["todas", "aberto"].includes(filtro) && s !== filtro) return false;
    const t = normalizar(q);
    return !t || normalizar(p.numero).includes(t) || normalizar(p.clienteNome).includes(t);
  }).sort((a, b) => String(b.numero).localeCompare(String(a.numero)));
  const total = lista.reduce((a, p) => a + totalProposta(p), 0);

  return (
    <div>
      <div className="ph">
        <div><h1 className="h1">Propostas</h1><div className="sub">{lista.length} proposta{lista.length !== 1 ? "s" : ""} · {brl(total)}</div></div>
        <button className="btn pri" onClick={() => abrir("proposta", {})}><Ic n="plus" /> Nova proposta</button>
      </div>
      <div className="busca" style={{ maxWidth: "none", marginBottom: 12 }}>
        <span className="busca-ic"><Ic n="search" s={18} /></span>
        <input className="inp" placeholder="Número da proposta ou cliente..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips">{filtros.map(([v, r]) => <button key={v} className={`chip ${filtro === v ? "on" : ""}`} onClick={() => setFiltro(v)}>{r}</button>)}</div>
      {lista.length ? <div className="lista">{lista.map((p) => <LinhaProposta key={p.id} p={p} />)}</div>
        : <div className="card"><Vazio icone="file" titulo="Nenhuma proposta aqui" texto="Crie uma proposta e envie pelo WhatsApp ou e-mail em poucos toques."
          acao={<button className="btn pri" onClick={() => abrir("proposta", {})}><Ic n="plus" /> Nova proposta</button>} /></div>}
    </div>
  );
}

function FormProposta({ dados, fechar }) {
  const { propostas, clientes, servicos, perfil, avisar, abrir, pode } = useApp();
  const existente = dados.id ? propostas.find((p) => p.id === dados.id) : null;
  const [f, setF] = useState(() => existente ? {
    clienteId: existente.clienteId, data: existente.data, validade: existente.validade, itens: existente.itens?.length ? existente.itens : [{ ...ITEM_VAZIO }],
    desconto: existente.desconto || "", prazo: existente.prazo || "", formaPagamento: existente.formaPagamento || "PIX",
    descricao: existente.descricao || "", observacoes: existente.observacoes || "", status: existente.status || "rascunho",
  } : {
    clienteId: dados.clienteId || "", data: hojeISO(), validade: addDias(hojeISO(), 15), itens: [{ ...ITEM_VAZIO }],
    desconto: "", prazo: "", formaPagamento: "PIX", descricao: "", observacoes: "", status: "rascunho",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, itens: p.itens.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const addCatalogo = (sid) => {
    const s = servicos.find((x) => x.id === sid); if (!s) return;
    setF((p) => {
      const itens = p.itens.length === 1 && !p.itens[0].descricao ? [] : p.itens;
      return { ...p, itens: [...itens, { descricao: s.nome, detalhe: s.descricao || "", qtd: 1, unidade: s.unidade || "serviço", valorUnit: s.preco || "" }] };
    });
  };
  const total = totalProposta(f);

  const salvar = async () => {
    setErro("");
    const cli = clientes.find((c) => c.id === f.clienteId);
    if (!cli) { setErro("Selecione o cliente."); return; }
    const itens = f.itens.filter((i) => i.descricao.trim()).map((i) => ({ ...i, qtd: num(i.qtd) || 1, valorUnit: num(i.valorUnit) }));
    if (!itens.length) { setErro("Adicione pelo menos um item com descrição."); return; }
    if (!f.validade) { setErro("Informe a validade da proposta."); return; }
    setSalvando(true);
    try {
      const base = { ...f, itens, desconto: num(f.desconto), clienteNome: cli.nome, total: totalProposta({ itens, desconto: f.desconto }) };
      if (existente) {
        await updateDoc(doc(db, "propostas", existente.id), { ...base, atualizadoEm: agoraISO() });
        registrarLog(perfil, "proposta_editada", existente.numero);
        avisar("Proposta atualizada."); fechar();
      } else {
        const numero = await proximoNumero("proposta");
        const ref = await addDoc(collection(db, "propostas"), { ...base, numero, criadoEm: agoraISO(), criadoPor: perfil.nome });
        registrarLog(perfil, "proposta_criada", `${numero} ${cli.nome}`);
        avisar(`Proposta ${numero} criada.`); fechar();
        abrir("propVer", { id: ref.id });
      }
    } catch (e) { console.error(e); setErro("Não foi possível salvar. Verifique a conexão."); }
    setSalvando(false);
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir a proposta ${existente.numero}?`)) return;
    await deleteDoc(doc(db, "propostas", existente.id));
    registrarLog(perfil, "proposta_excluida", existente.numero);
    avisar("Proposta excluída."); fechar();
  };

  return (
    <Modal titulo={existente ? `Editar ${existente.numero}` : "Nova proposta"} onClose={fechar} largo
      rodape={<>
        {existente && pode("excluir") && <button className="btn danger" style={{ marginRight: "auto" }} onClick={excluir}><Ic n="trash" /> Excluir</button>}
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar proposta"}</button>
      </>}>
      <div className="grid">
        <Campo rot="Cliente *"><SelectCliente valor={f.clienteId} onChange={(v) => setF((p) => ({ ...p, clienteId: v }))} /></Campo>
        <div className="grid g3">
          <Campo rot="Data"><input className="inp" type="date" value={f.data} onChange={set("data")} /></Campo>
          <Campo rot="Válida até *"><input className="inp" type="date" value={f.validade} onChange={set("validade")} /></Campo>
          <Campo rot="Status">
            <select className="inp" value={f.status} onChange={set("status")}>
              {Object.entries(PROP_STATUS).filter(([k]) => k !== "expirada").map(([k, v]) => <option key={k} value={k}>{v.rot}</option>)}
            </select>
          </Campo>
        </div>

        <div className="ph" style={{ margin: "8px 0 0" }}>
          <h4 className="grp-t" style={{ margin: 0 }}>Itens da proposta</h4>
          {servicos.length > 0 && (
            <select className="inp" style={{ width: "auto", minHeight: 40 }} value="" onChange={(e) => addCatalogo(e.target.value)}>
              <option value="">+ Adicionar do catálogo</option>
              {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)}</option>)}
            </select>
          )}
        </div>
        {f.itens.map((it, i) => (
          <div className="item-p" key={i}>
            <div className="grid">
              <div style={{ display: "flex", gap: 8 }}>
                <input className="inp" placeholder="Serviço (ex.: Limpeza pós-obra)" value={it.descricao} onChange={(e) => setItem(i, "descricao", e.target.value)} />
                {f.itens.length > 1 && <button className="icon-btn" style={{ height: 46, width: 46 }} aria-label="Remover item"
                  onClick={() => setF((p) => ({ ...p, itens: p.itens.filter((_, j) => j !== i) }))}><Ic n="trash" s={18} /></button>}
              </div>
              <textarea className="inp" style={{ minHeight: 56 }} placeholder="Descrição detalhada (opcional)" value={it.detalhe} onChange={(e) => setItem(i, "detalhe", e.target.value)} />
              <div className="grid g4">
                <Campo rot="Quantidade"><input className="inp" type="number" min="0" step="any" value={it.qtd} onChange={(e) => setItem(i, "qtd", e.target.value)} /></Campo>
                <Campo rot="Unidade">
                  <select className="inp" value={it.unidade} onChange={(e) => setItem(i, "unidade", e.target.value)}>
                    {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </Campo>
                <Campo rot="Valor unitário (R$)"><input className="inp" type="number" min="0" step="0.01" value={it.valorUnit} onChange={(e) => setItem(i, "valorUnit", e.target.value)} /></Campo>
                <Campo rot="Subtotal"><div className="inp" style={{ display: "flex", alignItems: "center", background: "transparent" }}>{brl(num(it.qtd) * num(it.valorUnit))}</div></Campo>
              </div>
            </div>
          </div>
        ))}
        <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => setF((p) => ({ ...p, itens: [...p.itens, { ...ITEM_VAZIO }] }))}><Ic n="plus" s={17} /> Adicionar item</button>

        <div className="grid g3">
          <Campo rot="Desconto (R$)"><input className="inp" type="number" min="0" step="0.01" value={f.desconto} onChange={set("desconto")} /></Campo>
          <Campo rot="Prazo de execução"><input className="inp" placeholder="Ex.: 1 dia, 8 horas" value={f.prazo} onChange={set("prazo")} /></Campo>
          <Campo rot="Forma de pagamento">
            <select className="inp" value={f.formaPagamento} onChange={set("formaPagamento")}>{FORMAS.map((x) => <option key={x}>{x}</option>)}</select>
          </Campo>
        </div>
        <div className="tot-box"><span>Total</span><span>{brl(total)}</span></div>
        <Campo rot="Descrição geral do serviço"><textarea className="inp" value={f.descricao} onChange={set("descricao")} /></Campo>
        <Campo rot="Observações"><textarea className="inp" value={f.observacoes} onChange={set("observacoes")} /></Campo>
        {erro && <div className="aviso bad">{erro}</div>}
      </div>
    </Modal>
  );
}

function VerProposta({ dados, fechar }) {
  const { propostas, clientes, os, config, perfil, abrir, avisar } = useApp();
  const p = propostas.find((x) => x.id === dados.id);
  if (!p) return <Modal titulo="Proposta" onClose={fechar}><Vazio titulo="Proposta não encontrada" /></Modal>;
  const c = clientes.find((x) => x.id === p.clienteId);
  const st = statusProposta(p);
  const tel = c?.whatsapp || c?.telefone;
  const emp = config.empresaNome || "nossa empresa";
  const osLigada = p.osId ? os.find((o) => o.id === p.osId) : null;

  const mudar = async (status) => {
    await updateDoc(doc(db, "propostas", p.id), { status, atualizadoEm: agoraISO() });
    registrarLog(perfil, "proposta_status", `${p.numero} → ${PROP_STATUS[status]?.rot}`);
  };
  const enviarWa = () => { abrirLink(waLink(tel, msgProposta(p, emp))); if (p.status === "rascunho") mudar("enviada"); };
  const enviarEmail = () => {
    abrirLink(mailLink(c?.email, `Proposta ${p.numero} — ${emp}`, `${msgProposta(p, emp)}\n\nDica: gere o PDF pelo sistema e anexe a este e-mail.`));
    if (p.status === "rascunho") mudar("enviada");
  };
  const aprovar = async () => {
    await updateDoc(doc(db, "propostas", p.id), { status: "aprovada", aprovadaEm: agoraISO() });
    registrarLog(perfil, "proposta_aprovada", p.numero);
    avisar("Proposta aprovada! Agora é só agendar o serviço.");
    fechar();
    abrir("os", { daProposta: p.id });
  };
  const recusar = async () => {
    if (!window.confirm("Marcar esta proposta como recusada?")) return;
    await mudar("recusada"); avisar("Proposta marcada como recusada.");
  };

  return (
    <Modal titulo={p.numero} onClose={fechar} largo
      rodape={<>
        <button className="btn" onClick={() => { fechar(); abrir("proposta", { id: p.id }); }}><Ic n="edit" s={18} /> Editar</button>
        <button className="btn" onClick={() => pdfProposta(p, c, config)}><Ic n="print" s={18} /> PDF</button>
        {c?.email && <button className="btn" onClick={enviarEmail}><Ic n="mail" s={18} /> E-mail</button>}
        {tel && <button className="btn wa" onClick={enviarWa}><Ic n="wa" s={18} /> Enviar pelo WhatsApp</button>}
      </>}>
      <div className="stack">
        <div className="row-gap" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h2" style={{ margin: 0 }}>{p.clienteNome}</div>
            <div className="sub">Emitida em {fmtData(p.data)} · válida até {fmtData(p.validade)}</div>
          </div>
          <Badge mapa={PROP_STATUS} valor={st} />
        </div>

        {osLigada ? (
          <div className="aviso ok"><Ic n="check" /> <span>Proposta aprovada e transformada em {osLigada.numero}. <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => { fechar(); abrir("osVer", { id: osLigada.id }); }}>Ver OS</button></span></div>
        ) : st !== "aprovada" && st !== "recusada" ? (
          <div className="card" style={{ background: "var(--pri-s)", borderColor: "transparent" }}>
            <div style={{ fontWeight: 700, color: "var(--pri-d)" }}>O cliente aprovou?</div>
            <div className="small" style={{ color: "var(--pri-d)", marginBottom: 10 }}>Ao aprovar, a ordem de serviço já vem preenchida para você só escolher a data e a equipe.</div>
            <div className="row-gap">
              <button className="btn pri" onClick={aprovar}><Ic n="check" /> Aprovar e agendar</button>
              <button className="btn" onClick={recusar}>Recusada</button>
            </div>
          </div>
        ) : st === "aprovada" ? (
          <div className="row-gap"><button className="btn pri" onClick={() => { fechar(); abrir("os", { daProposta: p.id }); }}><Ic n="cal" /> Criar OS e agendar</button></div>
        ) : null}

        <div className="lista">
          {(p.itens || []).map((i, k) => (
            <div className="row" key={k} style={{ cursor: "default" }}>
              <div className="row-main">
                <div className="row-t" style={{ whiteSpace: "normal" }}>{i.descricao}</div>
                {i.detalhe && <div className="small muted">{i.detalhe}</div>}
                <div className="row-s">{num(i.qtd)} {i.unidade} × {brl(i.valorUnit)}</div>
              </div>
              <b>{brl(num(i.qtd) * num(i.valorUnit))}</b>
            </div>
          ))}
        </div>
        {num(p.desconto) > 0 && <div className="row-gap" style={{ justifyContent: "space-between" }}><span className="muted">Desconto</span><b>- {brl(p.desconto)}</b></div>}
        <div className="tot-box"><span>Total</span><span>{brl(totalProposta(p))}</span></div>
        <div className="kv">
          <div><small>Prazo de execução</small>{p.prazo || "A combinar"}</div>
          <div><small>Forma de pagamento</small>{p.formaPagamento || "A combinar"}</div>
          {p.descricao && <div className="full"><small>Descrição</small>{p.descricao}</div>}
          {p.observacoes && <div className="full"><small>Observações</small>{p.observacoes}</div>}
        </div>
        <Campo rot="Alterar status">
          <select className="inp" value={p.status} onChange={(e) => mudar(e.target.value)}>
            {Object.entries(PROP_STATUS).filter(([k]) => k !== "expirada").map(([k, v]) => <option key={k} value={k}>{v.rot}</option>)}
          </select>
        </Campo>
      </div>
    </Modal>
  );
}

/* =========================================================
   MENSAGEM PRONTA (WhatsApp / e-mail) — usada nas automações
   ========================================================= */
function ModalMensagem({ dados, fechar }) {
  const [texto, setTexto] = useState(dados.texto || "");
  return (
    <Modal titulo={dados.titulo || "Enviar mensagem"} onClose={fechar}
      rodape={<>
        <button className="btn" onClick={fechar}>Agora não</button>
        {dados.email && <button className="btn" onClick={() => { abrirLink(mailLink(dados.email, dados.assunto || "", texto)); fechar(); }}><Ic n="mail" s={18} /> E-mail</button>}
        <button className="btn wa" onClick={() => { abrirLink(waLink(dados.tel, texto)); fechar(); }}><Ic n="wa" s={18} /> Enviar pelo WhatsApp</button>
      </>}>
      <div className="grid">
        {dados.intro && <div className="aviso ok"><Ic n="check" /><span>{dados.intro}</span></div>}
        <Campo rot="Mensagem" dica="Você pode ajustar o texto antes de enviar.">
          <textarea className="inp" style={{ minHeight: 190 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        {!dados.tel && <div className="aviso info">Este cliente não tem WhatsApp cadastrado. O WhatsApp vai abrir para você escolher o contato.</div>}
      </div>
    </Modal>
  );
}

/* =========================================================
   ORDENS DE SERVIÇO
   ========================================================= */
function LinhaOS({ o, semCliente }) {
  const { abrir } = useApp();
  return (
    <button className="row" onClick={() => abrir("osVer", { id: o.id })}>
      <div className={`av c-${OS_STATUS[o.status]?.cor}`} style={{ background: "var(--bg)", color: "var(--c)" }}><Ic n="clip" s={19} /></div>
      <div className="row-main">
        <div className="row-t">{semCliente ? o.servico : o.clienteNome}</div>
        <div className="row-s">{o.numero} · {semCliente ? "" : `${o.servico} · `}{o.data ? `${fmtData(o.data)} ${o.hora || ""}` : "sem data"}</div>
      </div>
      <div className="row-end"><b>{brl(o.valor)}</b><Badge mapa={OS_STATUS} valor={o.status} /></div>
    </button>
  );
}

function PaginaOS({ filtroInicial }) {
  const { os, abrir, perfil } = useApp();
  const [filtro, setFiltro] = useState(filtroInicial || "abertas");
  const [q, setQ] = useState("");
  const hoje = hojeISO();
  const filtros = [["abertas", "Abertas"], ["hoje", "Hoje"], ["concluidas", "Concluídas"], ["pagar", "Aguardando pagamento"], ["canceladas", "Canceladas"], ["todas", "Todas"]];
  const lista = os.filter((o) => {
    if (filtro === "abertas" && !OS_ABERTAS.includes(o.status)) return false;
    if (filtro === "hoje" && (o.data !== hoje || o.status === "cancelado")) return false;
    if (filtro === "concluidas" && !OS_FEITAS.includes(o.status)) return false;
    if (filtro === "pagar" && !["concluido", "aguardando_pagamento"].includes(o.status)) return false;
    if (filtro === "canceladas" && o.status !== "cancelado") return false;
    const t = normalizar(q);
    return !t || [o.numero, o.clienteNome, o.servico, o.equipeNome].some((x) => normalizar(x).includes(t));
  }).sort((a, b) => (filtro === "abertas" || filtro === "hoje"
    ? String(a.data + a.hora).localeCompare(String(b.data + b.hora))
    : String(b.numero).localeCompare(String(a.numero))));

  return (
    <div>
      <div className="ph">
        <div><h1 className="h1">Ordens de serviço</h1><div className="sub">{lista.length} nesta visão</div></div>
        {perfil.papel !== "equipe" && <button className="btn pri" onClick={() => abrir("os", {})}><Ic n="plus" /> Nova OS</button>}
      </div>
      <div className="busca" style={{ maxWidth: "none", marginBottom: 12 }}>
        <span className="busca-ic"><Ic n="search" s={18} /></span>
        <input className="inp" placeholder="Número da OS, cliente, serviço, equipe..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips">{filtros.map(([v, r]) => <button key={v} className={`chip ${filtro === v ? "on" : ""}`} onClick={() => setFiltro(v)}>{r}</button>)}</div>
      {lista.length ? <div className="lista">{lista.map((o) => <LinhaOS key={o.id} o={o} />)}</div>
        : <div className="card"><Vazio icone="clip" titulo="Nenhuma ordem de serviço aqui" texto="As OS são numeradas automaticamente (ex.: OS-2026-00001)." /></div>}
    </div>
  );
}

function useAcoesOS() {
  const { receber, clientes, config, perfil, abrir, avisar } = useApp();
  const emp = config.empresaNome || "nossa empresa";

  const garantirReceber = async (o) => {
    const r = receber.find((x) => x.osId === o.id);
    if (r || num(o.valor) <= 0) return r || null;
    const ref = await addDoc(collection(db, "receber"), {
      clienteId: o.clienteId, clienteNome: o.clienteNome, osId: o.id, osNumero: o.numero, propostaNumero: o.propostaNumero || "",
      descricao: o.servico, valor: num(o.valor), vencimento: hojeISO(), formaPrevista: o.formaPagamento || "PIX",
      pagamentos: [], cancelado: false, criadoEm: agoraISO(),
    });
    await updateDoc(doc(db, "os", o.id), { receberId: ref.id });
    return { id: ref.id, valor: num(o.valor), pagamentos: [] };
  };

  const mudarStatus = async (o, novo) => {
    if (novo === o.status) return;
    const cli = clientes.find((c) => c.id === o.clienteId);
    const tel = cli?.whatsapp || cli?.telefone;
    if (novo === "cancelado") {
      if (!window.confirm(`Cancelar o serviço ${o.numero}?`)) return;
      await updateDoc(doc(db, "os", o.id), { status: "cancelado", canceladoEm: agoraISO() });
      const r = receber.find((x) => x.osId === o.id);
      if (r && pagoDe(r) === 0 && !r.cancelado) await updateDoc(doc(db, "receber", r.id), { cancelado: true });
      registrarLog(perfil, "os_cancelada", o.numero);
      avisar("Serviço cancelado.");
      return;
    }
    if (novo === "concluido") {
      const r = await garantirReceber(o);
      const quitado = r && num(r.valor) > 0 && pagoDe(r) >= num(r.valor) - 0.005;
      await updateDoc(doc(db, "os", o.id), { status: quitado ? "pago" : "concluido", concluidoEm: agoraISO() });
      registrarLog(perfil, "os_concluida", o.numero);
      abrir("mensagem", {
        titulo: "Serviço concluído",
        intro: quitado ? "Serviço concluído e já pago. Envie o agradecimento e peça a avaliação." : "Serviço concluído e conta a receber registrada. Envie o agradecimento e peça a avaliação do cliente.",
        texto: msgAgradecimento(o, emp, config.linkAvaliacao), tel, email: cli?.email, assunto: `Obrigado! — ${emp}`,
      });
      return;
    }
    await updateDoc(doc(db, "os", o.id), { status: novo, atualizadoEm: agoraISO() });
    registrarLog(perfil, "os_status", `${o.numero} → ${OS_STATUS[novo]?.rot}`);
    if (novo === "confirmado") {
      abrir("mensagem", { titulo: "Avisar o cliente?", intro: "Serviço confirmado.", texto: msgConfirmacao(o, emp), tel, email: cli?.email, assunto: `Serviço confirmado — ${emp}` });
    } else avisar(`Status: ${OS_STATUS[novo]?.rot}`);
  };

  return { mudarStatus, garantirReceber };
}

const RECORRENCIAS = { nao: "Não repetir", semanal: "Toda semana", quinzenal: "A cada 15 dias", mensal: "Todo mês" };

function FormOS({ dados, fechar }) {
  const { os, clientes, propostas, receber, equipes, servicos, config, perfil, avisar, abrir, pode } = useApp();
  const existente = dados.id ? os.find((o) => o.id === dados.id) : null;
  const origemDup = dados.duplicar ? os.find((o) => o.id === dados.duplicar) : null;
  const prop = dados.daProposta ? propostas.find((p) => p.id === dados.daProposta) : null;

  const [f, setF] = useState(() => {
    const base = {
      clienteId: dados.clienteId || "", servico: "", descricao: "", data: dados.data || hojeISO(), hora: "08:00", duracao: 3,
      endereco: "", equipeId: "", responsavel: "", materiais: "", observacoes: "", valor: "", formaPagamento: "PIX",
      status: dados.status || "agendado", propostaId: "", propostaNumero: "", recorrencia: "nao", vezes: 4, gerarReceber: true,
    };
    const fonte = existente || origemDup;
    if (fonte) {
      const campos = ["clienteId", "servico", "descricao", "data", "hora", "duracao", "endereco", "equipeId", "responsavel", "materiais", "observacoes", "valor", "formaPagamento", "status", "propostaId", "propostaNumero", "recorrencia"];
      const copia = {}; campos.forEach((k) => { if (fonte[k] !== undefined) copia[k] = fonte[k]; });
      if (origemDup) { copia.status = "agendado"; copia.propostaId = ""; copia.propostaNumero = ""; copia.recorrencia = "nao"; }
      return { ...base, ...copia };
    }
    if (prop) {
      const cli = clientes.find((c) => c.id === prop.clienteId);
      return {
        ...base, clienteId: prop.clienteId, servico: (prop.itens || []).map((i) => i.descricao).join(" + "),
        descricao: [prop.descricao, ...(prop.itens || []).map((i) => i.detalhe)].filter(Boolean).join("\n"),
        valor: totalProposta(prop), formaPagamento: prop.formaPagamento || "PIX", propostaId: prop.id, propostaNumero: prop.numero,
        observacoes: prop.observacoes || "", endereco: enderecoCliente(cli),
      };
    }
    if (dados.clienteId) return { ...base, endereco: enderecoCliente(clientes.find((c) => c.id === dados.clienteId)) };
    return base;
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => {
    const v = e && e.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e;
    setF((p) => ({ ...p, [k]: v }));
  };
  const trocarCliente = (id) => setF((p) => ({ ...p, clienteId: id, endereco: enderecoCliente(clientes.find((c) => c.id === id)) || p.endereco }));
  const cli = clientes.find((c) => c.id === f.clienteId);

  const datas = useMemo(() => {
    if (existente || f.recorrencia === "nao" || !f.data) return [f.data];
    const n = Math.min(52, Math.max(1, parseInt(f.vezes, 10) || 1));
    const out = [f.data];
    for (let i = 1; i < n; i++) {
      const ant = out[i - 1];
      out.push(f.recorrencia === "semanal" ? addDias(ant, 7) : f.recorrencia === "quinzenal" ? addDias(ant, 14) : addMeses(f.data, i));
    }
    return out;
  }, [existente, f.recorrencia, f.vezes, f.data]);

  const conflitos = useMemo(() => {
    if (f.status === "cancelado" || f.status === "orcamento") return [];
    return datas.flatMap((d) => conflitosDe(os, { ...f, data: d }, existente ? [existente.id] : []).map((o) => ({ d, o })));
  }, [datas, f, os, existente]);

  const salvar = async () => {
    setErro("");
    if (!cli) { setErro("Selecione o cliente."); return; }
    if (!f.servico.trim()) { setErro("Informe o serviço contratado."); return; }
    if (f.status !== "orcamento" && (!f.data || !f.hora)) { setErro("Informe data e horário do serviço."); return; }
    if (conflitos.length) { setErro("Existe conflito de horário para a equipe escolhida. Troque o horário ou a equipe."); return; }
    setSalvando(true);
    const eq = equipes.find((e) => e.id === f.equipeId);
    const base = {
      clienteId: cli.id, clienteNome: cli.nome, servico: f.servico.trim(), descricao: f.descricao, hora: f.hora, duracao: num(f.duracao) || 2,
      endereco: f.endereco, equipeId: f.equipeId, equipeNome: eq?.nome || "", responsavel: f.responsavel, materiais: f.materiais,
      observacoes: f.observacoes, valor: num(f.valor), formaPagamento: f.formaPagamento, status: f.status,
      propostaId: f.propostaId || "", propostaNumero: f.propostaNumero || "", recorrencia: f.recorrencia,
    };
    try {
      if (existente) {
        await updateDoc(doc(db, "os", existente.id), { ...base, data: f.data, atualizadoEm: agoraISO() });
        const r = receber.find((x) => x.osId === existente.id);
        if (r && !(r.pagamentos || []).length && !r.cancelado) {
          await updateDoc(doc(db, "receber", r.id), { valor: num(f.valor), vencimento: f.data || r.vencimento, descricao: base.servico, clienteId: cli.id, clienteNome: cli.nome });
        }
        registrarLog(perfil, "os_editada", existente.numero);
        avisar("Ordem de serviço atualizada."); fechar();
      } else {
        const serieId = datas.length > 1 ? `S${Date.now()}` : "";
        let primeira = null;
        for (const d of datas) {
          const numero = await proximoNumero("os");
          const novo = { ...base, data: d, numero, serieId, criadoEm: agoraISO(), criadoPor: perfil.nome };
          const ref = await addDoc(collection(db, "os"), novo);
          if (f.gerarReceber && num(f.valor) > 0 && f.status !== "orcamento") {
            const rref = await addDoc(collection(db, "receber"), {
              clienteId: cli.id, clienteNome: cli.nome, osId: ref.id, osNumero: numero, propostaNumero: base.propostaNumero,
              descricao: base.servico, valor: num(f.valor), vencimento: d, formaPrevista: f.formaPagamento,
              pagamentos: [], cancelado: false, criadoEm: agoraISO(),
            });
            await updateDoc(ref, { receberId: rref.id });
          }
          if (!primeira) primeira = { id: ref.id, ...novo };
        }
        if (prop) await updateDoc(doc(db, "propostas", prop.id), { osId: primeira.id, status: "aprovada" });
        registrarLog(perfil, "os_criada", `${primeira.numero}${datas.length > 1 ? ` (+${datas.length - 1} recorrentes)` : ""} ${cli.nome}`);
        fechar();
        if (["agendado", "confirmado"].includes(f.status)) {
          abrir("mensagem", {
            titulo: "Enviar confirmação ao cliente?",
            intro: datas.length > 1 ? `${datas.length} serviços agendados (${RECORRENCIAS[f.recorrencia].toLowerCase()}).` : `${primeira.numero} agendada para ${fmtData(primeira.data)} às ${primeira.hora}.`,
            texto: msgConfirmacao(primeira, config.empresaNome || "nossa empresa") + (datas.length > 1 ? `\n\nPróximas datas: ${datas.slice(1, 6).map(fmtData).join(", ")}${datas.length > 6 ? "..." : ""}` : ""),
            tel: cli.whatsapp || cli.telefone, email: cli.email, assunto: `Serviço agendado — ${config.empresaNome || ""}`,
          });
        } else avisar(`${primeira.numero} criada.`);
      }
    } catch (e) { console.error(e); setErro("Não foi possível salvar. Verifique a conexão."); }
    setSalvando(false);
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir a ${existente.numero}? Prefira "Cancelado" para manter o histórico.`)) return;
    await deleteDoc(doc(db, "os", existente.id));
    registrarLog(perfil, "os_excluida", existente.numero);
    avisar("OS excluída."); fechar();
  };

  const titulo = existente ? `Editar ${existente.numero}` : prop ? `Agendar proposta ${prop.numero}` : origemDup ? `Duplicar ${origemDup.numero}` : "Nova ordem de serviço";

  return (
    <Modal titulo={titulo} onClose={fechar} largo
      rodape={<>
        {existente && pode("excluir") && <button className="btn danger" style={{ marginRight: "auto" }} onClick={excluir}><Ic n="trash" /> Excluir</button>}
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn pri" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : existente ? "Salvar alterações" : datas.length > 1 ? `Agendar ${datas.length} serviços` : "Salvar e agendar"}
        </button>
      </>}>
      <div className="grid">
        {prop && <div className="aviso ok"><Ic n="check" /><span>Dados trazidos da proposta {prop.numero}. Escolha a data, o horário e a equipe.</span></div>}
        <Campo rot="Cliente *"><SelectCliente valor={f.clienteId} onChange={trocarCliente} /></Campo>
        {cli && (cli.acesso || cli.pets || cli.cuidados) && (
          <div className="aviso info"><Ic n="alert" /><span>{[cli.acesso && `Acesso: ${cli.acesso}`, cli.pets && `Animais: ${cli.pets}`, cli.cuidados && `Cuidados: ${cli.cuidados}`].filter(Boolean).join(" · ")}</span></div>
        )}
        <div className="grid g2">
          <Campo rot="Serviço contratado *">
            <input className="inp" list="lista-servicos" value={f.servico} onChange={(e) => {
              const v = e.target.value; const s = servicos.find((x) => x.nome === v);
              setF((p) => ({ ...p, servico: v, valor: s && !p.valor ? s.preco : p.valor }));
            }} />
            <datalist id="lista-servicos">{servicos.map((s) => <option key={s.id} value={s.nome} />)}</datalist>
          </Campo>
          <Campo rot="Status">
            <select className="inp" value={f.status} onChange={set("status")}>
              {Object.entries(OS_STATUS).map(([k, v]) => <option key={k} value={k}>{v.rot}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grid g3">
          <Campo rot="Data"><input className="inp" type="date" value={f.data} onChange={set("data")} /></Campo>
          <Campo rot="Horário"><input className="inp" type="time" value={f.hora} onChange={set("hora")} /></Campo>
          <Campo rot="Duração (horas)"><input className="inp" type="number" min="0.5" step="0.5" value={f.duracao} onChange={set("duracao")} /></Campo>
          <Campo rot="Equipe">
            <select className="inp" value={f.equipeId} onChange={set("equipeId")}>
              <option value="">Sem equipe definida</option>
              {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
          <Campo rot="Responsável"><input className="inp" value={f.responsavel} onChange={set("responsavel")} /></Campo>
          <Campo rot="Valor (R$)"><input className="inp" type="number" min="0" step="0.01" value={f.valor} onChange={set("valor")} /></Campo>
        </div>
        {!equipes.length && <div className="small faint">Dica: cadastre suas equipes em Configurações para o sistema evitar dois serviços no mesmo horário.</div>}
        {conflitos.length > 0 && (
          <div className="aviso bad"><Ic n="alert" /><span>Conflito de horário: {conflitos.slice(0, 3).map(({ d, o }) => `${fmtData(d)} com ${o.numero} (${o.hora}, ${o.clienteNome})`).join("; ")}{conflitos.length > 3 ? "..." : ""}</span></div>
        )}
        <Campo rot="Endereço do serviço"><input className="inp" value={f.endereco} onChange={set("endereco")} /></Campo>
        <div className="grid g2">
          <Campo rot="Forma de pagamento">
            <select className="inp" value={f.formaPagamento} onChange={set("formaPagamento")}>{FORMAS.map((x) => <option key={x}>{x}</option>)}</select>
          </Campo>
          <Campo rot="Materiais necessários"><input className="inp" placeholder="Ex.: aspirador, escada, produtos para vidro" value={f.materiais} onChange={set("materiais")} /></Campo>
        </div>
        <Campo rot="Descrição do serviço"><textarea className="inp" value={f.descricao} onChange={set("descricao")} /></Campo>
        <Campo rot="Observações"><textarea className="inp" style={{ minHeight: 60 }} value={f.observacoes} onChange={set("observacoes")} /></Campo>

        {!existente && (
          <div className="card" style={{ background: "var(--bg)" }}>
            <div className="grid g2">
              <Campo rot="Serviço recorrente?">
                <select className="inp" value={f.recorrencia} onChange={set("recorrencia")}>
                  {Object.entries(RECORRENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Campo>
              {f.recorrencia !== "nao" && (
                <Campo rot="Quantas vezes" dica={`Última data: ${fmtData(datas[datas.length - 1])}`}>
                  <input className="inp" type="number" min="2" max="52" value={f.vezes} onChange={set("vezes")} />
                </Campo>
              )}
            </div>
            {pode("financeiro") && num(f.valor) > 0 && f.status !== "orcamento" && (
              <label className="check" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={f.gerarReceber} onChange={set("gerarReceber")} />
                Gerar conta a receber automaticamente{datas.length > 1 ? " (uma por serviço)" : ""}
              </label>
            )}
          </div>
        )}
        {erro && <div className="aviso bad">{erro}</div>}
      </div>
    </Modal>
  );
}

function VerOS({ dados, fechar }) {
  const { os, clientes, receber, config, perfil, abrir, pode } = useApp();
  const { mudarStatus } = useAcoesOS();
  const o = os.find((x) => x.id === dados.id);
  if (!o) return <Modal titulo="Ordem de serviço" onClose={fechar}><Vazio titulo="OS não encontrada" /></Modal>;
  const c = clientes.find((x) => x.id === o.clienteId);
  const r = receber.find((x) => x.osId === o.id);
  const tel = c?.whatsapp || c?.telefone;
  const emp = config.empresaNome || "nossa empresa";
  const podeEditar = perfil.papel !== "equipe";
  const proximo = { orcamento: ["agendado", "Agendar"], agendado: ["confirmado", "Confirmar"], confirmado: ["andamento", "Iniciar serviço"], andamento: ["concluido", "Concluir serviço"] }[o.status];

  return (
    <Modal titulo={o.numero} onClose={fechar} largo
      rodape={<>
        {podeEditar && <button className="btn" onClick={() => { fechar(); abrir("os", { id: o.id }); }}><Ic n="edit" s={18} /> Editar</button>}
        {podeEditar && <button className="btn" onClick={() => { fechar(); abrir("os", { duplicar: o.id }); }}><Ic n="copy" s={18} /> Duplicar</button>}
        <button className="btn" onClick={() => pdfOS(o, c, config)}><Ic n="print" s={18} /> PDF</button>
        {c?.email && <button className="btn" onClick={() => abrirLink(mailLink(c.email, `Ordem de serviço ${o.numero} — ${emp}`, msgConfirmacao(o, emp)))}><Ic n="mail" s={18} /> E-mail</button>}
        <button className="btn wa" onClick={() => abrirLink(waLink(tel, o.data >= hojeISO() ? msgLembrete(o, emp) : msgConfirmacao(o, emp)))}><Ic n="wa" s={18} /> WhatsApp</button>
      </>}>
      <div className="stack">
        <div className="row-gap" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h2" style={{ margin: 0 }}>{o.servico}</div>
            <div className="sub">{o.clienteNome}{c?.codigo ? ` · ${c.codigo}` : ""}</div>
          </div>
          <Badge mapa={OS_STATUS} valor={o.status} />
        </div>
        {proximo && (
          <div className="row-gap">
            <button className="btn pri" onClick={() => mudarStatus(o, proximo[0])}><Ic n="check" /> {proximo[1]}</button>
            {o.status !== "cancelado" && podeEditar && <button className="btn danger" onClick={() => mudarStatus(o, "cancelado")}>Cancelar serviço</button>}
          </div>
        )}
        <div className="kv">
          <div><small>Data e horário</small>{o.data ? `${fmtData(o.data)} às ${o.hora || "--:--"}` : "A definir"}{o.hora ? ` (até ${fimHora(o)})` : ""}</div>
          <div><small>Equipe / responsável</small>{[o.equipeNome, o.responsavel].filter(Boolean).join(" · ") || "—"}</div>
          <div className="full"><small>Endereço</small>{o.endereco || "—"}
            {o.endereco && <div><a href={mapsLink(o.endereco)} target="_blank" rel="noreferrer" className="small" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Ic n="map" s={15} /> Abrir no mapa</a></div>}</div>
          {c && (c.acesso || c.pets || c.cuidados) && (
            <div className="full"><small>Preferências do cliente</small>{[c.acesso && `Acesso: ${c.acesso}`, c.pets && `Animais: ${c.pets}`, c.cuidados && `Cuidados: ${c.cuidados}`].filter(Boolean).join(" · ")}</div>
          )}
          {o.descricao && <div className="full"><small>Descrição</small><span style={{ whiteSpace: "pre-line" }}>{o.descricao}</span></div>}
          {o.materiais && <div className="full"><small>Materiais necessários</small>{o.materiais}</div>}
          {o.observacoes && <div className="full"><small>Observações</small>{o.observacoes}</div>}
          <div><small>Valor</small><b>{brl(o.valor)}</b></div>
          <div><small>Forma de pagamento</small>{o.formaPagamento || "—"}</div>
          {o.propostaNumero && <div><small>Proposta de origem</small>{o.propostaNumero}</div>}
          {o.serieId && <div><small>Recorrência</small>{RECORRENCIAS[o.recorrencia] || "Recorrente"}</div>}
        </div>
        {r && pode("financeiro") && (
          <button className="al" onClick={() => abrir("pagamentos", { id: r.id })}>
            <Ic n="wallet" />
            <span><div style={{ fontWeight: 600 }}>Financeiro desta OS</div><div className="small muted">Pago {brl(pagoDe(r))} de {brl(r.valor)} · vence {fmtData(r.vencimento)}</div></span>
            <span style={{ marginLeft: "auto" }}><Badge mapa={FIN_STATUS} valor={statusReceber(r)} /></span>
          </button>
        )}
        <Campo rot="Alterar status">
          <select className="inp" value={o.status} onChange={(e) => mudarStatus(o, e.target.value)}>
            {Object.entries(OS_STATUS).map(([k, v]) => <option key={k} value={k}>{v.rot}</option>)}
          </select>
        </Campo>
      </div>
    </Modal>
  );
}

/* =========================================================
   FINANCEIRO
   ========================================================= */
function LinhaReceber({ r, semCliente }) {
  const { abrir } = useApp();
  const st = statusReceber(r);
  return (
    <button className="row" onClick={() => abrir("pagamentos", { id: r.id })}>
      <div className={`av c-${FIN_STATUS[st].cor}`} style={{ background: "var(--bg)", color: "var(--c)" }}><Ic n="wallet" s={19} /></div>
      <div className="row-main">
        <div className="row-t">{semCliente ? r.descricao : r.clienteNome}</div>
        <div className="row-s">{semCliente ? "" : `${r.descricao} · `}{r.osNumero ? `${r.osNumero} · ` : ""}vence {fmtData(r.vencimento)}</div>
      </div>
      <div className="row-end">
        <b>{brl(r.valor)}</b>
        {st === "parcial" || (st === "atrasado" && pagoDe(r) > 0) ? <span className="small muted">saldo {brl(saldoDe(r))}</span> : null}
        <Badge mapa={FIN_STATUS} valor={st} />
      </div>
    </button>
  );
}

function PaginaFinanceiro({ filtroInicial }) {
  const { receber, abrir } = useApp();
  const [filtro, setFiltro] = useState(filtroInicial || "aberto");
  const [q, setQ] = useState("");
  const hoje = hojeISO(); const mesAtual = hoje.slice(0, 7);
  const fimMes = toISO(new Date(parseISO(hoje).getFullYear(), parseISO(hoje).getMonth() + 1, 0));

  const k = useMemo(() => {
    const ativos = receber.filter((r) => !r.cancelado);
    const pags = ativos.flatMap((r) => r.pagamentos || []);
    return {
      aReceber: ativos.reduce((a, r) => a + saldoDe(r), 0),
      recebido: pags.reduce((a, p) => a + num(p.valor), 0),
      atrasado: ativos.filter((r) => statusReceber(r) === "atrasado").reduce((a, r) => a + saldoDe(r), 0),
      pendente: ativos.filter((r) => ["pendente", "parcial"].includes(statusReceber(r))).reduce((a, r) => a + saldoDe(r), 0),
      doMes: pags.filter((p) => String(p.data).startsWith(mesAtual)).reduce((a, p) => a + num(p.valor), 0),
      futuros: ativos.filter((r) => r.vencimento > fimMes).reduce((a, r) => a + saldoDe(r), 0),
      pags, ativos,
    };
  }, [receber, mesAtual, fimMes]);

  const meses = ultimosMeses(6);
  const recMes = meses.map((m) => ({ rot: m.rot, v: k.pags.filter((p) => String(p.data).startsWith(m.chave)).reduce((a, p) => a + num(p.valor), 0) }));
  const prox = Array.from({ length: 4 }, (_, i) => { const d = addMeses(`${mesAtual}-01`, i); return { chave: d.slice(0, 7), rot: MES_ABR[parseISO(d).getMonth()] }; });
  const previsao = prox.map((m) => ({ rot: m.rot, v: k.ativos.filter((r) => String(r.vencimento).startsWith(m.chave)).reduce((a, r) => a + saldoDe(r), 0) }));
  const porForma = FORMAS.map((fm) => ({ fm, v: k.pags.filter((p) => p.forma === fm).reduce((a, p) => a + num(p.valor), 0) })).filter((x) => x.v > 0);
  const cores = ["var(--pri)", "var(--info)", "var(--part)", "var(--warn)", "var(--ok)", "var(--off)"];
  const compacto = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v).replace(",00", ""));

  const filtros = [["aberto", "Em aberto"], ["atrasado", "Atrasados"], ["parcial", "Parciais"], ["pago", "Pagos"], ["cancelado", "Cancelados"], ["todos", "Todos"]];
  const lista = receber.filter((r) => {
    const st = statusReceber(r);
    if (filtro === "aberto" && !["pendente", "atrasado", "parcial"].includes(st)) return false;
    if (!["aberto", "todos"].includes(filtro) && st !== filtro) return false;
    const t = normalizar(q);
    return !t || [r.clienteNome, r.descricao, r.osNumero, r.propostaNumero].some((x) => normalizar(x).includes(t));
  }).sort((a, b) => (filtro === "pago" ? String(b.vencimento).localeCompare(String(a.vencimento)) : String(a.vencimento).localeCompare(String(b.vencimento))));

  return (
    <div className="stack">
      <div className="ph" style={{ marginBottom: 0 }}>
        <div><h1 className="h1">Financeiro</h1><div className="sub">Contas a receber</div></div>
        <button className="btn pri" onClick={() => abrir("receber", {})}><Ic n="plus" /> Novo lançamento</button>
      </div>
      <div className="grid g3">
        <Stat rot="Total a receber" valor={brl(k.aReceber)} onClick={() => setFiltro("aberto")} />
        <Stat rot="Total recebido" valor={brl(k.recebido)} cor="ok" onClick={() => setFiltro("pago")} />
        <Stat rot="Total atrasado" valor={brl(k.atrasado)} cor="bad" onClick={() => setFiltro("atrasado")} />
        <Stat rot="Total pendente (no prazo)" valor={brl(k.pendente)} cor="warn" />
        <Stat rot="Recebimentos do mês" valor={brl(k.doMes)} cor="ok" />
        <Stat rot="Recebimentos futuros" valor={brl(k.futuros)} cor="info" />
      </div>
      <div className="grid g2">
        <div className="card"><h3 className="h2">Recebido por mês</h3><Barras dados={recMes} formato={compacto} cor="ok" /></div>
        <div className="card"><h3 className="h2">Previsão a receber</h3><Barras dados={previsao} formato={compacto} cor="info" /></div>
      </div>
      {porForma.length > 0 && (
        <div className="card">
          <h3 className="h2">Recebido por forma de pagamento</h3>
          <div className="split">{porForma.map((x, i) => <i key={x.fm} style={{ width: `${(x.v / k.recebido) * 100}%`, background: cores[i % cores.length] }} />)}</div>
          <div className="leg">{porForma.map((x, i) => <span key={x.fm}><i style={{ background: cores[i % cores.length] }} />{x.fm}: {brl(x.v)}</span>)}</div>
        </div>
      )}
      <div>
        <div className="busca" style={{ maxWidth: "none", marginBottom: 12 }}>
          <span className="busca-ic"><Ic n="search" s={18} /></span>
          <input className="inp" placeholder="Cliente, descrição, número da OS ou proposta..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">{filtros.map(([v, r]) => <button key={v} className={`chip ${filtro === v ? "on" : ""}`} onClick={() => setFiltro(v)}>{r}</button>)}</div>
        {lista.length ? <div className="lista">{lista.map((r) => <LinhaReceber key={r.id} r={r} />)}</div>
          : <div className="card"><Vazio icone="wallet" titulo="Nada por aqui" texto="Contas a receber são criadas automaticamente ao agendar um serviço com valor." /></div>}
      </div>
    </div>
  );
}

function FormReceber({ dados, fechar }) {
  const { receber, os, clientes, perfil, avisar, pode } = useApp();
  const existente = dados.id ? receber.find((r) => r.id === dados.id) : null;
  const [f, setF] = useState(() => existente ? {
    clienteId: existente.clienteId, osId: existente.osId || "", descricao: existente.descricao || "", valor: existente.valor,
    vencimento: existente.vencimento, formaPrevista: existente.formaPrevista || "PIX", observacoes: existente.observacoes || "",
  } : { clienteId: dados.clienteId || "", osId: dados.osId || "", descricao: "", valor: "", vencimento: hojeISO(), formaPrevista: "PIX", observacoes: "" });
  const [erro, setErro] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const osDoCliente = os.filter((o) => o.clienteId === f.clienteId && o.status !== "cancelado");
  const escolherOS = (id) => {
    const o = os.find((x) => x.id === id);
    setF((p) => ({ ...p, osId: id, descricao: o ? o.servico : p.descricao, valor: o && !p.valor ? o.valor : p.valor, vencimento: o?.data || p.vencimento }));
  };

  const salvar = async () => {
    setErro("");
    const cli = clientes.find((c) => c.id === f.clienteId);
    if (!cli) { setErro("Selecione o cliente."); return; }
    if (num(f.valor) <= 0) { setErro("Informe um valor maior que zero."); return; }
    if (!f.vencimento) { setErro("Informe o vencimento."); return; }
    const o = os.find((x) => x.id === f.osId);
    const base = {
      clienteId: cli.id, clienteNome: cli.nome, osId: o?.id || "", osNumero: o?.numero || "", propostaNumero: o?.propostaNumero || "",
      descricao: f.descricao.trim() || o?.servico || "Serviço", valor: num(f.valor), vencimento: f.vencimento,
      formaPrevista: f.formaPrevista, observacoes: f.observacoes,
    };
    try {
      if (existente) {
        await updateDoc(doc(db, "receber", existente.id), { ...base, atualizadoEm: agoraISO() });
        registrarLog(perfil, "receber_editado", `${cli.nome} ${brl(base.valor)}`);
        avisar("Lançamento atualizado.");
      } else {
        const ref = await addDoc(collection(db, "receber"), { ...base, pagamentos: [], cancelado: false, criadoEm: agoraISO() });
        if (o) await updateDoc(doc(db, "os", o.id), { receberId: ref.id });
        registrarLog(perfil, "receber_criado", `${cli.nome} ${brl(base.valor)}`);
        avisar("Conta a receber criada.");
      }
      fechar();
    } catch (e) { console.error(e); setErro("Não foi possível salvar. Verifique a conexão."); }
  };

  const excluir = async () => {
    if (!window.confirm("Excluir este lançamento e todos os pagamentos registrados nele?")) return;
    await deleteDoc(doc(db, "receber", existente.id));
    registrarLog(perfil, "receber_excluido", `${existente.clienteNome} ${brl(existente.valor)}`);
    avisar("Lançamento excluído."); fechar();
  };

  return (
    <Modal titulo={existente ? "Editar lançamento" : "Nova conta a receber"} onClose={fechar}
      rodape={<>
        {existente && pode("excluir") && <button className="btn danger" style={{ marginRight: "auto" }} onClick={excluir}><Ic n="trash" /> Excluir</button>}
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn pri" onClick={salvar}>Salvar</button>
      </>}>
      <div className="grid">
        <Campo rot="Cliente *"><SelectCliente valor={f.clienteId} onChange={(v) => setF((p) => ({ ...p, clienteId: v, osId: "" }))} /></Campo>
        {osDoCliente.length > 0 && (
          <Campo rot="Ordem de serviço (opcional)">
            <select className="inp" value={f.osId} onChange={(e) => escolherOS(e.target.value)}>
              <option value="">Sem vínculo</option>
              {osDoCliente.map((o) => <option key={o.id} value={o.id}>{o.numero} — {o.servico} ({fmtData(o.data)})</option>)}
            </select>
          </Campo>
        )}
        <Campo rot="Descrição"><input className="inp" value={f.descricao} onChange={set("descricao")} /></Campo>
        <div className="grid g3">
          <Campo rot="Valor (R$) *"><input className="inp" type="number" min="0" step="0.01" value={f.valor} onChange={set("valor")} /></Campo>
          <Campo rot="Vencimento *"><input className="inp" type="date" value={f.vencimento} onChange={set("vencimento")} /></Campo>
          <Campo rot="Forma prevista">
            <select className="inp" value={f.formaPrevista} onChange={set("formaPrevista")}>{FORMAS.map((x) => <option key={x}>{x}</option>)}</select>
          </Campo>
        </div>
        <Campo rot="Observações"><textarea className="inp" style={{ minHeight: 60 }} value={f.observacoes} onChange={set("observacoes")} /></Campo>
        {erro && <div className="aviso bad">{erro}</div>}
      </div>
    </Modal>
  );
}

function ModalPagar({ dados, fechar }) {
  const { receber, os, clientes, config, perfil, avisar, abrir } = useApp();
  const r = receber.find((x) => x.id === dados.id);
  const [f, setF] = useState(() => ({ valor: r ? saldoDe(r).toFixed(2) : "", data: hojeISO(), forma: r?.formaPrevista || "PIX", obs: "" }));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  if (!r) return <Modal titulo="Registrar pagamento" onClose={fechar}><Vazio titulo="Lançamento não encontrado" /></Modal>;
  const saldo = saldoDe(r);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const salvar = async () => {
    setErro("");
    const v = num(f.valor);
    if (v <= 0) { setErro("Informe o valor recebido."); return; }
    if (v > saldo + 0.005) { setErro(`O valor é maior que o saldo restante (${brl(saldo)}).`); return; }
    if (!f.data) { setErro("Informe a data do recebimento."); return; }
    setSalvando(true);
    try {
      const pagamentos = [...(r.pagamentos || []), { valor: v, data: f.data, forma: f.forma, obs: f.obs, registradoPor: perfil.nome, em: agoraISO() }];
      await updateDoc(doc(db, "receber", r.id), { pagamentos, formaPagamento: f.forma, dataPagamento: f.data });
      const quitou = saldo - v <= 0.005;
      if (quitou && r.osId) {
        const o = os.find((x) => x.id === r.osId);
        if (o && ["concluido", "aguardando_pagamento"].includes(o.status)) await updateDoc(doc(db, "os", o.id), { status: "pago" });
      }
      registrarLog(perfil, "pagamento_registrado", `${r.clienteNome} ${brl(v)} (${f.forma})`);
      fechar();
      const cli = clientes.find((c) => c.id === r.clienteId);
      abrir("mensagem", {
        titulo: quitou ? "Pagamento recebido" : "Pagamento parcial registrado",
        intro: quitou ? `${brl(v)} recebido. Conta quitada.` : `${brl(v)} recebido. Saldo restante: ${brl(saldo - v)}.`,
        texto: `Olá, ${primeiroNome(r.clienteNome)}! Confirmamos o recebimento de ${brl(v)} via ${f.forma} em ${fmtData(f.data)}, referente a ${r.descricao}${r.osNumero ? ` (${r.osNumero})` : ""}.${quitou ? "" : `\nSaldo restante: ${brl(saldo - v)}.`}\n\nObrigado! ${config.empresaNome || ""}`,
        tel: cli?.whatsapp || cli?.telefone, email: cli?.email, assunto: `Recibo de pagamento — ${config.empresaNome || ""}`,
      });
    } catch (e) { console.error(e); setErro("Não foi possível salvar. Verifique a conexão."); }
    setSalvando(false);
  };

  return (
    <Modal titulo="Registrar pagamento" onClose={fechar}
      rodape={<><button className="btn" onClick={fechar}>Cancelar</button><button className="btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Confirmar recebimento"}</button></>}>
      <div className="grid">
        <div>
          <div style={{ fontWeight: 700 }}>{r.clienteNome}</div>
          <div className="sub">{r.descricao}{r.osNumero ? ` · ${r.osNumero}` : ""}</div>
        </div>
        <div className="grid g3">
          <Stat rot="Valor total" valor={brl(r.valor)} />
          <Stat rot="Valor pago" valor={brl(pagoDe(r))} cor="ok" />
          <Stat rot="Saldo restante" valor={brl(saldo)} cor="warn" />
        </div>
        <div className="grid g2">
          <Campo rot="Valor recebido (R$)" dica={num(f.valor) < saldo - 0.005 ? "Valor menor que o saldo: fica registrado como pagamento parcial." : undefined}>
            <input className="inp" type="number" min="0" step="0.01" value={f.valor} onChange={set("valor")} />
          </Campo>
          <Campo rot="Data do recebimento"><input className="inp" type="date" value={f.data} onChange={set("data")} /></Campo>
        </div>
        <Campo rot="Forma de pagamento">
          <div className="chips" style={{ flexWrap: "wrap", margin: 0 }}>
            {FORMAS.map((x) => <button key={x} type="button" className={`chip ${f.forma === x ? "on" : ""}`} onClick={() => setF((p) => ({ ...p, forma: x }))}>{x}</button>)}
          </div>
        </Campo>
        <Campo rot="Observação"><input className="inp" value={f.obs} onChange={set("obs")} /></Campo>
        {erro && <div className="aviso bad">{erro}</div>}
      </div>
    </Modal>
  );
}

function VerPagamentos({ dados, fechar }) {
  const { receber, clientes, os, config, perfil, abrir, avisar, pode } = useApp();
  const r = receber.find((x) => x.id === dados.id);
  if (!r) return <Modal titulo="Conta a receber" onClose={fechar}><Vazio titulo="Lançamento não encontrado" /></Modal>;
  const st = statusReceber(r);
  const cli = clientes.find((c) => c.id === r.clienteId);
  const tel = cli?.whatsapp || cli?.telefone;
  const o = r.osId ? os.find((x) => x.id === r.osId) : null;

  const removerPagamento = async (i) => {
    if (!window.confirm("Remover este pagamento?")) return;
    const pagamentos = (r.pagamentos || []).filter((_, j) => j !== i);
    await updateDoc(doc(db, "receber", r.id), { pagamentos });
    if (o && o.status === "pago") await updateDoc(doc(db, "os", o.id), { status: "concluido" });
    registrarLog(perfil, "pagamento_removido", `${r.clienteNome} ${brl(r.pagamentos[i].valor)}`);
    avisar("Pagamento removido.");
  };
  const alternarCancelado = async () => {
    if (!r.cancelado && !window.confirm("Cancelar esta conta a receber?")) return;
    await updateDoc(doc(db, "receber", r.id), { cancelado: !r.cancelado });
    registrarLog(perfil, r.cancelado ? "receber_reativado" : "receber_cancelado", `${r.clienteNome} ${brl(r.valor)}`);
    avisar(r.cancelado ? "Lançamento reativado." : "Lançamento cancelado.");
  };

  return (
    <Modal titulo="Conta a receber" onClose={fechar}
      rodape={<>
        <button className="btn" onClick={() => { fechar(); abrir("receber", { id: r.id }); }}><Ic n="edit" s={18} /> Editar</button>
        <button className="btn" onClick={alternarCancelado}>{r.cancelado ? "Reativar" : "Cancelar conta"}</button>
        {saldoDe(r) > 0 && !r.cancelado && tel && <button className="btn" onClick={() => abrirLink(waLink(tel, msgCobranca(r, config.empresaNome || "", config.pix)))}><Ic n="wa" s={18} /> Cobrar</button>}
        {saldoDe(r) > 0 && !r.cancelado && <button className="btn pri" onClick={() => abrir("pagar", { id: r.id })}><Ic n="cash" s={18} /> Registrar pagamento</button>}
      </>}>
      <div className="stack">
        <div className="row-gap" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="h2" style={{ margin: 0 }}>{r.clienteNome}</div>
            <div className="sub">{r.descricao} · vence {fmtData(r.vencimento)}</div>
          </div>
          <Badge mapa={FIN_STATUS} valor={st} />
        </div>
        <div className="grid g3">
          <Stat rot="Valor total" valor={brl(r.valor)} />
          <Stat rot="Valor pago" valor={brl(pagoDe(r))} cor="ok" />
          <Stat rot="Saldo restante" valor={brl(saldoDe(r))} cor={saldoDe(r) > 0 ? "warn" : undefined} />
        </div>
        <div className="kv">
          <div><small>Ordem de serviço</small>{o ? <button className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => { fechar(); abrir("osVer", { id: o.id }); }}>{o.numero}</button> : r.osNumero || "—"}</div>
          <div><small>Proposta</small>{r.propostaNumero || "—"}</div>
          <div><small>Forma prevista</small>{r.formaPrevista || "—"}</div>
          <div><small>Último pagamento</small>{r.dataPagamento ? fmtData(r.dataPagamento) : "—"}</div>
          {r.observacoes && <div className="full"><small>Observações</small>{r.observacoes}</div>}
        </div>
        <div>
          <h4 className="grp-t">Pagamentos registrados</h4>
          {(r.pagamentos || []).length === 0 && <div className="small muted">Nenhum pagamento registrado ainda.</div>}
          {(r.pagamentos || []).map((p, i) => (
            <div className="ag-item" key={i} style={{ cursor: "default" }}>
              <div className="row-main">
                <div className="row-t">{brl(p.valor)} · {p.forma}</div>
                <div className="row-s">{fmtData(p.data)}{p.obs ? ` · ${p.obs}` : ""}{p.registradoPor ? ` · por ${p.registradoPor}` : ""}</div>
              </div>
              {pode("excluir") && <button className="icon-btn" aria-label="Remover pagamento" onClick={() => removerPagamento(i)}><Ic n="trash" s={17} /></button>}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */
const CORES_EQUIPE = ["#0B7A6E", "#2E6BD6", "#6A56D6", "#C0582B", "#A87400", "#1E9E5A", "#D2463C", "#4B5563"];

function comprimirImagem(file, max = 320) {
  return new Promise((res, rej) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const esc2 = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * esc2); cv.height = Math.round(img.height * esc2);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/png"));
      };
      img.onerror = rej; img.src = leitor.result;
    };
    leitor.onerror = rej; leitor.readAsDataURL(file);
  });
}

function ConfigEmpresa() {
  const { config, perfil, avisar } = useApp();
  const [f, setF] = useState({});
  useEffect(() => {
    setF({
      empresaNome: config.empresaNome || "", cnpj: config.cnpj || "", telefone: config.telefone || "", whatsapp: config.whatsapp || "",
      email: config.email || "", endereco: config.endereco || "", pix: config.pix || "", linkAvaliacao: config.linkAvaliacao || "", logo: config.logo || "",
    });
  }, [config]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const trocarLogo = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const url = await comprimirImagem(file); setF((p) => ({ ...p, logo: url })); }
    catch { avisar("Não foi possível ler a imagem.", true); }
  };
  const salvar = async () => {
    if (!f.empresaNome.trim()) { avisar("Informe o nome da empresa.", true); return; }
    try {
      await setDoc(doc(db, "config", "sistema"), { ...f, atualizadoEm: agoraISO() }, { merge: true });
      registrarLog(perfil, "config_empresa", "Dados da empresa atualizados");
      avisar("Dados da empresa salvos.");
    } catch (e) { console.error(e); avisar("Sem permissão ou sem conexão para salvar.", true); }
  };
  return (
    <div className="card grid">
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div className="marca-ic" style={{ width: 72, height: 72, borderRadius: 18 }}>{f.logo ? <img src={f.logo} alt="Logo" /> : <Ic n="sparkle" s={30} />}</div>
        <div className="row-gap">
          <label className="btn sm" style={{ cursor: "pointer" }}><Ic n="plus" s={17} /> {f.logo ? "Trocar logo" : "Enviar logo"}
            <input type="file" accept="image/*" hidden onChange={trocarLogo} /></label>
          {f.logo && <button className="btn sm ghost" onClick={() => setF((p) => ({ ...p, logo: "" }))}>Remover</button>}
        </div>
      </div>
      <div className="grid g2">
        <Campo rot="Nome da empresa *"><input className="inp" value={f.empresaNome || ""} onChange={set("empresaNome")} /></Campo>
        <Campo rot="CNPJ"><input className="inp" value={f.cnpj || ""} onChange={(e) => setF((p) => ({ ...p, cnpj: mascaraDoc(e.target.value) }))} /></Campo>
        <Campo rot="Telefone"><input className="inp" value={f.telefone || ""} onChange={(e) => setF((p) => ({ ...p, telefone: mascaraTel(e.target.value) }))} /></Campo>
        <Campo rot="WhatsApp da empresa"><input className="inp" value={f.whatsapp || ""} onChange={(e) => setF((p) => ({ ...p, whatsapp: mascaraTel(e.target.value) }))} /></Campo>
        <Campo rot="E-mail"><input className="inp" type="email" value={f.email || ""} onChange={set("email")} /></Campo>
        <Campo rot="Chave PIX" dica="Aparece nas mensagens de cobrança."><input className="inp" value={f.pix || ""} onChange={set("pix")} /></Campo>
        <Campo rot="Endereço" className="span2"><input className="inp" value={f.endereco || ""} onChange={set("endereco")} /></Campo>
        <Campo rot="Link de avaliação (Google)" className="span2" dica="Enviado automaticamente no agradecimento após o serviço."><input className="inp" placeholder="https://g.page/r/..." value={f.linkAvaliacao || ""} onChange={set("linkAvaliacao")} /></Campo>
      </div>
      <div><button className="btn pri" onClick={salvar}>Salvar dados da empresa</button></div>
    </div>
  );
}

function ConfigLista({ colecao, titulo, vazio, campos, novoPadrao, linha }) {
  const { perfil, avisar } = useApp();
  const itens = useApp()[colecao];
  const [edit, setEdit] = useState(null);
  const salvar = async () => {
    if (!String(edit.nome || "").trim()) { avisar("Informe o nome.", true); return; }
    const { id, ...d } = edit;
    try {
      if (id) await updateDoc(doc(db, colecao, id), d); else await addDoc(collection(db, colecao), { ...d, criadoEm: agoraISO() });
      registrarLog(perfil, `${colecao}_salvo`, d.nome);
      avisar("Salvo."); setEdit(null);
    } catch (e) { console.error(e); avisar("Não foi possível salvar.", true); }
  };
  const excluir = async (it) => {
    if (!window.confirm(`Excluir ${it.nome}?`)) return;
    await deleteDoc(doc(db, colecao, it.id)); avisar("Excluído.");
  };
  return (
    <div className="stack">
      <div className="ph" style={{ marginBottom: 0 }}>
        <div className="sub">{titulo}</div>
        <button className="btn pri sm" onClick={() => setEdit({ ...novoPadrao })}><Ic n="plus" s={17} /> Adicionar</button>
      </div>
      {itens.length ? (
        <div className="lista">
          {[...itens].sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map((it) => (
            <div className="row" key={it.id} style={{ cursor: "default" }}>
              {linha(it)}
              <button className="icon-btn" aria-label="Editar" onClick={() => setEdit({ ...it })}><Ic n="edit" s={17} /></button>
              <button className="icon-btn" aria-label="Excluir" onClick={() => excluir(it)}><Ic n="trash" s={17} /></button>
            </div>
          ))}
        </div>
      ) : <div className="card"><Vazio icone="plus" titulo={vazio} /></div>}
      {edit && (
        <Modal titulo={edit.id ? "Editar" : "Adicionar"} onClose={() => setEdit(null)}
          rodape={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn pri" onClick={salvar}>Salvar</button></>}>
          <div className="grid">{campos(edit, setEdit)}</div>
        </Modal>
      )}
    </div>
  );
}

function ConfigUsuarios() {
  const { usuarios, perfil, avisar } = useApp();
  const mudar = async (u, papel) => {
    try {
      await updateDoc(doc(db, "usuarios", u.id), { papel });
      registrarLog(perfil, "usuario_papel", `${u.nome} → ${PAPEIS[papel]}`);
      avisar(`${u.nome}: ${PAPEIS[papel]}`);
    } catch (e) { console.error(e); avisar("Não foi possível alterar.", true); }
  };
  const pend = usuarios.filter((u) => u.papel === "pendente").length;
  return (
    <div className="stack">
      <div className="aviso info"><Ic n="users" /><span>Para adicionar alguém, peça que abra o sistema e toque em <b>Criar conta</b>. A pessoa aparece aqui como “Aguardando liberação” e você escolhe o tipo de acesso.</span></div>
      {pend > 0 && <div className="aviso bad"><Ic n="alert" /><span>{pend} usuário{pend > 1 ? "s" : ""} aguardando liberação.</span></div>}
      <div className="lista">
        {[...usuarios].sort((a, b) => (a.papel === "pendente" ? -1 : 1) - (b.papel === "pendente" ? -1 : 1)).map((u) => (
          <div className="row" key={u.id} style={{ cursor: "default", flexWrap: "wrap" }}>
            <div className="av">{iniciais(u.nome)}</div>
            <div className="row-main"><div className="row-t">{u.nome}{u.id === perfil.uid ? " (você)" : ""}</div><div className="row-s">{u.email}</div></div>
            <select className="inp" style={{ width: "auto", minHeight: 40 }} value={u.papel} disabled={u.id === perfil.uid} onChange={(e) => mudar(u, e.target.value)}>
              {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{k === "pendente" ? "Bloqueado / aguardando" : v}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="card small muted">
        <b style={{ color: "var(--ink)" }}>O que cada acesso pode ver</b><br />
        Administrador: tudo, inclusive usuários. · Gerente: tudo, menos usuários. · Financeiro: início, clientes, OS e financeiro. · Atendimento: início, agenda, clientes, propostas e OS. · Equipe: agenda e OS (atualiza o status do serviço).
      </div>
    </div>
  );
}

function ConfigHistorico() {
  const [logs, setLogs] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, "logs"), orderBy("data", "desc"), limit(60)),
    (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setLogs([])), []);
  if (!logs) return <div className="card"><div className="spin" /></div>;
  return (
    <div className="lista">
      {logs.length === 0 && <div className="row muted" style={{ cursor: "default" }}>Nenhuma alteração registrada ainda.</div>}
      {logs.map((l) => (
        <div className="row" key={l.id} style={{ cursor: "default" }}>
          <div className="row-main"><div className="row-t" style={{ whiteSpace: "normal" }}>{l.resumo}</div><div className="row-s">{l.acao.replace(/_/g, " ")} · {l.usuario}</div></div>
          <div className="small faint">{fmtData(l.data)} {String(l.data).slice(11, 16)}</div>
        </div>
      ))}
    </div>
  );
}

function PaginaConfig() {
  const { pode } = useApp();
  const [aba, setAba] = useState("empresa");
  const abas = [["empresa", "Empresa"], ["equipes", "Equipes"], ["servicos", "Catálogo de serviços"], pode("usuarios") && ["usuarios", "Usuários"], pode("usuarios") && ["historico", "Histórico"]].filter(Boolean);
  return (
    <div>
      <div className="ph"><div><h1 className="h1">Configurações</h1><div className="sub">Dados da empresa, equipes, serviços e acessos</div></div></div>
      <div className="tabs">{abas.map(([k, r]) => <button key={k} className={`tab ${aba === k ? "on" : ""}`} onClick={() => setAba(k)}>{r}</button>)}</div>
      {aba === "empresa" && <ConfigEmpresa />}
      {aba === "equipes" && (
        <ConfigLista colecao="equipes" titulo="O sistema impede dois serviços da mesma equipe no mesmo horário." vazio="Nenhuma equipe cadastrada"
          novoPadrao={{ nome: "", membros: "", cor: CORES_EQUIPE[0] }}
          linha={(e) => <><span className="swatch" style={{ background: e.cor }} /><div className="row-main"><div className="row-t">{e.nome}</div><div className="row-s">{e.membros || "Sem integrantes informados"}</div></div></>}
          campos={(e, setE) => <>
            <Campo rot="Nome da equipe *"><input className="inp" placeholder="Ex.: Equipe Azul" value={e.nome} onChange={(x) => setE({ ...e, nome: x.target.value })} /></Campo>
            <Campo rot="Integrantes"><input className="inp" placeholder="Ex.: Maria, Joana" value={e.membros} onChange={(x) => setE({ ...e, membros: x.target.value })} /></Campo>
            <Campo rot="Cor"><div className="row-gap">{CORES_EQUIPE.map((c) => (
              <button key={c} type="button" className="swatch" aria-label={`Cor ${c}`} onClick={() => setE({ ...e, cor: c })}
                style={{ background: c, boxShadow: e.cor === c ? "0 0 0 2px var(--ink)" : undefined }} />))}</div></Campo>
          </>} />
      )}
      {aba === "servicos" && (
        <ConfigLista colecao="servicos" titulo="Serviços que você oferece. Aparecem nas propostas e nas OS com o preço preenchido." vazio="Nenhum serviço no catálogo"
          novoPadrao={{ nome: "", descricao: "", preco: "", unidade: "serviço" }}
          linha={(s) => <><div className="av"><Ic n="tag" s={18} /></div><div className="row-main"><div className="row-t">{s.nome}</div><div className="row-s">{brl(s.preco)} por {s.unidade}{s.descricao ? ` · ${s.descricao}` : ""}</div></div></>}
          campos={(s, setS) => <>
            <Campo rot="Nome do serviço *"><input className="inp" placeholder="Ex.: Limpeza residencial completa" value={s.nome} onChange={(x) => setS({ ...s, nome: x.target.value })} /></Campo>
            <div className="grid g2">
              <Campo rot="Preço (R$)"><input className="inp" type="number" min="0" step="0.01" value={s.preco} onChange={(x) => setS({ ...s, preco: num(x.target.value) || x.target.value })} /></Campo>
              <Campo rot="Unidade"><select className="inp" value={s.unidade} onChange={(x) => setS({ ...s, unidade: x.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            </div>
            <Campo rot="Descrição"><textarea className="inp" value={s.descricao} onChange={(x) => setS({ ...s, descricao: x.target.value })} /></Campo>
          </>} />
      )}
      {aba === "usuarios" && pode("usuarios") && <ConfigUsuarios />}
      {aba === "historico" && pode("usuarios") && <ConfigHistorico />}
    </div>
  );
}

/* =========================================================
   MENU "MAIS"
   ========================================================= */
const NAV = [
  { k: "inicio", rot: "Início", ic: "home" },
  { k: "agenda", rot: "Agenda", ic: "cal" },
  { k: "clientes", rot: "Clientes", ic: "users" },
  { k: "propostas", rot: "Propostas", ic: "file" },
  { k: "os", rot: "Ordens de serviço", ic: "clip" },
  { k: "financeiro", rot: "Financeiro", ic: "wallet" },
  { k: "config", rot: "Configurações", ic: "cog" },
];
const EM_BREVE = [
  { rot: "Leads e funil de vendas", ic: "spark" },
  { rot: "Marketing", ic: "mega" },
  { rot: "Relatórios", ic: "chart" },
  { rot: "Área do cliente e site", ic: "globe" },
];

function PaginaMais() {
  const { ir, pode, perfil } = useApp();
  return (
    <div className="stack">
      <div className="ph" style={{ marginBottom: 0 }}><h1 className="h1">Mais opções</h1></div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="av">{iniciais(perfil.nome)}</div>
        <div className="row-main"><div className="row-t">{perfil.nome}</div><div className="row-s">{perfil.email} · {PAPEIS[perfil.papel]}</div></div>
        <button className="btn sm" onClick={() => signOut(auth)}><Ic n="logout" s={17} /> Sair</button>
      </div>
      <div className="mais">
        {NAV.filter((n) => pode(n.k)).map((n) => (
          <button key={n.k} onClick={() => ir(n.k)}><span className="av" style={{ width: 38, height: 38 }}><Ic n={n.ic} s={19} /></span>{n.rot}</button>
        ))}
      </div>
      <h3 className="grp-t">Chegando na próxima atualização</h3>
      <div className="mais">
        {EM_BREVE.map((n) => (
          <button key={n.rot} disabled><span className="av" style={{ width: 38, height: 38, background: "var(--off-s)", color: "var(--off)" }}><Ic n={n.ic} s={19} /></span>{n.rot}<small>Em breve</small></button>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   ESTRUTURA PRINCIPAL
   ========================================================= */
const MODAIS = {
  cliente: FormCliente, proposta: FormProposta, propVer: VerProposta, os: FormOS, osVer: VerOS,
  receber: FormReceber, pagar: ModalPagar, pagamentos: VerPagamentos, mensagem: ModalMensagem,
};

function Sistema({ perfil }) {
  const clientes = useColecao("clientes", true);
  const os = useColecao("os", true);
  const propostas = useColecao("propostas", true);
  const receber = useColecao("receber", true);
  const equipes = useColecao("equipes", true);
  const servicos = useColecao("servicos", true);
  const usuarios = useColecao("usuarios", perfil.papel === "admin");
  const [config, setConfig] = useState({});
  useEffect(() => onSnapshot(doc(db, "config", "sistema"), (s) => setConfig(s.exists() ? s.data() : {}), (e) => console.error(e)), []);
  useEffect(() => { document.title = config.empresaNome ? `${config.empresaNome} — Gestão` : "Gestão de limpeza"; }, [config.empresaNome]);

  const permitidas = PERMS[perfil.papel] || [];
  const pode = useMemo(() => (p) => permitidas.includes(p), [perfil.papel]); // eslint-disable-line react-hooks/exhaustive-deps
  const inicial = permitidas.includes("inicio") ? "inicio" : "agenda";
  const [nav, setNav] = useState({ pag: inicial, param: null });
  const ir = (pag, param = null) => { setNav({ pag, param }); window.scrollTo(0, 0); };

  const [modais, setModais] = useState([]);
  const abrir = (tipo, dados = {}) => setModais((m) => [...m, { tipo, dados, k: `${Date.now()}-${Math.random()}` }]);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const avisar = (t, erro = false) => {
    setToast({ t, erro }); clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3400);
  };

  const pendentesUsuarios = usuarios.filter((u) => u.papel === "pendente").length;
  const ctx = { perfil, config, clientes, os, propostas, receber, equipes, servicos, usuarios, ir, abrir, avisar, pode };

  let pag = nav.pag;
  const livre = ["mais", "cliente"];
  if (!livre.includes(pag) && !pode(pag)) pag = inicial;
  if (pag === "cliente" && !pode("clientes")) pag = inicial;

  const paginas = {
    inicio: <PaginaInicio />,
    agenda: <PaginaAgenda />,
    clientes: <PaginaClientes />,
    cliente: <PaginaCliente id={nav.param} />,
    propostas: <PaginaPropostas key={`p-${nav.param}`} filtroInicial={nav.param} />,
    os: <PaginaOS key={`o-${nav.param}`} filtroInicial={nav.param} />,
    financeiro: <PaginaFinanceiro key={`f-${nav.param}`} filtroInicial={nav.param} />,
    config: <PaginaConfig />,
    mais: <PaginaMais />,
  };
  const ativo = pag === "cliente" ? "clientes" : pag;

  let baixo = ["inicio", "agenda", "clientes", "propostas", "financeiro"].filter((k) => pode(k));
  if (baixo.length < 4 && pode("os")) baixo.push("os");
  baixo = baixo.slice(0, 5);
  const noMais = !baixo.includes(ativo);

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="marca">
            <div className="marca-ic">{config.logo ? <img src={config.logo} alt="" /> : <Ic n="sparkle" s={22} />}</div>
            <div style={{ minWidth: 0 }}><b>{config.empresaNome || "Sua empresa"}</b><small>Gestão de limpeza</small></div>
          </div>
          {NAV.filter((n) => pode(n.k)).map((n) => (
            <button key={n.k} className={`nav-i ${ativo === n.k ? "on" : ""}`} onClick={() => ir(n.k)}>
              <Ic n={n.ic} /> {n.rot}
              {n.k === "config" && pendentesUsuarios > 0 && <span className="bdg t-bad" style={{ marginLeft: "auto" }}>{pendentesUsuarios}</span>}
            </button>
          ))}
          <div className="nav-sep">Em breve</div>
          {EM_BREVE.map((n) => <div key={n.rot} className="nav-i soon"><Ic n={n.ic} /> {n.rot}</div>)}
          <div className="side-user">
            <div className="av" style={{ width: 36, height: 36 }}>{iniciais(perfil.nome)}</div>
            <div className="row-main"><div className="row-t" style={{ fontSize: 14 }}>{perfil.nome}</div><div className="row-s">{PAPEIS[perfil.papel]}</div></div>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => signOut(auth)} aria-label="Sair" title="Sair"><Ic n="logout" s={18} /></button>
          </div>
        </aside>

        <div className="main">
          <header className="top">
            <div className="top-logo">
              <div className="marca-ic" style={{ width: 34, height: 34, borderRadius: 10 }}>{config.logo ? <img src={config.logo} alt="" /> : <Ic n="sparkle" s={18} />}</div>
            </div>
            <BuscaGlobal />
            <Notificacoes />
          </header>
          <main className="page">{paginas[pag]}</main>
        </div>

        <nav className="bottom" aria-label="Menu principal">
          {baixo.map((k) => {
            const n = NAV.find((x) => x.k === k);
            return <button key={k} className={ativo === k ? "on" : ""} onClick={() => ir(k)}><Ic n={n.ic} s={22} />{k === "os" ? "OS" : n.rot}</button>;
          })}
          <button className={noMais ? "on" : ""} onClick={() => ir("mais")}><Ic n="menu" s={22} />Mais</button>
        </nav>
      </div>

      {modais.map((m) => {
        const Comp = MODAIS[m.tipo];
        if (!Comp) return null;
        return <Comp key={m.k} dados={m.dados} fechar={() => setModais((lista) => lista.filter((x) => x.k !== m.k))} />;
      })}
      {toast && <div className={`toast ${toast.erro ? "erro" : ""}`} role="status">{toast.t}</div>}
    </Ctx.Provider>
  );
}

/* =========================================================
   APP
   ========================================================= */
export default function App() {
  const [user, setUser] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const criando = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u || null); if (!u) { setPerfil(null); criando.current = false; } }), []);
  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(doc(db, "usuarios", user.uid), (s) => {
      if (s.exists()) setPerfil({ uid: user.uid, ...s.data() });
      else {
        setPerfil(null);
        if (!criando.current) { criando.current = true; criarPerfil(user, nomePendente).catch((e) => console.error(e)); }
      }
    }, (e) => console.error(e));
  }, [user]);

  let tela;
  if (user === undefined) tela = <Splash />;
  else if (!user) tela = <TelaLogin />;
  else if (!perfil) tela = <Splash texto="Preparando seu acesso..." />;
  else if (!PERMS[perfil.papel]) tela = <TelaPendente perfil={perfil} />;
  else tela = <Sistema perfil={perfil} />;

  return <><style>{CSS}</style>{tela}</>;
}
