# Allow2Automate Epic Games Plugin

Monitor and control Epic Games Store launcher and games (Fortnite, Rocket League, etc.) using Allow2 parental controls with agent-based process monitoring.

## Features

- ✅ **Multi-Platform Support** - Windows, macOS, Linux
- ✅ **Agent-Based Monitoring** - Distributed process monitoring across network devices
- ✅ **Multi-Process Detection** - Monitors launcher + individual games
- ✅ **Real-Time Enforcement** - Quota-based blocking with instant process termination
- ✅ **Granular Control** - Monitor specific games or entire Epic library
- ✅ **Child Linking** - Link agents to specific children for per-child quotas
- ✅ **Violation Logging** - Complete history of blocking events
- ✅ **Auto-Discovery** - Automatic agent detection via mDNS/Bonjour

## Requirements

- **allow2automate** v2.0.0 or higher
- **allow2automate-agent** installed on target devices
- Epic Games Store launcher installed on monitored devices

## Installation

### Via NPM (Future)
```bash
npm install @allow2/allow2automate-epic
```

### Via Git
```bash
git clone https://github.com/Allow2/allow2automate-epic.git
cd allow2automate-epic
npm install
npm run build
```

### Manual Installation
1. Copy this directory to `allow2automate/plugins/`
2. Restart allow2automate
3. Enable the plugin in Settings → Plugins

## Setup

### 1. Install Agent on Child's Device

Download and install `allow2automate-agent` on the device where Epic Games runs:

**Windows:**
```powershell
# Download installer from allow2automate Settings → Agents
# Run: allow2automate-agent-win-x64-v1.0.0.msi
```

**macOS:**
```bash
sudo installer -pkg allow2automate-agent-darwin-x64-v1.0.0.pkg -target /
```

**Linux:**
```bash
sudo dpkg -i allow2automate-agent-linux-amd64-v1.0.0.deb
```

### 2. Link Agent to Child

1. Open **allow2automate** → **Settings** → **Epic Games**
2. You'll see discovered agents in the "Agent Devices" section
3. Select a child from the dropdown next to each agent
4. The agent will now enforce that child's quota rules

### 3. Configure Monitoring

In Epic Games settings:
- **Monitor All Games** - Track launcher + all Epic games (Fortnite, Rocket League, etc.)
- **Check Interval** - How often to check for processes (default 30 seconds)
- **Enable Notifications** - Get notified when Epic is blocked

## How It Works

### Process Monitoring

The plugin monitors these Epic Games processes:

**Windows:**
- `EpicGamesLauncher.exe` (main launcher)
- `FortniteClient-Win64-Shipping.exe` (Fortnite)
- `RocketLeague.exe` (Rocket League)
- `EpicWebHelper.exe` (web components)

**macOS:**
- `EpicGamesLauncher` / `Epic Games Launcher.app`
- `Fortnite.app`
- `RocketLeague.app`

**Linux:**
- `EpicGamesLauncher`
- `legendary` (open-source Epic launcher)
- `FortniteClient-Linux-Shipping`

### Quota Enforcement

1. Agent detects Epic process running
2. Checks linked child's Allow2 quota
3. If quota available → Allow process to continue
4. If no quota or paused → Terminate process immediately
5. Log violation to parent app

### Architecture

```
┌─────────────────────────┐
│  Parent's Computer      │
│  ┌───────────────────┐  │         HTTPS
│  │ allow2automate    │  ├──────────────────┐
│  │                   │  │                  │
│  │ Epic Plugin       │  │                  ▼
│  │ - Policy mgmt     │  │     ┌────────────────────┐
│  │ - Child linking   │  │     │ Child's Computer   │
│  │ - UI              │  │     │                    │
│  └───────────────────┘  │     │ allow2automate-    │
└─────────────────────────┘     │ agent              │
                                │ - Process monitor  │
                                │ - Epic detection   │
                                │ - Process killer   │
                                └────────────────────┘
                                       │
                                       ▼
                                Epic Games processes
```

## API

### IPC Handlers

The plugin exposes these IPC endpoints for renderer communication:

```javascript
// Get list of agents
ipcRenderer.invoke('epic:getAgents')
// Returns: { success: true, agents: [...] }

// Get violation history
ipcRenderer.invoke('epic:getViolations', { limit: 50 })
// Returns: { success: true, violations: [...] }

// Clear violation history
ipcRenderer.invoke('epic:clearViolations')

// Get plugin settings
ipcRenderer.invoke('epic:getSettings')

// Update settings
ipcRenderer.invoke('epic:updateSettings', { monitorAllGames: true, checkInterval: 30000 })

// Get current status
ipcRenderer.invoke('epic:getStatus')

// Link agent to child
ipcRenderer.invoke('epic:linkAgent', { agentId: 'abc123', childId: 'def456' })

// Unlink agent
ipcRenderer.invoke('epic:unlinkAgent', { agentId: 'abc123' })
```

### Events

Listen for real-time events:

```javascript
// New violation detected
ipcRenderer.on('epicViolation', (event, violation) => {
  console.log('Epic blocked:', violation);
});

// New agent discovered
ipcRenderer.on('epicAgentDiscovered', (event, { agent }) => {
  console.log('New agent:', agent);
});

// Agent went offline
ipcRenderer.on('epicAgentLost', (event, { agentId }) => {
  console.log('Agent lost:', agentId);
});
```

## Configuration

### Plugin State

The plugin persists this state:

```javascript
{
  enabled: true,
  agents: [
    {
      id: 'agent-uuid',
      hostname: 'child-pc',
      platform: 'win32',
      online: true,
      childId: 'child-uuid'
    }
  ],
  violations: [
    {
      id: 'violation-uuid',
      agentId: 'agent-uuid',
      processName: 'FortniteClient-Win64-Shipping.exe',
      timestamp: '2025-01-15T10:30:00Z',
      childId: 'child-uuid'
    }
  ],
  settings: {
    monitorFortnite: true,
    monitorAllGames: true,
    checkInterval: 30000,
    enableNotifications: true
  }
}
```

## Troubleshooting

### Epic Games Not Detected

**Problem:** Agent doesn't see Epic Games running

**Solutions:**
1. Verify agent is online: Check "Agent Devices" section
2. Check Epic process names: Process names may vary by Epic version
3. Review agent logs: `allow2automate-agent.log` on child device
4. Increase check interval: Try 10-15 seconds instead of 30

### Agent Offline

**Problem:** Agent shows as offline

**Solutions:**
1. Check network connectivity between parent and child device
2. Verify agent service is running:
   - Windows: `sc query Allow2AutomateAgent`
   - macOS: `sudo launchctl list | grep allow2`
   - Linux: `systemctl status allow2automate-agent`
3. Check firewall settings: Port 8443 must be open
4. Try manual IP configuration in agent settings

### Process Not Killed

**Problem:** Epic continues running despite no quota

**Solutions:**
1. Verify child is linked to agent
2. Check child's quota status in Allow2 dashboard
3. Ensure agent has permission to kill processes (requires admin/root)
4. Check anti-cheat software: Some games may prevent process termination

### False Positives

**Problem:** Epic blocked when quota is available

**Solutions:**
1. Check Allow2 quota: May be paused or expired
2. Review violation log: Timestamp indicates when quota was checked
3. Sync Allow2 data: Force refresh in Allow2 settings

## Security & Privacy

### Data Collection

The plugin collects:
- ✅ Process names (e.g., "EpicGamesLauncher.exe")
- ✅ Agent hostnames
- ✅ Violation timestamps
- ❌ No Epic account credentials
- ❌ No personal data
- ❌ No game content or chat logs

### Network Communication

- Agent → Parent: HTTPS (TLS 1.3)
- JWT authentication
- mDNS autodiscovery (local network only)

### Permissions

The agent requires:
- **Windows:** Administrator privileges (to kill processes)
- **macOS:** Root access (via sudo/launchd)
- **Linux:** Root access (systemd service)

## Known Limitations

1. **No Official API:** Epic provides no parental controls API, so process monitoring is the only option
2. **Process Name Changes:** Epic may rename processes in updates
3. **Anti-Cheat Conflicts:** Some Epic games use anti-cheat that may interfere with process termination
4. **Legendary Support:** Limited testing with Legendary (open-source launcher) on Linux

## Roadmap

- [ ] Epic account detection (parse local storage)
- [ ] Per-game quotas (e.g., 1 hour Fortnite, 30 min Rocket League)
- [ ] Game launch prevention (not just termination)
- [ ] Epic Friends list integration
- [ ] Playtime statistics per game

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE)

## Support

- **Issues:** https://github.com/Allow2/allow2automate-epic/issues
- **Discussions:** https://github.com/Allow2/allow2automate/discussions
- **Email:** support@allow2.com

---

**Version:** 1.0.0
**Author:** Allow2
**Requires:** allow2automate v2.0.0+, allow2automate-agent v1.0.0+
