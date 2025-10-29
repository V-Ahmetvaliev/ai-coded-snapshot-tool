const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const runSnapshot = require('./puppeteer-runner');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

// Ensure necessary directories exist
const ensureDirectories = async () => {
  const dirs = ['snapshots', 'logs'];
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
};

// Allow any localhost with any port
const allowedOriginsRegex = /^https?:\/\/localhost(:\d+)?$/;

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOriginsRegex.test(origin)) {
      return callback(null, true);
    } else {
      const msg = `CORS policy does not allow access from: ${origin}`;
      return callback(new Error(msg), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST"]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use('/snapshots', express.static(path.join(__dirname, '..', 'snapshots')));

// Socket.IO with the same CORS policy
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOriginsRegex.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✅ Client connected for live preview:', socket.id);

  socket.on('disconnect', (reason) => {
    console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('🔴 Socket error:', error);
  });
});

// API Routes
app.post('/api/run-snapshot', async (req, res) => {
  try {
    const config = req.body;

    if (!config || !config.screens || config.screens.length === 0) {
      return res.status(400).json({ error: 'Invalid configuration or no screens provided' });
    }

    console.log('Starting normal snapshot execution...');
    const result = await runSnapshot(config, null, false);

    res.json({
      success: true,
      logs: result.logs,
      screenshots: result.screenshots,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Snapshot execution failed:', error);
    res.status(500).json({
      success: false,
      error: 'Snapshot execution failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/run-snapshot-debug', async (req, res) => {
  try {
    const config = req.body;

    if (!config || !config.screens || config.screens.length === 0) {
      return res.status(400).json({ error: 'Invalid configuration or no screens provided' });
    }

    console.log('Starting debug snapshot execution with streaming...');
    const result = await runSnapshot(config, io, true);

    res.json({
      success: true,
      logs: result.logs,
      screenshots: result.screenshots,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug snapshot execution failed:', error);
    res.status(500).json({
      success: false,
      error: 'Debug snapshot execution failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post('/api/run-screen-snapshot', async (req, res) => {
  try {
    const { screen, config, screenIndex } = req.body;

    if (!screen || !config) {
      return res.status(400).json({ error: 'Missing screen or config data' });
    }

    // ✅ Use provided screenIndex, or find it
    let actualIndex = screenIndex;

    if (actualIndex === undefined || actualIndex === null) {
      const foundIndex = config.screens.findIndex((s) => s.id === screen.id);
      actualIndex = foundIndex !== -1 ? foundIndex + 1 : 1;
    }

    const totalScreens = config.screens.length;
    const paddingLength = totalScreens.toString().length;

    // ✅ Add index information DIRECTLY to the screen object
    const screenWithIndex = {
      ...screen,
      screenIndex: actualIndex,
      paddingLength: paddingLength
    };

    // ✅ Create config with ONLY this screen, but keep index
    const singleScreenConfig = {
      ...config,
      screens: [screenWithIndex]
    };

    const results = await runSnapshot(singleScreenConfig, null, false);

    res.json({
      success: true,
      logs: results.logs,
      screenshots: results.screenshots
    });

  } catch (error) {
    console.error('Single screenshot error:', error);
    res.status(500).json({
      error: 'Screenshot failed',
      message: error.message
    });
  }
});

app.post('/api/run-screen-snapshot-debug', async (req, res) => {
  try {
    const { screen, config, screenIndex } = req.body;

    if (!screen || !config) {
      return res.status(400).json({ error: 'Missing screen or config data' });
    }

    // ✅ Use provided screenIndex, or find it
    let actualIndex = screenIndex;

    if (actualIndex === undefined || actualIndex === null) {
      const foundIndex = config.screens.findIndex((s) => s.id === screen.id);
      actualIndex = foundIndex !== -1 ? foundIndex + 1 : 1;
    }

    const totalScreens = config.screens.length;
    const paddingLength = totalScreens.toString().length;

    // ✅ Add index information DIRECTLY to the screen object
    const screenWithIndex = {
      ...screen,
      screenIndex: actualIndex,
      paddingLength: paddingLength
    };

    const singleScreenConfig = {
      ...config,
      screens: [screenWithIndex]
    };

    const results = await runSnapshot(singleScreenConfig, io, true);

    res.json({
      success: true,
      logs: results.logs,
      screenshots: results.screenshots
    });

  } catch (error) {
    console.error('Debug screenshot error:', error);
    res.status(500).json({
      error: 'Screenshot failed',
      message: error.message
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/screenshots', async (req, res) => {
  try {
    const snapshotsDir = path.join(__dirname, '..', 'snapshots');
    const files = await fs.readdir(snapshotsDir);
    const screenshots = files.filter(file => file.endsWith('.png'));
    res.json({ screenshots });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list screenshots' });
  }
});

// Initialize and start server
const startServer = async () => {
  await ensureDirectories();
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📸 Screenshots available at http://localhost:${PORT}/snapshots`);
  });
};

startServer().catch(console.error);

module.exports = app;
