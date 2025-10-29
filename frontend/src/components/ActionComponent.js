import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ACTION_TYPES = [
  'Delay',
  'Adjust Styling',
  'Execute JS',
  'Fill Form',
  'Remove Element',
  'Show Element',
  'Click Selector',
  'Hover Selector',
  'Scroll Into View',
  'Scroll Horizontally',
  'Debug Element Styles',
  'Inject CSS'
];

const getPlaceholder = (actionType) => {
  switch (actionType) {
    case 'Delay': return 'Milliseconds (e.g., 1000)';
    case 'Fill Form': return 'Text to fill';
    case 'Remove Element':
    case 'Show Element':
    case 'Click Selector':
    case 'Hover Selector':
    case 'Scroll Into View': return 'CSS Selector';
    case 'Scroll Horizontally': return 'Pixels (e.g., 100)';
    case 'Debug Element Styles': return 'CSS Selector';
    case 'Inject CSS': return 'CSS code to inject';
    default: return 'Value';
  }
};

const SortableActionComponent = React.memo(({ action, index, updateAction, deleteAction }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: action.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const requiresSelector = ['Adjust Styling', 'Fill Form'].includes(action.type);
  const isComplexAction = ['Adjust Styling', 'Execute JS', 'Inject CSS'].includes(action.type);

  return (
    <div className="action-wrapper" ref={setNodeRef} style={style}>
      <div className="action-drag-handle" {...attributes} {...listeners} title="Drag to reorder actions">
        ⋮⋮
      </div>
      <div className="action-index">{index + 1}</div>
      <div className={`action-item ${isComplexAction ? 'complex-action' : ''}`}>
        <div className="action-main-row">
          <div className="action-type-container">
            <select
              value={action.type}
              onChange={e => updateAction('type', e.target.value)}
              className="action-select"
            >
              {ACTION_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="action-inputs-container">
            {requiresSelector && (
              <input
                type="text"
                placeholder="CSS Selector (e.g., .class, #id)"
                value={action.selector || ''}
                onChange={e => updateAction('selector', e.target.value)}
                className="action-input selector-input"
              />
            )}

            {action.type !== 'Adjust Styling' && action.type !== 'Execute JS' && action.type !== 'Inject CSS' && (
              <input
                type="text"
                placeholder={getPlaceholder(action.type)}
                value={action.value || ''}
                onChange={e => updateAction('value', e.target.value)}
                className="action-input value-input"
              />
            )}
          </div>

          <button
            onClick={deleteAction}
            className="delete-button"
            title="Delete action"
          >
            ✕
          </button>
        </div>

        {action.type === 'Adjust Styling' && (
          <div className="action-secondary-row">
                        <textarea
                          placeholder='{"transform": "translateY(0)", "opacity": "1", "color": "red"}'
                          value={typeof action.styles === 'string' ? action.styles : JSON.stringify(action.styles || {}, null, 2)}
                          onChange={e => updateAction('styles', e.target.value)}
                          className="action-textarea styles-textarea"
                          rows={4}
                        />
            <div className="input-hint">
              Enter styles as JSON format. Example: {`{"property": "value"}`}
            </div>
          </div>
        )}

        {action.type === 'Execute JS' && (
          <div className="action-secondary-row">
                        <textarea
                          placeholder="console.log('Hello World'); document.querySelector('.button').click();"
                          value={action.value || ''}
                          onChange={e => updateAction('value', e.target.value)}
                          className="action-textarea js-textarea"
                          rows={4}
                        />
            <div className="input-hint">
              Enter JavaScript code to execute on the page
            </div>
          </div>
        )}

        {action.type === 'Inject CSS' && (
          <div className="action-secondary-row">
                        <textarea
                          placeholder=".callout__circled-icon--static { display: none !important; }"
                          value={action.value || ''}
                          onChange={e => updateAction('value', e.target.value)}
                          className="action-textarea css-textarea"
                          rows={6}
                        />
            <div className="input-hint">
              Enter CSS code to inject into the page
            </div>
          </div>
        )}
      </div>
    </div>
  );
});


export default SortableActionComponent;
