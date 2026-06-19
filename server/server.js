const express = require('express');
const cors = require('cors');
const scrapeRouter = require('./src/routes/scrape');

const app = express();

// Core Shop Middleware
app.use(cors());
app.use(express.json()); // Allows the engine to parse incoming POST payloads

// Mount the live scraping bay
app.use('/api/scrape', scrapeRouter);

// Mount the supporting estimation tools ecosystems
app.use('/api/estimate', require('./src/routes/estimate'));
app.use('/api/diagnose', require('./src/routes/diagnose'));
app.use('/api/invoice', require('./src/routes/invoice'));

// Catch-all 404 safety valve
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SKSK ProTech server idling cleanly on port ${PORT}`);
});
