// Copyright [2025] [Allow2 Pty Ltd]

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Select,
  MenuItem,
  Button,
  Chip,
  Divider,
  TextField,
  Box
} from '@material-ui/core';
import {
  Computer as ComputerIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon
} from '@material-ui/icons';

/**
 * Epic Games Settings Component
 *
 * Provides UI for configuring Epic Games monitoring including:
 * - Agent management and child linking
 * - Monitoring settings (check interval, notifications)
 * - Process selection (launcher only vs all games)
 * - Violation history
 */
export default function EpicSettings({ ipcRenderer }) {
  const [agents, setAgents] = useState([]);
  const [violations, setViolations] = useState([]);
  const [settings, setSettings] = useState({
    monitorFortnite: true,
    monitorAllGames: true,
    checkInterval: 30000,
    enableNotifications: true
  });
  const [children, setChildren] = useState([]); // From Allow2
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    // Listen for real-time updates
    const handleViolation = (event, violation) => {
      setViolations(prev => [violation, ...prev].slice(0, 50));
    };

    const handleAgentDiscovered = (event, { agent }) => {
      setAgents(prev => [...prev, agent]);
    };

    const handleAgentLost = (event, { agentId }) => {
      setAgents(prev => prev.filter(a => a.id !== agentId));
    };

    ipcRenderer?.on('epicViolation', handleViolation);
    ipcRenderer?.on('epicAgentDiscovered', handleAgentDiscovered);
    ipcRenderer?.on('epicAgentLost', handleAgentLost);

    return () => {
      ipcRenderer?.removeListener('epicViolation', handleViolation);
      ipcRenderer?.removeListener('epicAgentDiscovered', handleAgentDiscovered);
      ipcRenderer?.removeListener('epicAgentLost', handleAgentLost);
    };
  }, [ipcRenderer]);

  const loadData = async () => {
    try {
      const [agentsRes, violationsRes, settingsRes, childrenRes] = await Promise.all([
        ipcRenderer?.invoke('epic:getAgents'),
        ipcRenderer?.invoke('epic:getViolations'),
        ipcRenderer?.invoke('epic:getSettings'),
        ipcRenderer?.invoke('allow2:getChildren') // Get children from Allow2 service
      ]);

      if (agentsRes?.success) setAgents(agentsRes.agents);
      if (violationsRes?.success) setViolations(violationsRes.violations);
      if (settingsRes?.success) setSettings(settingsRes.settings);
      if (childrenRes?.success) setChildren(childrenRes.children);

      setLoading(false);
    } catch (error) {
      console.error('[Epic Settings] Failed to load data:', error);
      setLoading(false);
    }
  };

  const handleLinkAgent = async (agentId, childId) => {
    const result = await ipcRenderer?.invoke('epic:linkAgent', { agentId, childId });
    if (result?.success) {
      loadData();
    }
  };

  const handleUnlinkAgent = async (agentId) => {
    const result = await ipcRenderer?.invoke('epic:unlinkAgent', { agentId });
    if (result?.success) {
      loadData();
    }
  };

  const handleSettingChange = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    const result = await ipcRenderer?.invoke('epic:updateSettings', newSettings);
    if (!result?.success) {
      // Revert on failure
      loadData();
    }
  };

  const handleClearViolations = async () => {
    const result = await ipcRenderer?.invoke('epic:clearViolations');
    if (result?.success) {
      setViolations([]);
    }
  };

  if (loading) {
    return <Typography>Loading Epic Games settings...</Typography>;
  }

  return (
    <Box>
      {/* Monitoring Settings */}
      <Card style={{ marginBottom: 20 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Epic Games Monitoring Settings
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={settings.monitorAllGames}
                onChange={(e) => handleSettingChange('monitorAllGames', e.target.checked)}
              />
            }
            label="Monitor All Epic Games (Fortnite, Rocket League, etc.)"
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.monitorFortnite}
                onChange={(e) => handleSettingChange('monitorFortnite', e.target.checked)}
                disabled={!settings.monitorAllGames}
              />
            }
            label="Monitor Fortnite Specifically"
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.enableNotifications}
                onChange={(e) => handleSettingChange('enableNotifications', e.target.checked)}
              />
            }
            label="Enable Violation Notifications"
          />

          <Box style={{ marginTop: 16 }}>
            <TextField
              label="Check Interval (seconds)"
              type="number"
              value={settings.checkInterval / 1000}
              onChange={(e) => handleSettingChange('checkInterval', parseInt(e.target.value) * 1000)}
              helperText="How often to check for Epic Games processes"
              style={{ width: 200 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Agent Management */}
      <Card style={{ marginBottom: 20 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Agent Devices ({agents.length})
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph>
            Link each agent device to a child to apply specific quota rules
          </Typography>

          <List>
            {agents.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No agents detected"
                  secondary="Install allow2automate-agent on devices where you want to monitor Epic Games"
                />
              </ListItem>
            )}

            {agents.map(agent => (
              <ListItem key={agent.id} divider>
                <ComputerIcon style={{ marginRight: 12 }} />
                <ListItemText
                  primary={agent.hostname}
                  secondary={`${agent.platform} • ${agent.online ? 'Online' : 'Offline'}`}
                />
                <ListItemSecondaryAction>
                  {agent.online ? (
                    <Chip icon={<CheckCircleIcon />} label="Online" color="primary" size="small" />
                  ) : (
                    <Chip icon={<ErrorIcon />} label="Offline" size="small" />
                  )}
                  <Select
                    value={agent.childId || ''}
                    onChange={(e) => handleLinkAgent(agent.id, e.target.value)}
                    displayEmpty
                    style={{ marginLeft: 12, minWidth: 150 }}
                  >
                    <MenuItem value="">
                      <em>Not linked</em>
                    </MenuItem>
                    {children.map(child => (
                      <MenuItem key={child.id} value={child.id}>
                        {child.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {agent.childId && (
                    <Button
                      size="small"
                      onClick={() => handleUnlinkAgent(agent.id)}
                      style={{ marginLeft: 8 }}
                    >
                      Unlink
                    </Button>
                  )}
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      {/* Violation History */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              Recent Violations ({violations.length})
            </Typography>
            {violations.length > 0 && (
              <Button
                startIcon={<DeleteIcon />}
                onClick={handleClearViolations}
                size="small"
              >
                Clear History
              </Button>
            )}
          </Box>

          <List>
            {violations.length === 0 && (
              <ListItem>
                <ListItemText
                  primary="No violations recorded"
                  secondary="Epic Games blocking events will appear here"
                />
              </ListItem>
            )}

            {violations.map(violation => (
              <ListItem key={violation.id} divider>
                <ListItemText
                  primary={`${violation.processName} blocked on ${violation.agentHostname}`}
                  secondary={new Date(violation.timestamp).toLocaleString()}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
}
