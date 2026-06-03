/**
 * Advanced Load Balancer System
 * Handles 500+ concurrent operations with intelligent scheduling,
 * resource pooling, circuit breaker, and health monitoring
 */

interface QueuedOperation<T> {
  id: string;
  priority: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
  createdAt: number;
  timeout: number;
  tags: string[];
}

interface LoadBalancerConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  defaultTimeout: number;
  defaultMaxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerResetTime: number;
  healthCheckInterval: number;
}

interface WorkerPool {
  id: string;
  type: 'encryption' | 'decryption' | 'upload' | 'download' | 'general';
  maxConcurrent: number;
  currentLoad: number;
  totalProcessed: number;
  totalFailed: number;
  averageProcessingTime: number;
  isHealthy: boolean;
  lastHealthCheck: number;
}

interface HealthMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  currentQueueSize: number;
  activeWorkers: number;
  circuitBreakerOpen: boolean;
  uptime: number;
}

export class AdvancedLoadBalancer {
  private config: LoadBalancerConfig;
  private queue: QueuedOperation<any>[] = [];
  private activeOperations: Map<string, QueuedOperation<any>> = new Map();
  private workerPools: Map<string, WorkerPool> = new Map();
  private circuitBreakerOpen = false;
  private circuitBreakerFailureCount = 0;
  private circuitBreakerLastFailure = 0;
  private metrics: HealthMetrics;
  private startTime: number;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<LoadBalancerConfig>) {
    this.config = {
      maxConcurrent: 500, // Support 500+ concurrent operations
      maxQueueSize: 10000, // Large queue for burst handling
      defaultTimeout: 60000, // 60 seconds
      defaultMaxRetries: 5,
      circuitBreakerThreshold: 50, // Open circuit after 50 failures
      circuitBreakerResetTime: 30000, // 30 seconds
      healthCheckInterval: 5000, // 5 seconds
      ...config
    };

    this.startTime = Date.now();
    this.metrics = this.initializeMetrics();
    this.initializeWorkerPools();
    this.startHealthMonitoring();
  }

  private initializeMetrics(): HealthMetrics {
    return {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      currentQueueSize: 0,
      activeWorkers: 0,
      circuitBreakerOpen: false,
      uptime: 0
    };
  }

  private initializeWorkerPools(): void {
    const poolTypes: Array<WorkerPool['type']> = [
      'encryption',
      'decryption', 
      'upload',
      'download',
      'general'
    ];

    poolTypes.forEach(type => {
      const maxConcurrent = this.getPoolMaxConcurrent(type);
      this.workerPools.set(type, {
        id: `pool-${type}`,
        type,
        maxConcurrent,
        currentLoad: 0,
        totalProcessed: 0,
        totalFailed: 0,
        averageProcessingTime: 0,
        isHealthy: true,
        lastHealthCheck: Date.now()
      });
    });
  }

  private getPoolMaxConcurrent(type: WorkerPool['type']): number {
    // Allocate concurrency based on operation type
    switch (type) {
      case 'encryption':
      case 'decryption':
        return 150; // CPU-intensive operations
      case 'upload':
      case 'download':
        return 200; // Network I/O operations
      case 'general':
        return 100; // General operations
      default:
        return 50;
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
      this.checkCircuitBreaker();
      this.updateMetrics();
    }, this.config.healthCheckInterval);
  }

  private performHealthCheck(): void {
    this.workerPools.forEach((pool, key) => {
      const now = Date.now();
      
      // Check if pool is healthy based on failure rate
      const failureRate = pool.totalProcessed > 0 
        ? pool.totalFailed / pool.totalProcessed 
        : 0;
      
      pool.isHealthy = failureRate < 0.3; // Less than 30% failure rate
      pool.lastHealthCheck = now;

      // Auto-scale pool if needed
      if (pool.currentLoad >= pool.maxConcurrent * 0.8) {
        // Pool is at 80% capacity, log warning
        console.warn(`Worker pool ${key} is at ${Math.round(pool.currentLoad / pool.maxConcurrent * 100)}% capacity`);
      }
    });
  }

  private checkCircuitBreaker(): void {
    const now = Date.now();
    
    if (this.circuitBreakerOpen) {
      // Check if enough time has passed to attempt reset
      if (now - this.circuitBreakerLastFailure >= this.config.circuitBreakerResetTime) {
        console.log('Circuit breaker resetting to half-open state');
        this.circuitBreakerOpen = false;
        this.circuitBreakerFailureCount = Math.floor(this.circuitBreakerFailureCount / 2);
      }
    } else {
      // Decay failure count over time
      if (now - this.circuitBreakerLastFailure >= this.config.circuitBreakerResetTime) {
        this.circuitBreakerFailureCount = Math.max(0, this.circuitBreakerFailureCount - 1);
      }
    }
  }

  private updateMetrics(): void {
    this.metrics.currentQueueSize = this.queue.length;
    this.metrics.activeWorkers = this.activeOperations.size;
    this.metrics.circuitBreakerOpen = this.circuitBreakerOpen;
    this.metrics.uptime = Date.now() - this.startTime;

    // Calculate average response time from worker pools
    let totalTime = 0;
    let totalOps = 0;
    this.workerPools.forEach(pool => {
      totalTime += pool.averageProcessingTime * pool.totalProcessed;
      totalOps += pool.totalProcessed;
    });
    this.metrics.averageResponseTime = totalOps > 0 ? totalTime / totalOps : 0;
  }

  /**
   * Execute an operation with load balancing, priority scheduling, and fault tolerance
   */
  public async execute<T>(
    operation: () => Promise<T>,
    options: {
      priority?: number;
      maxRetries?: number;
      timeout?: number;
      tags?: string[];
      poolType?: WorkerPool['type'];
    } = {}
  ): Promise<T> {
    const {
      priority = 5,
      maxRetries = this.config.defaultMaxRetries,
      timeout = this.config.defaultTimeout,
      tags = [],
      poolType = 'general'
    } = options;

    // Circuit breaker check
    if (this.circuitBreakerOpen) {
      throw new Error('Service temporarily unavailable - circuit breaker open');
    }

    // Queue size check
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Queue is full - too many pending operations');
    }

    // Get appropriate worker pool
    const pool = this.workerPools.get(poolType);
    if (!pool) {
      throw new Error(`Worker pool ${poolType} not found`);
    }

    // Check pool health
    if (!pool.isHealthy) {
      console.warn(`Worker pool ${poolType} is unhealthy, using general pool`);
      return this.execute(operation, { ...options, poolType: 'general' });
    }

    this.metrics.totalOperations++;

    return new Promise<T>((resolve, reject) => {
      const operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const queuedOp: QueuedOperation<T> = {
        id: operationId,
        priority,
        execute: operation,
        resolve,
        reject,
        retries: 0,
        maxRetries,
        createdAt: Date.now(),
        timeout,
        tags: [...tags, poolType]
      };

      // Add to queue with priority sorting
      this.queue.push(queuedOp);
      this.queue.sort((a, b) => a.priority - b.priority); // Lower number = higher priority

      // Try to process immediately
      this.processQueue(poolType);
    });
  }

  private async processQueue(poolType: string): Promise<void> {
    const pool = this.workerPools.get(poolType);
    if (!pool) return;

    // Check if we can process more operations
    while (
      this.queue.length > 0 &&
      pool.currentLoad < pool.maxConcurrent &&
      this.activeOperations.size < this.config.maxConcurrent
    ) {
      // Find next operation for this pool type
      const opIndex = this.queue.findIndex(op => 
        op.tags.includes(poolType) || op.tags.includes('general')
      );

      if (opIndex === -1) break; // No operations for this pool

      const operation = this.queue.splice(opIndex, 1)[0];
      
      // Execute operation
      pool.currentLoad++;
      this.activeOperations.set(operation.id, operation);
      
      this.executeOperation(operation, pool).finally(() => {
        pool.currentLoad--;
        this.activeOperations.delete(operation.id);
        // Continue processing queue
        this.processQueue(poolType);
      });
    }
  }

  private async executeOperation<T>(
    operation: QueuedOperation<T>,
    pool: WorkerPool
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation ${operation.id} timed out after ${operation.timeout}ms`));
        }, operation.timeout);
      });

      // Race between operation and timeout
      const result = await Promise.race([
        operation.execute(),
        timeoutPromise
      ]);

      // Success
      const processingTime = Date.now() - startTime;
      this.handleSuccess(operation, result, pool, processingTime);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.handleFailure(operation, error as Error, pool, processingTime);
    }
  }

  private handleSuccess<T>(
    operation: QueuedOperation<T>,
    result: T,
    pool: WorkerPool,
    processingTime: number
  ): void {
    // Update metrics
    this.metrics.successfulOperations++;
    pool.totalProcessed++;
    
    // Update average processing time
    pool.averageProcessingTime = 
      (pool.averageProcessingTime * (pool.totalProcessed - 1) + processingTime) / 
      pool.totalProcessed;

    // Reset circuit breaker on success
    if (this.circuitBreakerFailureCount > 0) {
      this.circuitBreakerFailureCount = Math.max(0, this.circuitBreakerFailureCount - 2);
    }

    operation.resolve(result);
  }

  private handleFailure<T>(
    operation: QueuedOperation<T>,
    error: Error,
    pool: WorkerPool,
    processingTime: number
  ): void {
    console.error(`Operation ${operation.id} failed:`, error.message);

    // Update failure metrics
    this.circuitBreakerFailureCount++;
    this.circuitBreakerLastFailure = Date.now();
    pool.totalFailed++;

    // Check circuit breaker threshold
    if (this.circuitBreakerFailureCount >= this.config.circuitBreakerThreshold) {
      console.error('Circuit breaker threshold reached - opening circuit');
      this.circuitBreakerOpen = true;
      this.metrics.circuitBreakerOpen = true;
    }

    // Retry logic
    if (operation.retries < operation.maxRetries) {
      operation.retries++;
      
      // Exponential backoff
      const backoffDelay = Math.min(1000 * Math.pow(2, operation.retries), 30000);
      
      console.log(`Retrying operation ${operation.id}, attempt ${operation.retries}/${operation.maxRetries}`);
      
      setTimeout(() => {
        // Re-add to queue with higher priority (lower number)
        operation.priority = Math.max(1, operation.priority - 1);
        this.queue.unshift(operation); // Add to front
        this.processQueue(pool.type);
      }, backoffDelay);
      
    } else {
      // Max retries exceeded
      this.metrics.failedOperations++;
      operation.reject(new Error(`Operation failed after ${operation.maxRetries} retries: ${error.message}`));
    }
  }

  /**
   * Batch execute multiple operations with optimal scheduling
   */
  public async executeBatch<T>(
    operations: Array<() => Promise<T>>,
    options: {
      poolType?: WorkerPool['type'];
      priority?: number;
    } = {}
  ): Promise<T[]> {
    const promises = operations.map(op => 
      this.execute(op, {
        ...options,
        tags: ['batch', ...(options.poolType ? [options.poolType] : [])]
      })
    );

    return Promise.all(promises);
  }

  /**
   * Get current health metrics
   */
  public getMetrics(): HealthMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get detailed pool statistics
   */
  public getPoolStatistics(): Map<string, WorkerPool> {
    return new Map(this.workerPools);
  }

  /**
   * Force circuit breaker reset (use with caution)
   */
  public resetCircuitBreaker(): void {
    console.log('Manually resetting circuit breaker');
    this.circuitBreakerOpen = false;
    this.circuitBreakerFailureCount = 0;
    this.metrics.circuitBreakerOpen = false;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('Load balancer shutting down...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Wait for active operations to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeOperations.size > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeOperations.size > 0) {
      console.warn(`${this.activeOperations.size} operations still active after shutdown timeout`);
    }

    console.log('Load balancer shutdown complete');
  }

  /**
   * Clear queue (emergency use)
   */
  public clearQueue(): void {
    console.warn('Clearing operation queue');
    this.queue.forEach(op => {
      op.reject(new Error('Operation cancelled - queue cleared'));
    });
    this.queue = [];
  }
}

// Global singleton instance
let globalLoadBalancer: AdvancedLoadBalancer | null = null;

export const getLoadBalancer = (): AdvancedLoadBalancer => {
  if (!globalLoadBalancer) {
    globalLoadBalancer = new AdvancedLoadBalancer({
      maxConcurrent: 500,
      maxQueueSize: 10000,
      defaultTimeout: 60000,
      defaultMaxRetries: 5,
      circuitBreakerThreshold: 50,
      circuitBreakerResetTime: 30000,
      healthCheckInterval: 5000
    });
  }
  return globalLoadBalancer;
};

// Export for cleanup
export const shutdownLoadBalancer = async (): Promise<void> => {
  if (globalLoadBalancer) {
    await globalLoadBalancer.shutdown();
    globalLoadBalancer = null;
  }
};
