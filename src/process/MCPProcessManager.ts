import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import fetch from 'node-fetch';
import { 
  ProcessManager, 
  ProcessManagerConfig, 
  ProcessStatus 
} from '../core/interfaces.js';
import { 
  ProcessError, 
  Utils, 
  Constants 
} from '../core/types.js';

export class MCPProcessManager extends EventEmitter implements ProcessManager {
  private config!: ProcessManagerConfig;
  private process?: ChildProcess;
  private status: ProcessStatus;
  private healthCheckInterval?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private lockFilePath: string;
  private lastActivity: number = Date.now();
  
  constructor(lockDir: string = '/tmp') {
    super();
    
    this.lockFilePath = join(lockDir, 'mcp-process.lock');
    this.status = {
      status: 'stopped',
      restartCount: 0,
      isHealthy: false
    };
  }

  async start(config: ProcessManagerConfig): Promise<void> {
    this.config = {
      restartPolicy: 'on-failure',
      maxRestartAttempts: Constants.DEFAULT_MAX_RESTART_ATTEMPTS,
      healthCheckInterval: Constants.DEFAULT_HEALTH_CHECK_INTERVAL,
      idleTimeout: Constants.DEFAULT_SESSION_IDLE_TIMEOUT,
      ...config
    };

    // Check if another instance is already running
    if (await this.isAnotherInstanceRunning()) {
      throw new ProcessError('Another MCP process instance is already running');
    }

    await this.startProcess();
  }

  async stop(force: boolean = false): Promise<void> {
    this.clearTimers();
    
    if (!this.process) {
      this.updateStatus('stopped');
      return;
    }

    this.updateStatus('stopping');
    
    try {
      if (force) {
        this.process.kill('SIGKILL');
      } else {
        this.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            this.process?.kill('SIGKILL');
            resolve();
          }, 5000);
          
          this.process?.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
    } catch (error) {
      throw new ProcessError(
        `Failed to stop process: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      this.cleanup();
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await Utils.sleep(1000); // Brief pause before restart
    await this.startProcess();
  }

  getStatus(): ProcessStatus {
    return { ...this.status };
  }

  isRunning(): boolean {
    return this.status.status === 'running' && !!this.process && !this.process.killed;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isRunning() || !this.config.healthCheckUrl) {
      return false;
    }

    try {
      const response = await Utils.withTimeout(
        fetch(this.config.healthCheckUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'ShimMCP-HealthCheck/1.0' }
        }),
        5000
      );
      
      const healthy = response.ok;
      this.status.isHealthy = healthy;
      return healthy;
    } catch (error) {
      this.status.isHealthy = false;
      return false;
    }
  }

  updateActivity(): void {
    this.lastActivity = Date.now();
    this.resetIdleTimer();
  }

  private async startProcess(): Promise<void> {
    if (this.process) {
      throw new ProcessError('Process is already running');
    }

    this.updateStatus('starting');

    try {
      // Create lock file
      this.createLockFile();

      // Spawn the process
      this.process = spawn(this.config.command[0], this.config.command.slice(1), {
        cwd: this.config.workingDirectory,
        env: { ...process.env, ...this.config.environment },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      this.setupProcessHandlers();
      
      // Wait for process to stabilize
      await this.waitForProcessReady();
      
      this.updateStatus('running', this.process.pid, Date.now());
      this.startHealthCheck();
      this.resetIdleTimer();
      
      this.emit(Constants.EVENTS.BACKEND_STARTED, this.process.pid);
      
    } catch (error) {
      this.cleanup();
      throw new ProcessError(
        `Failed to start process: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('exit', (code, signal) => {
      const isIntentionalExit = this.status.status === 'stopping';
      
      if (isIntentionalExit) {
        this.updateStatus('stopped');
        this.emit(Constants.EVENTS.BACKEND_STOPPED);
      } else {
        this.updateStatus('crashed');
        const error = new ProcessError(`Process exited unexpectedly with code ${code}, signal ${signal}`);
        this.emit(Constants.EVENTS.BACKEND_CRASHED, error);
        
        // Attempt restart if policy allows
        this.attemptRestart();
      }
      
      this.cleanup();
    });

    this.process.on('error', (error) => {
      this.updateStatus('crashed');
      const processError = new ProcessError(`Process error: ${error.message}`, error);
      this.emit(Constants.EVENTS.BACKEND_CRASHED, processError);
      this.cleanup();
    });

    // Log stderr for debugging
    this.process.stderr?.on('data', (data) => {
      console.error(`[MCP Process stderr]: ${data.toString()}`);
    });

    // Handle stdout if needed for monitoring
    this.process.stdout?.on('data', (data) => {
      // Could be used for process communication or monitoring
      console.log(`[MCP Process stdout]: ${data.toString()}`);
    });
  }

  private async waitForProcessReady(): Promise<void> {
    if (!this.process) {
      throw new ProcessError('Process not started');
    }

    // Wait for process to be responsive
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 500;   // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (this.process.killed || this.process.exitCode !== null) {
        throw new ProcessError('Process died during startup');
      }

      // If health check URL is available, test it
      if (this.config.healthCheckUrl) {
        try {
          const response = await fetch(this.config.healthCheckUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'ShimMCP-Startup/1.0' }
          });
          
          if (response.ok) {
            return; // Process is ready
          }
        } catch {
          // Continue waiting
        }
      } else {
        // Without health check, just wait a bit for process to stabilize
        await Utils.sleep(2000);
        return;
      }

      await Utils.sleep(checkInterval);
    }

    throw new ProcessError('Process failed to become ready within timeout');
  }

  private startHealthCheck(): void {
    if (!this.config.healthCheckUrl || !this.config.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthy = await this.isHealthy();
        if (!healthy && this.isRunning()) {
          console.warn('[ProcessManager] Health check failed');
          
          // Consider restart if unhealthy for too long
          if (this.config.restartPolicy === 'always' || 
              this.config.restartPolicy === 'on-failure') {
            await this.restart();
          }
        }
      } catch (error) {
        console.error('[ProcessManager] Health check error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (!this.config.idleTimeout) return;

    this.idleTimer = setTimeout(() => {
      const idleTime = Date.now() - this.lastActivity;
      if (idleTime >= this.config.idleTimeout!) {
        console.log('[ProcessManager] Stopping process due to idle timeout');
        this.stop();
      }
    }, this.config.idleTimeout);
  }

  private async attemptRestart(): Promise<void> {
    if (this.config.restartPolicy === 'never') {
      return;
    }

    if (this.status.restartCount >= (this.config.maxRestartAttempts || 0)) {
      console.error(`[ProcessManager] Max restart attempts (${this.config.maxRestartAttempts}) exceeded`);
      return;
    }

    try {
      this.status.restartCount++;
      console.log(`[ProcessManager] Attempting restart (${this.status.restartCount}/${this.config.maxRestartAttempts})`);
      
      await Utils.sleep(Math.pow(2, this.status.restartCount) * 1000); // Exponential backoff
      await this.startProcess();
      
    } catch (error) {
      console.error('[ProcessManager] Restart failed:', error);
    }
  }

  private async isAnotherInstanceRunning(): Promise<boolean> {
    if (!existsSync(this.lockFilePath)) {
      return false;
    }

    try {
      const lockData = JSON.parse(readFileSync(this.lockFilePath, 'utf8'));
      const pid = lockData.pid;
      
      // Check if process is actually running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
        return true; // Process exists
      } catch {
        // Process doesn't exist, remove stale lock
        unlinkSync(this.lockFilePath);
        return false;
      }
    } catch {
      // Invalid lock file, remove it
      try {
        unlinkSync(this.lockFilePath);
      } catch {}
      return false;
    }
  }

  private createLockFile(): void {
    const lockData = {
      pid: process.pid,
      startTime: Date.now(),
      command: this.config.command
    };
    
    writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2));
  }

  private updateStatus(
    status: ProcessStatus['status'], 
    pid?: number, 
    startTime?: number
  ): void {
    this.status.status = status;
    if (pid !== undefined) this.status.pid = pid;
    if (startTime !== undefined) this.status.startTime = startTime;
    
    if (status === 'crashed') {
      this.status.isHealthy = false;
    }
  }

  private clearTimers(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private cleanup(): void {
    this.clearTimers();
    this.process = undefined;
    
    // Remove lock file
    try {
      if (existsSync(this.lockFilePath)) {
        unlinkSync(this.lockFilePath);
      }
    } catch (error) {
      console.warn('[ProcessManager] Failed to remove lock file:', error);
    }
  }
}