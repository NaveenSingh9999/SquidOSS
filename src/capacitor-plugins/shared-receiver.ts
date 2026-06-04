export interface SharedFile {
  path?: string
  name?: string
  mimeType?: string
  size?: number
  data?: string
}

const SharedReceiver = {
  addListener: () => {},
  removeAllListeners: () => {},
  getInitialSharedFiles: async (): Promise<SharedFile[]> => [],
}

export const onSharedFiles = (cb: Function) => cb
export default SharedReceiver
