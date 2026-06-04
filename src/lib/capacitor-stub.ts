export const Capacitor = {
  isNativePlatform: () => false,
  getPlatform: () => 'web',
  convertFileSrc: (p: string) => p,
}

export const App = {
  getInfo: async () => ({ version: '0.0.0', build: '0' }),
  addListener: async () => ({ remove: () => {} }),
}

export const Device = { getId: async () => ({ uuid: 'stub' }) }

export const Filesystem = {
  readFile: async () => ({ data: '' }),
  writeFile: async () => {},
  appendFile: async () => {},
  deleteFile: async () => {},
  mkdir: async () => {},
  rmdir: async () => {},
  readdir: async () => ({ files: [] }),
  stat: async () => ({ type: 'file', size: 0 }),
  getUri: async () => ({ uri: '' }),
}
export enum Directory { Data = 0, Documents = 1, Cache = 2 }
export enum Encoding { UTF8 = 'utf8', ASCII = 'ascii' }

export const Share = { share: async () => {} }

export const Network = { getStatus: async () => ({ connected: true }) }

export const Haptics = { vibrate: async () => {}, impact: async () => {} }
export enum ImpactStyle { Heavy = 'heavy', Medium = 'medium', Light = 'light' }

export const StatusBar = { setStyle: async () => {}, setOverlaysWebView: async () => {} }
export enum Style { Dark = 'DARK', Light = 'LIGHT' }

export const SplashScreen = { hide: async () => {}, show: async () => {} }

export const Camera = { getPhoto: async () => ({ webPath: '' }) }
export enum CameraResultType { Uri = 'uri', Base64 = 'base64', DataUrl = 'dataUrl' }
export enum CameraSource { Camera = 'camera', Photos = 'photos', Prompt = 'prompt' }
export interface Photo { webPath?: string; base64String?: string; dataUrl?: string; format: string }

export const registerPlugin = (name: string) => ({
  addListener: async () => ({ remove: () => {} }),
  removeAllListeners: async () => {},
})

const cap = { Capacitor, App, Device, Filesystem, Directory, Encoding, Share, Network, Haptics, ImpactStyle, StatusBar, Style, SplashScreen, Camera, CameraResultType, CameraSource, registerPlugin }
export default cap
