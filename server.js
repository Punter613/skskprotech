const express = require('express');
const path = require('path');

const diagnose = require('./src/routes/diagnose');
const estimate = require('./src/routes/estimate');
const invoice = require('./src/routes/invoice');
const payments = require('./src/routes/payments');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/diagnose', diagnose);
app.use('/api/estimate', estimate);
app.use('/api/invoice', invoice);
app.use('/api/payments', payments);

app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message || 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on ${port}`));
