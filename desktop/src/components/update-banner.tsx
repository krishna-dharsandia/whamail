"use client"

import { useEffect, useState } from "react"
import { Download, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UpdateStatus {
  status: "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error"
  version?: string
  percent?: number
  message?: string
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onUpdateStatus) return

    const unsub = api.onUpdateStatus((data: UpdateStatus) => {
      setUpdate(data)
      if (data.status === "available" || data.status === "ready") {
        setDismissed(false)
      }
    })
    return unsub
  }, [])

  if (!update || dismissed) return null
  if (update.status === "up-to-date" || update.status === "checking") return null

  const api = (window as any).electronAPI

  if (update.status === "error") return null

  return (
    <div className="flex items-center gap-3 bg-primary px-4 py-2 text-primary-foreground text-sm">
      {update.status === "available" && (
        <>
          <Download className="h-4 w-4 shrink-0" />
          <span>Version {update.version} available.</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => api?.updateDownload()}
          >
            Download
          </Button>
        </>
      )}

      {update.status === "downloading" && (
        <>
          <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          <span>Downloading update... {update.percent}%</span>
          <div className="flex-1 h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden max-w-48">
            <div
              className="h-full bg-primary-foreground rounded-full transition-all"
              style={{ width: `${update.percent ?? 0}%` }}
            />
          </div>
        </>
      )}

      {update.status === "ready" && (
        <>
          <Download className="h-4 w-4 shrink-0" />
          <span>Update ready. Restart to install v{update.version}.</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={() => api?.updateInstall()}
          >
            Restart Now
          </Button>
        </>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="ml-auto shrink-0 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
