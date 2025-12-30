// Copyright [2025] [Allow2 Pty Ltd]
//
// Licensed under the Apache License, Version 2.0 (the "License");

'use strict';

/**
 * Epic Games Monitor Service
 *
 * Handles Epic Games-specific monitoring logic including:
 * - Multi-process monitoring (launcher + individual games)
 * - Epic account detection (future enhancement)
 * - Process lifecycle management
 */
export default class EpicMonitor {
  constructor(agentService, allow2Service) {
    this.agentService = agentService;
    this.allow2Service = allow2Service;
    this.monitoredProcesses = new Map();
  }

  /**
   * Start monitoring Epic Games on an agent
   */
  async startMonitoring(agentId, config = {}) {
    console.log(`[EpicMonitor] Starting monitoring on agent ${agentId}`);

    const { checkInterval = 30000, monitorGames = true } = config;

    // Get Epic process list for this agent's platform
    const agent = await this.agentService.getAgent(agentId);
    const processes = this.getEpicProcesses(agent.platform, monitorGames);

    // Create monitoring policies for each process
    for (const process of processes) {
      await this.agentService.createPolicy(agentId, {
        processName: process.name,
        processAlternatives: process.alternatives,
        allowed: false,
        checkInterval,
        metadata: {
          type: process.type, // 'launcher' or 'game'
          game: process.game  // Game name if type is 'game'
        }
      });
    }

    this.monitoredProcesses.set(agentId, processes);
    console.log(`[EpicMonitor] Monitoring ${processes.length} processes on agent ${agentId}`);
  }

  /**
   * Stop monitoring Epic Games on an agent
   */
  async stopMonitoring(agentId) {
    console.log(`[EpicMonitor] Stopping monitoring on agent ${agentId}`);

    const processes = this.monitoredProcesses.get(agentId);
    if (!processes) {
      console.warn(`[EpicMonitor] No monitored processes found for agent ${agentId}`);
      return;
    }

    // Remove all Epic-related policies
    for (const process of processes) {
      await this.agentService.deletePolicy(agentId, process.name);
    }

    this.monitoredProcesses.delete(agentId);
  }

  /**
   * Get list of Epic processes to monitor for a platform
   */
  getEpicProcesses(platform, includeGames = true) {
    const baseProcesses = [
      {
        name: 'EpicGamesLauncher',
        alternatives: this.getLauncherNames(platform),
        type: 'launcher',
        game: null
      }
    ];

    if (!includeGames) {
      return baseProcesses;
    }

    const gameProcesses = [
      {
        name: 'FortniteClient',
        alternatives: this.getFortniteNames(platform),
        type: 'game',
        game: 'Fortnite'
      },
      {
        name: 'RocketLeague',
        alternatives: this.getRocketLeagueNames(platform),
        type: 'game',
        game: 'Rocket League'
      }
      // Add more Epic games as needed
    ];

    return [...baseProcesses, ...gameProcesses];
  }

  /**
   * Get launcher process names by platform
   */
  getLauncherNames(platform) {
    const names = {
      win32: [
        'EpicGamesLauncher.exe',
        'EpicWebHelper.exe',
        'UnrealEngineLauncher-Win64-Shipping.exe'
      ],
      darwin: [
        'EpicGamesLauncher',
        'Epic Games Launcher.app'
      ],
      linux: [
        'EpicGamesLauncher',
        'legendary' // Open-source alternative
      ]
    };

    return names[platform] || names.win32;
  }

  /**
   * Get Fortnite process names by platform
   */
  getFortniteNames(platform) {
    const names = {
      win32: [
        'FortniteClient-Win64-Shipping.exe',
        'FortniteLauncher.exe'
      ],
      darwin: [
        'Fortnite.app',
        'FortniteClient'
      ],
      linux: [
        'FortniteClient-Linux-Shipping',
        'Fortnite'
      ]
    };

    return names[platform] || names.win32;
  }

  /**
   * Get Rocket League process names by platform
   */
  getRocketLeagueNames(platform) {
    const names = {
      win32: ['RocketLeague.exe'],
      darwin: ['RocketLeague.app', 'RocketLeague'],
      linux: ['RocketLeague']
    };

    return names[platform] || names.win32;
  }

  /**
   * Update monitoring status based on Allow2 quota
   */
  async updateQuotaStatus(agentId, childId) {
    const state = await this.allow2Service.getChildState(childId);
    const allowed = !state.paused && state.quota > 0;

    console.log(`[EpicMonitor] Updating quota for agent ${agentId}: allowed=${allowed}`);

    const processes = this.monitoredProcesses.get(agentId);
    if (!processes) {
      console.warn(`[EpicMonitor] No monitored processes for agent ${agentId}`);
      return;
    }

    // Update all Epic process policies
    for (const process of processes) {
      await this.agentService.updatePolicy(agentId, {
        processName: process.name,
        allowed
      });
    }
  }

  /**
   * Get monitoring statistics for an agent
   */
  getStats(agentId) {
    const processes = this.monitoredProcesses.get(agentId);

    return {
      agentId,
      monitoring: !!processes,
      processCount: processes ? processes.length : 0,
      processes: processes ? processes.map(p => ({
        name: p.name,
        type: p.type,
        game: p.game
      })) : []
    };
  }
}
