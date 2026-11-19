import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

export default function WakeBanner() {
  const fetching = useIsFetching()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!fetching) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [fetching])

  if (!slow) return null
  return <div className="wake-banner">Сервер прокидається після простою — це може тривати до хвилини. Зачекайте, будь ласка.</div>
}
