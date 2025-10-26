import React from 'react';

const PreviewWindow = ({ showPreviewWindow, setShowPreviewWindow, livePreviews, socket }) => {
  if (!showPreviewWindow) return null;

  return (
    <div className="preview-window">
      <div className="preview-header">
        <h3>📺 Live Preview ({livePreviews.length} frames)</h3>
        <button
          className="close-preview"
          onClick={() => {
            console.log('Closing preview window');
            setShowPreviewWindow(false);
          }}
        >
          ✕
        </button>
      </div>
      <div className="preview-content">
        <div className="preview-status">
          Socket Connected: {socket?.connected ? '✅' : '❌'}
        </div>

        {livePreviews.length === 0 ? (
          <div className="no-preview">
            <div>⏳ Waiting for preview images...</div>
            <div style={{ fontSize: '12px', marginTop: '10px' }}>
              Previews will match final screenshot size and settings
            </div>
          </div>
        ) : (
          <div className="preview-grid">
            {livePreviews.slice(-4).map((preview, index) => {
              console.log(`Rendering preview ${index}:`, preview.screenName);
              return (
                <div key={`${preview.timestamp}-${index}`} className="preview-item">
                  <img
                    src={preview.image}
                    alt={`${preview.screenName} - ${preview.viewportType}`}
                    onLoad={() => console.log(`✅ Preview ${index} loaded (fullPage: ${preview.fullPage})`)}
                    onError={(e) => {
                      console.error(`❌ Preview ${index} failed to load:`, e);
                    }}
                    className="preview-image"
                  />
                  <div className="preview-info">
                    <div className="preview-title">
                      {preview.screenName} ({preview.viewportType})
                    </div>
                    <div className="preview-step">{preview.step}</div>
                    <div className="preview-meta">
                      {preview.fullPage ? 'Full Page' : 'Viewport'} •
                      {new Date(preview.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewWindow;
