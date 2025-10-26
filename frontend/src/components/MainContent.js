import React from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import ScreenComponent from './ScreenComponent';

const MainContent = ({
                       config,
                       addScreen,
                       duplicateScreen,
                       expandAllScreens,
                       collapseAllScreens,
                       expandedScreens,
                       updateScreen,
                       deleteScreen,
                       updateAction,
                       addAction,
                       deleteAction,
                       toggleScreenExpanded,
                       handleRunSingleScreen,
                       handleRunSingleScreenDebug,
                       handleActionDragEnd,
                       isRunning
                     }) => {
  return (
    <div className="main-content">
      <div className="main-header">
        <h1>📸 Snapshot Tool</h1>
        <div className="main-header-controls">
          {config.screens.length > 0 && (
            <div className="expand-controls">
              <button className="button secondary small" onClick={expandAllScreens}>
                Expand All
              </button>
              <button className="button secondary small" onClick={collapseAllScreens}>
                Collapse All
              </button>
            </div>
          )}
          <button
            className="button primary"
            onClick={addScreen}
            disabled={isRunning}
          >
            ➕ Add Screen
          </button>
        </div>
      </div>

      <div className="screens-container">
        {config.screens.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🖼️</div>
            <h3>No screens configured</h3>
            <p>Add your first screen to get started with automated screenshots</p>
            <button className="button primary" onClick={addScreen}>
              ➕ Add Your First Screen
            </button>
          </div>
        ) : (
          <SortableContext
            items={config.screens.map(s => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {config.screens.map((screen, index) => (
              <ScreenComponent
                key={screen.id}
                screen={screen}
                index={index}
                updateScreen={(field, value) => updateScreen(screen.id, field, value)}
                deleteScreen={() => deleteScreen(screen.id)}
                duplicateScreen={() => duplicateScreen(screen.id)}
                updateAction={updateAction}
                addAction={addAction}
                deleteAction={deleteAction}
                isExpanded={expandedScreens.has(screen.id)}
                toggleExpanded={() => toggleScreenExpanded(screen.id)}
                onRunSingleScreen={handleRunSingleScreen}
                onRunSingleScreenDebug={handleRunSingleScreenDebug}
                handleActionDragEnd={handleActionDragEnd}
                isRunning={isRunning}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
};

export default MainContent;
