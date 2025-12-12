/**
 * Middleware de Autenticación y Autorización
 *
 * Protege rutas y valida sesiones de usuario
 */

/**
 * Middleware para verificar si el usuario está autenticado
 * Lee el ID de sesión del header Authorization o de la cookie
 */
function requireAuth(authService) {
  return (req, res, next) => {
    // Obtener ID de sesión del header Authorization o cookie
    const sessionId = req.headers.authorization?.replace('Bearer ', '') ||
                     req.cookies?.sessionId;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: 'No autenticado. Por favor inicia sesión.'
      });
    }

    // Validar sesión
    const user = authService.validateSession(sessionId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida o expirada. Por favor inicia sesión nuevamente.'
      });
    }

    // Adjuntar información del usuario al request
    req.user = user;
    req.sessionId = sessionId;

    next();
  };
}

/**
 * Middleware para verificar si el usuario tiene rol de administrador
 * Debe usarse después de requireAuth
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'No autenticado'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requieren permisos de administrador.'
    });
  }

  next();
}

/**
 * Middleware de autenticación opcional - no falla si no hay auth, solo agrega usuario si está disponible
 */
function optionalAuth(authService) {
  return (req, res, next) => {
    const sessionId = req.headers.authorization?.replace('Bearer ', '') ||
                     req.cookies?.sessionId;

    if (sessionId) {
      const user = authService.validateSession(sessionId);
      if (user) {
        req.user = user;
        req.sessionId = sessionId;
      }
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  optionalAuth
};
