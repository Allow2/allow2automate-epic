import { jest } from '@jest/globals';
import { EpicMonitor } from '../src/EpicMonitor.js';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
jest.mock('fs/promises');

describe('EpicMonitor', () => {
  let epicMonitor;
  let mockPolicyCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPolicyCallback = jest.fn();
    epicMonitor = new EpicMonitor(mockPolicyCallback);
  });

  describe('constructor', () => {
    test('initializes with empty games list', () => {
      expect(epicMonitor.installedGames).toEqual([]);
    });

    test('stores policy callback', () => {
      expect(epicMonitor.onPolicyUpdate).toBe(mockPolicyCallback);
    });
  });

  describe('findEpicPath', () => {
    test('finds Epic path on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      fs.access.mockResolvedValue();

      const epicPath = await epicMonitor.findEpicPath();

      expect(epicPath).toContain('Epic Games');
      expect(fs.access).toHaveBeenCalled();
    });

    test('finds Epic path on macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      fs.access.mockResolvedValue();

      const epicPath = await epicMonitor.findEpicPath();

      expect(epicPath).toContain('Epic Games');
    });

    test('returns null when Epic not found', async () => {
      fs.access.mockRejectedValue({ code: 'ENOENT' });

      const epicPath = await epicMonitor.findEpicPath();

      expect(epicPath).toBeNull();
    });
  });

  describe('scanInstalledGames', () => {
    test('finds and parses game manifests', async () => {
      const mockManifestContent = JSON.stringify({
        DisplayName: 'Fortnite',
        InstallLocation: 'C:\\Program Files\\Epic Games\\Fortnite',
        LaunchExecutable: 'FortniteClient-Win64-Shipping.exe',
        AppName: 'Fortnite'
      });

      fs.readdir.mockResolvedValue(['Fortnite.item', 'RocketLeague.item']);
      fs.readFile.mockResolvedValue(mockManifestContent);

      await epicMonitor.scanInstalledGames('/path/to/epic');

      expect(epicMonitor.installedGames.length).toBeGreaterThan(0);
      expect(epicMonitor.installedGames[0].DisplayName).toBe('Fortnite');
    });

    test('filters manifest files correctly', async () => {
      fs.readdir.mockResolvedValue([
        'Fortnite.item',
        'other_file.txt',
        'RocketLeague.item'
      ]);
      fs.readFile.mockResolvedValue(JSON.stringify({ DisplayName: 'Game' }));

      await epicMonitor.scanInstalledGames('/path/to/epic');

      // Should only process .item files
      expect(fs.readFile.mock.calls.length).toBe(2);
    });

    test('handles invalid JSON gracefully', async () => {
      fs.readdir.mockResolvedValue(['invalid.item']);
      fs.readFile.mockResolvedValue('invalid json{');

      await epicMonitor.scanInstalledGames('/path/to/epic');

      // Should not crash
      expect(epicMonitor.installedGames).toEqual([]);
    });

    test('handles missing manifests directory', async () => {
      fs.readdir.mockRejectedValue({ code: 'ENOENT' });

      await epicMonitor.scanInstalledGames('/path/to/epic');

      expect(epicMonitor.installedGames).toEqual([]);
    });
  });

  describe('generatePolicies', () => {
    beforeEach(() => {
      epicMonitor.installedGames = [
        {
          DisplayName: 'Fortnite',
          LaunchExecutable: 'FortniteClient-Win64-Shipping.exe',
          AppName: 'Fortnite'
        },
        {
          DisplayName: 'Rocket League',
          LaunchExecutable: 'RocketLeague.exe',
          AppName: 'RocketLeague'
        }
      ];
    });

    test('generates policies for Windows', () => {
      const policies = epicMonitor.generatePolicies('win32');

      expect(policies.length).toBeGreaterThan(0);
      expect(policies.some(p => p.processName.includes('FortniteClient'))).toBe(true);
      expect(policies.some(p => p.processName.includes('RocketLeague'))).toBe(true);
    });

    test('generates policies for macOS', () => {
      epicMonitor.installedGames = [
        {
          DisplayName: 'Game',
          LaunchExecutable: 'Game.app',
          AppName: 'Game'
        }
      ];

      const policies = epicMonitor.generatePolicies('darwin');

      expect(policies.length).toBeGreaterThan(0);
    });

    test('sets correct policy properties', () => {
      const policies = epicMonitor.generatePolicies('win32');
      const policy = policies[0];

      expect(policy.allowed).toBe(false);
      expect(policy.checkInterval).toBe(30000);
      expect(policy.processName).toBeDefined();
    });

    test('includes Epic Launcher main process', () => {
      const policies = epicMonitor.generatePolicies('win32');

      expect(policies.some(p =>
        p.processName === 'EpicGamesLauncher.exe' ||
        p.processName.includes('Epic')
      )).toBe(true);
    });

    test('includes all launcher processes for Windows', () => {
      const policies = epicMonitor.generatePolicies('win32');

      const expectedProcesses = [
        'EpicGamesLauncher.exe',
        'EpicWebHelper.exe',
        'EpicOnlineServicesHost.exe'
      ];

      expectedProcesses.forEach(proc => {
        expect(policies.some(p => p.processName === proc)).toBe(true);
      });
    });

    test('handles games without LaunchExecutable', () => {
      epicMonitor.installedGames = [
        {
          DisplayName: 'Incomplete Game',
          AppName: 'IncompleteGame'
          // No LaunchExecutable
        }
      ];

      const policies = epicMonitor.generatePolicies('win32');

      // Should still generate launcher policies
      expect(policies.length).toBeGreaterThan(0);
    });

    test('returns launcher policies when no games installed', () => {
      epicMonitor.installedGames = [];

      const policies = epicMonitor.generatePolicies('win32');

      // Should still include launcher processes
      expect(policies.length).toBeGreaterThan(0);
      expect(policies.some(p => p.processName.includes('Epic'))).toBe(true);
    });
  });

  describe('start', () => {
    test('finds Epic and scans games', async () => {
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['Fortnite.item']);
      fs.readFile.mockResolvedValue(JSON.stringify({
        DisplayName: 'Fortnite',
        LaunchExecutable: 'FortniteClient.exe'
      }));

      await epicMonitor.start();

      expect(fs.access).toHaveBeenCalled();
      expect(fs.readdir).toHaveBeenCalled();
    });

    test('calls policy callback with generated policies', async () => {
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['Fortnite.item']);
      fs.readFile.mockResolvedValue(JSON.stringify({
        DisplayName: 'Fortnite',
        LaunchExecutable: 'FortniteClient.exe'
      }));

      await epicMonitor.start();

      expect(mockPolicyCallback).toHaveBeenCalled();
      const policies = mockPolicyCallback.mock.calls[0][0];
      expect(Array.isArray(policies)).toBe(true);
      expect(policies.length).toBeGreaterThan(0);
    });

    test('handles Epic not installed', async () => {
      fs.access.mockRejectedValue({ code: 'ENOENT' });

      await epicMonitor.start();

      // Should call callback with basic launcher policies
      expect(mockPolicyCallback).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    test('clears installed games', async () => {
      epicMonitor.installedGames = [
        { DisplayName: 'Fortnite' }
      ];

      await epicMonitor.stop();

      expect(epicMonitor.installedGames).toEqual([]);
    });
  });

  describe('platform-specific handling', () => {
    test('uses correct launcher process names for Windows', () => {
      const policies = epicMonitor.generatePolicies('win32');

      expect(policies.some(p => p.processName === 'EpicGamesLauncher.exe')).toBe(true);
      expect(policies.some(p => p.processName === 'EpicWebHelper.exe')).toBe(true);
    });

    test('uses correct launcher process names for macOS', () => {
      const policies = epicMonitor.generatePolicies('darwin');

      expect(policies.some(p =>
        p.processName.includes('Epic Games Launcher') ||
        p.processName.includes('EpicGamesLauncher')
      )).toBe(true);
    });

    test('handles game executables with paths', () => {
      epicMonitor.installedGames = [
        {
          DisplayName: 'Game',
          LaunchExecutable: 'Binaries/Win64/Game.exe'
        }
      ];

      const policies = epicMonitor.generatePolicies('win32');

      // Should extract just the executable name
      const gamePolicy = policies.find(p => p.processName === 'Game.exe');
      expect(gamePolicy).toBeDefined();
    });
  });

  describe('integration', () => {
    test('full workflow: find → scan → generate → callback', async () => {
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['Fortnite.item', 'RocketLeague.item']);
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({
          DisplayName: 'Fortnite',
          LaunchExecutable: 'FortniteClient.exe'
        }))
        .mockResolvedValueOnce(JSON.stringify({
          DisplayName: 'Rocket League',
          LaunchExecutable: 'RocketLeague.exe'
        }));

      await epicMonitor.start();

      expect(mockPolicyCallback).toHaveBeenCalled();
      const policies = mockPolicyCallback.mock.calls[0][0];

      // Should have launcher processes plus game processes
      expect(policies.length).toBeGreaterThan(3);
      expect(policies.some(p => p.processName === 'EpicGamesLauncher.exe')).toBe(true);
      expect(policies.some(p => p.processName === 'FortniteClient.exe')).toBe(true);
    });
  });
});
