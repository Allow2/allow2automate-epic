// Copyright [2025] [Allow2 Pty Ltd]
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

import EpicMonitor from './services/EpicMonitor.js';
import EpicSettings from './components/EpicSettings.jsx';
import EpicStatus from './components/EpicStatus.jsx';

/**
 * Allow2Automate Epic Games Plugin
 *
 * Monitors Epic Games Store launcher and games via agent-based process monitoring.
 * Enforces parental controls based on Allow2 quota and state.
 */
const epicPlugin = {
  name: '@allow2/allow2automate-epic',
  version: '1.0.0',
  displayName: 'Epic Games',

  // Plugin state
  state: {
    enabled: false,
    agents: [],
    violations: [],
    settings: {
      monitorFortnite: true,
      monitorAllGames: true,
      checkInterval: 30000, // 30 seconds
      enableNotifications: true
    }
  },

  // Plugin context (set by host app)
  context: null,

  /**
   * Plugin initialization
   * Called when plugin is loaded by allow2automate
   */
  async onLoad(loadedState, context) {
    console.log('[Epic] Initializing Epic Games plugin...');

    this.context = context;
    this.state = loadedState || this.state;

    // Check if Agent Service is available
    const agentService = context.services?.agent;
    if (!agentService) {
      console.error('[Epic] Agent service not available - plugin requires agent system');
      context.sendToRenderer?.('pluginError', {
        plugin: '@allow2/allow2automate-epic',
        error: 'Agent service not available. Please ensure allow2automate-agent is installed on target devices.'
      });
      return;
    }

    // Initialize Epic monitor
    this.monitor = new EpicMonitor(agentService, context.allow2);

    // Get all available agents
    const agents = await agentService.listAgents();
    console.log(`[Epic] Found ${agents.length} agent(s) on network`);

    this.state.agents = agents;

    // Configure Epic monitoring on each agent
    for (const agent of agents) {
      await this.configureEpicPolicy(agent, agentService);
    }

    // Listen for Allow2 state changes (quota updates, pause/unpause)
    context.allow2.on('stateChange', async (childId, newState) => {
      console.log(`[Epic] Allow2 state changed for child ${childId}`);
      const childAgents = agents.filter(a => a.childId === childId);

      for (const agent of childAgents) {
        await this.updateEpicPolicy(agent, newState, agentService);
      }
    });

    // Listen for new agents joining the network
    agentService.on('agentDiscovered', async (agent) => {
      console.log(`[Epic] New agent discovered: ${agent.hostname}`);
      this.state.agents.push(agent);
      await this.configureEpicPolicy(agent, agentService);

      // Notify renderer
      context.sendToRenderer?.('epicAgentDiscovered', { agent });
    });

    // Listen for agents going offline
    agentService.on('agentLost', (agentId) => {
      console.log(`[Epic] Agent lost: ${agentId}`);
      this.state.agents = this.state.agents.filter(a => a.id !== agentId);

      // Notify renderer
      context.sendToRenderer?.('epicAgentLost', { agentId });
    });

    // Listen for violation reports from agents
    agentService.on('violation', (violationData) => {
      if (this.isEpicProcess(violationData.processName)) {
        this.handleViolation(violationData);
      }
    });

    // Setup IPC handlers for renderer communication
    this.setupIPCHandlers(context);

    console.log('[Epic] Plugin initialized successfully');
    this.state.enabled = true;
  },

  /**
   * Configure Epic Games monitoring policy on an agent
   */
  async configureEpicPolicy(agent, agentService) {
    console.log(`[Epic] Configuring monitoring on agent: ${agent.hostname} (${agent.platform})`);

    // Platform-specific Epic process names
    const processNames = this.getEpicProcessNames(agent.platform);

    try {
      // Create policy for Epic launcher (main process)
      await agentService.createPolicy(agent.id, {
        processName: processNames.launcher[0],
        processAlternatives: processNames.launcher,
        allowed: false, // Default deny until quota checked
        checkInterval: this.state.settings.checkInterval,
        actions: {
          onDetected: 'check-quota',
          onViolation: 'kill-process'
        },
        metadata: {
          plugin: '@allow2/allow2automate-epic',
          category: 'gaming',
          platform: agent.platform
        }
      });

      // If monitoring all games, create policies for Epic games
      if (this.state.settings.monitorAllGames) {
        for (const gameName of processNames.games) {
          await agentService.createPolicy(agent.id, {
            processName: gameName,
            allowed: false,
            checkInterval: this.state.settings.checkInterval,
            actions: {
              onDetected: 'check-quota',
              onViolation: 'kill-process'
            },
            metadata: {
              plugin: '@allow2/allow2automate-epic',
              category: 'gaming',
              type: 'game',
              platform: agent.platform
            }
          });
        }
      }

      console.log(`[Epic] Successfully configured monitoring on ${agent.hostname}`);
    } catch (error) {
      console.error(`[Epic] Failed to configure policy on ${agent.hostname}:`, error);
      throw error;
    }
  },

  /**
   * Update Epic policy based on Allow2 state change
   */
  async updateEpicPolicy(agent, allow2State, agentService) {
    const epicAllowed = !allow2State.paused && allow2State.quota > 0;

    console.log(`[Epic] Updating policy on ${agent.hostname}: allowed=${epicAllowed}`);

    try {
      // Update launcher policy
      const processNames = this.getEpicProcessNames(agent.platform);

      await agentService.updatePolicy(agent.id, {
        processName: processNames.launcher[0],
        allowed: epicAllowed
      });

      // Update game policies if monitoring all games
      if (this.state.settings.monitorAllGames) {
        for (const gameName of processNames.games) {
          await agentService.updatePolicy(agent.id, {
            processName: gameName,
            allowed: epicAllowed
          });
        }
      }

      console.log(`[Epic] Policy updated successfully on ${agent.hostname}`);
    } catch (error) {
      console.error(`[Epic] Failed to update policy on ${agent.hostname}:`, error);
    }
  },

  /**
   * Get Epic process names for a platform
   */
  getEpicProcessNames(platform) {
    const processNames = {
      win32: {
        launcher: [
          'EpicGamesLauncher.exe',
          'EpicWebHelper.exe',
          'UnrealEngineLauncher-Win64-Shipping.exe'
        ],
        games: [
          'FortniteClient-Win64-Shipping.exe',
          'FortniteLauncher.exe',
          'RocketLeague.exe'
        ]
      },
      darwin: {
        launcher: [
          'EpicGamesLauncher',
          'Epic Games Launcher.app'
        ],
        games: [
          'Fortnite.app',
          'RocketLeague.app'
        ]
      },
      linux: {
        launcher: [
          'EpicGamesLauncher',
          'legendary' // Open-source Epic launcher alternative
        ],
        games: [
          'FortniteClient-Linux-Shipping',
          'RocketLeague'
        ]
      }
    };

    return processNames[platform] || processNames.win32;
  },

  /**
   * Check if a process name is an Epic Games process
   */
  isEpicProcess(processName) {
    const epicProcessKeywords = [
      'epicgameslauncher',
      'epicwebhelper',
      'unrealengine',
      'fortniteclient',
      'fortnitelauncher',
      'rocketleague',
      'legendary'
    ];

    const lowerProcessName = processName.toLowerCase();
    return epicProcessKeywords.some(keyword => lowerProcessName.includes(keyword));
  },

  /**
   * Handle violation report from agent
   */
  handleViolation(violationData) {
    console.log(`[Epic] Violation detected on agent ${violationData.agentId}: ${violationData.processName}`);

    // Add to violation log
    const violation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId: violationData.agentId,
      agentHostname: violationData.hostname || 'Unknown',
      processName: violationData.processName,
      timestamp: violationData.timestamp || new Date().toISOString(),
      childId: violationData.childId
    };

    this.state.violations.push(violation);

    // Keep only last 100 violations
    if (this.state.violations.length > 100) {
      this.state.violations = this.state.violations.slice(-100);
    }

    // Notify renderer
    if (this.context.sendToRenderer) {
      this.context.sendToRenderer('epicViolation', violation);
    }

    // Log to activity feed
    if (this.context.logActivity) {
      this.context.logActivity({
        type: 'epic_blocked',
        plugin: '@allow2/allow2automate-epic',
        message: `Epic Games was blocked on ${violation.agentHostname}`,
        timestamp: violation.timestamp,
        metadata: {
          processName: violationData.processName,
          agentId: violationData.agentId
        }
      });
    }

    // Send notification if enabled
    if (this.state.settings.enableNotifications && this.context.notify) {
      this.context.notify({
        title: 'Epic Games Blocked',
        body: `Epic Games was blocked on ${violation.agentHostname}`,
        icon: 'epic-icon.png'
      });
    }
  },

  /**
   * Setup IPC handlers for renderer communication
   */
  setupIPCHandlers(context) {
    const { ipcMain } = context;

    if (!ipcMain) {
      console.warn('[Epic] IPC not available, skipping handler setup');
      return;
    }

    // Get list of agents with Epic monitoring
    ipcMain.handle('epic:getAgents', async () => {
      return {
        success: true,
        agents: this.state.agents.map(agent => ({
          id: agent.id,
          hostname: agent.hostname,
          platform: agent.platform,
          online: agent.online,
          childId: agent.childId
        }))
      };
    });

    // Get violation history
    ipcMain.handle('epic:getViolations', async (event, { limit = 50 } = {}) => {
      return {
        success: true,
        violations: this.state.violations.slice(-limit).reverse()
      };
    });

    // Clear violation history
    ipcMain.handle('epic:clearViolations', async () => {
      this.state.violations = [];
      return { success: true };
    });

    // Get plugin settings
    ipcMain.handle('epic:getSettings', async () => {
      return {
        success: true,
        settings: this.state.settings
      };
    });

    // Update plugin settings
    ipcMain.handle('epic:updateSettings', async (event, newSettings) => {
      this.state.settings = { ...this.state.settings, ...newSettings };

      // If checkInterval changed, update all agent policies
      if (newSettings.checkInterval) {
        const agentService = context.services.agent;
        for (const agent of this.state.agents) {
          await this.configureEpicPolicy(agent, agentService);
        }
      }

      return { success: true, settings: this.state.settings };
    });

    // Get current status
    ipcMain.handle('epic:getStatus', async () => {
      return {
        success: true,
        status: {
          enabled: this.state.enabled,
          agentCount: this.state.agents.length,
          onlineAgents: this.state.agents.filter(a => a.online).length,
          recentViolations: this.state.violations.slice(-10).length,
          settings: this.state.settings
        }
      };
    });

    // Link agent to child
    ipcMain.handle('epic:linkAgent', async (event, { agentId, childId }) => {
      const agent = this.state.agents.find(a => a.id === agentId);
      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      agent.childId = childId;

      // Update policy based on this child's quota
      const agentService = context.services.agent;
      const allow2State = await context.allow2.getChildState(childId);
      await this.updateEpicPolicy(agent, allow2State, agentService);

      return { success: true };
    });

    // Unlink agent from child
    ipcMain.handle('epic:unlinkAgent', async (event, { agentId }) => {
      const agent = this.state.agents.find(a => a.id === agentId);
      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      agent.childId = null;
      return { success: true };
    });

    console.log('[Epic] IPC handlers registered');
  },

  /**
   * Plugin unload
   */
  onUnload() {
    console.log('[Epic] Unloading Epic Games plugin');
    this.state.enabled = false;

    // Remove all policies from agents
    if (this.context?.services?.agent) {
      const agentService = this.context.services.agent;
      for (const agent of this.state.agents) {
        // Remove Epic policies (implementation depends on agent API)
        console.log(`[Epic] Removing policies from agent ${agent.hostname}`);
      }
    }
  },

  /**
   * Get plugin state for persistence
   */
  getState() {
    return this.state;
  },

  /**
   * Render settings UI component
   */
  renderSettings(props) {
    return EpicSettings({
      ...props,
      state: this.state,
      context: this.context
    });
  },

  /**
   * Render status UI component
   */
  renderStatus(props) {
    return EpicStatus({
      ...props,
      state: this.state,
      context: this.context
    });
  }
};

export default epicPlugin;
