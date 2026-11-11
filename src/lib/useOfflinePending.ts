import { useCallback, useEffect, useState } from 'react'
import { onSyncChange, pendingCount } from './data'

/** True only when there are unsent changes and no signal: time to show "Saved on phone". */
export function useOfflinePending(uid: string | null): boolean {
  const check = useCallback(() => uid !== null && !navigator.onLine && pendingCount(uid) > 0, [uid])
  const [value, setValue] = useState(check)
  useEffect(() => {
    const update = () => setValue(check())
    const off = onSyncChange(update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      off()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [check])
  return value
}
