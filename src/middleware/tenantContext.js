const checkTenantContext = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing X-Tenant-ID context header.' });
  }
  
  // Attach tenant context directly to the request object for pipeline visibility
  req.tenantId = tenantId;
  next();
};

module.exports = { checkTenantContext };
