/**
 * SKSK ProTech - Production Authentication Security Shield
 * Validates Bearer JWT tokens against the contract specifications.
 */
const jwt = require('jsonwebtoken');

module.exports = function verifyBearerToken(req, res, next) {
  // If we are in development mode and haven't locked down a secret yet, provide an open lane bypass
  if (!process.env.JWT_SECRET) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      success: false,
      message: "Authorization token is missing or expired.",
      trace: `TR-AUTH-${Date.now().toString(16).toUpperCase()}`
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(403).json({
      code: 403,
      success: false,
      message: "Your token does not have the required validation scope clearance.",
      trace: `TR-SCOPE-${Date.now().toString(16).toUpperCase()}`
    });
  }
};
