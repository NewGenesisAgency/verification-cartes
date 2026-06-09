'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Loader from './Loader';

export default function PageTransitionWrapper() {
  const [shouldShowLoader, setShouldShowLoader] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);

  useEffect(() => {
    // Désactiver le loader au chargement de la page
    setShouldShowLoader(false);
    setLoadingDone(true);
  }, []);

  const handleLoaderReadyForContent = () => { };
  const handleLoaderFinish = () => {
    setLoadingDone(true);
  };

  if (loadingDone) return null;

  return (
    <AnimatePresence>
      {shouldShowLoader && (
        <motion.div
          className="fixed inset-0 z-[99999999999999999999999] flex items-center justify-center"
          style={{ background: 'var(--cl)' }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
        >
          <Loader
            key="loader"
            onFinish={handleLoaderFinish}
            onReadyForContent={handleLoaderReadyForContent}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
