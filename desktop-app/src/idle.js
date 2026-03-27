// Idle detection is handled in main.js using powerMonitor.getSystemIdleTime()
// This file provides the threshold constant and any utility functions

const DEFAULT_IDLE_THRESHOLD = 300; // 5 minutes in seconds

module.exports = { DEFAULT_IDLE_THRESHOLD };
