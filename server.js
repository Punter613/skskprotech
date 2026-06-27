// =================================================================
// PRODUCTION ROUTING LANES (Clean, inline, and isolated)
// =================================================================
app.use('/api/scrape', require('./src/routes/scrape'));
app.use('/api/parts', require('./src/routes/parts'));
app.use('/api/full-estimate', require('./src/routes/full-estimate'));
app.use('/api/buyer', require('./src/routes/buyer'));
app.use('/api/jobs', require('./src/routes/jobs'));
app.use('/api/diagnose', require('./src/routes/diagnose'));
app.use('/api/invoice', require('./src/routes/invoice'));
app.use('/api/translate', require('./src/routes/translate'));
app.use('/api/parts-lookup', require('./src/routes/partsLookup'));
app.use('/api/fleet', require('./src/routes/fleet'));
app.use('/api/oem', require('./src/routes/oem')); // 💡 Explicit path added safely

// Handle the heuristic route safely by requiring its middleware directly
const authMiddleware = require('./src/middleware/authenticateHeuristic');
if (typeof authMiddleware === 'function') {
  app.use('/api/estimateHeuristic', authMiddleware, require('./src/routes/estimate'));
} else {
  // Destructuring fallback if you exported it as an object { authenticateHeuristic }
  const { authenticateHeuristic } = require('./src/middleware/authenticateHeuristic');
  app.use('/api/estimateHeuristic', authenticateHeuristic, require('./src/routes/estimate'));
}

// 2. 🚨 STRIPE WEBHOOK EVENT PROCESSING CORE (CRITICAL PLACEMENT)
// This must be placed BEFORE global body parsers to preserve the raw request stream
const webhookRouter = require('./src/routes/webhooks');
app.use('/api/webhooks', webhookRouter); 

// 3. GLOBAL BODY PARSERS (For all other standard routes)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 4. ROUTE INFRASTRUCTURE & DEPENDENCIES
const diagnose = require('./src/routes/diagnose');
const estimateHeuristic = require('./src/routes/estimate'); 
const invoice = require('./src/routes/invoice');
const oemRouter = require('./src/routes/oem');
const scrapeRouter = require('./src/routes/scrape');
const partsRouter = require('./src/routes/parts');
const fullEstimateRouter = require('./src/routes/full-estimate');
const jobsRouter = require('./src/routes/jobs');
const partsLookupRouter = require('./src/routes/partsLookup');
const fleetRouter = require('./src/routes/fleet');
const verifyToken = require('./src/middleware/auth');

// Production Spec Routing Lanes
app.use('/api/diagnose', diagnose);
app.use('/api/estimateHeuristic', verifyToken, estimateHeuristic);
app.use('/api/invoice', invoice);
app.use('/api/scrape', scrapeRouter);
app.use('/api/parts', partsRouter);
app.use('/api/full-estimate', fullEstimateRouter);
app.use('/api/jobs', verifyToken, jobsRouter);
app.use('/api/parts-lookup', partsLookupRouter);
app.use('/api/fleet', verifyToken, fleetRouter);
app.use('/api/oem', oemRouter);

// 5. CATCH-ALL FOR UNHANDLED ROUTES (404)
app.use((req, res, next) => {
  res.status(404).json({ error: 'Resource Not Found' });
});

// 6. GLOBAL ERROR HANDLING MIDDLEWARE
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 7. INITIALIZE SERVICES & LISTEN
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is processing requests on port ${PORT}`);
  
  // Safeguard database connections or spin up continuous loops
  try {
    startKeepAwakeLoop();
  } catch (error) {
    console.error('Failed to initiate keep awake sequence:', error.message);
  }
});
