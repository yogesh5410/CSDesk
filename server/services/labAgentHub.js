import { WebSocketServer, WebSocket } from 'ws';

export const LAB_AGENT_TOKEN = process.env.LAB_AGENT_TOKEN || 'csdesk_lab_secure_token_2026';

class LabAgentHub {
  constructor() {
    this.agents = new Map(); // socketId -> AgentInfo
    this.adminSockets = new Set(); // WebSockets for React frontends
    this.executionHistory = new Map(); // executionId -> { command, timestamp, results: Map<pcName, { status, logs, exitCode }> }
  }

  init(server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.adminWss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (pathname === '/ws/lab-agent') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else if (pathname === '/ws/lab-admin') {
        this.adminWss.handleUpgrade(request, socket, head, (ws) => {
          this.adminWss.emit('connection', ws, request);
        });
      }
    });

    // Handle Agent connections
    this.wss.on('connection', (ws, req) => {
      const socketId = Math.random().toString(36).substring(2, 11);
      const remoteIp = req.socket.remoteAddress?.replace(/^.*:/, '') || '127.0.0.1';

      ws.socketId = socketId;
      ws.isAlive = true;

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleAgentMessage(ws, msg, remoteIp);
        } catch (err) {
          console.error('[lab-agent] Parse error:', err.message);
        }
      });

      ws.on('close', () => {
        const agent = this.agents.get(socketId);
        if (agent) {
          console.log(`[lab-agent] PC disconnected: ${agent.pcName} (${agent.lab})`);
          this.agents.delete(socketId);
          this.broadcastToAdmins({ type: 'AGENT_DISCONNECTED', pcName: agent.pcName, lab: agent.lab });

          // If this PC was actively running a command, mark it as failed
          for (const execRecord of this.executionHistory.values()) {
            if (execRecord.pcs && execRecord.pcs[agent.pcName] && execRecord.pcs[agent.pcName].status === 'running') {
              execRecord.pcs[agent.pcName].status = 'failed';
              execRecord.pcs[agent.pcName].error = 'Agent disconnected unexpectedly';
              this.broadcastToAdmins({
                type: 'EXECUTION_RESULT',
                executionId: execRecord.executionId,
                pcName: agent.pcName,
                lab: agent.lab,
                exitCode: 1,
                error: 'Agent disconnected unexpectedly'
              });
            }
          }
        }
      });

      ws.on('error', (err) => {
        console.error(`[lab-agent] Socket error:`, err.message);
      });
    });

    // Handle Admin Frontend connections
    this.adminWss.on('connection', (ws) => {
      this.adminSockets.add(ws);
      // Immediately send current fleet state to newly opened frontend
      ws.send(JSON.stringify({
        type: 'FLEET_STATE',
        agents: this.getFleet()
      }));

      ws.on('close', () => {
        this.adminSockets.delete(ws);
      });
    });

    // Heartbeat check every 15 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [socketId, agent] of this.agents.entries()) {
        if (now - agent.lastHeartbeat > 25000) {
          console.log(`[lab-agent] Heartbeat timeout for ${agent.pcName}`);
          agent.ws.terminate();
          this.agents.delete(socketId);
          this.broadcastToAdmins({ type: 'AGENT_DISCONNECTED', pcName: agent.pcName, lab: agent.lab });
        }
      }
    }, 10000);

    console.log('[lab-agent] WebSocket Hub initialized on /ws/lab-agent and /ws/lab-admin');
  }

  handleAgentMessage(ws, msg, remoteIp) {
    const socketId = ws.socketId;

    switch (msg.type) {
      case 'REGISTER': {
        // Security check: verify authentication token
        if (msg.token !== LAB_AGENT_TOKEN) {
          console.warn(`[lab-agent] Unauthorized registration attempt from ${remoteIp} (invalid token)`);
          try {
            ws.send(JSON.stringify({ type: 'REGISTER_REJECTED', error: 'Unauthorized: Invalid token' }));
            setTimeout(() => {
              try { ws.close(4401, 'Unauthorized'); } catch (e) {}
            }, 300);
          } catch (e) {}
          return;
        }

        const agentInfo = {
          socketId,
          pcName: msg.pcName || `PC-${remoteIp}`,
          lab: (msg.lab || 'UNKNOWN').toUpperCase(),
          ip: msg.ip || remoteIp,
          os: msg.os || 'Linux',
          status: 'idle',
          lastHeartbeat: Date.now(),
          ws
        };
        this.agents.set(socketId, agentInfo);
        console.log(`[lab-agent] Registered: ${agentInfo.pcName} [Lab: ${agentInfo.lab}] IP: ${agentInfo.ip}`);
        
        ws.send(JSON.stringify({ type: 'REGISTER_ACK', status: 'OK' }));
        this.broadcastToAdmins({ type: 'AGENT_CONNECTED', agent: this.sanitizeAgent(agentInfo) });
        break;
      }

      case 'HEARTBEAT': {
        const agent = this.agents.get(socketId);
        if (agent) {
          agent.lastHeartbeat = Date.now();
          if (msg.status) agent.status = msg.status;
          ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
        }
        break;
      }

      case 'LOG_LINE': {
        // Stream log chunk from PC to Admins
        const agent = this.agents.get(socketId);
        const pcName = agent ? agent.pcName : msg.pcName;
        const lab = agent ? agent.lab : msg.lab;

        const execRecord = this.executionHistory.get(msg.executionId);
        if (execRecord && execRecord.pcs && execRecord.pcs[pcName]) {
          execRecord.pcs[pcName].logs.push(msg.line);
        }

        this.broadcastToAdmins({
          type: 'EXECUTION_LOG',
          executionId: msg.executionId,
          pcName,
          lab,
          line: msg.line,
          timestamp: Date.now()
        });
        break;
      }

      case 'EXECUTION_FINISHED': {
        const agent = this.agents.get(socketId);
        if (agent) agent.status = 'idle';

        const pcName = agent ? agent.pcName : msg.pcName;
        const execRecord = this.executionHistory.get(msg.executionId);
        if (execRecord && execRecord.pcs && execRecord.pcs[pcName]) {
          execRecord.pcs[pcName].status = msg.exitCode === 0 ? 'success' : 'failed';
          execRecord.pcs[pcName].exitCode = msg.exitCode;
          execRecord.pcs[pcName].duration = msg.duration;
          execRecord.pcs[pcName].error = msg.error;
        }

        this.broadcastToAdmins({
          type: 'EXECUTION_RESULT',
          executionId: msg.executionId,
          pcName: agent ? agent.pcName : msg.pcName,
          lab: agent ? agent.lab : msg.lab,
          exitCode: msg.exitCode,
          duration: msg.duration,
          error: msg.error
        });
        break;
      }

      default:
        console.log('[lab-agent] Unknown msg type:', msg.type);
    }
  }

  broadcastToAdmins(data) {
    const payload = JSON.stringify(data);
    for (const admin of this.adminSockets) {
      if (admin.readyState === WebSocket.OPEN) {
        admin.send(payload);
      }
    }
  }

  sanitizeAgent(agent) {
    return {
      pcName: agent.pcName,
      lab: agent.lab,
      ip: agent.ip,
      os: agent.os,
      status: agent.status,
      lastHeartbeat: agent.lastHeartbeat
    };
  }

  getFleet(labFilter = null) {
    const list = [];
    for (const agent of this.agents.values()) {
      if (!labFilter || labFilter === 'ALL' || agent.lab === labFilter.toUpperCase()) {
        list.push(this.sanitizeAgent(agent));
      }
    }
    return list;
  }

  executeCommand({ lab, targetPcs, script, executionId }) {
    const execId = executionId || `exec_${Date.now()}`;
    let dispatchedCount = 0;

    const pcsRecord = {};

    for (const agent of this.agents.values()) {
      const matchLab = !lab || lab === 'ALL' || agent.lab === lab.toUpperCase();
      const matchPc = !targetPcs || targetPcs.length === 0 || targetPcs.includes(agent.pcName);

      if (matchLab && matchPc && agent.ws.readyState === WebSocket.OPEN) {
        agent.status = 'busy';
        pcsRecord[agent.pcName] = {
          status: 'running',
          logs: [],
          exitCode: null,
          duration: null,
          error: null
        };

        agent.ws.send(JSON.stringify({
          type: 'EXECUTE',
          executionId: execId,
          token: LAB_AGENT_TOKEN,
          script
        }));
        dispatchedCount++;
      }
    }

    this.executionHistory.set(execId, {
      executionId: execId,
      script,
      timestamp: Date.now(),
      dispatchedCount,
      pcs: pcsRecord
    });

    this.broadcastToAdmins({
      type: 'EXECUTION_STARTED',
      executionId: execId,
      dispatchedCount,
      script,
      timestamp: Date.now()
    });

    return { executionId: execId, dispatchedCount };
  }

  getExecutionStatus(executionId) {
    return this.executionHistory.get(executionId) || null;
  }
}

export const labAgentHub = new LabAgentHub();
export default labAgentHub;
