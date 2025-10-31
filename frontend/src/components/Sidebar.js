import React from 'react';

const Sidebar = ({
                   config,
                   handleConfigChange,
                   uploadJson,
                   downloadJson,
                   resetAll,
                   handleRunSnapshot,
                   handleRunSnapshotDebug,
                   handleRunSnapshotSequential,
                   customScreenRange,
                   setCustomScreenRange,
                   handleRunCustomRange,
                   customScreenRangeParallel,
                   setCustomScreenRangeParallel,
                   handleRunCustomRangeParallel,
                   isRunning,
                   isDragging,
                   isProcessingFile,
                   handleDragOver,
                   handleDragLeave,
                   handleDrop,
                   configSummary,
                   error,
                   logs,
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
          <label>Base URL (Optional)</label>
          <input
            type="text"
            name="baseUrl"
            value={config.baseUrl || ''}
            onChange={handleConfigChange}
            placeholder="https://example.com"
          />
          <div className="form-hint">
            Base URL for relative paths. Leave empty to use full URLs in screens.
          </div>
        </div>

        <div className="form-group">
          <label>Username (optional)</label>
          <input
            name="username"
            autoComplete="off"
            value={config.username}
            onChange={handleConfigChange}
            placeholder="Basic auth username"
          />
        </div>

        <div className="form-group">
          <label>Password (optional)</label>
          <input
            name="password"
            type="password"
            autoComplete="off"
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

        <div className="config-section">
          <h3>🚀 Run Snapshots</h3>

          {/* Run All - Parallel */}
          <div className="button-group">
            <button
              onClick={handleRunSnapshot}
              disabled={isRunning || config.screens.length === 0}
              className="button primary"
            >
              📸 Run All (Parallel)
            </button>
            <button
              onClick={handleRunSnapshotDebug}
              disabled={isRunning || config.screens.length === 0}
              className="button secondary"
            >
              🔍 Debug All (Parallel)
            </button>
          </div>

          {/* Run All - Sequential */}
          <div className="button-group" style={{ marginTop: '10px' }}>
            <button
              onClick={() => handleRunSnapshotSequential(false)}
              disabled={isRunning || config.screens.length === 0}
              className="button primary"
            >
              🔄 Run All (One by One)
            </button>
            <button
              onClick={() => handleRunSnapshotSequential(true)}
              disabled={isRunning || config.screens.length === 0}
              className="button secondary"
            >
              🔍 Debug All (One by One)
            </button>
          </div>

          {/* Parallel Custom Range */}
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #34495e' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: '#ecf0f1', fontWeight: '600' }}>
              🚀 Parallel Custom Range
            </label>
            <input
              type="text"
              value={customScreenRangeParallel}
              onChange={(e) => setCustomScreenRangeParallel(e.target.value)}
              placeholder="e.g., 1-5 or 1,3,5 or 1-3,7,9-12"
              disabled={isRunning || config.screens.length === 0}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #34495e',
                background: 'rgb(60, 60, 60)',
                color: '#ecf0f1',
                fontSize: '0.9em',
                marginTop: '8px',
                marginBottom: '16px',
              }}
            />
            <div className="button-group">
              <button
                onClick={() => handleRunCustomRangeParallel(false)}
                disabled={isRunning || config.screens.length === 0 || !customScreenRangeParallel}
                className="button primary"
              >
                ⚡ Run Parallel
              </button>
              <button
                onClick={() => handleRunCustomRangeParallel(true)}
                disabled={isRunning || config.screens.length === 0 || !customScreenRangeParallel}
                className="button secondary"
              >
                🔍 Debug Parallel
              </button>
            </div>
            <div style={{ fontSize: '0.75em', color: '#95a5a6', marginTop: '8px', lineHeight: '1.5' }}>
              Runs selected screens in <strong>parallel batches</strong> (fast)
            </div>
          </div>

          {/* Sequential Custom Range */}
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #34495e' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: '#ecf0f1', fontWeight: '600' }}>
              🔄 Sequential Custom Range
            </label>
            <input
              type="text"
              value={customScreenRange}
              onChange={(e) => setCustomScreenRange(e.target.value)}
              placeholder="e.g., 1-5 or 1,3,5 or 1-3,7,9-12"
              disabled={isRunning || config.screens.length === 0}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid #34495e',
                background: 'rgb(60, 60, 60)',
                color: '#ecf0f1',
                fontSize: '0.9em',
                marginTop: '8px',
                marginBottom: '16px',
              }}
            />
            <div className="button-group">
              <button
                onClick={() => handleRunCustomRange(false)}
                disabled={isRunning || config.screens.length === 0 || !customScreenRange}
                className="button primary"
              >
                🔄 Run Sequential
              </button>
              <button
                onClick={() => handleRunCustomRange(true)}
                disabled={isRunning || config.screens.length === 0 || !customScreenRange}
                className="button secondary"
              >
                🔍 Debug Sequential
              </button>
            </div>
            <div style={{ fontSize: '0.75em', color: '#95a5a6', marginTop: '8px', lineHeight: '1.5' }}>
              Runs selected screens <strong>one by one</strong> (slower, more stable)
            </div>
          </div>

          {/* Examples */}
          <div className="run-info" style={{ marginTop: '15px' }}>
            <strong>Examples:</strong><br/>
            • <code>1-5</code> - Screens 1 through 5<br/>
            • <code>1,3,5,7</code> - Screens 1, 3, 5, and 7<br/>
            • <code>1-3,7,9-12</code> - Screens 1-3, 7, and 9-12<br/>
            • Total screens: <strong>{config.screens.length}</strong>
          </div>

          <div className="run-info" style={{ marginTop: '10px', fontSize: '0.85em', color: '#95a5a6' }}>
            <strong>Parallel:</strong> Fast, all screens at once<br/>
            <strong>One by One:</strong> Slower, but more stable
          </div>
        </div>

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
