/**
 * Comptes locaux Position · GPS Camion
 * Admin pré-créé + inscription client.
 * Stockage : localStorage (par navigateur / appareil).
 */
(function (global) {
  const STORAGE_USERS = 'positionGpsUsers_v1';
  const STORAGE_SESSION = 'positionGpsSession_v1';
  const ADMIN_USERNAME = 'admin';
  // Mot de passe admin : GpsCamion#Admin26  (hash SHA-256 + sel fixe app)
  const ADMIN_SALT = 'position-gps-camion-v1';
  const ADMIN_PASSWORD_PLAIN = 'GpsCamion#Admin26';

  async function sha256(text) {
    if (global.crypto && crypto.subtle) {
      const data = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Repli simple si crypto.subtle indisponible (certains contextes file://)
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8) +
      ('00000000' + ((h ^ text.length) >>> 0).toString(16)).slice(-8);
  }

  async function hashPassword(password, salt) {
    return sha256(ADMIN_SALT + '|' + salt + '|' + password);
  }

  function loadUsers() {
    try {
      const raw = localStorage.getItem(STORAGE_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
  }

  function publicUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt
    };
  }

  async function ensureAdmin() {
    const users = loadUsers();
    const existing = users.find(u => u.username.toLowerCase() === ADMIN_USERNAME);
    const salt = 'admin-seed';
    const passwordHash = await hashPassword(ADMIN_PASSWORD_PLAIN, salt);
    if (!existing) {
      users.push({
        id: 'admin',
        username: ADMIN_USERNAME,
        name: 'Administrateur',
        email: 'admin@position-gps.local',
        role: 'admin',
        salt,
        passwordHash,
        createdAt: new Date().toISOString()
      });
      saveUsers(users);
      return;
    }
    // Toujours resynchroniser le hash admin (accès de travail)
    existing.role = 'admin';
    existing.salt = salt;
    existing.passwordHash = passwordHash;
    existing.name = existing.name || 'Administrateur';
    existing.email = existing.email || 'admin@position-gps.local';
    saveUsers(users);
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION);
      if (!raw) return null;
      const session = JSON.parse(raw);
      const user = loadUsers().find(u => u.id === session.userId);
      return user ? publicUser(user) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(userId) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify({
      userId,
      at: new Date().toISOString()
    }));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_SESSION);
  }

  async function registerClient({ username, name, email, password }) {
    await ensureAdmin();
    const u = (username || '').trim();
    const n = (name || '').trim();
    const e = (email || '').trim().toLowerCase();
    const p = password || '';

    if (u.length < 3) throw new Error('Nom d\'utilisateur : au moins 3 caractères');
    if (!/^[a-zA-Z0-9._-]+$/.test(u)) throw new Error('Nom d\'utilisateur invalide (lettres, chiffres, . _ -)');
    if (u.toLowerCase() === ADMIN_USERNAME) throw new Error('Ce nom d\'utilisateur est réservé');
    if (n.length < 2) throw new Error('Entre ton nom complet');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Courriel invalide');
    if (p.length < 6) throw new Error('Mot de passe : au moins 6 caractères');

    const users = loadUsers();
    if (users.some(x => x.username.toLowerCase() === u.toLowerCase())) {
      throw new Error('Ce nom d\'utilisateur existe déjà');
    }
    if (users.some(x => (x.email || '').toLowerCase() === e)) {
      throw new Error('Ce courriel est déjà utilisé');
    }

    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(p, salt);
    const user = {
      id: crypto.randomUUID(),
      username: u,
      name: n,
      email: e,
      role: 'client',
      salt,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);
    setSession(user.id);
    return publicUser(user);
  }

  async function login(username, password) {
    await ensureAdmin();
    const u = (username || '').trim();
    const users = loadUsers();
    const user = users.find(x => x.username.toLowerCase() === u.toLowerCase());
    if (!user) throw new Error('Identifiant ou mot de passe incorrect');
    const hash = await hashPassword(password || '', user.salt);
    if (hash !== user.passwordHash) throw new Error('Identifiant ou mot de passe incorrect');
    setSession(user.id);
    return publicUser(user);
  }

  function logout() {
    clearSession();
  }

  function listUsers() {
    return loadUsers().map(publicUser);
  }

  function deleteUser(userId, actor) {
    if (!actor || actor.role !== 'admin') throw new Error('Accès administrateur requis');
    if (userId === 'admin' || userId === actor.id) throw new Error('Impossible de supprimer ce compte');
    const users = loadUsers().filter(u => u.id !== userId);
    saveUsers(users);
  }

  global.PositionAuth = {
    ensureAdmin,
    getSession,
    registerClient,
    login,
    logout,
    listUsers,
    deleteUser,
    ADMIN_USERNAME
  };
})(window);
