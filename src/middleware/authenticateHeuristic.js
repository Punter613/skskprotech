const jwt = require('jsonwebtoken');

function authenticateHeuristic(req, res, next) {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Access denied. No token provided or malformed authorization header.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      error: 'Invalid or expired token.'
    });
  }
}

module.exports = authenticateHeuristic;
