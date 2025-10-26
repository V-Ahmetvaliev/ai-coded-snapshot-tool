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

  const getHostname = (url) => {
    try {
      return new URL(url).hostname;
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
          {/* Drag Handle */}
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
              disabled={isRunning || !screen.url || (screen.screenshotType === 'Screenshot of Selector' && !screen.selectorToScreenshot)}
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
                </div>
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
