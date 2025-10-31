import React, { useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import useSocket from './hooks/useSocket';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import PreviewWindow from './components/PreviewWindow';
import './App.css';

const API_BASE = 'http://localhost:5001/api';

const App = () => {
  const [config, setConfig] = useState({
    siteName: 'Snapshot Tool',
    baseUrl: '',
    username: '',
    password: '',
    desktopWidth: 1920,
    desktopHeight: 1080,
    mobileWidth: 436,
    mobileHeight: 1080,
    enableLazyLoading: true,
    screens: []
  });

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [expandedScreens, setExpandedScreens] = useState(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showPreviewWindow, setShowPreviewWindow] = useState(false);

  const { socket, logs, livePreviews, setLogs, clearPreviews } = useSocket();

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Config handlers
  const handleConfigChange = useCallback((e) => {
    const { name, value, type } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value, 10) || 0 :
        type === 'checkbox' ? value : value
    }));
  }, []);

  // Screen management
  const toggleScreenExpanded = useCallback((screenId) => {
    setExpandedScreens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(screenId)) {
        newSet.delete(screenId);
      } else {
        newSet.add(screenId);
      }
      return newSet;
    });
  }, []);

  const updateScreen = useCallback((screenId, field, value) => {
    setConfig(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId ? { ...s, [field]: value } : s
      )
    }));
  }, []);

  const addScreen = useCallback(() => {
    const newScreen = {
      id: uuidv4(),
      fileName: `screen-${config.screens.length + 1}`,
      url: '',
      screenshotType: 'Full Page',
      selectorToScreenshot: '',
      heightCompensation: 0,
      fullPage: true,
      enableDesktop: true,
      enableMobile: true,
      enableCrop: false,
      desktopCropLeft: 0,
      desktopCropRight: 0,
      desktopCropTop: 0,
      desktopCropBottom: 0,
      mobileCropLeft: 0,
      mobileCropRight: 0,
      mobileCropTop: 0,
      mobileCropBottom: 0,
      desktopActions: [],
      mobileActions: [],
      sharedActions: []
    };
    setConfig(prev => ({ ...prev, screens: [...prev.screens, newScreen] }));
    setExpandedScreens(prev => new Set([...prev, newScreen.id]));
  }, [config.screens.length]);

  // **NEW: Duplicate Screen**
  const duplicateScreen = useCallback((screenId) => {
    const screenToDuplicate = config.screens.find(s => s.id === screenId);
    if (!screenToDuplicate) return;

    const duplicatedScreen = {
      ...screenToDuplicate,
      id: uuidv4(),
      fileName: `${screenToDuplicate.fileName}-copy`,
      desktopActions: screenToDuplicate.desktopActions.map(action => ({
        ...action,
        id: uuidv4()
      })),
      mobileActions: screenToDuplicate.mobileActions.map(action => ({
        ...action,
        id: uuidv4()
      })),
      sharedActions: screenToDuplicate.sharedActions.map(action => ({
        ...action,
        id: uuidv4()
      }))
    };

    setConfig(prev => ({
      ...prev,
      screens: [...prev.screens, duplicatedScreen]
    }));
    setExpandedScreens(prev => new Set([...prev, duplicatedScreen.id]));
  }, [config.screens]);

  const deleteScreen = useCallback((screenId) => {
    if (window.confirm('Are you sure you want to delete this screen?')) {
      setConfig(prev => ({
        ...prev,
        screens: prev.screens.filter(s => s.id !== screenId)
      }));
      setExpandedScreens(prev => {
        const newSet = new Set(prev);
        newSet.delete(screenId);
        return newSet;
      });
    }
  }, []);

  // **NEW: Screen Drag and Drop**
  const handleScreenDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setConfig(prev => {
        const oldIndex = prev.screens.findIndex(screen => screen.id === active.id);
        const newIndex = prev.screens.findIndex(screen => screen.id === over.id);

        return {
          ...prev,
          screens: arrayMove(prev.screens, oldIndex, newIndex)
        };
      });
    }
  }, []);

  // Action management
  const updateAction = useCallback((screenId, actionType, actionId, field, value) => {
    setConfig(prev => ({
      ...prev,
      screens: prev.screens.map(screen => {
        if (screen.id !== screenId) return screen;

        return {
          ...screen,
          [actionType]: screen[actionType].map(action => {
            if (action.id !== actionId) return action;

            if (field === 'styles' && typeof value === 'string') {
              try {
                return { ...action, styles: JSON.parse(value) };
              } catch (e) {
                return { ...action, styles: value };
              }
            }

            return { ...action, [field]: value };
          })
        };
      })
    }));
  }, []);

  const addAction = useCallback((screenId, actionType) => {
    const newAction = {
      id: uuidv4(),
      type: 'Delay',
      value: '1000'
    };

    setConfig(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId
          ? { ...s, [actionType]: [...(s[actionType] || []), newAction] }
          : s
      )
    }));
  }, []);

  const deleteAction = useCallback((screenId, actionType, actionId) => {
    setConfig(prev => ({
      ...prev,
      screens: prev.screens.map(s =>
        s.id === screenId
          ? { ...s, [actionType]: (s[actionType] || []).filter(a => a.id !== actionId) }
          : s
      )
    }));
  }, []);

  // **NEW: Action Drag and Drop**
  const handleActionDragEnd = useCallback((event, screenId, actionType) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setConfig(prev => ({
        ...prev,
        screens: prev.screens.map(screen => {
          if (screen.id !== screenId) return screen;

          const actions = screen[actionType] || [];
          const oldIndex = actions.findIndex(action => action.id === active.id);
          const newIndex = actions.findIndex(action => action.id === over.id);

          return {
            ...screen,
            [actionType]: arrayMove(actions, oldIndex, newIndex)
          };
        })
      }));
    }
  }, []);

  // Snapshot execution functions (unchanged)
  const handleRunSnapshot = async () => {
    if (config.screens.length === 0) {
      setError('Please add at least one screen before running');
      return;
    }

    setIsRunning(true);
    setError('');
    setLogs(['🚀 Starting snapshot process...']);

    try {
      const response = await axios.post(`${API_BASE}/run-snapshot`, config, {
        timeout: 600000
      });

      if (response.data.success) {
        setLogs(prev => [...prev, ...response.data.logs, '✅ All screenshots completed!']);
      } else {
        setError('Snapshot process failed');
        setLogs(prev => [...prev, '❌ Process failed']);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.details || error.message || 'Unknown error occurred';
      setError(`Failed to run snapshot: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunSnapshotDebug = async () => {
    if (config.screens.length === 0) {
      setError('Please add at least one screen before running');
      return;
    }

    setIsRunning(true);
    setError('');
    setLogs(['🚀 Starting debug snapshot process with live preview...']);
    clearPreviews();
    setShowPreviewWindow(true);

    try {
      const response = await axios.post(`${API_BASE}/run-snapshot-debug`, config, {
        timeout: 600000
      });

      if (response.data.success) {
        setLogs(prev => [...prev, '✅ Debug screenshots completed!']);
      } else {
        setError('Debug snapshot process failed');
        setLogs(prev => [...prev, '❌ Debug process failed']);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.details || error.message || 'Unknown error occurred';
      setError(`Failed to run debug snapshot: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  };

  // ✅ NEW: Run all screens sequentially (one by one)
  const handleRunSnapshotSequential = async (debugMode = false) => {
    if (config.screens.length === 0) {
      setError('Please add at least one screen before running');
      return;
    }

    setIsRunning(true);
    setError('');
    setLogs([`🚀 Starting sequential snapshot process (${config.screens.length} screens, one at a time)...`]);

    if (debugMode) {
      clearPreviews();
      setShowPreviewWindow(true);
    }

    const failedScreens = [];
    const successfulScreens = [];

    try {
      for (let i = 0; i < config.screens.length; i++) {
        const screen = config.screens[i];
        const screenNumber = i + 1;

        setLogs(prev => [...prev, `\n📸 [${screenNumber}/${config.screens.length}] Processing: ${screen.fileName}...`]);

        try {
          // Find screen index for proper numbering
          const screenIndex = config.screens.findIndex(s => s.id === screen.id) + 1;

          const endpoint = debugMode ? 'run-screen-snapshot-debug' : 'run-screen-snapshot';

          const response = await axios.post(`${API_BASE}/${endpoint}`, {
            screen,
            config,
            screenIndex
          }, { timeout: 300000 });

          if (response.data.success) {
            setLogs(prev => [...prev, ...response.data.logs]);
            successfulScreens.push(screen.fileName);
            setLogs(prev => [...prev, `✅ [${screenNumber}/${config.screens.length}] ${screen.fileName} completed`]);
          } else {
            failedScreens.push({ name: screen.fileName, error: 'Unknown error' });
            setLogs(prev => [...prev, `❌ [${screenNumber}/${config.screens.length}] ${screen.fileName} failed`]);
          }
        } catch (error) {
          const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
          failedScreens.push({ name: screen.fileName, error: errorMessage });
          setLogs(prev => [...prev, `❌ [${screenNumber}/${config.screens.length}] ${screen.fileName} failed: ${errorMessage}`]);
        }

        // Small delay between screens
        if (i < config.screens.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Summary
      setLogs(prev => [
        ...prev,
        `\n${'='.repeat(50)}`,
        `📊 Sequential Processing Complete`,
        `✅ Successful: ${successfulScreens.length}`,
        `❌ Failed: ${failedScreens.length}`,
        `${'='.repeat(50)}`
      ]);

      if (failedScreens.length > 0) {
        setLogs(prev => [...prev, `\n⚠️ Failed Screens:`]);
        failedScreens.forEach((failure, idx) => {
          setLogs(prev => [...prev, `  ${idx + 1}. ${failure.name}: ${failure.error}`]);
        });
      }

      if (failedScreens.length === 0) {
        alert(`✅ All ${successfulScreens.length} screens completed successfully!`);
      } else {
        alert(`⚠️ Completed with ${successfulScreens.length} successful and ${failedScreens.length} failed screenshots`);
      }

    } catch (error) {
      const errorMessage = error.message || 'Unknown error occurred';
      setError(`Sequential snapshot failed: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Fatal error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  };


  const handleRunSingleScreen = async (screenId) => {
    setIsRunning(true);
    setError('');

    // ✅ Find screen first
    const screen = config.screens.find(s => s.id === screenId);

    if (!screen) {
      setError('Screen not found');
      setIsRunning(false);
      return;
    }

    // ✅ Find screen index
    const screenIndex = config.screens.findIndex(s => s.id === screenId) + 1;

    setLogs([`🚀 Starting snapshot for screen: ${screen.fileName}...`]);

    try {
      const response = await axios.post(`${API_BASE}/run-screen-snapshot`, {
        screen,      // ✅ Send screen object
        config,      // ✅ Send full config
        screenIndex  // ✅ Send index
      }, { timeout: 300000 });

      if (response.data.success) {
        setLogs(prev => [...prev, ...response.data.logs, `✅ Screenshot completed for ${screen.fileName}!`]);
      } else {
        setError('Single screen snapshot failed');
        setLogs(prev => [...prev, '❌ Single screen process failed']);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
      setError(`Failed to run single screen snapshot: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunSingleScreenDebug = async (screenId) => {
    setIsRunning(true);
    setError('');

    // ✅ Find screen first
    const screen = config.screens.find(s => s.id === screenId);

    if (!screen) {
      setError('Screen not found');
      setIsRunning(false);
      return;
    }

    // ✅ Find screen index
    const screenIndex = config.screens.findIndex(s => s.id === screenId) + 1;

    setLogs([`🚀 Starting debug snapshot for screen: ${screen.fileName}...`]);
    clearPreviews();
    setShowPreviewWindow(true);

    try {
      const response = await axios.post(`${API_BASE}/run-screen-snapshot-debug`, {
        screen,      // ✅ Send screen object
        config,      // ✅ Send full config
        screenIndex  // ✅ Send index
      }, { timeout: 300000 });

      if (response.data.success) {
        setLogs(prev => [...prev, `✅ Debug screenshot completed for ${screen.fileName}!`]);
      } else {
        setError('Single screen debug snapshot failed');
        setLogs(prev => [...prev, '❌ Single screen debug process failed']);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
      setError(`Failed to run single screen debug snapshot: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  };


  // State variables (add to existing useState declarations)
  const [customScreenRange, setCustomScreenRange] = useState('');
  const [customScreenRangeParallel, setCustomScreenRangeParallel] = useState('');

  // ✅ Parse range/list input (e.g., "1-5" or "1,3,5,7" or "1-3,5,7-9")
  const parseScreenSelection = useCallback((input) => {
    const screenIndices = new Set();

    if (!input || input.trim() === '') {
      return [];
    }

    const parts = input.split(',').map(p => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        // Range: "3-7"
        const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end) && start > 0 && end > 0 && start <= end) {
          for (let i = start; i <= Math.min(end, config.screens.length); i++) {
            screenIndices.add(i - 1); // Convert to 0-based index
          }
        }
      } else {
        // Single number: "5"
        const num = parseInt(part, 10);
        if (!isNaN(num) && num > 0 && num <= config.screens.length) {
          screenIndices.add(num - 1); // Convert to 0-based index
        }
      }
    }

    return Array.from(screenIndices).sort((a, b) => a - b);
  }, [config.screens.length]);

  // ✅ NEW: Run custom range in SEQUENTIAL mode (one by one)
  const handleRunCustomRange = useCallback(async (debugMode = false) => {
    const indices = parseScreenSelection(customScreenRange);

    if (indices.length === 0) {
      setError('Invalid range or list. Examples: "1-5" or "1,3,5,7" or "1-3,5,8-10"');
      return;
    }

    setIsRunning(true);
    setError('');
    setLogs([`🚀 Starting sequential snapshot for custom range (${indices.length} screens)...`]);

    if (debugMode) {
      clearPreviews();
      setShowPreviewWindow(true);
    }

    const failedScreens = [];
    const successfulScreens = [];

    try {
      for (let i = 0; i < indices.length; i++) {
        const screenIndex = indices[i];
        const screen = config.screens[screenIndex];

        if (!screen) continue;

        const progressNumber = i + 1;
        const actualScreenNumber = screenIndex + 1;

        setLogs(prev => [...prev, `\n📸 [${progressNumber}/${indices.length}] Processing screen #${actualScreenNumber}: ${screen.fileName}...`]);

        try {
          const endpoint = debugMode ? 'run-screen-snapshot-debug' : 'run-screen-snapshot';

          const response = await axios.post(`${API_BASE}/${endpoint}`, {
            screen,
            config,
            screenIndex: actualScreenNumber
          }, { timeout: 300000 });

          if (response.data.success) {
            setLogs(prev => [...prev, ...response.data.logs]);
            successfulScreens.push(screen.fileName);
            setLogs(prev => [...prev, `✅ [${progressNumber}/${indices.length}] ${screen.fileName} completed`]);
          } else {
            failedScreens.push({ name: screen.fileName, error: 'Unknown error' });
            setLogs(prev => [...prev, `❌ [${progressNumber}/${indices.length}] ${screen.fileName} failed`]);
          }
        } catch (error) {
          const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
          failedScreens.push({ name: screen.fileName, error: errorMessage });
          setLogs(prev => [...prev, `❌ [${progressNumber}/${indices.length}] ${screen.fileName} failed: ${errorMessage}`]);
        }

        if (i < indices.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Summary
      setLogs(prev => [
        ...prev,
        `\n${'='.repeat(50)}`,
        `📊 Sequential Custom Range Complete`,
        `✅ Successful: ${successfulScreens.length}`,
        `❌ Failed: ${failedScreens.length}`,
        `${'='.repeat(50)}`
      ]);

      if (failedScreens.length === 0) {
        alert(`✅ All ${successfulScreens.length} screens completed successfully!`);
      } else {
        alert(`⚠️ Completed with ${successfulScreens.length} successful and ${failedScreens.length} failed screenshots`);
      }

      // Clear input after successful run
      setCustomScreenRange('');

    } catch (error) {
      const errorMessage = error.message || 'Unknown error occurred';
      setError(`Sequential custom range failed: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Fatal error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  }, [customScreenRange, parseScreenSelection, config, clearPreviews, setShowPreviewWindow, setIsRunning, setError, setLogs]);

  // ✅ NEW: Run custom range in PARALLEL mode (batches)
  const handleRunCustomRangeParallel = useCallback(async (debugMode = false) => {
    const indices = parseScreenSelection(customScreenRangeParallel);

    if (indices.length === 0) {
      setError('Invalid range or list. Examples: "1-5" or "1,3,5,7" or "1-3,5,8-10"');
      return;
    }

    setIsRunning(true);
    setError('');
    setLogs([`🚀 Starting parallel snapshot for custom range (${indices.length} screens)...`]);

    if (debugMode) {
      clearPreviews();
      setShowPreviewWindow(true);
    }

    try {
      const selectedScreensArray = indices.map(idx => config.screens[idx]).filter(Boolean);

      if (selectedScreensArray.length === 0) {
        setError('No valid screens found in the specified range');
        setIsRunning(false);
        return;
      }

      const selectedConfig = {
        ...config,
        screens: selectedScreensArray.map((screen, idx) => ({
          ...screen,
          // Preserve original screen index for numbering
          screenIndex: indices[idx] + 1,
          paddingLength: config.screens.length.toString().length
        }))
      };

      const endpoint = debugMode ? 'run-snapshot-debug' : 'run-snapshot';

      const response = await axios.post(`${API_BASE}/${endpoint}`, selectedConfig, {
        timeout: 600000
      });

      if (response.data.success) {
        setLogs(prev => [...prev, ...response.data.logs, `✅ Parallel custom range completed!`]);

        // Clear input after successful run
        setCustomScreenRangeParallel('');
      } else {
        setError('Snapshot process failed');
        setLogs(prev => [...prev, '❌ Process failed']);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.details || error.message || 'Unknown error occurred';
      setError(`Failed to run parallel custom range: ${errorMessage}`);
      setLogs(prev => [...prev, `❌ Error: ${errorMessage}`]);
    } finally {
      setIsRunning(false);
    }
  }, [customScreenRangeParallel, parseScreenSelection, config, clearPreviews, setShowPreviewWindow, setIsRunning, setError, setLogs]);



  // File operations (unchanged)
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        processJsonFile(file);
      } else {
        setError('Please drop a valid JSON file');
        setLogs(prev => [...prev, '❌ Invalid file type. Please upload a JSON file.']);
      }
    }
  }, []);

  const processJsonFile = (file) => {
    setIsProcessingFile(true);
    setError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target.result);
        const processedContent = {
          ...content,
          screens: (content.screens || []).map(screen => ({
            ...screen,
            id: screen.id || uuidv4(),
            desktopActions: (screen.desktopActions || []).map(action => ({
              ...action,
              id: action.id || uuidv4()
            })),
            mobileActions: (screen.mobileActions || []).map(action => ({
              ...action,
              id: action.id || uuidv4()
            })),
            sharedActions: (screen.sharedActions || []).map(action => ({
              ...action,
              id: action.id || uuidv4()
            }))
          }))
        };
        setConfig(processedContent);
        setLogs(prev => [...prev, `📁 Configuration loaded: ${file.name} (${content.screens?.length || 0} screens)`]);
        setError('');
        const screenIds = processedContent.screens.map(s => s.id);
        setExpandedScreens(new Set(screenIds));
      } catch (error) {
        setError('Invalid JSON file format');
        setLogs(prev => [...prev, `❌ Failed to parse JSON file: ${error.message}`]);
      } finally {
        setIsProcessingFile(false);
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setLogs(prev => [...prev, '❌ Failed to read file']);
      setIsProcessingFile(false);
    };

    reader.readAsText(file);
  };

  const uploadJson = (event) => {
    const file = event.target.files[0];
    if (file) {
      processJsonFile(file);
    }
  };

  const downloadJson = () => {
    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `${config.siteName.toLowerCase().replace(/\s+/g, '-')}-config.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const resetAll = () => {
    if (window.confirm('Are you sure you want to reset all configuration? This cannot be undone.')) {
      setConfig({
        siteName: 'Snapshot Tool',
        baseUrl: '',
        username: '',
        password: '',
        desktopWidth: 1920,
        desktopHeight: 1080,
        mobileWidth: 430,
        mobileHeight: 1080,
        enableLazyLoading: true,
        screens: []
      });
      setLogs([]);
      setError('');
      setExpandedScreens(new Set());
    }
  };

  const configSummary = useMemo(() => ({
    totalScreens: config.screens.length,
    totalActions: config.screens.reduce((acc, screen) =>
      acc + (screen.desktopActions?.length || 0) +
      (screen.mobileActions?.length || 0) +
      (screen.sharedActions?.length || 0), 0
    )
  }), [config.screens]);

  const expandAllScreens = () => {
    setExpandedScreens(new Set(config.screens.map(s => s.id)));
  };

  const collapseAllScreens = () => {
    setExpandedScreens(new Set());
  };

  return (
    <div className="app-container">
      <Sidebar
        config={config}
        handleConfigChange={handleConfigChange}
        uploadJson={uploadJson}
        downloadJson={downloadJson}
        resetAll={resetAll}
        handleRunSnapshot={handleRunSnapshot}
        handleRunSnapshotDebug={handleRunSnapshotDebug}
        handleRunSnapshotSequential={handleRunSnapshotSequential}
        customScreenRange={customScreenRange}
        setCustomScreenRange={setCustomScreenRange}
        handleRunCustomRange={handleRunCustomRange}
        customScreenRangeParallel={customScreenRangeParallel}
        setCustomScreenRangeParallel={setCustomScreenRangeParallel}
        handleRunCustomRangeParallel={handleRunCustomRangeParallel}
        isRunning={isRunning}
        isDragging={isDragging}
        isProcessingFile={isProcessingFile}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        configSummary={configSummary}
        error={error}
        logs={logs}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleScreenDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <MainContent
          config={config}
          addScreen={addScreen}
          duplicateScreen={duplicateScreen}
          expandAllScreens={expandAllScreens}
          collapseAllScreens={collapseAllScreens}
          expandedScreens={expandedScreens}
          updateScreen={updateScreen}
          deleteScreen={deleteScreen}
          updateAction={updateAction}
          addAction={addAction}
          deleteAction={deleteAction}
          toggleScreenExpanded={toggleScreenExpanded}
          handleRunSingleScreen={handleRunSingleScreen}
          handleRunSingleScreenDebug={handleRunSingleScreenDebug}
          handleActionDragEnd={handleActionDragEnd}
          isRunning={isRunning}
        />
      </DndContext>

      <PreviewWindow
        showPreviewWindow={showPreviewWindow}
        setShowPreviewWindow={setShowPreviewWindow}
        livePreviews={livePreviews}
        socket={socket}
      />
    </div>
  );
};

export default App;
