const socket = io();
const postsList = document.getElementById('postsList');
const postForm = document.getElementById('postForm');
const contentInput = document.getElementById('content');
const charCountSpan = document.getElementById('charCount');
const postButton = document.querySelector('.post-btn');
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const currentUserSpan = document.getElementById('currentUser');
const appContainer = document.querySelector('.app-container');
const mediaFileInput = document.getElementById('mediaFile');
const mediaBtn = document.getElementById('mediaBtn');
const mediaPreviewDiv = document.getElementById('mediaPreview');

let currentAuthor = null;
const MAX_CHARS = 280;
const ACTION_COLOR = '#657786';


// --- UTILERÍAS ---
function formatTime(isoDate) {
    const date = new Date(isoDate);
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString('es-ES', options);
}

// --- FUNCIÓN MODIFICADA: Renderizado del Área de Respuestas ---
async function toggleReplyArea(postId) {
    const postEl = document.getElementById(postId);
    const existingReplyArea = document.getElementById(`reply-area-${postId}`);
    
    if (existingReplyArea) {
        existingReplyArea.remove();
        return;
    }

    const newReplyArea = document.createElement('div');
    newReplyArea.id = `reply-area-${postId}`;
    newReplyArea.classList.add('reply-area');
    
    // Cargar respuestas de la API
    let replies;
    try {
        replies = await fetch(`/api/posts/${postId}/replies`).then(res => res.json());
    } catch(e) {
        replies = [];
    }
    
    // Renderizado de las respuestas existentes (INCLUYE EL BOTÓN DE LIKE)
    let repliesHtml = replies.map(reply => {
        const userHasLiked = reply.likedBy && reply.likedBy.includes(currentAuthor);
        const likeIcon = userHasLiked ? '❤️' : '🤍';
        
        return `
            <div class="small-reply-item" id="reply-${reply._id}">
                <div class="small-reply-author">@${reply.author}</div>
                <div class="small-reply-content">${reply.content}</div>
                <div class="small-reply-actions">
                    <small class="small-reply-date">${formatTime(reply.createdAt)}</small>
                    <button class="small-reply-like-btn" data-id="${reply._id}" onclick="likePost('${reply._id}')">
                        <span class="small-like-icon">${likeIcon}</span>
                        <span class="small-like-count">${reply.likes}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    if (replies.length > 0) {
        repliesHtml = `<div class="replies-list">${repliesHtml}</div>`;
    } else {
        repliesHtml = '<p class="no-replies">Sé el primero en responder.</p>';
    }

    newReplyArea.innerHTML = `
        <div class="reply-section-header">
            <h3>Respuestas (${replies.length})</h3>
        </div>
        ${repliesHtml}
        <div class="reply-form-container">
            <textarea id="reply-content-${postId}" placeholder="Escribe tu respuesta..."></textarea>
            <button class="primary-btn" onclick="submitReply('${postId}')">Responder</button>
        </div>
    `;
    
    const postActions = postEl.querySelector('.post-actions');
    postEl.insertBefore(newReplyArea, postActions.nextSibling);

    document.getElementById(`reply-content-${postId}`).focus();
}


// --- FUNCIÓN DE RENDERIZADO PRINCIPAL (Feed) ---
function renderPost(post, prepend = true) {
    if (post.type === 'reply') return; 
    if (document.getElementById(post._id)) return;
    
    const postEl = document.createElement('div');
    postEl.className = 'post-item';
    postEl.id = post._id;

    let contentHTML = post.content || '';
    let mediaHTML = '';
    
    // 1. Renderizar Multimedia
    if (post.mediaUrl && post.mediaType) {
        if (post.mediaType === 'image') {
            mediaHTML = `<img src="${post.mediaUrl}" alt="Imagen de ${post.author}" class="post-media full-width-media" onclick="window.open(this.src)">`;
        } else if (post.mediaType === 'video') {
            mediaHTML = `<video src="${post.mediaUrl}" controls class="post-media full-width-media"></video>`;
        }
    }
    
    // 2. Renderizar Repost
    if (post.type === 'repost' && post.repostOfId) {
        const original = post.repostOfId;
        if (original) {
            contentHTML = `
                ${post.content === 'Repost' || !post.content ? '' : `<p>${post.content}</p>`} 
                <div class="reposted-post">
                    <div class="reposted-author">@${original.author}</div>
                    <div class="reposted-message">${original.content.substring(0, 100)}${original.content.length > 100 ? '...' : ''}</div>
                </div>
            `;
        }
    }
    
    // 3. Determinar estado de Like
    const userHasLiked = post.likedBy && post.likedBy.includes(currentAuthor);
    const likeIcon = userHasLiked ? '❤️' : '🤍';
    
    postEl.innerHTML = `
        <div class="post-header">
            <span class="post-author">@${post.author}</span> ·
            <span class="post-date">${formatTime(post.createdAt)}</span>
        </div>
        <div class="post-content-body">${contentHTML}</div>
        ${mediaHTML}
        
        <div class="post-actions">
            <button class="action-btn reply-btn" onclick="toggleReplyArea('${post._id}')">
                <span class="reply-icon" data-count="0">💬</span>
            </button>
            <button class="action-btn repost-btn" onclick="repostPost('${post._id}')">
                <span class="repost-icon">🔁</span>
                Repost
            </button>
            <button class="action-btn like-btn" data-id="${post._id}" onclick="likePost('${post._id}')">
                <span class="like-icon">${likeIcon}</span>
                <span class="like-count">${post.likes}</span>
            </button>
        </div>
    `;
    
    if (prepend) {
        postsList.insertBefore(postEl, postsList.firstChild);
    } else {
        postsList.appendChild(postEl);
    }
}


// --- API FETCH LÓGICA ---

async function loadPosts() {
    try {
        const res = await fetch('/api/posts');
        const posts = await res.json();
        postsList.innerHTML = '';
        posts.forEach(post => renderPost(post, false));
    } catch (err) {
        postsList.innerHTML = `<div class="loading-state" style="color:red;">Error al cargar publicaciones.</div>`;
    }
}

async function likePost(id) {
    if (!currentAuthor) return alert('Debes iniciar sesión para dar like.');
    await fetch(`/api/posts/${id}/like`, { method: 'POST' });
}

async function repostPost(repostOfId) {
    if (!currentAuthor) return alert('Debes iniciar sesión para hacer repost.');
    if (!confirm('¿Estás seguro de que quieres hacer Repost?')) return;
    
    await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            content: '', 
            type: 'repost',
            repostOfId: repostOfId
        })
    });
}

async function submitReply(replyToId) {
    const content = document.getElementById(`reply-content-${replyToId}`).value.trim();
    if (!content || !currentAuthor) return alert('Escribe tu respuesta.');

    await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            content, 
            type: 'reply',
            replyToId: replyToId
        })
    });
    
    const replyArea = document.getElementById(`reply-area-${replyToId}`);
    if(replyArea) replyArea.remove();
    // Forzamos la recarga del área para incluir la nueva respuesta
    toggleReplyArea(replyToId); 
}


// --- LÓGICA DE LOGIN ---

async function checkLoginStatus() {
    const res = await fetch('/api/user');
    const data = await res.json();
    if (data.author) {
        currentAuthor = data.author;
        currentUserSpan.textContent = `@${data.author}`;
        loginModal.style.display = 'none';
        appContainer.classList.remove('hidden-app');
        loadPosts();
    } else {
        loginModal.style.display = 'flex';
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = document.getElementById('username').value.trim().replace('@', '');
    if (!author) return;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author })
    });
    const data = await res.json();
    if (data.success) {
        checkLoginStatus();
    }
});


// --- LÓGICA DE EVENTOS Y MULTIMEDIA ---

function updatePostButtonState() {
    const currentLength = contentInput.value.length;
    const fileSelected = mediaFileInput.files.length > 0;
    const remaining = MAX_CHARS - currentLength;
    
    charCountSpan.textContent = remaining;
    
    const canPost = (currentLength > 0 && currentLength <= MAX_CHARS) || fileSelected;
    
    postButton.disabled = !canPost;
    
    if (remaining < 0) {
        charCountSpan.style.color = 'red';
    } else if (remaining <= 20) {
        charCountSpan.style.color = 'orange';
    } else {
        charCountSpan.style.color = ACTION_COLOR;
    }
}

contentInput.addEventListener('input', updatePostButtonState);

postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentAuthor) return alert('Error de sesión.');
    
    const content = contentInput.value.trim();
    const file = mediaFileInput.files[0];
    
    if (!content && !file) return;

    postButton.disabled = true;

    const formData = new FormData();
    formData.append('content', content);
    formData.append('type', 'post');
    if (file) formData.append('media', file);
    
    await fetch('/api/posts', {
        method: 'POST',
        body: formData
    });
    
    postForm.reset();
    mediaFileInput.value = null; 
    mediaPreviewDiv.innerHTML = '';
    mediaPreviewDiv.classList.add('hidden');
    updatePostButtonState(); 
});

mediaBtn.addEventListener('click', () => {
    mediaFileInput.click();
});

mediaFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    mediaPreviewDiv.innerHTML = '';
    mediaPreviewDiv.classList.add('hidden');
    
    if (file) {
        const url = URL.createObjectURL(file);
        
        if (file.type.startsWith('image/')) {
            mediaPreviewDiv.innerHTML = `<img src="${url}" alt="Vista previa" style="max-width: 100%; border-radius: 8px;">`;
        } else if (file.type.startsWith('video/')) {
            mediaPreviewDiv.innerHTML = `<video src="${url}" controls style="max-width: 100%; border-radius: 8px;"></video>`;
        }
        
        mediaPreviewDiv.classList.remove('hidden');
    }
    
    updatePostButtonState(); 
});


// --- SOCKET.IO: Escuchar en Tiempo Real (Actualización de Likes) ---

// Escucha nuevos posts/reposts
socket.on('newPost', (post) => {
    if (post.type === 'post' || post.type === 'repost') {
        renderPost(post, true);
    }
});

// Escucha la actualización de Likes (funciona para posts y respuestas)
socket.on('likeUpdate', (data) => {
    // 1. Intentar actualizar en el Feed principal
    let likeBtn = document.querySelector(`#${data.id}.post-item .like-btn`);
    
    // 2. Si no está en el feed, buscar en la lista de Respuestas
    if (!likeBtn) {
        likeBtn = document.querySelector(`#reply-${data.id} .small-reply-like-btn`);
    }

    if (likeBtn) {
        likeBtn.querySelector('.small-like-count, .like-count').textContent = data.likes;
        const icon = likeBtn.querySelector('.small-like-icon, .like-icon');
        
        if (data.isLiked) {
            icon.textContent = '❤️';
        } else {
            icon.textContent = '🤍';
        }
    }
});

// Escucha el evento de nueva respuesta (fuerza la recarga del área si está abierta)
socket.on('replyUpdate', (data) => {
    // Si el área de respuestas para el post afectado está abierta, la recargamos.
    if (document.getElementById(`reply-area-${data.replyToId}`)) {
        toggleReplyArea(data.replyToId);
    }
});


// --- INICIALIZACIÓN ---
checkLoginStatus();