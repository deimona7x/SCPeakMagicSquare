import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, limit, addDoc, writeBatch, getDocs, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDu6GPNdju2yBssczjLvtkPPfwrlKo7ltw",
    authDomain: "picosecretotracker.firebaseapp.com",
    projectId: "picosecretotracker",
    storageBucket: "picosecretotracker.firebasestorage.app",
    messagingSenderId: "568151364129",
    appId: "1:568151364129:web:c478efff3ca62d4c000960"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// State
let currentUser = null;
let currentServerView = null;
let currentFloor = 7;
let timersData = { 7: {}, 8: {}, 9: {}, 10: {} };
let activityLogs = [];
let unsubTimers = null;
let unsubLogs = null;
let unsubSchedule = null;

// CORRIGIDO: controla se a vista do log foi manualmente limpa
let logViewCleared = false;

// Timer metadata
const timerMeta = {
    'ama-esq': { label: 'Ama Esq', chipClass: 'chip-yellow' },
    'ama-dir': { label: 'Ama Dir', chipClass: 'chip-yellow' },
    'verde-norte': { label: 'Verde Norte', chipClass: 'chip-green' },
    'verde-esq': { label: 'Verde Esq', chipClass: 'chip-green' },
    'verde-sul': { label: 'Verde Sul', chipClass: 'chip-green' },
    'verde-dir': { label: 'Verde Dir', chipClass: 'chip-green' },
    'minerio': { label: 'Minério', chipClass: 'chip-gold' },
    'planta': { label: 'Planta', chipClass: 'chip-gold' },
    'lider1': { label: 'Líder 1', chipClass: 'chip-purple' },
    'lider2': { label: 'Líder 2', chipClass: 'chip-purple' },
    'lider3': { label: 'Líder 3', chipClass: 'chip-purple' },
};

// Sub-Events Configuration
const subEventOptions = {
    "BOSS RED PICO / BOSS RED SP": ["10:00", "13:00", "16:00", "19:00", "22:00", "01:00", "04:00", "07:00"],
    "LÍDER 3 PRAÇA / LEADER 3 MS": ["09:00", "12:00", "15:00", "18:00", "21:00", "00:00", "03:00", "06:00"],
    "WORLDBOSS": ["10:00", "12:00", "20:00", "22:00", "00:00"],
    "EVENTOS GLOBAIS / GLOBAL EVENTS": [
        "Guerra Vale (Quarta-feira) // Valley War (Wednesday)",
        "Defesa Cristal (Quinta-feira) // Crystal Defense (Thursday)",
        "Saque (Sexta-feira) // Heist (Friday)",
        "Expedição Boss (Terça-feira) // Boss Expedition (Tuesday)",
        "Expedição Guerra (Quarta-feira) // Expedition War (Wednesday)",
        "Expedição Cristal (Quinta-feira) // Expedition Crystal (Thursday)",
        "Expedição Saque (Sexta-feira) // Expedition Heist (Friday)",
        "Bosses Mundiais / World Bosses (Krukan, Nerkan, Turkan, Utukan, Helbar)"
    ],
    "TORRE": ["11:00", "17:00", "23:00"],
    "PURGATÓRIO / PURGATORY": ["00:00", "06:00", "12:00", "18:00"]
};

// ============================================
// CORRIGIDO: Som de alerta gerado via Web Audio API (sem base64 corrompido)
// ============================================
function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) { console.warn('Audio não disponível:', e); }
}

// ============================================
// CORRIGIDO: Solicitar permissão de notificação explicitamente
// ============================================
window.requestNotificationPermission = async function () {
    if (!('Notification' in window)) {
        alert('Seu navegador não suporta notificações.');
        return;
    }
    const permission = await Notification.requestPermission();
    const btn = document.getElementById('btnNotification');
    if (permission === 'granted') {
        if (btn) btn.textContent = '🔔';
        alert('Alertas de boss ativados!');
    } else {
        if (btn) btn.textContent = '🔕';
        alert('Permissão negada. Você não receberá alertas de boss.');
    }
};

// Atualiza ícone do botão de notificação conforme permissão atual
function updateNotificationBtn() {
    const btn = document.getElementById('btnNotification');
    if (!btn) return;
    if (!('Notification' in window)) { btn.style.display = 'none'; return; }
    btn.textContent = Notification.permission === 'granted' ? '🔔' : '🔕';
}

// ============================================
// INITIALIZATION — CORRIGIDO: unificado em um único DOMContentLoaded
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(updateActiveTimers, 1000);
    setInterval(checkAlerts, 5000);

    updateNotificationBtn();

    // Schedule save events
    document.querySelectorAll('.schedule-input').forEach(input => {
        if (input.id !== 'presenceEvent' && input.id !== 'presenceSubEvent') {
            input.addEventListener('change', saveSchedule);
            input.addEventListener('blur', saveSchedule);
        }
    });

    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('theme-light');
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.textContent = '🌙';
    }

    // Presence module setup - apenas configurar o select de eventos
    const presenceEventSelect = document.getElementById('presenceEvent');
    const subEventContainer = document.getElementById('subEventContainer');
    const presenceSubEventSelect = document.getElementById('presenceSubEvent');
    const subEventLabel = document.getElementById('subEventLabel');

    if (presenceEventSelect) {
        presenceEventSelect.addEventListener('change', function () {
            const ev = this.value;
            if (subEventOptions[ev]) {
                presenceSubEventSelect.innerHTML = '<option value="">Selecione...</option>';
                subEventOptions[ev].forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o; opt.textContent = o;
                    presenceSubEventSelect.appendChild(opt);
                });
                subEventLabel.textContent = ev === "EVENTOS GLOBAIS / GLOBAL EVENTS" ? "Evento Específico *" : "Horário do Servidor (Server Time) *";
                subEventContainer.style.display = 'flex';
            } else {
                subEventContainer.style.display = 'none';
            }
        });
    }

    // Boss icon — modo MASTER
    const bossIcon = document.querySelector('.boss-icon');
    if (bossIcon) {
        bossIcon.style.cursor = 'pointer';
        bossIcon.addEventListener('click', window.promptMasterServer);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            currentUser = {
                uid: user.uid,
                email: user.email,
                nickname: data.nickname,
                block: data.block,
                server: data.server,
                role: data.role || 'user'
            };
            currentServerView = currentUser.server;

            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            updateHeader();
            
            // Mostra Relatório Semanal apenas para MASTER
            const tabRanking = document.getElementById('tabRanking');
            if (tabRanking) {
                tabRanking.style.display = currentUser.role === 'MASTER' ? 'block' : 'none';
            }

            changeFloor(7);
            listenToServerData();
        }
    } else {
        currentUser = null;
        currentServerView = null;
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginModal').style.display = 'flex';

        if (unsubTimers) unsubTimers();
        if (unsubLogs) unsubLogs();
        if (unsubSchedule) unsubSchedule();
    }
});

function updateHeader() {
    if (!currentUser) return;
    document.getElementById('displayNickname').textContent = currentUser.nickname;
    let serverText = currentServerView;
    if (currentUser.role === 'MASTER') serverText += ' 👑';
    document.getElementById('displayServer').textContent = serverText;
}

function listenToServerData() {
    if (!currentServerView) return;

    if (unsubTimers) unsubTimers();
    if (unsubLogs) unsubLogs();
    if (unsubSchedule) unsubSchedule();

    const timersDoc = doc(db, "servers", currentServerView, "data", "timers");
    unsubTimers = onSnapshot(timersDoc, (docSnap) => {
        if (docSnap.exists()) timersData = docSnap.data();
        else timersData = { 7: {}, 8: {}, 9: {}, 10: {} };
        refreshTimerDisplay();
        updateActiveTimers();
    });

    const logsRef = collection(db, "servers", currentServerView, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
    unsubLogs = onSnapshot(q, (snapshot) => {
        activityLogs = [];
        snapshot.forEach((doc) => activityLogs.push(doc.data()));
        // CORRIGIDO: só renderiza logs se a vista não foi limpa manualmente
        if (!logViewCleared) renderLogs();
    });

    const scheduleDoc = doc(db, "servers", currentServerView, "data", "schedule");
    unsubSchedule = onSnapshot(scheduleDoc, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data().inputs || {};
            document.querySelectorAll('.schedule-input').forEach(input => {
                if (input.id !== 'presenceEvent' && input.id !== 'presenceSubEvent' && data[input.id] !== undefined) {
                    input.value = data[input.id];
                }
            });
        }
    });
}

window.toggleTheme = function () {
    const isLight = document.body.classList.toggle('theme-light');
    const themeBtn = document.getElementById('themeToggleBtn');
    if (isLight) {
        localStorage.setItem('theme', 'light');
        if (themeBtn) themeBtn.textContent = '🌙';
    } else {
        localStorage.setItem('theme', 'dark');
        if (themeBtn) themeBtn.textContent = '☀️';
    }
};

window.switchAuthTab = function (tabName) {
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.auth-form-container').forEach(form => form.classList.remove('active'));
    if (tabName === 'login') {
        document.querySelectorAll('.auth-tab')[0].classList.add('active');
        document.getElementById('formLogin').classList.add('active');
    } else {
        document.querySelectorAll('.auth-tab')[1].classList.add('active');
        document.getElementById('formRegister').classList.add('active');
    }
};

window.performLogin = async function () {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    if (!email || !password) { alert('Por favor, preencha E-mail e Senha.'); return; }
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (error) { alert('Erro ao fazer login: ' + error.message); }
};

window.performRegister = async function () {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const nickname = document.getElementById('regNickname').value.trim();
    const block = document.getElementById('regBlock').value;
    const server = document.getElementById('regServer').value.trim();

    if (!email || !password || !nickname || !block || !server) { alert('Por favor, preencha todos os campos.'); return; }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            email, nickname, block, server, role: 'user', createdAt: Date.now()
        });
    } catch (error) { alert('Erro ao cadastrar: ' + error.message); }
};

window.performLogout = async function () {
    if (!confirm('Tem certeza que deseja sair desta conta?')) return;
    try { await signOut(auth); window.switchAuthTab('login'); } catch (error) { console.error(error); }
};

window.switchMainTab = function (tabName) {
    document.getElementById('tabTimers').classList.remove('active');
    document.getElementById('tabSchedule').classList.remove('active');
    document.getElementById('tabPresence').classList.remove('active');
    document.getElementById('tabRanking').classList.remove('active');

    document.getElementById('floorNav').style.display = 'none';
    document.getElementById('activeTimersBar').style.display = 'none';
    document.getElementById('mainGrid').style.display = 'none';
    document.getElementById('scheduleContainer').style.display = 'none';
    document.getElementById('presenceContainer').style.display = 'none';
    document.getElementById('rankingContainer').style.display = 'none';

    if (tabName === 'timers') {
        document.getElementById('tabTimers').classList.add('active');
        document.getElementById('floorNav').style.display = 'flex';
        document.getElementById('activeTimersBar').style.display = 'flex';
        document.getElementById('mainGrid').style.display = 'grid';
    } else if (tabName === 'schedule') {
        document.getElementById('tabSchedule').classList.add('active');
        document.getElementById('scheduleContainer').style.display = 'block';
    } else if (tabName === 'presence') {
        document.getElementById('tabPresence').classList.add('active');
        document.getElementById('presenceContainer').style.display = 'block';
    } else if (tabName === 'ranking') {
        document.getElementById('tabRanking').classList.add('active');
        document.getElementById('rankingContainer').style.display = 'block';
        window.loadWeeklyRanking();
    }
};

window.changeFloor = function (floor) {
    currentFloor = floor;
    // CORRIGIDO: quando muda de piso, reativa a exibição de logs
    logViewCleared = false;
    document.getElementById('currentFloorLog').textContent = floor;
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(floor)) btn.classList.add('active');
    });
    refreshTimerDisplay();
    updateActiveTimers();
    renderLogs();
};

window.registerKill = async function (bossId, cooldownMinutes) {
    if (!currentUser || !currentServerView) return;
    const now = new Date();
    const respawnTime = new Date(now.getTime() + cooldownMinutes * 60 * 1000);

    if (!timersData[currentFloor]) timersData[currentFloor] = {};
    timersData[currentFloor][bossId] = {
        killedAt: now.getTime(), respawnAt: respawnTime.getTime(), cooldown: cooldownMinutes, notified: false
    };

    refreshTimerDisplay();
    updateActiveTimers();

    try {
        await setDoc(doc(db, "servers", currentServerView, "data", "timers"), timersData, { merge: true });
        const meta = timerMeta[bossId];
        if (meta) await logActivity('marcou', meta.label);
    } catch (error) { console.error("Erro ao salvar timer:", error); }
};

// CORRIGIDO: clearAllTimers agora verifica se o usuário tem permissão (lider ou MASTER)
window.clearAllTimers = async function () {
    if (!currentUser) return;
    if (currentUser.role !== 'MASTER' && currentUser.role !== 'lider') {
        alert('Apenas líderes e administradores podem limpar todos os timers.');
        return;
    }
    if (!confirm(`Limpar todos os timers do Piso ${currentFloor}?`)) return;
    timersData[currentFloor] = {};
    try {
        await setDoc(doc(db, "servers", currentServerView, "data", "timers"), timersData, { merge: true });
        await logActivity('limpou', 'todos os timers');
    } catch (error) { console.error(error); }
};

// CORRIGIDO: clearLogView apenas esconde os logs na tela, sem apagar dados da nuvem
window.clearLogView = function () {
    logViewCleared = true;
    const container = document.getElementById('activityLog');
    if (container) container.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Vista limpa. Mude de piso para recarregar.</span>';
};

window.promptMasterServer = function () {
    if (currentUser && currentUser.role === 'MASTER') {
        const targetServer = prompt("Modo MASTER Ativado. Digite o Servidor:", currentServerView);
        if (targetServer && targetServer.trim() !== "") {
            currentServerView = targetServer.trim();
            updateHeader();
            listenToServerData();
        }
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function updateClock() { document.getElementById('mainClock').textContent = formatTime(new Date()); }

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatTimeFromMs(ms) { return formatTime(new Date(ms)); }

function formatDateTime(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${mo} ${formatTime(date)}`;
}

async function saveSchedule() {
    if (!currentServerView) return;
    const data = {};
    document.querySelectorAll('.schedule-input').forEach(input => {
        if (input.id !== 'presenceEvent' && input.id !== 'presenceSubEvent') data[input.id] = input.value;
    });
    try {
        await setDoc(doc(db, "servers", currentServerView, "data", "schedule"), { inputs: data }, { merge: true });
    } catch (e) { }
}

async function logActivity(action, target) {
    if (!currentUser || !currentServerView) return;
    const now = new Date();
    try {
        await addDoc(collection(db, "servers", currentServerView, "logs"), {
            time: formatDateTime(now),
            user: currentUser.nickname,
            server: currentUser.server,
            action,
            target,
            floor: currentFloor,
            timestamp: now.getTime()
        });
    } catch (e) { }
}

function renderLogs() {
    const container = document.getElementById('activityLog');
    if (!container) return;
    const floorLogs = activityLogs.filter(log => log.floor === currentFloor);
    if (floorLogs.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Sem logs.</span>';
        return;
    }
    let html = '';
    floorLogs.forEach(log => {
        html += `<div class="log-entry"><span class="log-time">[${log.time}]</span><span class="log-user">${log.user}</span> <span>${log.action} ${log.target}</span></div>`;
    });
    container.innerHTML = html;
}

function refreshTimerDisplay() {
    document.querySelectorAll('[id$="-morreu"], [id$="-nasceu"]').forEach(el => el.textContent = '--:--:--');
    const floorTimers = timersData[currentFloor] || {};
    for (const [bossId, timer] of Object.entries(floorTimers)) {
        const m = document.getElementById(`${bossId}-morreu`);
        const n = document.getElementById(`${bossId}-nasceu`);
        if (m) m.textContent = formatTimeFromMs(timer.killedAt);
        if (n) n.textContent = formatTimeFromMs(timer.respawnAt);
    }
}

function updateActiveTimers() {
    const container = document.getElementById('activeTimers');
    if (!container) return;

    const now = Date.now();
    let chips = [];
    const floorTimers = timersData[currentFloor] || {};

    document.querySelectorAll('.live-countdown').forEach(el => {
        el.textContent = 'PRONTO';
        el.className = 'live-countdown ready';
    });

    for (const [id, timer] of Object.entries(floorTimers)) {
        const remaining = timer.respawnAt - now;
        const meta = timerMeta[id];
        const liveEl = document.getElementById(`${id}-live`);

        if (!meta) continue;

        if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const timeString = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            chips.push(`<div class="active-timer-chip ${meta.chipClass}"><span>${meta.label}</span> <strong>${timeString}</strong></div>`);
            if (liveEl) { liveEl.textContent = timeString; liveEl.className = 'live-countdown active'; }
        } else {
            chips.push(`<div class="active-timer-chip ${meta.chipClass} soon"><span>${meta.label}</span> <strong>NASCEU!</strong></div>`);
            if (liveEl) { liveEl.textContent = 'NASCEU!'; liveEl.className = 'live-countdown ready'; }
        }
    }

    container.innerHTML = chips.length === 0
        ? '<span style="color:var(--text-muted); font-size:0.8rem;">Nenhum timer ativo.</span>'
        : chips.join('');
}

async function checkAlerts() {
    if (!currentServerView) return;
    const now = Date.now();
    let updated = false;
    for (const [floor, floorTimers] of Object.entries(timersData)) {
        for (const [id, timer] of Object.entries(floorTimers)) {
            if (!timer.notified && timer.respawnAt - now <= 0) {
                timersData[floor][id].notified = true;
                updated = true;
                const meta = timerMeta[id];
                if (meta) showNotification(`PISO ${floor}: ${meta.label} NASCEU!`, `Disponível no servidor ${currentServerView}!`);
            }
        }
    }
    if (updated) {
        try {
            await setDoc(doc(db, "servers", currentServerView, "data", "timers"), timersData, { merge: true });
        } catch (e) { }
    }
}

function showNotification(title, body) {
    // CORRIGIDO: só exibe se a permissão foi concedida (não falha silenciosamente)
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    }
    playAlertSound();
}

window.exportTimers = function () {
    let text = `=== TIMERS PISO ${currentFloor} (${currentServerView}) ===\n`;
    for (const [id, timer] of Object.entries(timersData[currentFloor] || {})) {
        const meta = timerMeta[id];
        if (meta) text += `${meta.label}: Morreu ${formatTimeFromMs(timer.killedAt)} | Nasce ${formatTimeFromMs(timer.respawnAt)}\n`;
    }
    navigator.clipboard.writeText(text).then(() => alert('Copiado!'));
};

// ============================================
// PRESENCE & RANKING MODULE
// ============================================

function getISOWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return d.getUTCFullYear() + "-W" + String(Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)).padStart(2, '0');
}

// CORRIGIDO: formata o número da semana ISO em datas legíveis (ex: "19/05 – 25/05")
function formatWeekRange(weekStr) {
    const [year, week] = weekStr.split('-W');
    const jan4 = new Date(Date.UTC(parseInt(year), 0, 4));
    const startOfWeek = new Date(jan4);
    startOfWeek.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (parseInt(week) - 1) * 7);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    const fmt = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return `${fmt(startOfWeek)} – ${fmt(endOfWeek)}`;
}

window.submitPresence = async function () {
    if (!currentUser) { alert("Você precisa estar logado!"); return; }
    const ev = document.getElementById('presenceEvent').value;
    const subEv = document.getElementById('presenceSubEvent').value;
    const imageUrl = document.getElementById('presenceImageUrl').value.trim();
    
    if (!ev || (document.getElementById('subEventContainer').style.display !== 'none' && !subEv)) {
        alert("Preencha as informações do evento."); return;
    }
    if (!imageUrl) { 
        alert("Cole o link da print de comprovação."); return; 
    }
    
    // Validar se é uma URL válida
    try {
        new URL(imageUrl);
    } catch (e) {
        alert("Link inválido. Por favor, insira uma URL válida.");
        return;
    }

    const msg = document.getElementById('presenceMessage');
    msg.textContent = 'Enviando...';
    document.getElementById('btnSubmitPresence').disabled = true;

    try {
        const serverToUse = currentServerView || currentUser.server;
        const now = new Date();
        const weekStr = getISOWeekNumber(now);

        console.log('Iniciando envio de presença:', { serverToUse, weekStr, evento: ev });

        // Verifica duplicidade — mesmo usuário, mesmo evento, mesma semana
        const existingSnap = await getDocs(query(
            collection(db, `servers/${serverToUse}/attendance`),
            where("uid", "==", currentUser.uid),
            where("event", "==", ev),
            where("weekNumber", "==", weekStr)
        ));

        if (!existingSnap.empty) {
            msg.textContent = 'Você já registrou presença neste evento esta semana!';
            msg.style.color = 'var(--yellow-primary)';
            document.getElementById('btnSubmitPresence').disabled = false;
            setTimeout(() => { msg.textContent = ''; }, 5000);
            return;
        }

        console.log('Salvando documento no Firestore...');
        await addDoc(collection(db, `servers/${serverToUse}/attendance`), {
            uid: currentUser.uid,
            nickname: currentUser.nickname,
            block: currentUser.block,
            server: currentUser.server,
            event: ev,
            subEvent: subEv || null,
            imageUrl: imageUrl,
            timestamp: now.getTime(),
            weekNumber: weekStr,
            points: 1
        });
        console.log('Documento salvo com sucesso!');

        msg.textContent = 'Presença registrada! +1 Ponto.';
        msg.style.color = 'var(--green-primary)';
        
        // Limpar formulário
        document.getElementById('presenceEvent').value = '';
        document.getElementById('presenceSubEvent').value = '';
        document.getElementById('presenceImageUrl').value = '';
        document.getElementById('subEventContainer').style.display = 'none';
        
        setTimeout(() => { msg.textContent = ''; }, 5000);
    } catch (e) {
        console.error('Erro ao enviar presença:', e);
        msg.textContent = 'Erro: ' + e.message;
        msg.style.color = 'var(--red-primary)';
    } finally {
        document.getElementById('btnSubmitPresence').disabled = false;
    }
};

window.loadWeeklyRanking = async function () {
    if (!currentUser) return;
    const tbody = document.getElementById('rankingBody');
    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
    const serverToUse = currentServerView || currentUser.server;
    const weekStr = getISOWeekNumber(new Date());

    // Exibe o período da semana no título do ranking
    const rankingTitle = document.getElementById('rankingTitle');
    if (rankingTitle) {
        rankingTitle.textContent = `Relatório Semanal — ${formatWeekRange(weekStr)}`;
    }

    try {
        const snapshot = await getDocs(query(
            collection(db, `servers/${serverToUse}/attendance`),
            where("weekNumber", "==", weekStr)
        ));
        
        // Constrói o mapa de dados dos jogadores e guarda os docs individuais
        const playersMap = {};
        const attendanceDocs = [];
        
        snapshot.forEach(doc => {
            const d = doc.data();
            const nickname = d.nickname;
            
            if (!playersMap[nickname]) {
                playersMap[nickname] = {
                    nickname: d.nickname,
                    block: d.block || 'N/A',
                    server: d.server || 'N/A',
                    points: 0,
                    presences: 0
                };
            }
            
            playersMap[nickname].points += (d.points || 1);
            playersMap[nickname].presences += 1;
            
            // Guarda documento individual para validação
            attendanceDocs.push({
                ...d,
                docId: doc.id
            });
        });
        
        const ranking = Object.values(playersMap)
            .sort((a, b) => b.points - a.points);
        
        // Preenchendo a tabela principal de ranking
        tbody.innerHTML = ranking.length === 0 ? '<tr><td colspan="5">Nenhum registro.</td></tr>' : '';
        ranking.forEach((p, i) => {
            const tr = document.createElement('tr');
            let pos = i + 1;
            let medal = '';
            if (i === 0) { pos = '🥇'; medal = '1º'; }
            else if (i === 1) { pos = '🥈'; medal = '2º'; }
            else if (i === 2) { pos = '🥉'; medal = '3º'; }
            
            const displayPos = medal ? `${pos} ${medal}` : pos;
            const playerDisplay = `${p.nickname} (${p.block}${p.server})`;
            
            tr.innerHTML = `<td>${displayPos}</td><td><span style="cursor:pointer; color:var(--purple-primary);" onclick="window.openPlayerPrintsModal('${p.nickname}', '${weekStr}')">${playerDisplay}</span></td><td>${p.server}</td><td>${p.presences}</td><td><strong>${p.points} pts</strong></td>`;
            tbody.appendChild(tr);
        });
        
        // Criar tabela de detalhes de presenças para validação
        createAttendanceDetailsTable(attendanceDocs);
        
        // Criando Top 10 com scroll
        await createTop10Scroller(ranking);
        
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar.</td></tr>';
        console.error('Erro ao carregar ranking:', e);
    }
};

function createAttendanceDetailsTable(attendanceDocs) {
    // Verificar se o container de detalhes existe, senão criar
    let detailsContainer = document.getElementById('attendanceDetailsContainer');
    
    if (!detailsContainer) {
        detailsContainer = document.createElement('div');
        detailsContainer.id = 'attendanceDetailsContainer';
        
        // Encontrar o container de ranking e adicionar depois
        const rankingContainer = document.querySelector('.ranking-container');
        if (rankingContainer) {
            const newPanel = document.createElement('div');
            newPanel.className = 'panel panel-purple';
            newPanel.style.marginTop = '30px';
            newPanel.innerHTML = `
                <div class="panel-header purple-header">📋 Detalhes de Presenças (Validação)</div>
                <div class="panel-body">
                    <table class="timer-table" style="width:100%; font-size:0.9rem;">
                        <thead>
                            <tr>
                                <th>Jogador</th>
                                <th>Evento</th>
                                <th>Data/Hora</th>
                                <th>Link de Validação</th>
                            </tr>
                        </thead>
                        <tbody id="attendanceDetailsBody">
                        </tbody>
                    </table>
                </div>
            `;
            rankingContainer.appendChild(newPanel);
            detailsContainer = document.getElementById('attendanceDetailsBody');
        } else {
            return;
        }
    } else {
        detailsContainer = document.getElementById('attendanceDetailsBody') || detailsContainer;
    }
    
    // Limpar e preencher a tabela
    if (detailsContainer) {
        detailsContainer.innerHTML = '';
        
        attendanceDocs.forEach(doc => {
            const tr = document.createElement('tr');
            const playerName = `${doc.nickname} (${doc.block}${doc.server})`;
            const eventName = doc.event || 'N/A';
            const timestamp = new Date(doc.timestamp);
            const dateStr = `${String(timestamp.getDate()).padStart(2, '0')}/${String(timestamp.getMonth() + 1).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;
            
            const link = doc.imageUrl || '';
            const linkDisplay = link ? `<a href="${link}" target="_blank" style="color:var(--purple-primary); text-decoration:underline;">Ver Print</a>` : '<span style="color:var(--text-muted);">Sem link</span>';
            
            tr.innerHTML = `<td>${playerName}</td><td>${eventName}</td><td>${dateStr}</td><td>${linkDisplay}</td>`;
            detailsContainer.appendChild(tr);
        });
    }
}

async function createTop10Scroller(ranking) {
    const scrollerContainer = document.getElementById('top10Scroller');
    if (!scrollerContainer) return;
    
    scrollerContainer.innerHTML = '';
    
    // Pega apenas top 10
    const top10 = ranking.slice(0, 10);
    
    if (top10.length === 0) {
        scrollerContainer.innerHTML = '<span style="color:var(--text-muted);">Sem dados...</span>';
        return;
    }
    
    // Obter semana atual para passar ao modal
    const weekStr = getISOWeekNumber(new Date());
    
    // Cria cards para cada jogador
    top10.forEach((player, idx) => {
        const card = document.createElement('div');
        card.className = 'top10-card';
        card.style.cssText = `
            flex: 0 0 auto;
            min-width: 180px;
            background: var(--bg-panel);
            border: 2px solid var(--gold-primary);
            border-radius: 10px;
            padding: 15px;
            text-align: center;
            animation: slideInFromRight 0.5s ease-out ${idx * 0.1}s backwards;
        `;
        
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`;
        const playerName = `${player.block}${player.server}`;
        
        card.innerHTML = `
            <div style="font-size:24px; font-weight:bold; color:var(--gold-primary); margin-bottom:8px;">${medal}</div>
            <div class="top10-card-name" onclick="window.openPlayerPrintsModal('${player.nickname}', '${weekStr}')">${player.nickname}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:10px;">${playerName}</div>
            <div style="background:var(--purple-bg); padding:8px; border-radius:6px; margin-top:10px;">
                <span style="color:var(--purple-primary); font-weight:bold;">${player.points} Pontos</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:8px;">${player.presences} presença${player.presences !== 1 ? 's' : ''}</div>
        `;
        
        // Adicionar listener de clique também no card inteiro
        card.addEventListener('click', () => {
            window.openPlayerPrintsModal(player.nickname, weekStr);
        });
        
        scrollerContainer.appendChild(card);
    });
    // Scroll simples — sem duplicação de cards
}

// ============================================
// MODAL DE PRINTS DO JOGADOR
// ============================================
window.openPlayerPrintsModal = async function (playerNickname, weekStr) {
    const modal = document.getElementById('playerPrintsModal');
    const overlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalPlayerName');
    const modalContent = document.getElementById('modalContent');
    
    if (!currentUser) return;
    const serverToUse = currentServerView || currentUser.server;
    
    modalTitle.textContent = `📸 Prints de ${playerNickname}`;
    modalContent.innerHTML = '<div class="empty-message">Carregando...</div>';
    
    modal.classList.add('show');
    overlay.classList.add('show');
    
    try {
        // Busca todos os registros de presença deste jogador
        const snapshot = await getDocs(query(
            collection(db, `servers/${serverToUse}/attendance`),
            where("nickname", "==", playerNickname),
            where("weekNumber", "==", weekStr)
        ));
        
        const prints = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            prints.push({
                event: d.event || 'Evento desconhecido',
                subEvent: d.subEvent || null,
                timestamp: d.timestamp || new Date(),
                imageUrl: d.imageUrl || null
            });
        });
        
        // Ordena por data decrescente
        prints.sort((a, b) => {
            const timeA = typeof a.timestamp === 'object' ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
            const timeB = typeof b.timestamp === 'object' ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
            return timeB - timeA;
        });
        
        if (prints.length === 0) {
            modalContent.innerHTML = '<div class="empty-message">Nenhum print enviado nesta semana.</div>';
            return;
        }
        
        modalContent.innerHTML = '';
        prints.forEach((print, idx) => {
            const printEl = document.createElement('div');
            printEl.className = 'print-item';
            
            const timestamp = typeof print.timestamp === 'object' ? print.timestamp : new Date(print.timestamp);
            const dateStr = `${String(timestamp.getDate()).padStart(2, '0')}/${String(timestamp.getMonth() + 1).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}`;
            
            const linkHtml = print.imageUrl 
                ? `<a href="${print.imageUrl}" target="_blank" class="print-link">🔗 Ver Print</a>`
                : '<span style="color:var(--text-muted); font-size:0.85rem;">Sem link</span>';

            const subEventHtml = print.subEvent
                ? `<div class="print-subevent">🕐 ${print.subEvent}</div>`
                : '';

            printEl.innerHTML = `
                <div class="print-event">${print.event}</div>
                ${subEventHtml}
                <div class="print-timestamp">${dateStr}</div>
                <div>${linkHtml}</div>
            `;
            
            modalContent.appendChild(printEl);
        });
        
    } catch (e) {
        console.error('Erro ao carregar prints:', e);
        modalContent.innerHTML = '<div class="empty-message">Erro ao carregar os prints.</div>';
    }
};

window.closePlayerPrintsModal = function () {
    const modal = document.getElementById('playerPrintsModal');
    const overlay = document.getElementById('modalOverlay');
    
    modal.classList.remove('show');
    overlay.classList.remove('show');
};