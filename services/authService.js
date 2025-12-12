/**
 * Servicio de Autenticación
 *
 * Maneja autenticación de usuarios, hashing de contraseñas y gestión de sesiones
 */

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const UserDatabase = require('./userDatabase');

const SALT_ROUNDS = 10;
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 horas

class AuthService {
  constructor(dbPath = './data/users.db') {
    this.userDb = new UserDatabase(dbPath);
  }

  /**
   * Hashea contraseña usando bcrypt
   */
  async hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verifica contraseña contra hash
   */
  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Registra nuevo usuario
   */
  async register(username, password, role = 'user') {
    // Validar entrada
    if (!username || username.length < 3) {
      throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
    }

    if (!password || password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }

    if (!['admin', 'user'].includes(role)) {
      throw new Error('Rol inválido');
    }

    // Hashear contraseña
    const passwordHash = await this.hashPassword(password);

    // Crear usuario
    return this.userDb.createUser(username, passwordHash, role);
  }

  /**
   * Inicia sesión de usuario y crea sesión
   */
  async login(username, password) {
    // Buscar usuario
    const user = this.userDb.findUserByUsername(username);
    if (!user) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    // Verificar contraseña
    const isValid = await this.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    // Actualizar último login
    this.userDb.updateLastLogin(user.id);

    // Crear sesión
    const sessionId = uuidv4();
    this.userDb.createSession(sessionId, user.id, SESSION_DURATION);

    return {
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };
  }

  /**
   * Cierra sesión de usuario (elimina sesión)
   */
  logout(sessionId) {
    return this.userDb.deleteSession(sessionId);
  }

  /**
   * Valida sesión y obtiene información del usuario
   */
  validateSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const session = this.userDb.findSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      userId: session.user_id,
      username: session.username,
      role: session.role
    };
  }

  /**
   * Obtiene todos los usuarios (solo admin)
   */
  getAllUsers() {
    return this.userDb.getAllUsers();
  }

  /**
   * Elimina usuario (solo admin)
   */
  deleteUser(userId) {
    // Prevenir eliminar el último admin
    const users = this.userDb.getAllUsers();
    const admins = users.filter(u => u.role === 'admin');

    if (admins.length === 1 && admins[0].id === userId) {
      throw new Error('No se puede eliminar el último administrador');
    }

    return this.userDb.deleteUser(userId);
  }

  /**
   * Guarda mensaje de chat en el historial
   */
  saveChatMessage(userId, question, answer, sources = null) {
    return this.userDb.saveChatMessage(userId, question, answer, sources);
  }

  /**
   * Obtiene historial de chat para usuario
   */
  getChatHistory(userId, limit = 50) {
    return this.userDb.getChatHistory(userId, limit);
  }

  /**
   * Inicializa usuario admin por defecto si no existe ningún admin
   */
  async initializeDefaultAdmin(adminPassword = 'admin123') {
    if (this.userDb.adminExists()) {
      console.log('✓ Usuario admin ya existe');
      return null;
    }

    console.log('⚙️  Creando usuario admin por defecto...');
    const admin = await this.register('admin', adminPassword, 'admin');
    console.log('✓ Usuario admin creado: admin / ' + adminPassword);
    console.log('⚠️  IMPORTANTE: Cambia la contraseña del admin después del primer login');

    return admin;
  }

  /**
   * Cambia contraseña de usuario
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = this.userDb.findUserById(userId);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Obtener hash de contraseña
    const userWithHash = this.userDb.findUserByUsername(user.username);

    // Verificar contraseña anterior
    const isValid = await this.verifyPassword(oldPassword, userWithHash.password_hash);
    if (!isValid) {
      throw new Error('Contraseña actual incorrecta');
    }

    if (newPassword.length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
    }

    // Hashear nueva contraseña y actualizar
    const newHash = await this.hashPassword(newPassword);
    const stmt = this.userDb.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    stmt.run(newHash, userId);
  }

  /**
   * Limpia sesiones expiradas periódicamente
   */
  startSessionCleaner(intervalMs = 60 * 60 * 1000) {
    // Limpiar inmediatamente
    this.userDb.cleanExpiredSessions();

    // Luego limpiar cada hora
    setInterval(() => {
      this.userDb.cleanExpiredSessions();
    }, intervalMs);
  }

  /**
   * Cierra conexión a la base de datos
   */
  close() {
    this.userDb.close();
  }
}

module.exports = AuthService;
