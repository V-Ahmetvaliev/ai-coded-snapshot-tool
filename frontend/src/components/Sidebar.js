import React from 'react';

const Sidebar = ({
                   config,
                   handleConfigChange,
                   uploadJson,
                   downloadJson,
                   resetAll,
                   handleRunSnapshot,
                   handleRunSnapshotDebug,
                   isRunning,
                   isDragging,
                   isProcessingFile,
                   handleDragOver,
                   handleDragLeave,
                   handleDrop,
                   configSummary,
                   error,
                   logs
                 }) => {
  return (
    <div className="sidebar">
      {/* Upload Section */}
      <div className="panel">
        <h2 className="panel-title">📁 Configuration</h2>
        <div
          className={`file-upload-area ${isDragging ? 'dragging' : ''} ${isProcessingFile ? 'processing' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="file-upload-content">
            <div className="file-upload-icon">
              {isProcessingFile ? '⏳' : isDragging ? '📥' : '📄'}
            </div>
            <div className="file-upload-text">
              {isProcessingFile ? (
                <strong>Processing file...</strong>
              ) : (
                <>
                  <strong>Drop JSON file here</strong>
                  <span>or</span>
                </>
              )}
            </div>
            {!isProcessingFile && (
              <label className="file-upload-button">
                <input
                  type="file"
                  onChange={uploadJson}
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                />
                Choose File
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Site Configuration */}
      <div className="panel">
        <h2 className="panel-title">⚙️ Site Configuration</h2>
        <div className="form-group">
          <label>Site Name</label>
          <input
            name="siteName"
            value={config.siteName}
            onChange={handleConfigChange}
            placeholder="My Website"
          />
        </div>

        <div className="form-group">
          <label>Username (optional)</label>
          <input
            name="usernameWithoutAutofill"
            autoComplete="ChromePleaseNo"
            value={config.username}
            onChange={handleConfigChange}
            placeholder="Basic auth username"
          />
        </div>

        <div className="form-group">
          <label>Password (optional)</label>
          <input
            name="passwordWithoutAutofill"
            type="password"
            autoComplete="ChromePleaseNo"
            value={config.password}
            onChange={handleConfigChange}
            placeholder="Basic auth password"
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.enableLazyLoading}
              onChange={e => handleConfigChange({
                target: { name: 'enableLazyLoading', value: e.target.checked, type: 'checkbox' }
              })}
            />
            Enable automatic lazy loading and animations trigger
          </label>
        </div>

        <div className="viewport-config">
          <div className="viewport-section">
            <h4>🖥️ Desktop Viewport</h4>
            <div className="viewport-inputs">
              <input
                name="desktopWidth"
                type="number"
                value={config.desktopWidth}
                onChange={handleConfigChange}
                placeholder="Width"
              />
              <span>×</span>
              <input
                name="desktopHeight"
                type="number"
                value={config.desktopHeight}
                onChange={handleConfigChange}
                placeholder="Height"
              />
            </div>
          </div>

          <div className="viewport-section">
            <h4>📱 Mobile Viewport</h4>
            <div className="viewport-inputs">
              <input
                name="mobileWidth"
                type="number"
                value={config.mobileWidth}
                onChange={handleConfigChange}
                placeholder="Width"
              />
              <span>×</span>
              <input
                name="mobileHeight"
                type="number"
                value={config.mobileHeight}
                onChange={handleConfigChange}
                placeholder="Height"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="panel">
        <h2 className="panel-title">🎮 Controls</h2>
        <div className="control-summary">
          <div className="summary-item">
            <span className="summary-label">Screens:</span>
            <span className="summary-value">{configSummary.totalScreens}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Actions:</span>
            <span className="summary-value">{configSummary.totalActions}</span>
          </div>
        </div>

        <button
          className={`button primary ${isRunning ? 'loading' : ''}`}
          onClick={handleRunSnapshot}
          disabled={isRunning || config.screens.length === 0}
        >
          {isRunning ? '🔄 Running...' : '🚀 Run Snapshot'}
        </button>

        <button
          className={`button secondary ${isRunning ? 'loading' : ''}`}
          onClick={handleRunSnapshotDebug}
          disabled={isRunning || config.screens.length === 0}
        >
          {isRunning ? '🔄 Running Debug...' : '🔍 Run Snapshot With Debug'}
        </button>

        <button
          className="button secondary"
          onClick={downloadJson}
          disabled={isRunning}
        >
          💾 Download JSON
        </button>

        <button
          className="button danger"
          onClick={resetAll}
          disabled={isRunning}
        >
          🗑️ Reset All
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="panel error-panel">
          <h2 className="panel-title">❌ Error</h2>
          <div className="error-message">{error}</div>
        </div>
      )}

      {/* Logs */}
      <div className="panel logs-panel">
        <h2 className="panel-title">📋 Logs</h2>
        <div className="logs-content">
          {logs.length === 0 ? (
            <div className="logs-empty">No logs yet...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="log-entry">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
