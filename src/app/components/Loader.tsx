'use client'
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

export default function Loader({
  onFinish,
  onReadyForContent
}: { 
  onFinish: () => void, 
  onReadyForContent: () => void 
}) {
  const [progress, setProgress] = useState(0)
  const [displayedProgress, setDisplayedProgress] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let progressValue = 0
    const startTime = Date.now()

    // Simuler le chargement progressif basé sur les événements réels
    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      
      // Progression rapide au début
      if (elapsed < 200) {
        progressValue = Math.min(30, (elapsed / 200) * 30)
      }
      // Progression moyenne
      else if (elapsed < 800) {
        progressValue = 30 + Math.min(50, ((elapsed - 200) / 600) * 50)
      }
      // Progression finale
      else {
        progressValue = 80 + Math.min(20, ((elapsed - 800) / 400) * 20)
      }
      
      setProgress(Math.min(progressValue, 100))
      
      if (progressValue < 100) {
        requestAnimationFrame(updateProgress)
      }
    }

    // Démarrer l'animation de progression
    requestAnimationFrame(updateProgress)

    // Vérifier si le DOM est chargé
    if (document.readyState === 'complete') {
      setProgress(100)
    } else {
      const handleLoad = () => {
        setProgress(100)
      }
      window.addEventListener('load', handleLoad)
      
      return () => {
        window.removeEventListener('load', handleLoad)
      }
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayedProgress(prev => {
        if (progress === 100 && prev >= 99.5) {
          clearInterval(interval)
          setTimeout(() => {
            setDone(true)
            onReadyForContent()
          }, 300)
          return 100
        }
        const delta = progress - prev
        const smooth = prev + delta * 0.2
        return Math.min(smooth, 100)
      })
    }, 30)
    return () => clearInterval(interval)
  }, [progress, onReadyForContent])

  useEffect(() => {
    if (done) {
      setTimeout(() => {
        onFinish();
      }, 500);
    }
  }, [done, onFinish]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div 
          className="fixed inset-0 flex items-center bg-white justify-center z-[99999]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: .35 }}
        >
          <div className="w-64">
            {/* Progress Bar Container */}
            <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
              {/* Progress Bar */}
              <motion.div 
                className="h-full bg-black rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${displayedProgress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}