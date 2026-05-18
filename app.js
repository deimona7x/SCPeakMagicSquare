import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, limit, addDoc, writeBatch, getDocs, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// Your web app's Firebase configuration
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
let currentServerView = null; // Used for MASTER to see other servers
let currentFloor = 7;
let timersData = { 7: {}, 8: {}, 9: {}, 10: {} };
let activityLogs = [];
let unsubTimers = null;
let unsubLogs = null;
let unsubSchedule = null;

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
    'energia': { label: 'Energia', chipClass: 'chip-gold' },
    'lider2': { label: 'Líder 2', chipClass: 'chip-purple' },
    'lider1': { label: 'Líder 1', chipClass: 'chip-purple' },
    'selar': { label: 'Selar', chipClass: 'chip-purple' },
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(updateActiveTimers, 1000);
    setInterval(checkAlerts, 5000);
    
    // Schedule save events
    document.querySelectorAll('.schedule-input').forEach(input => {
        input.addEventListener('change', saveSchedule);
        input.addEventListener('blur', saveSchedule);
    });

    // Theme initialization
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('theme-light');
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.textContent = '🌙';
    }
});

// AUTH STATE LISTENER
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Fetch user profile from Firestore
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
            currentServerView = currentUser.server; // default view is their own server
            
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            updateHeader();
            
            changeFloor(7);
            listenToServerData(); // Start real-time listeners
        }
    } else {
        // Logged out
        currentUser = null;
        currentServerView = null;
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginModal').style.display = 'flex';
        
        // Stop listeners
        if(unsubTimers) unsubTimers();
        if(unsubLogs) unsubLogs();
        if(unsubSchedule) unsubSchedule();
    }
});

function updateHeader() {
    if (!currentUser) return;
    document.getElementById('displayNickname').textContent = currentUser.nickname;
    
    let serverText = currentServerView;
    if (currentUser.role === 'MASTER') {
        serverText += ' 👑'; // visual indicator of master
    }
    document.getElementById('displayServer').textContent = serverText;
}

// ============================================
// REAL-TIME LISTENERS
// ============================================
function listenToServerData() {
    if (!currentServerView) return;
    
    // Stop previous listeners if changing servers
    if(unsubTimers) unsubTimers();
    if(unsubLogs) unsubLogs();
    if(unsubSchedule) unsubSchedule();
    
    // 1. Listen to Timers for all floors
    const timersDoc = doc(db, "servers", currentServerView, "data", "timers");
    unsubTimers = onSnapshot(timersDoc, (docSnap) => {
        if (docSnap.exists()) {
            timersData = docSnap.data();
        } else {
            timersData = { 7: {}, 8: {}, 9: {}, 10: {} };
        }
        refreshTimerDisplay();
        updateActiveTimers();
    });
    
    // 2. Listen to Logs (last 100)
    const logsRef = collection(db, "servers", currentServerView, "logs");
    const q = query(logsRef, orderBy("timestamp", "desc"), limit(100));
    unsubLogs = onSnapshot(q, (snapshot) => {
        activityLogs = [];
        snapshot.forEach((doc) => {
            activityLogs.push(doc.data());
        });
        renderLogs();
    });
    
    // 3. Listen to Schedule
    const scheduleDoc = doc(db, "servers", currentServerView, "data", "schedule");
    unsubSchedule = onSnapshot(scheduleDoc, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data().inputs || {};
            document.querySelectorAll('.schedule-input').forEach(input => {
                if (data[input.id] !== undefined) {
                    input.value = data[input.id];
                }
            });
        }
    });
}

// ============================================
// GLOBAL EXPORTS (For HTML onclick events)
// ============================================
window.toggleTheme = function() {
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

window.switchAuthTab = function(tabName) {
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

window.performLogin = async function() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (!email || !password) {
        alert('Por favor, preencha E-mail e Senha.');
        return;
    }
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error(error);
        alert('Erro ao fazer login: ' + error.message);
    }
};

window.performRegister = async function() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const nickname = document.getElementById('regNickname').value.trim();
    const block = document.getElementById('regBlock').value;
    const server = document.getElementById('regServer').value.trim();
    
    if (!email || !password || !nickname || !block || !server) {
        alert('Por favor, preencha todos os campos do cadastro.');
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Save profile in Firestore
        await setDoc(doc(db, "users", user.uid), {
            email: email,
            nickname: nickname,
            block: block,
            server: server,
            role: 'user', // Default role
            createdAt: Date.now()
        });
        
    } catch (error) {
        console.error(error);
        alert('Erro ao cadastrar: ' + error.message);
    }
};

window.performLogout = async function() {
    if (!confirm('Tem certeza que deseja sair desta conta?')) return;
    try {
        await signOut(auth);
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        window.switchAuthTab('login');
    } catch (error) {
        console.error(error);
    }
};

window.switchMainTab = function(tabName) {
    document.getElementById('tabTimers').classList.remove('active');
    document.getElementById('tabSchedule').classList.remove('active');
    document.getElementById('tabPresence').classList.remove('active');
    document.getElementById('tabRanking').classList.remove('active');
    
    document.getElementById('floorNav').style.display = 'none';
    document.getElementById('mainGrid').style.display = 'none';
    document.getElementById('scheduleContainer').style.display = 'none';
    document.getElementById('presenceContainer').style.display = 'none';
    document.getElementById('rankingContainer').style.display = 'none';

    if (tabName === 'timers') {
        document.getElementById('tabTimers').classList.add('active');
        document.getElementById('floorNav').style.display = 'flex';
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

window.changeFloor = function(floor) {
    currentFloor = floor;
    document.getElementById('currentFloorLog').textContent = floor;
    
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(floor)) {
            btn.classList.add('active');
        }
    });
    
    refreshTimerDisplay();
    updateActiveTimers();
    renderLogs();
};

window.registerKill = async function(bossId, cooldownMinutes) {
    if (!currentUser || !currentServerView) return;

    const now = new Date();
    const respawnTime = new Date(now.getTime() + cooldownMinutes * 60 * 1000);
    
    // Optimistic UI Update
    if (!timersData[currentFloor]) timersData[currentFloor] = {};
    timersData[currentFloor][bossId] = {
        killedAt: now.getTime(),
        respawnAt: respawnTime.getTime(),
        cooldown: cooldownMinutes,
        notified: false
    };
    
    refreshTimerDisplay();
    updateActiveTimers();
    
    // Visual feedback
    const btn = document.querySelector(`[onclick*="'${bossId}'"]`);
    if (btn) {
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = '', 200);
    }
    
    // Save to Firestore
    try {
        const timersDoc = doc(db, "servers", currentServerView, "data", "timers");
        await setDoc(timersDoc, timersData, { merge: true });
        
        const meta = timerMeta[bossId];
        if (meta) {
            await logActivity('marcou', meta.label);
        }
    } catch (error) {
        console.error("Erro ao salvar timer:", error);
    }
};

window.clearAllTimers = async function() {
    if (!confirm(`Limpar todos os timers APENAS do Piso ${currentFloor}? Esta ação não pode ser desfeita.`)) return;
    
    timersData[currentFloor] = {};
    
    try {
        const timersDoc = doc(db, "servers", currentServerView, "data", "timers");
        await setDoc(timersDoc, timersData, { merge: true });
        await logActivity('limpou', 'todos os timers');
    } catch (error) {
        console.error("Erro ao limpar:", error);
    }
};

window.clearLog = function() {
    alert("Como os logs agora são compartilhados na nuvem com o servidor inteiro, o botão de limpar local foi desativado temporariamente para evitar que alguém apague o histórico dos outros.");
};

// MASTER FEATURE: Click the icon to switch server view
window.promptMasterServer = function() {
    if (currentUser && currentUser.role === 'MASTER') {
        const targetServer = prompt("Modo MASTER Ativado.\nDigite o nome do servidor que deseja monitorar (ex: SA22):", currentServerView);
        if (targetServer && targetServer.trim() !== "") {
            currentServerView = targetServer.trim();
            updateHeader();
            listenToServerData();
            alert(`Conectado ao servidor: ${currentServerView}`);
        }
    }
};

// Add listener to boss icon
document.addEventListener('DOMContentLoaded', () => {
    const bossIcon = document.querySelector('.boss-icon');
    if(bossIcon) {
        bossIcon.style.cursor = 'pointer';
        bossIcon.addEventListener('click', window.promptMasterServer);
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function updateClock() {
    const now = new Date();
    document.getElementById('mainClock').textContent = formatTime(now);
}

function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function formatTimeFromMs(ms) {
    return formatTime(new Date(ms));
}

async function saveSchedule() {
    if (!currentServerView) return;
    const data = {};
    document.querySelectorAll('.schedule-input').forEach(input => {
        data[input.id] = input.value;
    });
    
    try {
        const scheduleDoc = doc(db, "servers", currentServerView, "data", "schedule");
        await setDoc(scheduleDoc, { inputs: data }, { merge: true });
    } catch (error) {
        console.error("Erro ao salvar schedule:", error);
    }
}

async function logActivity(action, target) {
    if (!currentUser || !currentServerView) return;
    
    const now = new Date();
    const logEntry = {
        time: formatTime(now),
        user: currentUser.nickname,
        server: currentUser.server, // Origin server of the user
        action: action,
        target: target,
        floor: currentFloor,
        timestamp: now.getTime()
    };
    
    try {
        await addDoc(collection(db, "servers", currentServerView, "logs"), logEntry);
    } catch (e) {
        console.error("Erro ao registrar log:", e);
    }
}

function renderLogs() {
    const container = document.getElementById('activityLog');
    if (!container) return;
    
    const floorLogs = activityLogs.filter(log => log.floor === currentFloor);
    
    if (floorLogs.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhuma atividade registrada neste andar.</span>';
        return;
    }
    
    let html = '';
    floorLogs.forEach((log, index) => {
        const isNew = index === 0 && (Date.now() - log.timestamp < 5000);
        html += `
            <div class="log-entry ${isNew ? 'new' : ''}">
                <span class="log-time">[${log.time}]</span>
                <span class="log-user">${log.user} <span style="color:var(--text-muted);font-weight:400;font-size:0.8rem">(${log.server})</span></span>
                <span class="log-action">${log.action}</span>
                <span class="log-action">${log.target}</span>
                <span class="log-floor">(Piso ${log.floor})</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

function refreshTimerDisplay() {
    document.querySelectorAll('[id$="-morreu"], [id$="-nasceu"]').forEach(el => {
        el.textContent = '--:--:--';
        el.closest('tr')?.classList.remove('timer-soon', 'timer-ready');
    });

    const floorTimers = timersData[currentFloor] || {};
    
    for (const [bossId, timer] of Object.entries(floorTimers)) {
        const morreuEl = document.getElementById(`${bossId}-morreu`);
        const nasceuEl = document.getElementById(`${bossId}-nasceu`);
        
        if (morreuEl) {
            morreuEl.textContent = formatTimeFromMs(timer.killedAt);
        }
        if (nasceuEl) {
            nasceuEl.textContent = formatTimeFromMs(timer.respawnAt);
        }
    }
}

function updateActiveTimers() {
    const container = document.getElementById('activeTimers');
    if (!container) return;
    
    const now = Date.now();
    let chips = [];
    const floorTimers = timersData[currentFloor] || {};
    
    for (const [id, timer] of Object.entries(floorTimers)) {
        const remaining = timer.respawnAt - now;
        const meta = timerMeta[id];
        
        if (!meta) continue;
        
        if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const timeLeft = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const isSoon = remaining < 5 * 60 * 1000;
            
            chips.push(`
                <div class="active-timer-chip ${meta.chipClass} ${isSoon ? 'soon' : ''}">
                    <span>${meta.label}</span>
                    <strong>${timeLeft}</strong>
                </div>
            `);
            
            const nasceuEl = document.getElementById(`${id}-nasceu`);
            if (nasceuEl) {
                if (isSoon) {
                    nasceuEl.closest('tr')?.classList.add('timer-soon');
                    nasceuEl.closest('tr')?.classList.remove('timer-ready');
                } else {
                    nasceuEl.closest('tr')?.classList.remove('timer-soon');
                    nasceuEl.closest('tr')?.classList.remove('timer-ready');
                }
            }
        } else {
            chips.push(`
                <div class="active-timer-chip ${meta.chipClass} soon">
                    <span>${meta.label}</span>
                    <strong>NASCEU!</strong>
                </div>
            `);
            
            const nasceuEl = document.getElementById(`${id}-nasceu`);
            if (nasceuEl) {
                nasceuEl.closest('tr')?.classList.remove('timer-soon');
                nasceuEl.closest('tr')?.classList.add('timer-ready');
            }
        }
    }
    
    if (chips.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">Nenhum timer ativo — clique em um boss para iniciar</span>';
    } else {
        container.innerHTML = chips.join('');
    }
}

async function checkAlerts() {
    if (!currentServerView) return;
    const now = Date.now();
    let updated = false;
    
    // Use local timersData because it's in sync with Firebase
    for (const [floor, floorTimers] of Object.entries(timersData)) {
        for (const [id, timer] of Object.entries(floorTimers)) {
            if (timer.notified) continue;
            
            const remaining = timer.respawnAt - now;
            
            if (remaining <= 0) {
                timersData[floor][id].notified = true;
                updated = true;
                const meta = timerMeta[id];
                if (meta) {
                    showNotification(`PISO ${floor}: ${meta.label} NASCEU!`, `O boss/recurso está disponível no servidor ${currentServerView}!`);
                }
            }
        }
    }
    
    if (updated) {
        try {
            const timersDoc = doc(db, "servers", currentServerView, "data", "timers");
            await setDoc(timersDoc, timersData, { merge: true });
        } catch (error) {}
    }
}

function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '👹' });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                new Notification(title, { body, icon: '👹' });
            }
        });
    }
    try {
        const audio = document.getElementById('alertSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        }
    } catch (e) {}
}

window.exportTimers = function() {
    const now = new Date();
    let text = `=== BOSSES PISO SECRETO (PISO ${currentFloor} - ${currentServerView}) ===\n`;
    text += `Data/Hora: ${now.toLocaleString('pt-BR')}\n\n`;
    
    const floorTimers = timersData[currentFloor] || {};
    
    for (const [id, timer] of Object.entries(floorTimers)) {
        const meta = timerMeta[id];
        if (!meta) continue;
        
        const killed = formatTimeFromMs(timer.killedAt);
        const respawn = formatTimeFromMs(timer.respawnAt);
        const status = timer.respawnAt > Date.now() ? 'AGUARDANDO' : 'NASCEU';
        
        text += `${meta.label}: Morreu ${killed} | Nasce ${respawn} | ${status}\n`;
    }
    
    text += `\n=== Reds e Liders 3 ===\n`;
    document.querySelectorAll('.schedule-input').forEach(input => {
        if (input.value) {
            text += `${input.id}: ${input.value}\n`;
        }
    });
    
    navigator.clipboard.writeText(text).then(() => {
        alert('Dados copiados para a área de transferência!');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('Dados copiados para a área de transferência!');
    });
};

document.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}, { once: true });

// ============================================
// PRESENCE & RANKING LOGIC
// ============================================

let currentFile = null;

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('presenceImage');
    const preview = document.getElementById('imagePreview');
    const dropZoneText = document.getElementById('dropZoneText');

    if (!dropZone) return;

    // Click to select
    dropZone.addEventListener('click', () => fileInput.click());

    // File selected via input
    fileInput.addEventListener('change', function(e) {
        handleFile(this.files[0]);
    });

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--purple-primary)';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-default)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-default)';
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Paste
    document.addEventListener('paste', (e) => {
        // Only handle paste if we are on the presence tab
        if(document.getElementById('presenceContainer').style.display === 'block') {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.type.indexOf('image') === 0) {
                    handleFile(item.getAsFile());
                    break;
                }
            }
        }
    });

    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            alert('Por favor, selecione uma imagem válida.');
            return;
        }
        currentFile = file;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
            dropZoneText.style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
});

// Helper: Get ISO Week Number
function getISOWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return d.getUTCFullYear() + "-W" + String(weekNo).padStart(2, '0');
}

window.submitPresence = async function() {
    if (!currentUser) {
        alert("Você precisa estar logado!");
        return;
    }
    
    const eventType = document.getElementById('presenceEvent').value;
    if (!eventType) {
        alert("Por favor, selecione qual evento foi lutado.");
        return;
    }

    if (!currentFile) {
        alert("Por favor, anexe a comprovação (Print).");
        return;
    }

    // Validação de 15 minutos (Como todos os eventos do jogo acontecem em horas fechadas :00)
    // O jogador só pode enviar a print entre 00 e 15 minutos de qualquer hora.
    const now = new Date();
    const currentMinutes = now.getMinutes();
    
    if (currentMinutes > 15) {
        alert("Fora do horário permitido! Você só pode enviar prints até 15 minutos após o início de um evento.");
        return;
    }

    const msg = document.getElementById('presenceMessage');
    msg.textContent = 'Enviando... Por favor, aguarde.';
    msg.style.color = 'var(--text-primary)';
    document.getElementById('btnSubmitPresence').disabled = true;

    try {
        const serverToUse = currentServerView || currentUser.server;
        const weekStr = getISOWeekNumber(now);
        
        // Upload para Storage
        const fileRef = ref(storage, `attendance/${serverToUse}/${weekStr}/${currentUser.uid}_${Date.now()}.jpg`);
        const uploadResult = await uploadBytes(fileRef, currentFile);
        const downloadURL = await getDownloadURL(uploadResult.ref);

        // Salvar no Firestore
        await addDoc(collection(db, `servers/${serverToUse}/attendance`), {
            uid: currentUser.uid,
            nickname: currentUser.nickname,
            event: eventType,
            imageUrl: downloadURL,
            timestamp: now.getTime(),
            weekNumber: weekStr,
            points: 5
        });

        msg.textContent = 'Presença registrada com sucesso! +5 Pontos!';
        msg.style.color = 'var(--green-primary)';
        
        // Reset form
        currentFile = null;
        document.getElementById('presenceEvent').value = '';
        document.getElementById('imagePreview').style.display = 'none';
        document.getElementById('dropZoneText').style.display = 'block';

        setTimeout(() => { msg.textContent = ''; }, 5000);
    } catch (error) {
        console.error("Erro ao enviar presença:", error);
        msg.textContent = 'Erro ao enviar. Tente novamente.';
        msg.style.color = 'var(--red-primary)';
    } finally {
        document.getElementById('btnSubmitPresence').disabled = false;
    }
};

window.loadWeeklyRanking = async function() {
    if (!currentUser) return;
    
    const tbody = document.getElementById('rankingBody');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Carregando ranking...</td></tr>';
    
    const serverToUse = currentServerView || currentUser.server;
    const weekStr = getISOWeekNumber(new Date());

    try {
        const q = query(
            collection(db, `servers/${serverToUse}/attendance`),
            where("weekNumber", "==", weekStr)
        );
        
        const snapshot = await getDocs(q);
        const pointsMap = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            if (!pointsMap[data.nickname]) {
                pointsMap[data.nickname] = 0;
            }
            pointsMap[data.nickname] += data.points || 5;
        });

        // Convert to array and sort
        const ranking = Object.keys(pointsMap).map(nick => ({
            nickname: nick,
            points: pointsMap[nick]
        })).sort((a, b) => b.points - a.points);

        tbody.innerHTML = '';
        if (ranking.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Nenhuma presença registrada nesta semana ainda.</td></tr>';
            return;
        }

        ranking.forEach((player, index) => {
            const tr = document.createElement('tr');
            let positionColor = 'inherit';
            let positionText = index + 1;
            
            if (index === 0) { positionColor = '#fbbf24'; positionText = '🥇 1º'; }
            else if (index === 1) { positionColor = '#94a3b8'; positionText = '🥈 2º'; }
            else if (index === 2) { positionColor = '#b45309'; positionText = '🥉 3º'; }
            
            tr.innerHTML = `
                <td style="color:${positionColor}; font-weight:bold;">${positionText}</td>
                <td>${player.nickname}</td>
                <td style="color:var(--green-primary); font-weight:bold;">${player.points} pts</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar ranking:", error);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--red-primary);">Erro ao carregar ranking.</td></tr>';
    }
};

