import { useState, useEffect } from 'react';
import io from 'socket.io-client';

const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [logs, setLogs] = useState([]);
  const [livePreviews, setLivePreviews] = useState([]);

  useEffect(() => {
    console.log('🔌 Initializing socket connection...');
    const newSocket = io('http://localhost:5001', {
      transports: ['websocket'],
      timeout: 20000,
      forceNew: true
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected successfully, ID:', newSocket.id);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔴 Socket connection error:', error);
    });

    newSocket.on('log', (logMessage) => {
      console.log('📋 Server log:', logMessage);
      setLogs(prev => [...prev, logMessage]);
    });

    newSocket.on('preview', (previewData) => {
      console.log('🖼️ Preview received!', previewData.screenName, previewData.step);
      setLivePreviews(prev => {
        const newPreviews = [...prev, previewData];
        return newPreviews.slice(-20);
      });
    });

    return () => {
      console.log('🔌 Cleaning up socket connection');
      newSocket.close();
    };
  }, []);

  const clearLogs = () => setLogs([]);
  const clearPreviews = () => setLivePreviews([]);

  return {
    socket,
    logs,
    livePreviews,
    setLogs,
    clearLogs,
    clearPreviews
  };
};

export default useSocket;
