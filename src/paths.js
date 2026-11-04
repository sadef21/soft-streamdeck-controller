// Папки утилиты
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
export const WEB_DIR = path.join(APP_DIR, 'web')
export const LUCIDE_DIR = path.join(APP_DIR, 'node_modules', 'lucide-static')
export const LUCIDE_ICONS_DIR = path.join(LUCIDE_DIR, 'icons')
