// Configuration
let localPeerConnection = null;
let dataChannel = null;
let isHost = true;
let myUsername = '';
let otherUsername = '';
let isConnected = false;

// Éléments DOM
const offerPanel = document.getElementById('offerPanel');
const answerPanel = document.getElementById('answerPanel');
const chatContainer = document.getElementById('chatContainer');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Configuration STUN (serveurs gratuits pour la connexion P2P)
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' }
    ]
};

// Changer de mode (Hôte / Invité)
function setMode(mode) {
    isHost = (mode === 'offer');
    
    // Mettre à jour les boutons
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    if (mode === 'offer') {
        document.querySelector('.mode-btn:first-child').classList.add('active');
        offerPanel.classList.add('active');
        answerPanel.classList.remove('active');
    } else {
        document.querySelector('.mode-btn:last-child').classList.add('active');
        offerPanel.classList.remove('active');
        answerPanel.classList.add('active');
    }
    
    // Fermer toute connexion existante
    if (localPeerConnection) {
        localPeerConnection.close();
        localPeerConnection = null;
    }
    dataChannel = null;
    isConnected = false;
    chatContainer.style.display = 'none';
    
    // Réinitialiser les champs
    document.getElementById('offerText').value = '';
    document.getElementById('answerText').value = '';
    document.getElementById('receivedOfferText').value = '';
    document.getElementById('responseText').value = '';
}

// Attendre que tous les ICE candidates soient collectés
function waitForIceGathering(pc) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve(pc.localDescription);
        } else {
            pc.addEventListener('icegatheringstatechange', () => {
                if (pc.iceGatheringState === 'complete') {
                    resolve(pc.localDescription);
                }
            });
        }
    });
}

// Configurer les handlers du data channel
function setupDataChannelHandlers() {
    if (!dataChannel) return;
    
    dataChannel.onopen = () => {
        console.log('Data channel ouvert');
        if (!isConnected) {
            isConnected = true;
            startChat();
            // Envoyer le pseudo à l'autre utilisateur
            dataChannel.send(JSON.stringify({
                type: 'info',
                username: myUsername
            }));
        }
    };
    
    dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'info') {
            otherUsername = data.username;
            addSystemMessage(`${otherUsername} a rejoint le chat`);
        } else if (data.type === 'message') {
            addMessage(data.text, false, data.username);
        }
    };
    
    dataChannel.onclose = () => {
        addSystemMessage('🔌 La connexion a été fermée');
        messageInput.disabled = true;
        sendBtn.disabled = true;
        isConnected = false;
    };
    
    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
        addSystemMessage('❌ Erreur de connexion');
    };
}

// Démarrer l'interface de chat
function startChat() {
    chatContainer.style.display = 'block';
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
    
    if (isHost) {
        updateStatus('offerStatus', 'connected', '✅ Connecté ! Vous pouvez discuter.');
    } else {
        updateStatus('answerStatus', 'connected', '✅ Connecté ! Vous pouvez discuter.');
    }
    
    addSystemMessage('Chat connecté ! Vous pouvez envoyer des messages.');
}

// ============ FONCTIONS HÔTE ============

// Générer l'offre (Hôte)
async function generateOffer() {
    myUsername = document.getElementById('offerUsername').value.trim() || 'Hôte';
    
    // Réinitialiser
    if (localPeerConnection) {
        localPeerConnection.close();
    }
    
    localPeerConnection = new RTCPeerConnection(configuration);
    
    // Créer le data channel
    dataChannel = localPeerConnection.createDataChannel('chat');
    setupDataChannelHandlers();
    
    // Créer l'offre
    try {
        const offer = await localPeerConnection.createOffer();
        await localPeerConnection.setLocalDescription(offer);
        
        // Attendre que les ICE candidates soient rassemblées
        const offerWithIce = await waitForIceGathering(localPeerConnection);
        
        // Afficher l'offre
        const offerTextarea = document.getElementById('offerText');
        offerTextarea.value = JSON.stringify(offerWithIce);
        
        document.getElementById('copyOfferBtn').disabled = false;
        document.getElementById('submitAnswerBtn').disabled = false;
        
        updateStatus('offerStatus', 'waiting', '📤 Offre générée ! Copiez-la et envoyez-la à l\'invité, puis attendez sa réponse.');
        
        // Effacer l'ancienne réponse
        document.getElementById('answerText').value = '';
        
    } catch (error) {
        console.error('Erreur lors de la génération de l\'offre:', error);
        updateStatus('offerStatus', 'error', '❌ Erreur lors de la génération de l\'offre. Rafraîchissez la page.');
    }
}

// Copier l'offre
function copyOffer() {
    const offerText = document.getElementById('offerText').value;
    if (!offerText) {
        alert('Générez d\'abord une offre');
        return;
    }
    navigator.clipboard.writeText(offerText).then(() => {
        alert('✅ Offre copiée ! Envoyez-la à l\'autre personne par SMS, WhatsApp, etc.');
    }).catch(() => {
        alert('Copie manuelle : sélectionnez le texte et faites Ctrl+C');
    });
}

// Envoyer la réponse (Hôte)
async function submitAnswer() {
    const answerText = document.getElementById('answerText').value;
    if (!answerText) {
        alert('Collez d\'abord la réponse de l\'invité');
        return;
    }
    
    try {
        const answer = JSON.parse(answerText);
        await localPeerConnection.setRemoteDescription(answer);
        updateStatus('offerStatus', 'connected', '✅ Connexion établie ! Attente de l\'autre utilisateur...');
    } catch (error) {
        console.error('Erreur:', error);
        alert('❌ Erreur: La réponse n\'est pas valide. Vérifiez que vous avez bien copié tout le texte.');
        updateStatus('offerStatus', 'error', '❌ Réponse invalide. Réessayez.');
    }
}

// ============ FONCTIONS INVITÉ ============

// Traiter l'offre (Invité)
async function processOffer() {
    myUsername = document.getElementById('answerUsername').value.trim() || 'Invité';
    const offerText = document.getElementById('receivedOfferText').value;
    
    if (!offerText) {
        alert('Collez d\'abord l\'offre de l\'hôte');
        return;
    }
    
    try {
        const offer = JSON.parse(offerText);
        
        // Réinitialiser
        if (localPeerConnection) {
            localPeerConnection.close();
        }
        
        localPeerConnection = new RTCPeerConnection(configuration);
        
        // Gérer le data channel entrant
        localPeerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannelHandlers();
        };
        
        await localPeerConnection.setRemoteDescription(offer);
        
        const answer = await localPeerConnection.createAnswer();
        await localPeerConnection.setLocalDescription(answer);
        
        const answerWithIce = await waitForIceGathering(localPeerConnection);
        
        // Afficher la réponse
        const responseTextarea = document.getElementById('responseText');
        responseTextarea.value = JSON.stringify(answerWithIce);
        document.getElementById('copyResponseBtn').disabled = false;
        
        updateStatus('answerStatus', 'waiting', '📤 Réponse générée ! Copiez-la et envoyez-la à l\'hôte.');
        
    } catch (error) {
        console.error('Erreur:', error);
        alert('❌ Erreur: L\'offre n\'est pas valide. Demandez à l\'hôte de générer une nouvelle offre.');
        updateStatus('answerStatus', 'error', '❌ Offre invalide. Réessayez.');
    }
}

// Copier la réponse (Invité)
function copyResponse() {
    const responseText = document.getElementById('responseText').value;
    if (!responseText) {
        alert('Traitez d\'abord l\'offre');
        return;
    }
    navigator.clipboard.writeText(responseText).then(() => {
        alert('✅ Réponse copiée ! Envoyez-la à l\'hôte.');
    }).catch(() => {
        alert('Copie manuelle : sélectionnez le texte et faites Ctrl+C');
    });
}

// ============ FONCTIONS COMMUNES ============

// Envoyer un message
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
        addSystemMessage('❌ Pas de connexion active. Attendez que la connexion soit établie.');
        return;
    }
    
    addMessage(message, true, myUsername);
    dataChannel.send(JSON.stringify({
        type: 'message',
        text: message,
        username: myUsername,
        timestamp: Date.now()
    }));
    messageInput.value = '';
    messageInput.focus();
}

// Ajouter un message à l'interface
function addMessage(text, isSelf, username) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSelf ? 'self' : 'other'}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        <div class="message-content">
            <div>${escapeHtml(text)}</div>
            <div class="message-meta">
                ${!isSelf ? `<strong>${escapeHtml(username)}</strong> · ` : ''}
                ${time}
            </div>
        </div>
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

// Mettre à jour le statut
function updateStatus(elementId, type, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.className = `status ${type}`;
        element.innerHTML = message;
    }
}

// Échapper le HTML pour éviter les injections
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Écouteurs d'événements
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Initialiser l'interface
console.log('Chat P2P prêt !');
