// Configuration
let peer = null;
let currentRoom = null;
let connections = [];

// Éléments DOM
const roomNameInput = document.getElementById('roomName');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomStatus = document.getElementById('roomStatus');
const chatArea = document.getElementById('chatArea');
const currentRoomSpan = document.getElementById('currentRoom');
const leaveBtn = document.getElementById('leaveBtn');
const connectionStatus = document.getElementById('connectionStatus');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Vérifier si un salon est spécifié dans l'URL
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
    roomNameInput.value = roomFromUrl;
    setTimeout(() => joinRoom(), 500);
}

// Gestionnaires d'événements
createBtn.addEventListener('click', createRoom);
joinBtn.addEventListener('click', joinRoom);
leaveBtn.addEventListener('click', leaveRoom);
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Créer un salon (hôte)
async function createRoom() {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        showStatus('Veuillez entrer un nom de salon', 'error');
        return;
    }

    if (peer) {
        peer.destroy();
    }

    showStatus('🔧 Création du salon...', 'info');
    
    // Générer un ID unique pour le peer
    const peerId = generatePeerId();
    
    peer = new Peer(peerId, {
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        showStatus(`✅ Salon "${roomName}" créé !`, 'success');
        currentRoom = roomName;
        currentRoomSpan.textContent = roomName;
        chatArea.style.display = 'block';
        roomStatus.innerHTML = '';
        
        // Mettre à jour l'URL sans recharger la page
        const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
        window.history.pushState({}, '', newUrl);
        
        // Attendre les connexions
        connectionStatus.innerHTML = '🎯 En attente de quelqu\'un qui rejoint...<br><small>Partagez ce lien pour inviter :</small><br>' + 
            `<strong>${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}</strong>`;
        
        addSystemMessage(`Salon "${roomName}" créé. Partagez le lien pour inviter quelqu'un !`);
    });

    peer.on('connection', (conn) => {
        handleNewConnection(conn);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        showStatus('Erreur de connexion. Rafraîchissez la page.', 'error');
    });
}

// Rejoindre un salon
async function joinRoom() {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        showStatus('Veuillez entrer un nom de salon', 'error');
        return;
    }

    if (peer) {
        peer.destroy();
    }

    showStatus(`🔍 Recherche du salon "${roomName}"...`, 'info');
    
    const peerId = generatePeerId();
    peer = new Peer(peerId, {
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        currentRoom = roomName;
        currentRoomSpan.textContent = roomName;
        chatArea.style.display = 'block';
        roomStatus.innerHTML = '';
        
        connectionStatus.innerHTML = '🔄 Tentative de connexion...';
        
        // La connexion se fait via l'ID du salon (qui doit être le même que l'hôte)
        // Pour simplifier, on utilise l'ID du salon comme ID du peer de l'hôte
        const hostPeerId = roomName; // L'hôte utilise roomName comme ID
        
        const conn = peer.connect(hostPeerId, {
            reliable: true
        });
        
        handleNewConnection(conn);
        
        // Mettre à jour l'URL
        const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
        window.history.pushState({}, '', newUrl);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            showStatus(`Le salon "${roomName}" n'existe pas ou est inaccessible.`, 'error');
        } else {
            showStatus('Erreur de connexion. Vérifiez que l\'hôte est en ligne.', 'error');
        }
    });
}

// Gérer une nouvelle connexion
function handleNewConnection(conn) {
    connections.push(conn);
    
    conn.on('open', () => {
        connectionStatus.innerHTML = '✅ Connecté ! Vous pouvez maintenant discuter.';
        addSystemMessage('Un utilisateur a rejoint le chat');
        
        // Envoyer l'historique des messages (optionnel)
        // Pour l'instant, juste un message de bienvenue
        sendToPeer(conn, {
            type: 'system',
            text: 'a rejoint le chat'
        });
    });
    
    conn.on('data', (data) => {
        handleIncomingMessage(data, conn);
    });
    
    conn.on('close', () => {
        // Retirer la connexion de la liste
        const index = connections.indexOf(conn);
        if (index > -1) {
            connections.splice(index, 1);
        }
        addSystemMessage('Un utilisateur a quitté le chat');
        
        if (connections.length === 0) {
            connectionStatus.innerHTML = '🔌 Plus personne dans le chat. En attente de nouveaux participants...';
        }
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
    });
}

// Envoyer un message à tous les pairs connectés
function sendMessageToAll(message) {
    connections.forEach(conn => {
        if (conn.open) {
            sendToPeer(conn, {
                type: 'message',
                text: message,
                timestamp: Date.now()
            });
        }
    });
}

// Envoyer des données à un pair spécifique
function sendToPeer(conn, data) {
    if (conn && conn.open) {
        conn.send(data);
    }
}

// Gérer les messages entrants
function handleIncomingMessage(data, fromConn) {
    if (data.type === 'message') {
        addMessage(data.text, false, data.timestamp);
    } else if (data.type === 'system') {
        addSystemMessage(`👤 ${data.text}`);
    }
}

// Envoyer un message
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || connections.length === 0) {
        if (connections.length === 0) {
            addSystemMessage('Personne n\'est connecté pour recevoir votre message');
        }
        return;
    }
    
    addMessage(message, true);
    sendMessageToAll(message);
    messageInput.value = '';
    messageInput.focus();
}

// Ajouter un message à l'interface
function addMessage(text, isSelf, timestamp = Date.now()) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSelf ? 'self' : 'other'}`;
    
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(text)}</div>
        <div class="message-meta">${time}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Ajouter un message système
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.innerHTML = `<span>🔔 ${escapeHtml(text)}</span>`;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Quitter le salon
function leaveRoom() {
    // Fermer toutes les connexions
    connections.forEach(conn => {
        if (conn.open) {
            conn.close();
        }
    });
    connections = [];
    
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    // Réinitialiser l'interface
    chatArea.style.display = 'none';
    currentRoom = null;
    messagesDiv.innerHTML = '';
    connectionStatus.innerHTML = '';
    
    // Nettoyer l'URL
    window.history.pushState({}, '', window.location.pathname);
    
    showStatus('Vous avez quitté le salon', 'info');
}

// Afficher un statut dans la section de création
function showStatus(message, type) {
    roomStatus.innerHTML = `<div class="status ${type}">${message}</div>`;
    setTimeout(() => {
        if (roomStatus.innerHTML.includes(message)) {
            roomStatus.innerHTML = '';
        }
    }, 5000);
}

// Générer un ID unique
function generatePeerId() {
    return Math.random().toString(36).substring(2, 15);
}

// Échapper les caractères HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
