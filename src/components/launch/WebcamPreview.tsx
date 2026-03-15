import { useEffect, useRef } from 'react'

interface WebcamPreviewProps {
  stream: MediaStream | null
  enabled: boolean
}

export function WebcamPreview({ stream, enabled }: WebcamPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!videoRef.current || !stream || !enabled) {
      return
    }

    videoRef.current.srcObject = stream
    videoRef.current.play().catch((error) => {
      console.error('Error playing webcam preview:', error)
    })

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [stream, enabled])

  if (!enabled || !stream) {
    return null
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      style={{
        width: '200px',
        height: '200px',
      }}
    >
      <div
        className="relative w-full h-full rounded-full overflow-hidden border-4 border-white/30 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(28,28,36,0.97) 0%, rgba(18,18,26,0.96) 100%)',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: 'scaleX(-1)',
          }}
        />
      </div>
    </div>
  )
}
