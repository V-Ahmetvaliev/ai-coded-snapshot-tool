import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import ActionComponent from './ActionComponent';

const SortableScreenCard = ({ screen, index, children, ...props }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: screen.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="screen-card-container">
      {React.cloneElement(children, { dragHandleProps: { ...attributes, ...listeners }, ...props })}
    </div>
  );
};

const ScreenComponent = React.memo(({
                                      screen,
                                      index,
                                      updateScreen,
                                      deleteScreen,
                                      duplicateScreen,
                                      updateAction,
                                      addAction,
                                      deleteAction,
                                      isExpanded,
                                      toggleExpanded,
                                      onRunSingleScreen,
                                      onRunSingleScreenDebug,
                                      handleActionDragEnd,
                                      isRunning,
                                      dragHandleProps
                                    }) => {
  const actionSections = [
    { key: 'desktopActions', label: 'Desktop Actions', icon: '🖥️', color: '#0e639c' },
    { key: 'mobileActions', label: 'Mobile Actions', icon: '📱', color: '#27ae60' },
    { key: 'sharedActions', label: 'Shared Actions', icon: '🔄', color: '#9b59b6' }
  ];

  const totalActions = (screen.desktopActions?.length || 0) +
    (screen.mobileActions?.length || 0) +
    (screen.sharedActions?.length || 0);

  const getHostname = (url, baseUrl) => {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return new URL(url).hostname;
      }

      if (baseUrl) {
        const cleanBaseUrl = baseUrl.replace(/\/$/, '');
        const cleanUrl = url.startsWith('/') ? url : '/' + url;
        return new URL(cleanBaseUrl + cleanUrl).hostname;
      }

      return url || 'No URL';
    } catch {
      return 'Invalid URL';
    }
  };

  const screenshotTypes = ['Full Page', 'Viewport Only', 'Screenshot of Selector'];

  return (
    <div className="screen-card">
      <div
        className="screen-header"
        onClick={toggleExpanded}
      >
        <div className="screen-header-left">
          <div
            className="drag-handle screen-drag-handle"
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder screens"
          >
            ⋮⋮
          </div>
          <div className="screen-expand-icon">
            {isExpanded ? '▼' : '▶'}
          </div>
          <div className="screen-title">
            <h3>
              {index + 1}. {screen.fileName || 'Untitled Screen'}
            </h3>
            <div className="screen-subtitle">
              {screen.url ? getHostname(screen.url) : 'No URL set'} • {totalActions} actions • {screen.screenshotType || 'Full Page'}
              {screen.screenshotType === 'Screenshot of Selector' && screen.selectorToScreenshot &&
                ` • ${screen.selectorToScreenshot}`
              }
            </div>
          </div>
        </div>
        <div className="screen-header-right">
          <div className="screen-badges">
            <span className={`badge ${screen.screenshotType === 'Screenshot of Selector' ? 'selector-badge' : 'screenshot-type-badge'}`}>
              {screen.screenshotType === 'Screenshot of Selector' ? '🎯 Selector' : screen.screenshotType || 'Full Page'}
            </span>

            {/* ✅ NEW: Viewport badges */}
            {screen.enableDesktop !== false && screen.enableMobile !== false && (
              <span className="badge viewport-badge" title="Desktop & Mobile enabled">
                🖥️📱
              </span>
            )}
            {screen.enableDesktop !== false && screen.enableMobile === false && (
              <span className="badge viewport-badge desktop-only" title="Desktop only">
                🖥️ Only
              </span>
            )}
            {screen.enableDesktop === false && screen.enableMobile !== false && (
              <span className="badge viewport-badge mobile-only" title="Mobile only">
                📱 Only
              </span>
            )}
            {screen.enableDesktop === false && screen.enableMobile === false && (
              <span className="badge viewport-badge disabled" title="Both disabled - will skip">
                ⚠️ Skip
              </span>
            )}

            <span className="badge actions-badge">{totalActions}</span>
          </div>
          <div className="screen-action-buttons">
            <button
              onClick={(e) => {
                e.stopPropagation();
                duplicateScreen();
              }}
              className="screen-action-button duplicate-button"
              title="Duplicate this screen"
              disabled={isRunning}
            >
              📋
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRunSingleScreen(screen.id);
              }}
              className="screen-action-button run-button"
              title="Run snapshot for this screen"
              disabled={
                isRunning ||
                !screen.url ||
                (screen.screenshotType === 'Screenshot of Selector' && !screen.selectorToScreenshot) ||
                (screen.enableDesktop === false && screen.enableMobile === false)
              }
            >
              📸
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRunSingleScreenDebug(screen.id);
              }}
              className="screen-action-button debug-button"
              title="Run snapshot with debug streaming"
              disabled={isRunning || !screen.url || (screen.screenshotType === 'Screenshot of Selector' && !screen.selectorToScreenshot)}
            >
              🔍
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteScreen();
              }}
              className="screen-action-button delete-button"
              title="Delete screen"
              disabled={isRunning}
            >
              🗑️
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="screen-content">
          <div className="screen-config">
            <div className="screen-config-row">
              <div className="form-group">
                <label>Screen Name</label>
                <input
                  value={screen.fileName}
                  onChange={e => updateScreen('fileName', e.target.value)}
                  placeholder="screen-name"
                />
              </div>
              <div className="form-group">
                <label>URL</label>
                <input
                  value={screen.url}
                  onChange={e => updateScreen('url', e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div className="form-group">
                <label>Screenshot Type</label>
                <select
                  value={screen.screenshotType || 'Full Page'}
                  onChange={e => updateScreen('screenshotType', e.target.value)}
                  className="screenshot-type-select"
                >
                  {screenshotTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ✅ NEW: Viewport Enable/Disable Row */}
            <div className="screen-config-row" style={{ marginTop: '10px' }}>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={screen.enableDesktop !== false}
                    onChange={e => updateScreen('enableDesktop', e.target.checked)}
                  />
                  {' '}🖥️ Enable Desktop Screenshot
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={screen.enableMobile !== false}
                    onChange={e => updateScreen('enableMobile', e.target.checked)}
                  />
                  {' '}📱 Enable Mobile Screenshot
                </label>
              </div>

              {/* ✅ Warning if both disabled */}
              {screen.enableDesktop === false && screen.enableMobile === false && (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '10px 15px',
                  background: 'rgba(231, 76, 60, 0.1)',
                  borderLeft: '3px solid #e74c3c',
                  borderRadius: '4px',
                  fontSize: '0.9em',
                  color: '#e74c3c',
                  marginTop: '10px'
                }}>
                  ⚠️ Warning: Both viewports are disabled. This screen will be skipped.
                </div>
              )}
            </div>

            {/* ✅ Screenshot of Selector with crop settings */}
            {screen.screenshotType === 'Screenshot of Selector' && (
              <div className="selector-config">
                <div className="selector-config-header">
                  <h4>🎯 Element Screenshot Settings</h4>
                </div>
                <div className="selector-config-row">
                  <div className="form-group">
                    <label>CSS Selector <span style={{color: '#e74c3c'}}>*</span></label>
                    <input
                      value={screen.selectorToScreenshot || ''}
                      onChange={e => updateScreen('selectorToScreenshot', e.target.value)}
                      placeholder="e.g., .main-content, #header, .card"
                      className="selector-input"
                      style={{
                        fontFamily: 'Monaco, monospace',
                        backgroundColor: '#2c3e50',
                        border: '1px solid #34495e',
                        color: '#ecf0f1'
                      }}
                    />
                    <div style={{fontSize: '0.8em', color: '#95a5a6', marginTop: '5px'}}>
                      Right-click element → Inspect → Copy selector
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Height Compensation (px)</label>
                    <input
                      type="number"
                      value={screen.heightCompensation || 0}
                      onChange={e => updateScreen('heightCompensation', parseInt(e.target.value) || 0)}
                      placeholder="0"
                      style={{textAlign: 'center'}}
                    />
                    <div style={{fontSize: '0.8em', color: '#95a5a6', marginTop: '5px'}}>
                      + Add height, - Reduce height
                    </div>
                  </div>

                  {/* ✅ Crop Checkbox */}
                  <div className="form-group checkbox-group" style={{marginTop: '15px'}}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={screen.enableCrop || false}
                        onChange={e => updateScreen('enableCrop', e.target.checked)}
                      />
                      {' '}✂️ Crop after screenshot
                    </label>
                  </div>
                </div>

                {/* ✅ Show crop settings only if enabled */}
                {screen.enableCrop && (
                  <>
                    {/* Desktop Crop Settings */}
                    <div className="crop-settings">
                      <h4>🖥️ Desktop Crop (pixels from each edge)</h4>
                      <div className="crop-grid">
                        <div className="form-group">
                          <label>Left</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.desktopCropLeft || 0}
                            onChange={(e) => updateScreen('desktopCropLeft', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Right</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.desktopCropRight || 0}
                            onChange={(e) => updateScreen('desktopCropRight', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Top</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.desktopCropTop || 0}
                            onChange={(e) => updateScreen('desktopCropTop', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Bottom</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.desktopCropBottom || 0}
                            onChange={(e) => updateScreen('desktopCropBottom', parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mobile Crop Settings */}
                    <div className="crop-settings">
                      <h4>📱 Mobile Crop (pixels from each edge)</h4>
                      <div className="crop-grid">
                        <div className="form-group">
                          <label>Left</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.mobileCropLeft || 0}
                            onChange={(e) => updateScreen('mobileCropLeft', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Right</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.mobileCropRight || 0}
                            onChange={(e) => updateScreen('mobileCropRight', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Top</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.mobileCropTop || 0}
                            onChange={(e) => updateScreen('mobileCropTop', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Bottom</label>
                          <input
                            type="number"
                            placeholder="0"
                            value={screen.mobileCropBottom || 0}
                            onChange={(e) => updateScreen('mobileCropBottom', parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {(screen.screenshotType === 'Full Page' || !screen.screenshotType) && (
              <div className="legacy-config">
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={screen.fullPage !== false}
                      onChange={e => updateScreen('fullPage', e.target.checked)}
                    />
                    Capture full page height (scrollable content)
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="actions-container">
            {actionSections.map(({ key, label, icon, color }) => (
              <div key={key} className="actions-section">
                <div
                  className="actions-section-header"
                  style={{ borderLeftColor: color }}
                >
                  <h4 className="actions-title">
                    {icon} {label}
                    <span className="actions-count">({screen[key]?.length || 0})</span>
                  </h4>
                  <button
                    className="add-action-button"
                    onClick={() => addAction(screen.id, key)}
                    style={{ backgroundColor: color }}
                  >
                    + Add Action
                  </button>
                </div>

                <div className="actions-list">
                  <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => handleActionDragEnd(event, screen.id, key)}
                  >
                    <SortableContext
                      items={(screen[key] || []).map(a => a.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {(screen[key] || []).map((action, index) => (
                        <ActionComponent
                          key={action.id}
                          action={action}
                          index={index}
                          updateAction={(field, value) => updateAction(screen.id, key, action.id, field, value)}
                          deleteAction={() => deleteAction(screen.id, key, action.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {(screen[key]?.length === 0) && (
                    <div className="no-actions">
                      <span>No {label.toLowerCase()} configured</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// Export the sortable version
const SortableScreenComponent = (props) => (
  <SortableScreenCard screen={props.screen} index={props.index}>
    <ScreenComponent {...props} />
  </SortableScreenCard>
);

export default SortableScreenComponent;
