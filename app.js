import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, query, orderBy, limit, addDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

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
