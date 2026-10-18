import { registerPlugin } from '@capacitor/core'

export interface NotifCapture {
  id: string
  packageName: string
  title: string
  text: string
  subText: string
  timestamp: number
}

export interface NotificationCapturePlugin {
  isPermissionGranted(): Promise<{ granted: boolean }>
  openSettings(): Promise<void>
  isBatteryOptimized(): Promise<{ optimized: boolean }>
  requestBatteryExemption(): Promise<void>
  getCaptures(): Promise<{ captures: NotifCapture[] }>
  clearCaptures(): Promise<void>
  addListener(
    event: 'notificationReceived',
    fn: (capture: NotifCapture) => void,
  ): Promise<{ remove: () => void }>
}

export const NotificationCapture = registerPlugin<NotificationCapturePlugin>('NotificationCapture')
