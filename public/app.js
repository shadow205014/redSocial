// public/app.js

// === 1. ESTADO GLOBAL Y ELEMENTOS DEL DOM ===
let state = {
    token: localStorage.getItem('token') || null,
    currentUser: null, // { username, displayName, profilePictureUrl }
};

const socket = io();

// Referencias a todas las "vistas"
const views = {
    login: document.getElementById('login-view'),
    register: document.getElementById('register-view'),
    feed: document.getElementById('feed-view'),
    profile: document.getElementById('profile-view'),
};

// Referencias a elementos de la UI
const navLinksMain = document.getElementById('nav-links-main');
const navPostButton = document.getElementById('nav-post-button');
const navProfileWidget = document.getElementById('nav-profile-widget');
const postBoxAvatar = document.getElementById('post-box-avatar');

// === 2. NAVEGACIÓN Y MANEJO DE VISTAS ===

/**
 * Muestra una vista y oculta las demás
 * @param {string} viewName - 'login', 'register', 'feed', 'profile'
 * @param {object} [data] - Datos opcionales para cargar la vista (ej: { username: 'elon' })
 */
async function showView(viewName, data = null) {
    // Ocultar todas las vistas
    for (const key in views) {
        views[key].classList.add('hidden');
    }

    // Mostrar la vista solicitada
    const viewToShow = views[viewName];
    if (viewToShow) {
        viewToShow.classList.remove('hidden');

        // Cargar datos específicos de la vista
        if (viewName === 'feed') {
            await loadFeedPosts();
        } else if (viewName === 'profile' && data && data.username) {
            await loadProfilePage(data.username);
        }
        
    } else {
        console.error(`Vista "${viewName}" no encontrada`);
        views.login.classList.remove('hidden'); // Fallback a login
    }
    
    updateNavigationUI();
}

/**
 * Actualiza la barra de navegación basada en el estado de login
 */
function updateNavigationUI() {
    if (state.token && state.currentUser) {
        // --- Usuario Logueado ---
        navLinksMain.innerHTML = `
            <a class="nav-link active" id="nav-home-link">
                <i class="fa-solid fa-house"></i>
                <span>Home</span>
            </a>
            <a class="nav-link" id="nav-profile-link">
                <i class="fa-solid fa-user"></i>
                <span>Profile</span>
            </a>
            <a class="nav-link" id="nav-logout-link">
                <i class="fa-solid fa-right-from-bracket"></i>
                <span>Logout</span>
            </a>
        `;
        navPostButton.classList.remove('hidden');
        
     
        
        // Actualizar widget de perfil
        navProfileWidget.innerHTML = `
            <div class="user-info">
                <div class="display-name">${state.currentUser.displayName}</div>
                <div class="username">@${state.currentUser.username}</div>
            </div>
        `;
        navProfileWidget.classList.remove('hidden');
        
        // Actualizar avatar en la caja de posteo
        postBoxAvatar.src = state.currentUser.profilePictureUrl;

        // --- Asignar Eventos a Nav Links ---
        document.getElementById('nav-home-link').onclick = () => showView('feed');
        document.getElementById('nav-profile-link').onclick = () => showView('profile', { username: state.currentUser.username });
        document.getElementById('nav-logout-link').onclick = handleLogout;
        navProfileWidget.onclick = () => showView('profile', { username: state.currentUser.username });

    } else {
        // --- Usuario Deslogueado ---
        navLinksMain.innerHTML = `
            <a class="nav-link" id="nav-login-link">
                <i class="fa-solid fa-right-to-bracket"></i>
                <span>Login</span>
            </a>
            <a class="nav-link" id="nav-register-link">
                <i class="fa-solid fa-user-plus"></i>
                <span>Register</span>
            </a>
        `;
        navPostButton.classList.add('hidden');
        navProfileWidget.classList.add('hidden');
        
        // --- Asignar Eventos a Nav Links ---
        document.getElementById('nav-login-link').onclick = () => showView('login');
        document.getElementById('nav-register-link').onclick = () => showView('register');
    }
}

// === 3. RENDERIZACIÓN DE POSTS ===

/**
 * Renderiza un solo post (o repost) y lo devuelve como un elemento HTML
 * @param {object} post - El objeto Post de la API
 */
function renderPost(post) {
    const postElement = document.createElement('article');
    postElement.classList.add('post');
    postElement.dataset.id = post._id; // ID del post (o del repost)

    const isRepost = post.originalPost;
    const author = post.author;
    
    // Si es un repost, el post a mostrar es el original
    const postToShow = isRepost ? post.originalPost : post;
    const authorOfPostToShow = postToShow.author;
    
    // Formatear la fecha
    const postDate = new Date(postToShow.createdAt).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'short'
    });
    
    // Asegurar que la URL de la imagen de perfil sea completa
    const authorAvatar = (authorOfPostToShow.profilePictureUrl.startsWith('http') ?
        authorOfPostToShow.profilePictureUrl :
        `/${authorOfPostToShow.profilePictureUrl}`); // Añadir / al inicio si es local

    postElement.innerHTML = `
        <img src="${authorAvatar}" alt="Avatar" class="avatar">
        <div class="post-content">
            
            ${isRepost ? `
                <div class="repost-info">
                    <i class="fa-solid fa-retweet"></i>
                    <strong class="repost-author" data-username="${author.username}">${author.displayName}</strong> reposteó
                </div>
            ` : ''}

            <div class="post-header">
                <strong class="post-author" data-username="${authorOfPostToShow.username}">${authorOfPostToShow.displayName}</strong>
                <span class="username">@${authorOfPostToShow.username} · ${postDate}</span>
            </div>
            
            <div class="post-body">
                <p>${postToShow.content}</p>
            </div>
            
            <div class="post-actions">
                <div class="action-btn action-reply">
                    <i class="fa-regular fa-comment"></i>
                    <span>0</span>
                </div>
                <div class="action-btn action-repost" data-id="${postToShow._id}">
                    <i class="fa-solid fa-retweet"></i>
                    <span>0</span> 
                </div>
                <div class="action-btn action-like" data-id="${postToShow._id}">
                    <i class="fa-regular fa-heart"></i>
                    <span>${postToShow.likes}</span>
                </div>
                <div class="action-btn action-view">
                    <i class="fa-solid fa-chart-simple"></i>
                    <span>0</span>
                </div>
            </div>
        </div>
    `;
    return postElement;
}


// === 4. CARGADORES DE DATOS DE VISTAS ===

async function loadFeedPosts() {
    const feedContainer = document.getElementById('feed-container');
    feedContainer.innerHTML = '<p>Cargando posts...</p>'; // Indicador de carga
    try {
        const response = await fetch('/api/posts');
        if (!response.ok) throw new Error('No se pudieron cargar los posts');
        const posts = await response.json();
        
        feedContainer.innerHTML = ''; // Limpiar
        posts.forEach(post => {
            feedContainer.appendChild(renderPost(post));
        });
    } catch (err) {
        feedContainer.innerHTML = `<p style="color:red">${err.message}</p>`;
    }
}

async function loadProfilePage(username) {
    // Referencias a elementos del perfil
    const headerName = document.getElementById('profile-header-name');
    const avatar = document.getElementById('profile-avatar');
    const displayName = document.getElementById('profile-displayname');
    const usernameEl = document.getElementById('profile-username');
    const postsContainer = document.getElementById('profile-posts-container');
    const uploadForm = document.getElementById('upload-picture-form');

    postsContainer.innerHTML = '<p>Cargando perfil...</p>';
    
    try {
        const response = await fetchWithAuth(`/api/users/${username}`);
        if (!response.ok) throw new Error('No se pudo cargar el perfil');
        
        const { user, posts } = await response.json();

        // Llenar info de perfil
        headerName.textContent = user.displayName;
        avatar.src = (user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : `/${user.profilePictureUrl}`);
        displayName.textContent = user.displayName;
        usernameEl.textContent = `@${user.username}`;
        
        // Mostrar formulario de subida SOLO si es MI perfil
        if (state.currentUser && state.currentUser.username === user.username) {
            uploadForm.classList.remove('hidden');
        } else {
            uploadForm.classList.add('hidden');
        }

        // Llenar posts
        postsContainer.innerHTML = '';
        if (posts.length === 0) {
            postsContainer.innerHTML = '<p>Este usuario aún no ha posteado.</p>';
        } else {
            posts.forEach(post => {
                postsContainer.appendChild(renderPost(post));
            });
        }
    } catch (err) {
        postsContainer.innerHTML = `<p style="color:red">${err.message}</p>`;
    }
}


// === 5. FUNCIONES DE API (con Autenticación) ===

/**
 * Wrapper para 'fetch' que incluye el token de autenticación
 */
async function fetchWithAuth(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    // Si el body es FormData, no pongas Content-Type (el navegador lo hace)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    return fetch(url, { ...options, headers });
}

async function getMyProfile() {
    if (!state.token) return;
    try {
        const response = await fetchWithAuth('/api/users/me');
        if (response.ok) {
            state.currentUser = await response.json();
        } else {
            // Token inválido
            handleLogout();
        }
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        handleLogout();
    }
}

// === 6. MANEJADORES DE EVENTOS ===

// --- Autenticación ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        // ¡Éxito!
        state.token = data.token;
        state.currentUser = data.user;
        localStorage.setItem('token', data.token); // Guardar token
        showView('feed');
        
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('register-displayname').value;
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const errorEl = document.getElementById('register-error');

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName, username, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        // ¡Éxito!
        state.token = data.token;
        state.currentUser = data.user;
        localStorage.setItem('token', data.token); // Guardar token
        showView('feed');

    } catch (err) {
        errorEl.textContent = err.message;
    }
});

function handleLogout() {
    state.token = null;
    state.currentUser = null;
    localStorage.removeItem('token');
    showView('login');
}

// --- Toggle entre Login/Register ---
document.getElementById('show-register').onclick = () => showView('register');
document.getElementById('show-login').onclick = () => showView('login');

// --- Crear Post ---
document.getElementById('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const contentInput = document.getElementById('post-content-input');
    const content = contentInput.value;
    if (!content.trim()) return;

    try {
        const response = await fetchWithAuth('/api/posts', {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        if (!response.ok) throw new Error('No se pudo crear el post');
        
        contentInput.value = ''; // Limpiar
        // Socket.io se encargará de añadirlo al feed
    } catch (err) {
        alert(err.message);
    }
});

// --- Subir Foto de Perfil ---
document.getElementById('upload-picture-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('profile-picture-input');
    if (!input.files || input.files.length === 0) {
        alert('Por favor, selecciona un archivo');
        return;
    }
    
    const formData = new FormData();
    formData.append('profilePicture', input.files[0]);

    try {
        const response = await fetchWithAuth('/api/users/picture', {
            method: 'POST',
            body: formData // No se pone 'Content-Type'
        });
        
        const updatedUser = await response.json();
        if (!response.ok) throw new Error(updatedUser.error);
        
        // Actualizar el estado local y la UI
        state.currentUser.profilePictureUrl = updatedUser.profilePictureUrl;
        await loadProfilePage(state.currentUser.username); // Recargar vista de perfil
        updateNavigationUI(); // Actualizar widgets

    } catch (err) {
        alert(`Error al subir imagen: ${err.message}`);
    }
});

// --- Acciones de Post (Like/Repost/Ver Perfil) ---
// Usamos delegación de eventos en los contenedores de posts
document.getElementById('feed-container').addEventListener('click', handlePostActions);
document.getElementById('profile-posts-container').addEventListener('click', handlePostActions);

async function handlePostActions(e) {
    const likeButton = e.target.closest('.action-like');
    const repostButton = e.target.closest('.action-repost');
    const authorElement = e.target.closest('.post-author, .repost-author');
    
    // --- Clic en "Like" ---
    if (likeButton) {
        const postId = likeButton.dataset.id;
        try {
            await fetchWithAuth(`/api/posts/${postId}/like`, { method: 'POST' });
            // Socket.io se encargará de actualizar el contador
        } catch (err) {
            alert('Error al dar like');
        }
    }
    
    // --- Clic en "Repost" ---
    if (repostButton) {
        if (!state.token) return showView('login');
        const postId = repostButton.dataset.id;
        try {
            const response = await fetchWithAuth(`/api/posts/${postId}/repost`, { method: 'POST' });
            if (!response.ok) throw new Error('Error al repostear');
            // Socket.io se encargará de añadir el nuevo post (repost)
        } catch (err) {
            alert(err.message);
        }
    }

    // --- Clic en nombre de autor ---
    if (authorElement) {
        const username = authorElement.dataset.username;
        showView('profile', { username: username });
    }
}


// === 7. MANEJADORES DE SOCKET.IO ===

socket.on('newPost', (post) => {
    // Añadir el nuevo post al feed si estamos en la vista de feed
    if (!views.feed.classList.contains('hidden')) {
        const feedContainer = document.getElementById('feed-container');
        feedContainer.prepend(renderPost(post));
    }
    // Añadir al perfil si estamos en el perfil de ese autor
    const profileUsername = document.getElementById('profile-username').textContent;
    if (!views.profile.classList.contains('hidden') && profileUsername === `@${post.author.username}`) {
        document.getElementById('profile-posts-container').prepend(renderPost(post));
    }
});

socket.on('likeUpdate', ({ id, likes }) => {
    // Actualizar el contador de likes en todos los posts que coincidan
    const likeSpans = document.querySelectorAll(`.action-like[data-id="${id}"] span`);
    likeSpans.forEach(span => {
        span.textContent = likes;
    });
});


// === 8. INICIO DE LA APLICACIÓN ===
document.addEventListener('DOMContentLoaded', async () => {
    if (state.token) {
        await getMyProfile(); // Obtener datos del usuario si hay token
        if (state.currentUser) {
            showView('feed');
        } else {
            showView('login'); // El token era inválido
        }
    } else {
        showView('login');
    }
});