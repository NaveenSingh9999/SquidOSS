export interface DownloadTask {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'downloading' | 'completed' | 'failed';
  error?: string;
}

type DownloadSubscriber = (tasks: DownloadTask[]) => void;

class BackgroundDownloadService {
  private tasks: DownloadTask[] = [];
  private subscribers = new Set<DownloadSubscriber>();

  subscribe(callback: DownloadSubscriber): () => void {
    this.subscribers.add(callback);
    callback([...this.tasks]);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    const snapshot = [...this.tasks];
    this.subscribers.forEach((subscriber) => subscriber(snapshot));
  }

  startTask(task: { id: string; fileName: string; fileSize?: number }) {
    const normalizedSize = task.fileSize && Number.isFinite(task.fileSize) ? task.fileSize : 0;
    const existingIndex = this.tasks.findIndex((item) => item.id === task.id);
    const nextTask: DownloadTask = {
      id: task.id,
      fileName: task.fileName,
      fileSize: normalizedSize,
      progress: 0,
      status: 'downloading',
    };

    if (existingIndex >= 0) {
      this.tasks[existingIndex] = nextTask;
    } else {
      this.tasks.push(nextTask);
    }
    this.notify();
  }

  updateProgress(id: string, progress: number) {
    this.tasks = this.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            progress: Math.max(0, Math.min(100, progress)),
            status: task.status === 'failed' ? 'failed' : 'downloading',
          }
        : task,
    );
    this.notify();
  }

  completeTask(id: string) {
    this.tasks = this.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            progress: 100,
            status: 'completed',
            error: undefined,
          }
        : task,
    );
    this.notify();
  }

  failTask(id: string, error?: string) {
    this.tasks = this.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            status: 'failed',
            error,
          }
        : task,
    );
    this.notify();
  }

  clearCompleted() {
    this.tasks = this.tasks.filter((task) => task.status !== 'completed');
    this.notify();
  }

  clearFailed() {
    this.tasks = this.tasks.filter((task) => task.status !== 'failed');
    this.notify();
  }
}

export const backgroundDownloadService = new BackgroundDownloadService();
