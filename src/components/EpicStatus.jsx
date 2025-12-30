// Copyright [2025] [Allow2 Pty Ltd]

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress
} from '@material-ui/core';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon
} from '@material-ui/icons';

/**
 * Epic Games Status Component
 *
 * Real-time status display showing:
 * - Overall monitoring status
 * - Agent online/offline status
 * - Recent violation count
 * - Quick stats
 */
export default function EpicStatus({ ipcRenderer }) {
  const [status, setStatus] = useState({
    enabled: false,
    agentCount: 0,
    onlineAgents: 0,
    recentViolations: 0,
    settings: {}
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();

    // Refresh every 30 seconds
    const interval = setInterval(loadStatus, 30000);

    // Listen for real-time updates
    const handleViolation = () => {
      loadStatus();
    };

    ipcRenderer?.on('epicViolation', handleViolation);

    return () => {
      clearInterval(interval);
      ipcRenderer?.removeListener('epicViolation', handleViolation);
    };
  }, [ipcRenderer]);

  const loadStatus = async () => {
    try {
      const result = await ipcRenderer?.invoke('epic:getStatus');
      if (result?.success) {
        setStatus(result.status);
      }
      setLoading(false);
    } catch (error) {
      console.error('[Epic Status] Failed to load status:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <LinearProgress />;
  }

  const getStatusIcon = () => {
    if (!status.enabled) {
      return <ErrorIcon style={{ color: '#f44336' }} />;
    }
    if (status.onlineAgents === 0) {
      return <WarningIcon style={{ color: '#ff9800' }} />;
    }
    return <CheckCircleIcon style={{ color: '#4caf50' }} />;
  };

  const getStatusText = () => {
    if (!status.enabled) {
      return 'Disabled';
    }
    if (status.onlineAgents === 0) {
      return 'No agents online';
    }
    return `Monitoring ${status.onlineAgents} device${status.onlineAgents === 1 ? '' : 's'}`;
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" marginBottom={2}>
          {getStatusIcon()}
          <Typography variant="h6" style={{ marginLeft: 8 }}>
            Epic Games Monitoring
          </Typography>
        </Box>

        <Typography variant="body2" color="textSecondary" paragraph>
          {getStatusText()}
        </Typography>

        <Box display="flex" gap={1} flexWrap="wrap">
          <Chip
            label={`${status.agentCount} Agent${status.agentCount === 1 ? '' : 's'}`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`${status.onlineAgents} Online`}
            size="small"
            color={status.onlineAgents > 0 ? 'primary' : 'default'}
          />
          <Chip
            label={`${status.recentViolations} Recent Violations`}
            size="small"
            color={status.recentViolations > 0 ? 'secondary' : 'default'}
          />
        </Box>

        {status.settings && (
          <Box marginTop={2}>
            <Typography variant="caption" color="textSecondary">
              Check interval: {status.settings.checkInterval / 1000}s •
              {status.settings.monitorAllGames ? ' Monitoring all games' : ' Launcher only'}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
