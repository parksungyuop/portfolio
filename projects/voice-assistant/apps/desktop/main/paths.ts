import { app } from 'electron'
import path from 'node:path'
export const supportDir = (): string => path.join(app.getPath('appData'), 'Jarvis')
export const configPath = (): string => path.join(supportDir(), 'config.json')
export const secretsPath = (): string => path.join(supportDir(), 'secrets.bin')
export const statePath = (): string => path.join(supportDir(), 'state.json')
export const logPath = (): string => path.join(supportDir(), 'jarvis.log')
