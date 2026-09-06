const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in required." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
}

// Attaches req.userId if a valid token is present, but doesn't reject the
// request if it's missing — useful for endpoints that behave differently
// for signed-in vs anonymous users without requiring auth outright.
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = payload.sub;
    } catch (err) {
      // ignore invalid token, treat as anonymous
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
