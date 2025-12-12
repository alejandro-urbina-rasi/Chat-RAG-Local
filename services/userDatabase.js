/**
 * User Database Service
 *
 * Manages user authentication and session data in SQLite database
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class UserDatabase {
  constructor(dbPath = './data/users.db') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initTables();
  }

  /**
   * Initialize database tables
   */
  initTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Chat history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sources TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
    `);

    console.log('✓ Tablas de usuarios inicializadas');
  }

  /**
   * Create a new user
   */
  createUser(username, passwordHash, role = 'user') {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);

    try {
      const result = stmt.run(username, passwordHash, role);
      return { id: result.lastInsertRowid, username, role };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new Error('El nombre de usuario ya existe');
      }
      throw error;
    }
  }

  /**
   * Find user by username
   */
  findUserByUsername(username) {
    const stmt = this.db.prepare(`
      SELECT id, username, password_hash, role, created_at, last_login
      FROM users
      WHERE username = ?
    `);
    return stmt.get(username);
  }

  /**
   * Find user by ID
   */
  findUserById(userId) {
    const stmt = this.db.prepare(`
      SELECT id, username, role, created_at, last_login
      FROM users
      WHERE id = ?
    `);
    return stmt.get(userId);
  }

  /**
   * Get all users (admin only)
   */
  getAllUsers() {
    const stmt = this.db.prepare(`
      SELECT id, username, role, created_at, last_login
      FROM users
      ORDER BY created_at DESC
    `);
    return stmt.all();
  }

  /**
   * Update last login time
   */
  updateLastLogin(userId) {
    const stmt = this.db.prepare(`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(userId);
  }

  /**
   * Delete user
   */
  deleteUser(userId) {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  /**
   * Create session
   */
  createSession(sessionId, userId, expiresInMs = 24 * 60 * 60 * 1000) {
    const expiresAt = new Date(Date.now() + expiresInMs).toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(sessionId, userId, expiresAt);
  }

  /**
   * Find session by ID
   */
  findSession(sessionId) {
    const stmt = this.db.prepare(`
      SELECT s.id, s.user_id, s.expires_at, u.username, u.role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `);
    return stmt.get(sessionId);
  }

  /**
   * Delete session (logout)
   */
  deleteSession(sessionId) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(sessionId);
    return result.changes > 0;
  }

  /**
   * Clean expired sessions
   */
  cleanExpiredSessions() {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE expires_at <= datetime('now')
    `);
    const result = stmt.run();
    if (result.changes > 0) {
      console.log(`✓ ${result.changes} sesiones expiradas eliminadas`);
    }
    return result.changes;
  }

  /**
   * Save chat message to history
   */
  saveChatMessage(userId, question, answer, sources = null) {
    const stmt = this.db.prepare(`
      INSERT INTO chat_history (user_id, question, answer, sources)
      VALUES (?, ?, ?, ?)
    `);

    const sourcesJson = sources ? JSON.stringify(sources) : null;
    stmt.run(userId, question, answer, sourcesJson);
  }

  /**
   * Get chat history for user
   */
  getChatHistory(userId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT id, question, answer, sources, created_at
      FROM chat_history
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    const history = stmt.all(userId, limit);

    // Parse sources JSON
    return history.map(msg => ({
      ...msg,
      sources: msg.sources ? JSON.parse(msg.sources) : null
    }));
  }

  /**
   * Check if admin user exists
   */
  adminExists() {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE role = 'admin'
    `);
    const result = stmt.get();
    return result.count > 0;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = UserDatabase;
