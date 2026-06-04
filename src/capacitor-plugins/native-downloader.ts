const NativeDownloader = {
  canRequestPackageInstalls: async () => ({ allowed: false }),
  openInstallPermissionSettings: async () => {},
  downloadApkFromUrl: async (_: { url: string; filename: string }) => ({ apkPath: '' }),
  verifyAndInstallApk: async (_: { apkPath: string }) => ({ verified: false, installIntentStarted: false }),
}
export default NativeDownloader
