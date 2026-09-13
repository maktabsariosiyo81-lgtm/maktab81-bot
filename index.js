// ========================================================
// 81-MAKTAB BAZASI — TELEGRAM BOT (Node.js, Render.com uchun)
// Ma'lumotlar Google Sheets'da saqlanadi (Apps Script Data API orqali)
// ========================================================

const express = require("express");
const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEETS_API_URL = process.env.SHEETS_API_URL;
const SHEETS_API_KEY = process.env.SHEETS_API_KEY;
const ADMIN_SETUP_CODE = process.env.ADMIN_SETUP_CODE || "ADMIN81MAKTAB2026";
const TG_API = "https://api.telegram.org/bot" + BOT_TOKEN + "/";

// ---------------- YORDAMCHI: SHEETS DATA API CHAQIRISH ----------------
async function callApi(action, params) {
  const body = Object.assign({ key: SHEETS_API_KEY, action: action }, params || {});
  const res = await fetch(SHEETS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow"
  });
  const data = await res.json();
  if (!data.ok) throw new Error("API xato: " + (data.error || "noma'lum"));
  return data.result;
}

// ---------------- TELEGRAM YORDAMCHI FUNKSIYALAR ----------------
async function sendMessage(chatId, text, keyboard) {
  const payload = { chat_id: chatId, text: text, parse_mode: "HTML" };
  if (keyboard) payload.reply_markup = keyboard;
  await fetch(TG_API + "sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
async function answerCallback(callbackId) {
  await fetch(TG_API + "answerCallbackQuery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId })
  });
}
async function deleteMessage(chatId, messageId) {
  try {
    await fetch(TG_API + "deleteMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
  } catch (e) { /* eski xabar o'chmasa ham muammo emas */ }
}
function btnRows(items) {
  return { inline_keyboard: items.map(i => [{ text: i[0], callback_data: i[1] }]) };
}
function replyKeyboard(items) {
  // items: ["Matn1","Matn2",...] -> har biri alohida qatorda, doim pastda ko'rinadi
  return { keyboard: items.map(i => [{ text: i }]), resize_keyboard: true, is_persistent: true };
}

// ---------------- HOLAT (STATE) — xotirada saqlanadi ----------------
const stateMap = new Map();
function getState(chatId) { return stateMap.get(chatId) || null; }
function setState(chatId, obj) { stateMap.set(chatId, obj); }
function clearState(chatId) { stateMap.delete(chatId); }

// ---------------- MENYULAR ----------------
function showAdminMenu(chatId) {
  return sendMessage(chatId, "👑 <b>Admin panel</b>\nQuyidagi tugmalardan birini tanlang:", replyKeyboard([
    "➕ O'qituvchi qo'shish",
    "📋 Barcha o'qituvchilar",
    "🔍 Filtr bo'yicha qidirish"
  ]));
}
function showTeacherMenu(chatId, fio) {
  return sendMessage(chatId, "👋 Salom, <b>" + fio + "</b>!\nQaysi bo'limni to'ldirmoqchisiz?", replyKeyboard([
    "1️⃣ Pasport va ish ma'lumotlari",
    "2️⃣ Toifa",
    "3️⃣ Malaka oshirish",
    "4️⃣ Fan bo'yicha sertifikat",
    "5️⃣ Diplom"
  ]));
}

// ---------------- WEBHOOK ----------------
app.post("/webhook", async (req, res) => {
  res.send("ok"); // Telegram'ga darhol javob — sekinlik/302 muammosi bo'lmaydi
  try {
    const update = req.body;
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (err) {
    console.error("XATO:", err);
  }
});
app.get("/", (req, res) => res.send("Bot ishlayapti ✅"));

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text === "/start") {
    clearState(chatId);
    const adminCheck = await callApi("isAdmin", { chatId });
    if (adminCheck.isAdmin) { await showAdminMenu(chatId); return; }
    const link = await callApi("findByChatId", { chatId });
    if (link) { await showTeacherMenu(chatId, link.fio); return; }
    await sendMessage(chatId, "Assalomu alaykum! Botdan foydalanish uchun sizga berilgan <b>kodni</b> kiriting.");
    return;
  }

  if (text.toUpperCase() === ADMIN_SETUP_CODE) {
    await callApi("addAdmin", { chatId });
    await sendMessage(chatId, "✅ Siz admin sifatida ro'yxatdan o'tdingiz.");
    await showAdminMenu(chatId);
    return;
  }

  const state = getState(chatId);

  if (text === "➕ O'qituvchi qo'shish") {
    setState(chatId, { step: "admin_awaiting_fio" });
    await sendMessage(chatId, "Yangi o'qituvchining F.I.Sh. ni to'liq kiriting:");
    return;
  }
  if (text === "📋 Barcha o'qituvchilar") {
    const list = await callApi("listTeachers", {});
    if (!list.length) { await sendMessage(chatId, "Hozircha o'qituvchilar yo'q."); return; }
    await sendMessage(chatId, "O'qituvchini tanlang:", btnRows(list.map(t => [t.fio, "profile_" + t.bazaRow])));
    return;
  }
  if (text === "🔍 Filtr bo'yicha qidirish") {
    await sendMessage(chatId, "Qaysi mezon bo'yicha qidiramiz?", btnRows([
      ["Toifa", "filt_toifa"], ["Fan bo'yicha sertifikat", "filt_sert"],
      ["Malaka oshirish", "filt_mok"], ["Diplom", "filt_diplom"]
    ]));
    return;
  }
  const sectionLabels = {
    "1️⃣ Pasport va ish ma'lumotlari": "sec_1",
    "2️⃣ Toifa": "sec_2",
    "3️⃣ Malaka oshirish": "sec_3",
    "4️⃣ Fan bo'yicha sertifikat": "sec_4",
    "5️⃣ Diplom": "sec_5"
  };
  if (sectionLabels[text]) {
    const link = await callApi("findByChatId", { chatId });
    if (!link) { await sendMessage(chatId, "Avval kodingizni kiriting. /start"); return; }
    startWizard(chatId, sectionLabels[text], link.bazaRow);
    await askCurrentStep(chatId, getState(chatId));
    return;
  }

  if (state && state.step === "admin_awaiting_fio") {
    const r = await callApi("addTeacher", { fio: text });
    clearState(chatId);
    await sendMessage(chatId, "✅ O'qituvchi qo'shildi!\n\nF.I.Sh.: <b>" + text + "</b>\nKod: <b>" + r.kod + "</b>\n\nShu kodni o'qituvchiga bering.");
    await showAdminMenu(chatId);
    return;
  }

  if (!state) {
    const adminCheck = await callApi("isAdmin", { chatId });
    if (!adminCheck.isAdmin) {
      const existingLink = await callApi("findByChatId", { chatId });
      if (!existingLink) {
        const link = await callApi("linkChat", { kod: text, chatId });
        if (link.ok) {
          await sendMessage(chatId, "✅ Kod qabul qilindi!");
          await showTeacherMenu(chatId, link.fio);
        } else if (link.reason === "already_used") {
          await sendMessage(chatId, "Bu kod allaqachon ishlatilgan. /start bosing.");
        } else {
          await sendMessage(chatId, "❌ Kod topilmadi. Qaytadan urinib ko'ring.");
        }
        return;
      }
    }
  }

  if (state && state.section) {
    await processWizardText(chatId, state, text);
    return;
  }

  await sendMessage(chatId, "Buyruqni tushunmadim. /start ni bosing.");
}

async function handleCallback(cq) {
  const chatId = cq.message.chat.id;
  const data = cq.data;
  answerCallback(cq.id);
  deleteMessage(chatId, cq.message.message_id); // tugma bosilgan xabarni o'chirib, chatni toza saqlaymiz

  if (data === "admin_add") {
    setState(chatId, { step: "admin_awaiting_fio" });
    await sendMessage(chatId, "Yangi o'qituvchining F.I.Sh. ni to'liq kiriting:");
    return;
  }
  if (data === "admin_list") {
    const list = await callApi("listTeachers", {});
    if (!list.length) { await sendMessage(chatId, "Hozircha o'qituvchilar yo'q."); return; }
    await sendMessage(chatId, "O'qituvchini tanlang:", btnRows(list.map(t => [t.fio, "profile_" + t.bazaRow])));
    return;
  }
  if (data.startsWith("profile_")) {
    const bazaRow = parseInt(data.split("_")[1]);
    await sendProfile(chatId, bazaRow);
    return;
  }
  if (data === "admin_filter") {
    await sendMessage(chatId, "Qaysi mezon bo'yicha qidiramiz?", btnRows([
      ["Toifa", "filt_toifa"], ["Fan bo'yicha sertifikat", "filt_sert"],
      ["Malaka oshirish", "filt_mok"], ["Diplom", "filt_diplom"]
    ]));
    return;
  }
  if (data === "filt_toifa") {
    await sendMessage(chatId, "Toifani tanlang:", btnRows([
      ["Oliy","fv_toifa_Oliy"],["Birinchi","fv_toifa_Birinchi"],
      ["Ikkinchi","fv_toifa_Ikkinchi"],["Mutaxassis","fv_toifa_Mutaxassis"]
    ]));
    return;
  }
  if (data === "filt_mok") {
    await sendMessage(chatId, "Qaysi holatni ko'rsatay?", btnRows([["O'tganlar","fv_mok_otgan"],["O'tmaganlar","fv_mok_otmagan"]]));
    return;
  }
  if (data === "filt_sert") {
    await sendMessage(chatId, "Turi bo'yicha tanlang:", btnRows([["Xalqaro","fv_sertturi_Xalqaro"],["Milliy","fv_sertturi_Milliy"]]));
    return;
  }
  if (data === "filt_diplom") {
    await sendMessage(chatId, "Diplom holatini tanlang:", btnRows([
      ["Oliy","fv_diplom_Oliy"],["Tugallanmagan oliy","fv_diplom_Tugallanmagan oliy"],["O'rta maxsus","fv_diplom_O'rta maxsus"]
    ]));
    return;
  }
  if (data.startsWith("fv_toifa_")) {
    const val = data.replace("fv_toifa_", "");
    const rows = await callApi("filterEq", { colName: "TOIFA", value: val, outCols: ["FIO","TOIFA_SERIYA","TOIFA_RAQAM","TOIFA_BERILGAN","TOIFA_TUGASH"] });
    const lines = rows.map(r => `${r.FIO} | Seriya: ${r.TOIFA_SERIYA||"-"} Raqam: ${r.TOIFA_RAQAM||"-"} | Berilgan: ${r.TOIFA_BERILGAN||"-"} Tugash: ${r.TOIFA_TUGASH||"-"}`);
    await sendMessage(chatId, lines.length ? lines.join("\n\n") : "Natija topilmadi.");
    return;
  }
  if (data.startsWith("fv_mok_")) {
    const mode = data === "fv_mok_otgan" ? "otgan" : "otmagan";
    const rows = await callApi("filterMok", { mode });
    const lines = rows.map(r => `${r.fio} — ${r.vaqt}`);
    await sendMessage(chatId, lines.length ? lines.join("\n") : "Natija topilmadi.");
    return;
  }
  if (data.startsWith("fv_sertturi_")) {
    const val = data.replace("fv_sertturi_", "");
    const rows = await callApi("filterEq", { colName: "SERT_TURI", value: val, outCols: ["FIO","SERT_FAN","SERT_DARAJA","SERT_SERIYA"] });
    const lines = rows.map(r => `${r.FIO} | Fan: ${r.SERT_FAN||"-"} Daraja: ${r.SERT_DARAJA||"-"} Seriya: ${r.SERT_SERIYA||"-"}`);
    await sendMessage(chatId, lines.length ? lines.join("\n\n") : "Natija topilmadi.");
    return;
  }
  if (data.startsWith("fv_diplom_")) {
    const val = data.replace("fv_diplom_", "");
    const rows = await callApi("filterEq", { colName: "DIPLOM_MALUMOTI", value: val, outCols: ["FIO","OTM","MUTAXASSISLIK","DIPLOM_SERIYA"] });
    const lines = rows.map(r => `${r.FIO} | OTM: ${r.OTM||"-"} Mutaxassislik: ${r.MUTAXASSISLIK||"-"} Seriya: ${r.DIPLOM_SERIYA||"-"}`);
    await sendMessage(chatId, lines.length ? lines.join("\n\n") : "Natija topilmadi.");
    return;
  }
  if (data.startsWith("sec_")) {
    const link = await callApi("findByChatId", { chatId });
    if (!link) { await sendMessage(chatId, "Avval kodingizni kiriting. /start"); return; }
    startWizard(chatId, data, link.bazaRow);
    await askCurrentStep(chatId, getState(chatId));
    return;
  }
  if (data.startsWith("wv_")) {
    const state = getState(chatId);
    if (state && state.section) {
      const val = data.substring(3);
      await processWizardAnswer(chatId, state, val);
    }
    return;
  }
}

async function sendProfile(chatId, bazaRow) {
  const d = await callApi("readRow", { bazaRow });
  let t = `👤 <b>${d.FIO}</b>\n\n📌 <b>Shaxsiy:</b>\nTug'ilgan sana: ${d.TUGSANA||"-"}\nJinsi: ${d.JINSI||"-"}\nPasport: ${d.PASSPORT||"-"}\nJSHSHIR: ${d.JSHSHIR||"-"}\nTelefon: ${d.TELEFON||"-"}`;
  t += `\n\n💼 <b>Ish:</b>\nLavozimi: ${d.LAVOZIM||"-"}\nFani: ${d.FAN||"-"}\nStaji: ${d.STAJ||"-"}`;
  t += `\n\n🏅 <b>Toifa:</b> ${d.TOIFA||"-"}`;
  if (d.TOIFA && d.TOIFA !== "Mutaxassis") {
    t += `\nSeriya-raqam: ${d.TOIFA_SERIYA||"-"} ${d.TOIFA_RAQAM||""}\nBerilgan: ${d.TOIFA_BERILGAN||"-"} — Tugash: ${d.TOIFA_TUGASH||"-"}`;
  }
  t += `\n\n📚 <b>Malaka oshirish:</b> ${d.MOK_VAQT||"-"}${d.MOK_HUJJAT ? " ("+d.MOK_HUJJAT+")" : ""}`;
  t += `\n\n📜 <b>Fan sertifikati:</b> ${d.SERT_BORMI||"Yo'q"}`;
  if (d.SERT_BORMI === "Ha") {
    t += `\nTuri: ${d.SERT_TURI||"-"}, Fani: ${d.SERT_FAN||"-"}\nBall: ${d.SERT_BALL||"-"}, Daraja: ${d.SERT_DARAJA||"-"}\nSeriya-raqami: ${d.SERT_SERIYA||"-"}`;
  }
  t += `\n\n🎓 <b>Diplom:</b> ${d.DIPLOM_MALUMOTI||"-"}`;
  if (d.DIPLOM_MALUMOTI === "Tugallanmagan oliy") {
    t += `\nO'qiyotgan joyi: ${d.OTM||"-"}\nKursi: ${d.TALIM_SHAKLI||"-"}`;
  } else if (d.DIPLOM_MALUMOTI) {
    t += `\nTa'lim shakli: ${d.TALIM_SHAKLI||"-"}, Darajasi: ${d.DARAJASI||"-"}\nOTM: ${d.OTM||"-"}\nMutaxassislik: ${d.MUTAXASSISLIK||"-"}\nSeriya-raqami: ${d.DIPLOM_SERIYA||"-"}, Sana: ${d.DIPLOM_SANA||"-"}`;
    if (d.NOSTRIFIKATSIYA) t += `\nNostrifikatsiya: ${d.NOSTRIFIKATSIYA}`;
  }
  await sendMessage(chatId, t);
}

// ---------------- WIZARD ----------------
function startWizard(chatId, sectionCode, bazaRow) {
  const section = sectionCode.replace("sec_", "");
  setState(chatId, { section, bazaRow, step: 1, data: {} });
}

async function askCurrentStep(chatId, state) {
  const s = state.section, step = state.step;

  if (s === "1") {
    if (step===1) return sendMessage(chatId, "Tug'ilgan sanangizni kiriting (masalan 14.05.1990):");
    if (step===2) return sendMessage(chatId, "Jinsingizni tanlang:", btnRows([["Erkak","wv_Erkak"],["Ayol","wv_Ayol"]]));
    if (step===3) return sendMessage(chatId, "Pasport ma'lumotini kiriting (seriya va raqam):");
    if (step===4) return sendMessage(chatId, "JSHSHIR raqamingizni kiriting:");
    if (step===5) return sendMessage(chatId, "Telefon raqamingizni kiriting:");
    if (step===6) return sendMessage(chatId, "Lavozimingizni tanlang:", btnRows([
      ["O'qituvchi","wv_O'qituvchi"],["MM (metod birlashma)","wv_MM"],["Direktor","wv_Direktor"],["O'IBDO'","wv_O'IBDO'"],["Psixolog","wv_Psixolog"]
    ]));
    if (step===7) return sendMessage(chatId, "Dars beradigan faningizni kiriting:");
    if (step===8) return sendMessage(chatId, "Pedagogik stajingizni kiriting (necha yil):");
  }
  else if (s === "2") {
    if (step===1) return sendMessage(chatId, "Toifangizni tanlang:", btnRows([
      ["Oliy","wv_Oliy"],["Birinchi","wv_Birinchi"],["Ikkinchi","wv_Ikkinchi"],["Mutaxassis","wv_Mutaxassis"]
    ]));
    if (step===2) return sendMessage(chatId, "Toifa olgan faningizni kiriting:");
    if (step===3) return sendMessage(chatId, "Sertifikat seriyasini kiriting:");
    if (step===4) return sendMessage(chatId, "Sertifikat raqamini kiriting:");
    if (step===5) return sendMessage(chatId, "Qachon olingan (sana)?:");
    if (step===6) return sendMessage(chatId, "Qachon tugaydi (sana)?:");
  }
  else if (s === "3") {
    if (step===1) return sendMessage(chatId, "Malaka oshirish (MOK) kursidan o'tganmisiz?", btnRows([["Ha","wv_Ha"],["Yo'q","wv_Yoq"]]));
    if (step===2) return sendMessage(chatId, "Qaysi yili o'tgansiz?:");
    if (step===3) return sendMessage(chatId, "Hujjat raqamini kiriting:");
  }
  else if (s === "4") {
    if (step===1) return sendMessage(chatId, "Fan bo'yicha sertifikatingiz bormi?", btnRows([["Ha","wv_Ha"],["Yo'q","wv_Yoq"]]));
    if (step===2) return sendMessage(chatId, "Sertifikat turi:", btnRows([["Xalqaro","wv_Xalqaro"],["Milliy","wv_Milliy"]]));
    if (step===3 && state.data.turi==="Xalqaro") return sendMessage(chatId, "Darajasini kiriting (erkin matn):");
    if (step===3 && state.data.turi==="Milliy") return sendMessage(chatId, "Darajani tanlang:", btnRows([
      ["C","wv_C"],["C+","wv_C+"],["B","wv_B"],["B+","wv_B+"],["A","wv_A"],["A+","wv_A+"]
    ]));
    if (step===4) return sendMessage(chatId, "Qaysi fandan sertifikat olgansiz?:");
    if (step===5) return sendMessage(chatId, "Ball(natija)ni kiriting:");
    if (step===6) return sendMessage(chatId, "Sertifikat seriya-raqamini kiriting:");
  }
  else if (s === "5") {
    if (step===1) return sendMessage(chatId, "Ma'lumotingizni tanlang:", btnRows([
      ["Oliy","wv_Oliy"],["Tugallanmagan oliy","wv_Tugallanmagan oliy"],["O'rta maxsus","wv_O'rta maxsus"]
    ]));
    if (state.data.malumoti === "Tugallanmagan oliy") {
      if (step===2) return sendMessage(chatId, "Hozir qayerda o'qiyapsiz (OTM nomi)?:");
      if (step===3) return sendMessage(chatId, "Necha kursda o'qiysiz?:");
    } else {
      if (step===2) return sendMessage(chatId, "Ta'lim shaklini tanlang:", btnRows([["Kunduzgi","wv_Kunduzgi"],["Sirtqi","wv_Sirtqi"],["Kechki","wv_Kechki"]]));
      if (step===3) return sendMessage(chatId, "Darajasini tanlang:", btnRows([["Bakalavr","wv_Bakalavr"],["Magistr","wv_Magistr"]]));
      if (step===4) return sendMessage(chatId, "Tugatgan OTM nomini kiriting:");
      if (step===5) return sendMessage(chatId, "Mutaxassisligingizni kiriting:");
      if (step===6) return sendMessage(chatId, "Diplom seriya-raqamini kiriting:");
      if (step===7) return sendMessage(chatId, "Diplom berilgan sanasini kiriting:");
      if (step===8) return sendMessage(chatId, "Agar chet el diplomi bo'lsa, nostrifikatsiya ma'lumotini kiriting. Bo'lmasa \"yo'q\" deb yozing:");
    }
  }
}

async function processWizardText(chatId, state, text) {
  saveAnswer(state, text);
  await advance(chatId, state);
}
async function processWizardAnswer(chatId, state, val) {
  saveAnswer(state, val);
  await advance(chatId, state);
}

function saveAnswer(state, val) {
  const s = state.section, step = state.step;
  if (s==="1") { const m={1:"tugsana",2:"jinsi",3:"passport",4:"jshshir",5:"telefon",6:"lavozim",7:"fan",8:"staj"}; state.data[m[step]] = val; }
  else if (s==="2") { const m={1:"toifa",2:"toifafan",3:"seriya",4:"raqam",5:"berilgan",6:"tugash"}; state.data[m[step]] = val; }
  else if (s==="3") { const m={1:"otganmi",2:"yil",3:"hujjat"}; state.data[m[step]] = val; }
  else if (s==="4") { const m={1:"bormi",2:"turi",3:"daraja",4:"fan",5:"ball",6:"seriya"}; state.data[m[step]] = val; }
  else if (s==="5") {
    if (step===1) state.data.malumoti = val;
    else if (state.data.malumoti === "Tugallanmagan oliy") { const m={2:"otm",3:"kurs"}; state.data[m[step]] = val; }
    else { const m={2:"shakl",3:"daraja",4:"otm",5:"mutaxassislik",6:"seriya",7:"sana",8:"nostrifikatsiya"}; state.data[m[step]] = val; }
  }
}

async function advance(chatId, state) {
  const s = state.section;
  let finished = false;

  if (s==="1") { if (state.step>=8) finished=true; else state.step++; }
  else if (s==="2") {
    if (state.step===1 && state.data.toifa==="Mutaxassis") finished = true;
    else if (state.step>=6) finished = true; else state.step++;
  }
  else if (s==="3") {
    if (state.step===1 && state.data.otganmi==="Yoq") finished = true;
    else if (state.step>=3) finished = true; else state.step++;
  }
  else if (s==="4") {
    if (state.step===1 && state.data.bormi==="Yoq") finished = true;
    else if (state.step>=6) finished = true; else state.step++;
  }
  else if (s==="5") {
    if (state.data.malumoti === "Tugallanmagan oliy") { if (state.step>=3) finished=true; else state.step++; }
    else { if (state.step>=8) finished=true; else state.step++; }
  }

  if (finished) await saveToBaza(chatId, state);
  else { setState(chatId, state); await askCurrentStep(chatId, state); }
}

async function saveToBaza(chatId, state) {
  const row = state.bazaRow, d = state.data, s = state.section;
  let fields = {};

  if (s==="1") {
    fields = { TUGSANA:d.tugsana, JINSI:d.jinsi, PASSPORT:d.passport, JSHSHIR:d.jshshir, TELEFON:d.telefon, LAVOZIM:d.lavozim, FAN:d.fan, STAJ:d.staj };
  } else if (s==="2") {
    if (d.toifa === "Mutaxassis") {
      fields = { TOIFA:d.toifa, TOIFA_FAN:"", TOIFA_SERIYA:"", TOIFA_RAQAM:"", TOIFA_BERILGAN:"", TOIFA_TUGASH:"" };
    } else {
      fields = { TOIFA:d.toifa, TOIFA_FAN:d.toifafan, TOIFA_SERIYA:d.seriya, TOIFA_RAQAM:d.raqam, TOIFA_BERILGAN:d.berilgan, TOIFA_TUGASH:d.tugash };
    }
  } else if (s==="3") {
    if (d.otganmi === "Yoq") fields = { MOK_VAQT:"O'tmagan", MOK_HUJJAT:"" };
    else fields = { MOK_VAQT:d.yil, MOK_HUJJAT:d.hujjat };
  } else if (s==="4") {
    if (d.bormi === "Yoq") fields = { SERT_BORMI:"Yo'q", SERT_TURI:"", SERT_FAN:"", SERT_BALL:"", SERT_DARAJA:"", SERT_SERIYA:"" };
    else fields = { SERT_BORMI:"Ha", SERT_TURI:d.turi, SERT_FAN:d.fan, SERT_BALL:d.ball, SERT_DARAJA:d.daraja, SERT_SERIYA:d.seriya };
  } else if (s==="5") {
    if (d.malumoti === "Tugallanmagan oliy") {
      fields = { DIPLOM_MALUMOTI:d.malumoti, OTM:d.otm, TALIM_SHAKLI:(d.kurs+"-kurs"), DARAJASI:"", MUTAXASSISLIK:"", DIPLOM_SERIYA:"", DIPLOM_SANA:"", NOSTRIFIKATSIYA:"" };
    } else {
      fields = { DIPLOM_MALUMOTI:d.malumoti, TALIM_SHAKLI:d.shakl, DARAJASI:d.daraja, OTM:d.otm, MUTAXASSISLIK:d.mutaxassislik, DIPLOM_SERIYA:d.seriya, DIPLOM_SANA:d.sana, NOSTRIFIKATSIYA:(d.nostrifikatsiya==="yo'q"?"":d.nostrifikatsiya) };
    }
  }

  await callApi("writeFields", { bazaRow: row, fields });
  clearState(chatId);
  await sendMessage(chatId, "✅ Ma'lumot saqlandi!");
  const link = await callApi("findByChatId", { chatId });
  await showTeacherMenu(chatId, link.fio);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Bot server ishga tushdi, port:", PORT));
