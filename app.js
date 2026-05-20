import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, limit, addDoc, writeBatch, getDocs, where, runTransaction, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
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
let unsubClaims = null;
let claimsData = { 7: {}, 8: {}, 9: {}, 10: {} };

// CORRIGIDO: controla se a vista do log foi manualmente limpa
let logViewCleared = false;
const CLAIM_DURATION_MS = 30 * 60 * 1000;
const LEADER3_SPAWN_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const BLOCK_TIME_ZONES = {
    SA: 'America/Sao_Paulo',
    NA: 'America/New_York',
    EU: 'Europe/Berlin',
    ASIA: 'Asia/Seoul',
    INMENA: 'Asia/Dubai'
};
const SERVER_OPTIONS_BY_BLOCK = {
    SA: ['SA011', 'SA012', 'SA013', 'SA014', 'SA021', 'SA022', 'SA023', 'SA031', 'SA032', 'SA033', 'SA041', 'BSA041'],
    NA: ['NA011', 'NA012', 'NA013', 'NA014', 'NA021', 'NA022', 'NA023', 'NA031', 'NA032', 'NA033', 'NA041', 'BNA051'],
    EU: ['EU011', 'EU012', 'EU014', 'EU021', 'EU022', 'EU023', 'EU024', 'EU031', 'BEU031'],
    INMENA: ['INMENA013', 'INMENA014', 'INMENA021', 'INMENA022', 'INMENA023', 'INMENA024', 'INMENA031', 'BINMENA021'],
    ASIA: ['ASIA011', 'ASIA012', 'ASIA014', 'ASIA021', 'ASIA023', 'ASIA024', 'ASIA031', 'ASIA032', 'ASIA033', 'ASIA034', 'ASIA041', 'ASIA051', 'ASIA052', 'ASIA053', 'ASIA061', 'ASIA062', 'ASIA063', 'ASIA081', 'ASIA082', 'ASIA091', 'ASIA311', 'ASIA313', 'ASIA314', 'ASIA321', 'ASIA322', 'ASIA323', 'ASIA324', 'ASIA331', 'ASIA332', 'ASIA333', 'ASIA334', 'ASIA341', 'BASIA011', 'BASIA012', 'BASIA013']
};

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
    'pedra-magica-iii': { label: 'Pedra Mágica III', chipClass: 'chip-purple' },
    'xp3': { label: 'XP 3', chipClass: 'chip-blue' },
    'ouro3': { label: 'Ouro 3', chipClass: 'chip-gold' },
    'anti-demon': { label: 'Anti Demon', chipClass: 'chip-red' },
    'lider1': { label: 'Líder 1', chipClass: 'chip-purple' },
    'lider2': { label: 'Líder 2', chipClass: 'chip-blue' },
    'lider3': { label: 'Líder 3', chipClass: 'chip-gold' },
};

const claimMeta = {
    'pedra-magica-iii': { label: 'Pedra Mágica III', type: 'queue', maxSlots: 3, perUserMax: 3, repeatDelayMs: 5 * 60 * 1000 },
    'xp3': { label: 'XP 3', type: 'queue', maxSlots: 3, perUserMax: 3, repeatDelayMs: 5 * 60 * 1000 },
    'ouro3': { label: 'Ouro 3', type: 'queue', maxSlots: 3, perUserMax: 3, repeatDelayMs: 5 * 60 * 1000 },
    'anti-demon': { label: 'Anti Demon', type: 'queue', maxSlots: 3, perUserMax: 3, repeatDelayMs: 5 * 60 * 1000 },
    'praca-magica': { label: 'Praça Mágica', type: 'single-ticket', perUserMax: 3, repeatDelayMs: 5 * 60 * 1000 },
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
    setInterval(renderClaims, 1000);
    setInterval(checkAlerts, 5000);

    updateNotificationBtn();
    setupRegisterServerSelects();

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
            const status = normalizeStatus(data.status);
            const isMaster = isMasterUser(data);
            currentUser = {
                uid: user.uid,
                email: user.email,
                nickname: data.nickname,
                block: data.block,
                server: normalizeServerName(data.server),
                role: data.role || 'user',
                status,
                isMaster
            };

            if (!currentUser.isMaster && status !== 'approved') {
                const statusMessages = {
                    disabled: 'Sua conta foi desativada por um Staff.',
                    rejected: 'Seu cadastro foi rejeitado por um Staff.',
                    pending: 'Seu cadastro está pendente de aprovação por um Staff.'
                };
                const message = statusMessages[status] || statusMessages.pending;
                alert(message);
                await signOut(auth);
                return;
            }

            currentServerView = currentUser.server;

            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            updateHeader();
            
            // Mostra Relatório Semanal apenas para MASTER
            const tabRanking = document.getElementById('tabRanking');
            const tabApprovals = document.getElementById('tabApprovals');
            if (tabRanking) {
                tabRanking.style.display = currentUser.isMaster ? 'block' : 'none';
            }
            if (tabApprovals) {
                tabApprovals.style.display = currentUser.isMaster ? 'block' : 'none';
            }
            const staffServerControl = document.getElementById('staffServerControl');
            if (staffServerControl) {
                staffServerControl.style.display = currentUser.isMaster ? 'flex' : 'none';
            }

            changeFloor(7);
            if (currentUser.isMaster) await loadStaffServerOptions();
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
        if (unsubClaims) unsubClaims();
    }
});

function updateHeader() {
    if (!currentUser) return;
    document.getElementById('displayNickname').textContent = currentUser.nickname;
    let serverText = currentServerView;
    if (currentUser.isMaster) serverText += ' 👑';
    document.getElementById('displayServer').textContent = serverText;
}

async function loadStaffServerOptions() {
    if (!currentUser?.isMaster) return;
    const blockSelect = document.getElementById('staffBlockSelect');
    if (!blockSelect) return;

    const servers = new Set(Object.values(SERVER_OPTIONS_BY_BLOCK).flat());
    try {
        const snapshot = await getDocs(collection(db, "users"));
        snapshot.forEach(userDoc => {
            const server = normalizeServerName(userDoc.data().server);
            if (server) servers.add(server);
        });
    } catch (error) {
        console.warn('Não foi possível carregar servidores dos usuários:', error);
    }

    const groupedServers = groupServersByBlock(Array.from(servers));
    window.staffServersByBlock = groupedServers;
    const selectedServer = normalizeServerName(currentServerView) || normalizeServerName(currentUser.server);
    const selectedBlock = inferBlockFromServer(selectedServer) || Object.keys(groupedServers)[0] || currentUser.block;

    blockSelect.innerHTML = '';
    Object.keys(groupedServers)
        .filter(Boolean)
        .sort(compareBlockNames)
        .forEach(block => {
            const option = document.createElement('option');
            option.value = block;
            option.textContent = block;
            blockSelect.appendChild(option);
        });

    blockSelect.value = selectedBlock;
    renderStaffServerSelect(selectedBlock, selectedServer);
}

function renderStaffServerSelect(block, preferredServer = null) {
    const select = document.getElementById('staffServerSelect');
    if (!select) return;
    const servers = (window.staffServersByBlock?.[block] || SERVER_OPTIONS_BY_BLOCK[block] || []).sort(compareServerNames);

    select.innerHTML = '';
    servers.forEach(server => {
        const option = document.createElement('option');
        option.value = server;
        option.textContent = server;
        select.appendChild(option);
    });

    if (preferredServer && servers.includes(preferredServer)) {
        select.value = preferredServer;
    } else if (servers.length > 0) {
        select.value = servers[0];
    }
}

window.changeStaffBlock = function (block) {
    if (!currentUser?.isMaster) return;
    renderStaffServerSelect(block);
    const select = document.getElementById('staffServerSelect');
    if (select?.value) window.changeStaffServer(select.value);
}

window.changeStaffServer = function (server) {
    if (!currentUser?.isMaster) return;
    const normalizedServer = normalizeServerName(server);
    if (!isValidServerName(normalizedServer)) {
        alert('Servidor inválido. Exemplo: SA22.');
        const select = document.getElementById('staffServerSelect');
        if (select) select.value = currentServerView;
        return;
    }
    currentServerView = normalizedServer;
    const blockSelect = document.getElementById('staffBlockSelect');
    const select = document.getElementById('staffServerSelect');
    const block = inferBlockFromServer(normalizedServer);
    if (blockSelect && blockSelect.value !== block) {
        blockSelect.value = block;
        renderStaffServerSelect(block, normalizedServer);
    }
    if (select) select.value = normalizedServer;
    logViewCleared = false;
    updateHeader();
    listenToServerData();
    changeFloor(currentFloor);
};

function listenToServerData() {
    if (!currentServerView) return;

    if (unsubTimers) unsubTimers();
    if (unsubLogs) unsubLogs();
    if (unsubSchedule) unsubSchedule();
    if (unsubClaims) unsubClaims();

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

    const claimsDoc = doc(db, "servers", currentServerView, "data", "claims");
    unsubClaims = onSnapshot(claimsDoc, (docSnap) => {
        claimsData = docSnap.exists() ? docSnap.data() : { 7: {}, 8: {}, 9: {}, 10: {} };
        renderClaims();
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

function setupRegisterServerSelects() {
    const blockSelect = document.getElementById('regBlock');
    const serverSelect = document.getElementById('regServer');
    if (!blockSelect || !serverSelect) return;

    blockSelect.addEventListener('change', () => {
        populateServerSelect(serverSelect, blockSelect.value, 'Selecione o Servidor');
    });
}

function populateServerSelect(select, block, placeholder = null) {
    if (!select) return;
    const servers = SERVER_OPTIONS_BY_BLOCK[block] || [];
    select.innerHTML = '';
    if (placeholder) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = placeholder;
        option.disabled = true;
        option.selected = true;
        select.appendChild(option);
    }
    servers.forEach(server => {
        const option = document.createElement('option');
        option.value = server;
        option.textContent = server;
        select.appendChild(option);
    });
}

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
    const server = normalizeServerName(document.getElementById('regServer').value);

    if (!email || !password || !nickname || !block || !server) { alert('Por favor, preencha todos os campos.'); return; }
    if (!isValidServerName(server)) {
        alert('Selecione um servidor válido.');
        return;
    }
    if (inferBlockFromServer(server) !== block) {
        alert('O servidor selecionado não pertence ao bloco escolhido.');
        return;
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const pendingUser = {
            uid: userCredential.user.uid,
            email,
            nickname,
            block,
            server,
            role: 'user',
            status: 'pending',
            createdAt: Date.now()
        };
        await setDoc(doc(db, "users", userCredential.user.uid), pendingUser);
        await setDoc(doc(db, "pendingApprovals", userCredential.user.uid), pendingUser);
        alert('Cadastro enviado! Aguarde aprovação de um Staff.');
        await signOut(auth);
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
    document.getElementById('tabApprovals').classList.remove('active');
    document.getElementById('tabRanking').classList.remove('active');

    document.getElementById('floorNav').style.display = 'none';
    document.getElementById('activeTimersBar').style.display = 'none';
    document.getElementById('mainGrid').style.display = 'none';
    document.getElementById('scheduleContainer').style.display = 'none';
    document.getElementById('presenceContainer').style.display = 'none';
    document.getElementById('approvalsContainer').style.display = 'none';
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
    } else if (tabName === 'approvals') {
        document.getElementById('tabApprovals').classList.add('active');
        document.getElementById('approvalsContainer').style.display = 'block';
        window.loadPendingApprovals();
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
    renderClaims();
};

window.registerKill = async function (bossId, cooldownMinutes) {
    if (!currentUser || !currentServerView) return;
    const now = new Date();
    const respawnTime = bossId === 'lider3'
        ? getNextLeader3Respawn(now)
        : new Date(now.getTime() + cooldownMinutes * 60 * 1000);

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

window.claimTarget = async function (targetId, ticketAmount = 1) {
    if (!currentUser || !currentServerView) return;
    const meta = claimMeta[targetId];
    if (!meta) return;

    ticketAmount = Math.max(1, Math.min(3, Number(ticketAmount) || 1));
    const now = Date.now();
    const claimsDoc = doc(db, "servers", currentServerView, "data", "claims");

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(claimsDoc);
            const data = snap.exists() ? snap.data() : {};
            if (!data[currentFloor]) data[currentFloor] = {};
            let entries = Array.isArray(data[currentFloor][targetId]) ? [...data[currentFloor][targetId]] : [];
            entries = normalizeClaimEntries(entries, meta, now);

            if (!currentUser.isMaster) {
                if (meta.type === 'single-ticket') {
                    const currentEntry = entries[0];
                    const lastClaim = currentEntry?.uid === currentUser.uid
                        ? currentEntry.lastClaimedAt || currentEntry.claimedAt || 0
                        : 0;

                    if (currentEntry && currentEntry.uid !== currentUser.uid) {
                        throw new Error(`${meta.label} já está clamado. Aguarde o jogador atual finalizar.`);
                    }
                    if (currentEntry && (currentEntry.ticketCount || 1) + ticketAmount > meta.perUserMax) {
                        throw new Error(`Você já tem ${meta.perUserMax} tickets em ${meta.label}.`);
                    }
                    if (lastClaim && now - lastClaim < meta.repeatDelayMs) {
                        const waitMs = meta.repeatDelayMs - (now - lastClaim);
                        throw new Error(`Aguarde ${formatDuration(waitMs)} para clamar ${meta.label} novamente.`);
                    }
                } else {
                    const userEntries = entries.filter(entry => entry.uid === currentUser.uid);
                    const hasOtherPlayers = entries.some(entry => entry.uid !== currentUser.uid);
                    const lastClaim = userEntries.reduce((last, entry) => Math.max(last, entry.lastClaimedAt || entry.claimedAt || 0), 0);

                    if (userEntries.length === 0 && entries.length >= meta.maxSlots) {
                        throw new Error(`A fila de ${meta.label} já está cheia (${meta.maxSlots}/3).`);
                    }
                    if (userEntries.some(entry => (entry.ticketCount || 1) + ticketAmount > meta.perUserMax)) {
                        throw new Error(`Você já tem ${meta.perUserMax} tickets em ${meta.label}.`);
                    }
                    if (userEntries.length > 0 && hasOtherPlayers) {
                        throw new Error(`Você já está clamado em ${meta.label}. Com fila ativa, aguarde sua vez antes de clamar mais tickets.`);
                    }
                    if (lastClaim && now - lastClaim < meta.repeatDelayMs) {
                        const waitMs = meta.repeatDelayMs - (now - lastClaim);
                        throw new Error(`Aguarde ${formatDuration(waitMs)} para clamar ${meta.label} novamente.`);
                    }
                }
            }

            const existingIndex = meta.type === 'queue' || meta.type === 'single-ticket'
                ? entries.findIndex(entry => entry.uid === currentUser.uid)
                : -1;

            if (existingIndex >= 0) {
                const currentEntry = entries[existingIndex];
                const nextTicketCount = (currentEntry.ticketCount || 1) + ticketAmount;
                if (meta.perUserMax && nextTicketCount > meta.perUserMax) {
                    throw new Error(`Você já tem ${meta.perUserMax} tickets em ${meta.label}.`);
                }
                const baseUntil = Math.max(currentEntry.activeUntil || now, now);
                entries[existingIndex] = {
                    ...currentEntry,
                    ticketCount: nextTicketCount,
                    lastClaimedAt: now,
                    activeUntil: existingIndex === 0 ? baseUntil + CLAIM_DURATION_MS * ticketAmount : currentEntry.activeUntil
                };
            } else {
                if (meta.type === 'single-ticket' && entries.length > 0) {
                    throw new Error(`${meta.label} já está clamado. Aguarde o jogador atual finalizar.`);
                }
                entries.push({
                    uid: currentUser.uid,
                    nickname: currentUser.nickname,
                    claimedAt: now,
                    lastClaimedAt: now,
                    ticketCount: ticketAmount,
                    activeFrom: entries.length === 0 ? now : null,
                    activeUntil: entries.length === 0 ? now + CLAIM_DURATION_MS * ticketAmount : null,
                    role: currentUser.role || 'user'
                });
            }
            data[currentFloor][targetId] = entries;
            transaction.set(claimsDoc, data, { merge: true });
        });
        await logActivity('clamou', meta.label);
    } catch (error) {
        alert(error.message || 'Erro ao clamar.');
    }
};

window.finishClaim = async function (targetId) {
    if (!currentUser || !currentServerView) return;
    const meta = claimMeta[targetId];
    if (!meta) return;

    const claimsDoc = doc(db, "servers", currentServerView, "data", "claims");
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(claimsDoc);
            const data = snap.exists() ? snap.data() : {};
            let entries = Array.isArray(data[currentFloor]?.[targetId]) ? [...data[currentFloor][targetId]] : [];
            entries = normalizeClaimEntries(entries, meta, Date.now());
            const removeIndex = currentUser.isMaster
                ? 0
                : entries.findIndex(entry => entry.uid === currentUser.uid);

            if (removeIndex < 0) {
                throw new Error(`Você não tem claim ativo em ${meta.label}.`);
            }

            entries.splice(removeIndex, 1);
            entries = promoteNextClaim(entries, Date.now());
            if (!data[currentFloor]) data[currentFloor] = {};
            data[currentFloor][targetId] = entries;
            transaction.set(claimsDoc, data, { merge: true });
        });
        await logActivity('finalizou claim de', meta.label);
    } catch (error) {
        alert(error.message || 'Erro ao finalizar claim.');
    }
};

// CORRIGIDO: clearAllTimers agora verifica se o usuário tem permissão (lider ou MASTER)
window.clearAllTimers = async function () {
    if (!currentUser) return;
    if (!currentUser.isMaster && currentUser.role !== 'lider') {
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
    if (currentUser && currentUser.isMaster) {
        const targetServer = prompt("Modo MASTER Ativado. Digite o Servidor:", currentServerView);
        if (targetServer && targetServer.trim() !== "") {
            const normalizedServer = normalizeServerName(targetServer);
            window.changeStaffServer(normalizedServer);
        }
    }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function updateClock() { document.getElementById('mainClock').textContent = formatTime(new Date()); }

function normalizeRole(role) {
    return String(role || '').trim().toUpperCase();
}

function normalizeStatus(status) {
    return String(status || 'approved').trim().toLowerCase();
}

function normalizeServerName(server) {
    return String(server || '').trim().toUpperCase();
}

function isValidServerName(server) {
    const normalizedServer = normalizeServerName(server);
    return Object.values(SERVER_OPTIONS_BY_BLOCK).some(servers => servers.includes(normalizedServer));
}

function compareServerNames(a, b) {
    const parse = (server) => {
        const normalizedServer = normalizeServerName(server);
        const block = inferBlockFromServer(normalizedServer) || normalizedServer;
        const match = normalizedServer.match(/(\d+)$/);
        return match ? { block, number: Number(match[1]) } : { block, number: 0 };
    };
    const left = parse(a);
    const right = parse(b);
    return left.block.localeCompare(right.block) || left.number - right.number;
}

function compareBlockNames(a, b) {
    const order = ['SA', 'NA', 'EU', 'INMENA', 'ASIA'];
    return order.indexOf(a) - order.indexOf(b);
}

function groupServersByBlock(servers) {
    return servers.reduce((groups, server) => {
        const normalizedServer = normalizeServerName(server);
        const block = inferBlockFromServer(normalizedServer);
        if (!block || !isValidServerName(normalizedServer)) return groups;
        if (!groups[block]) groups[block] = [];
        if (!groups[block].includes(normalizedServer)) groups[block].push(normalizedServer);
        return groups;
    }, {});
}

function isMasterUser(userData) {
    const role = normalizeRole(userData?.role);
    return role === 'MASTER' || role === 'STAFF' || role === 'ADMIN';
}

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatTimeFromMs(ms) { return formatTime(new Date(ms)); }

function formatDateTime(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${mo} ${formatTime(date)}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function inferBlockFromServer(server) {
    const normalizedServer = normalizeServerName(server);
    for (const [block, servers] of Object.entries(SERVER_OPTIONS_BY_BLOCK)) {
        if (servers.includes(normalizedServer)) return block;
    }
    return null;
}

function getBlockTimeZone() {
    const block = inferBlockFromServer(currentServerView) || currentUser?.block || 'SA';
    return BLOCK_TIME_ZONES[block] || BLOCK_TIME_ZONES.SA;
}

function getZonedParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function zonedTimeToDate(parts, timeZone) {
    const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0));
    const actual = getZonedParts(guess, timeZone);
    const wantedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute || 0, actual.second || 0);
    return new Date(guess.getTime() + (wantedAsUtc - actualAsUtc));
}

function getNextLeader3Respawn(now) {
    const timeZone = getBlockTimeZone();
    const zonedNow = getZonedParts(now, timeZone);
    const today = { year: zonedNow.year, month: zonedNow.month, day: zonedNow.day };

    for (const hour of LEADER3_SPAWN_HOURS) {
        const candidate = zonedTimeToDate({ ...today, hour, minute: 0, second: 0 }, timeZone);
        if (candidate.getTime() > now.getTime()) return candidate;
    }

    const tomorrowAtNoon = zonedTimeToDate({ ...today, hour: 12, minute: 0, second: 0 }, timeZone);
    tomorrowAtNoon.setUTCDate(tomorrowAtNoon.getUTCDate() + 1);
    const tomorrow = getZonedParts(tomorrowAtNoon, timeZone);
    return zonedTimeToDate({
        year: tomorrow.year,
        month: tomorrow.month,
        day: tomorrow.day,
        hour: LEADER3_SPAWN_HOURS[0],
        minute: 0,
        second: 0
    }, timeZone);
}

function promoteNextClaim(entries, now) {
    if (entries.length === 0) return entries;
    const [current, ...rest] = entries;
    if (!current.activeUntil || current.activeUntil <= now) {
        const ticketCount = current.ticketCount || 1;
        return [{
            ...current,
            ticketCount,
            activeFrom: now,
            activeUntil: now + CLAIM_DURATION_MS * ticketCount
        }, ...rest];
    }
    return entries;
}

function normalizeClaimEntries(entries, meta, now) {
    const withClaimDuration = (entry) => {
        const activeFrom = entry.activeFrom || entry.claimedAt || now;
        const ticketCount = Math.min(entry.ticketCount || 1, meta.perUserMax || entry.ticketCount || 1);
        return {
            ...entry,
            ticketCount,
            activeFrom,
            activeUntil: entry.activeUntil || activeFrom + CLAIM_DURATION_MS * ticketCount,
            lastClaimedAt: entry.lastClaimedAt || entry.claimedAt || activeFrom
        };
    };

    const compacted = [];
    entries.filter(Boolean).forEach((entry) => {
        const normalizedEntry = withClaimDuration(entry);
        const existing = compacted.find(item => item.uid === normalizedEntry.uid);
        if (!existing) {
            compacted.push(normalizedEntry);
            return;
        }

        const maxTickets = meta.perUserMax || Infinity;
        existing.ticketCount = Math.min(maxTickets, (existing.ticketCount || 1) + (normalizedEntry.ticketCount || 1));
        existing.claimedAt = Math.min(existing.claimedAt || normalizedEntry.claimedAt || now, normalizedEntry.claimedAt || now);
        existing.lastClaimedAt = Math.max(existing.lastClaimedAt || 0, normalizedEntry.lastClaimedAt || normalizedEntry.claimedAt || 0);
        existing.activeFrom = Math.min(existing.activeFrom || normalizedEntry.activeFrom || now, normalizedEntry.activeFrom || now);
        existing.activeUntil = existing.activeUntil || normalizedEntry.activeUntil;
    });

    if (meta.type !== 'queue') {
        return compacted
            .slice(0, 1)
            .map(entry => ({
                ...entry,
                activeUntil: (entry.activeFrom || now) + CLAIM_DURATION_MS * (entry.ticketCount || 1)
            }))
            .filter(entry => entry.activeUntil > now);
    }

    let normalized = compacted.slice(0, meta.maxSlots || compacted.length);
    if (normalized.length > 0) {
        normalized[0] = {
            ...normalized[0],
            activeUntil: (normalized[0].activeFrom || now) + CLAIM_DURATION_MS * (normalized[0].ticketCount || 1)
        };
    }
    while (normalized.length > 0 && normalized[0].activeUntil <= now) {
        normalized.shift();
        if (normalized.length > 0) normalized = promoteNextClaim(normalized, now);
    }
    return normalized;
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

function renderClaims() {
    const floorClaims = claimsData[currentFloor] || {};
    const now = Date.now();

    Object.keys(claimMeta).forEach(targetId => {
        const listEl = document.getElementById(`${targetId}-claim-list`);
        const statusEl = document.getElementById(`${targetId}-claim-status`);
        const countEl = document.getElementById(`${targetId}-claim-count`);
        const meta = claimMeta[targetId];
        const entries = normalizeClaimEntries(
            Array.isArray(floorClaims[targetId]) ? [...floorClaims[targetId]] : [],
            meta,
            now
        );
        const activeRemaining = entries[0]?.activeUntil ? formatCountdown(entries[0].activeUntil - now) : null;
        const cardTimerEl = document.getElementById(`${targetId}-nasceu`);
        const spawnTimer = timersData[currentFloor]?.[targetId];
        const hasActiveSpawnTimer = spawnTimer && spawnTimer.respawnAt > now;

        if (cardTimerEl?.classList.contains('magic-timer') && !hasActiveSpawnTimer) {
            cardTimerEl.textContent = activeRemaining || '--:--:--';
            cardTimerEl.classList.toggle('timer-ready', !activeRemaining);
        }

        if (countEl) {
            if (meta.type === 'queue') {
                countEl.textContent = `${entries[0]?.ticketCount || 0}/${meta.perUserMax || meta.maxSlots}`;
            } else if (meta.perUserMax) {
                countEl.textContent = `${entries[0]?.ticketCount || 0}/${meta.perUserMax}`;
            } else {
                countEl.textContent = entries.length > 0 ? 'Ocupado' : 'Livre';
            }
        }

        if (statusEl) {
            if (entries.length === 0) {
                statusEl.textContent = meta.type === 'queue' ? 'Fila livre' : 'Aguardando claim';
                statusEl.className = 'claim-status claim-free';
            } else {
                statusEl.textContent = meta.type === 'queue'
                    ? `Atual: ${entries[0].nickname} ${activeRemaining ? `(${activeRemaining})` : ''}`
                    : `Clamado por ${entries[0].nickname} ${activeRemaining ? `(${activeRemaining})` : ''}`;
                statusEl.className = 'claim-status claim-busy';
            }
        }

        if (listEl) {
            if (entries.length === 0) {
                listEl.innerHTML = '<div class="claim-empty">Sem jogadores.</div>';
            } else {
                listEl.innerHTML = entries.map((entry, index) => {
                    const position = meta.type === 'queue' ? `${index + 1}.` : '';
                    const tag = index === 0
                        ? `<span class="claim-tag">${entry.activeUntil ? formatCountdown(entry.activeUntil - now) : 'ATUAL'}</span>`
                        : '<span class="claim-tag waiting">FILA</span>';
                    const tickets = entry.ticketCount ? ` <small>${entry.ticketCount}x</small>` : '';
                    return `<div class="claim-row"><span>${position} ${entry.nickname}${tickets}</span>${tag}</div>`;
                }).join('');
            }
        }
    });
}

function refreshTimerDisplay() {
    document.querySelectorAll('[id$="-morreu"], [id$="-nasceu"]').forEach(el => {
        el.textContent = '--:--:--';
        el.classList.remove('timer-ready');
    });
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
        const cardTimerEl = document.getElementById(`${id}-nasceu`);
        const shouldShowCountdown = cardTimerEl && (
            cardTimerEl.classList.contains('magic-timer') ||
            cardTimerEl.classList.contains('leader-timer')
        );

        if (!meta) continue;

        if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const timeString = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const cardTimeString = formatCountdown(remaining);
            chips.push(`<div class="active-timer-chip ${meta.chipClass}"><span>${meta.label}</span> <strong>${timeString}</strong></div>`);
            if (liveEl) { liveEl.textContent = timeString; liveEl.className = 'live-countdown active'; }
            if (shouldShowCountdown) {
                cardTimerEl.textContent = cardTimeString;
                cardTimerEl.classList.remove('timer-ready');
            }
        } else {
            chips.push(`<div class="active-timer-chip ${meta.chipClass} soon"><span>${meta.label}</span> <strong>NASCEU!</strong></div>`);
            if (liveEl) { liveEl.textContent = 'NASCEU!'; liveEl.className = 'live-countdown ready'; }
            if (shouldShowCountdown) {
                cardTimerEl.textContent = 'NASCEU!';
                cardTimerEl.classList.add('timer-ready');
            }
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

window.loadPendingApprovals = async function () {
    if (!currentUser || !currentUser.isMaster) return;
    const tbody = document.getElementById('approvalsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';

    try {
        const pendingMap = new Map();
        try {
            const approvalsSnapshot = await getDocs(collection(db, "pendingApprovals"));
            approvalsSnapshot.forEach(userDoc => {
                pendingMap.set(userDoc.id, { id: userDoc.id, ...userDoc.data() });
            });
        } catch (error) {
            console.warn('Não foi possível ler pendingApprovals, usando users como fallback:', error);
        }

        let usersSnapshot = null;
        try {
            usersSnapshot = await getDocs(collection(db, "users"));
            usersSnapshot.forEach(userDoc => {
                const user = { id: userDoc.id, ...userDoc.data() };
                if (normalizeStatus(user.status) === 'pending') {
                    pendingMap.set(userDoc.id, user);
                }
            });
        } catch (error) {
            console.warn('Não foi possível ler users para aprovações:', error);
        }

        const pendingUsers = Array.from(pendingMap.values());
        if (pendingUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhum cadastro pendente.</td></tr>';
            await window.loadUsersManagement(usersSnapshot);
            return;
        }

        tbody.innerHTML = '';
        pendingUsers
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.nickname || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>${user.block || '-'}</td>
                <td>${user.server || '-'}</td>
                <td>
                    <div class="approval-actions">
                        <button class="btn btn-green" onclick="approveUser('${user.id}')">Aprovar</button>
                        <button class="btn btn-danger" onclick="rejectUser('${user.id}')">Rejeitar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        await window.loadUsersManagement(usersSnapshot);
    } catch (error) {
        console.error('Erro ao carregar aprovações:', error);
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar cadastros pendentes.</td></tr>';
        await window.loadUsersManagement();
    }
};

window.approveUser = async function (uid) {
    if (!currentUser || !currentUser.isMaster) return;
    try {
        await setDoc(doc(db, "users", uid), {
            status: 'approved',
            approvedBy: currentUser.uid,
            approvedAt: Date.now()
        }, { merge: true });
        await deleteDoc(doc(db, "pendingApprovals", uid));
        await window.loadPendingApprovals();
    } catch (error) {
        alert('Erro ao aprovar usuário: ' + error.message);
    }
};

window.rejectUser = async function (uid) {
    if (!currentUser || !currentUser.isMaster) return;
    if (!confirm('Rejeitar este cadastro?')) return;
    try {
        await setDoc(doc(db, "users", uid), {
            status: 'rejected',
            rejectedBy: currentUser.uid,
            rejectedAt: Date.now()
        }, { merge: true });
        await deleteDoc(doc(db, "pendingApprovals", uid));
        await window.loadPendingApprovals();
    } catch (error) {
        alert('Erro ao rejeitar usuário: ' + error.message);
    }
};

window.loadUsersManagement = async function (existingSnapshot = null) {
    if (!currentUser || !currentUser.isMaster) return;
    const tbody = document.getElementById('usersManagementBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';

    try {
        const snapshot = existingSnapshot || await getDocs(collection(db, "users"));
        const users = [];
        snapshot.forEach(userDoc => users.push({ id: userDoc.id, ...userDoc.data() }));

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        users
            .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''))
            .forEach(user => {
                const status = normalizeStatus(user.status);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${user.nickname || '-'}</td>
                    <td>${user.email || '-'}</td>
                    <td>${user.server || '-'}</td>
                    <td>${status}</td>
                    <td>
                        <div class="approval-actions">
                            <button class="btn btn-secondary" onclick="promptChangeUserNickname('${user.id}', '${escapeForSingleQuote(user.nickname || '')}')">Nick</button>
                            ${status === 'disabled'
                                ? `<button class="btn btn-green" onclick="setUserAccountStatus('${user.id}', 'approved')">Ativar</button>`
                                : `<button class="btn btn-danger" onclick="setUserAccountStatus('${user.id}', 'disabled')">Desativar</button>`}
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        tbody.innerHTML = '<tr><td colspan="5">Erro ao carregar usuários.</td></tr>';
    }
};

window.promptChangeUserNickname = async function (uid, currentNickname) {
    if (!currentUser || !currentUser.isMaster) return;
    const nickname = prompt('Novo nickname:', currentNickname || '');
    if (!nickname || !nickname.trim()) return;

    try {
        await setDoc(doc(db, "users", uid), {
            nickname: nickname.trim(),
            nicknameUpdatedBy: currentUser.uid,
            nicknameUpdatedAt: Date.now()
        }, { merge: true });
        await window.loadPendingApprovals();
    } catch (error) {
        alert('Erro ao trocar nick: ' + error.message);
    }
};

window.setUserAccountStatus = async function (uid, status) {
    if (!currentUser || !currentUser.isMaster) return;
    if (uid === currentUser.uid && status === 'disabled') {
        alert('Você não pode desativar a própria conta.');
        return;
    }
    const action = status === 'disabled' ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${action} esta conta?`)) return;

    try {
        await setDoc(doc(db, "users", uid), {
            status,
            statusUpdatedBy: currentUser.uid,
            statusUpdatedAt: Date.now()
        }, { merge: true });
        if (status !== 'pending') {
            await deleteDoc(doc(db, "pendingApprovals", uid));
        }
        await window.loadPendingApprovals();
    } catch (error) {
        alert('Erro ao alterar status: ' + error.message);
    }
};

function escapeForSingleQuote(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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
