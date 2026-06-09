'use client';

import { Link } from 'next-view-transitions';
import { Home, ArrowLeft } from 'lucide-react';
import { useRevealer } from './hooks/useRevealer';

export default function NotFound() {
  useRevealer();
  
  return (
    <div className='w-full h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 overflow-hidden relative'>
      {/* Background decorative elements */}
      <div className='absolute inset-0 overflow-hidden pointer-events-none'>
        <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-white/30 rounded-full blur-3xl'></div>
        <div className='absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-200/30 rounded-full blur-3xl'></div>
      </div>

      {/* Content */}
      <div className='relative z-10 text-center px-6'>
        {/* 404 Number with glass effect */}
        <div className='mb-8'>
          <div className='relative inline-block'>
            <h1 className='text-[10rem] md:text-[12rem] font-bold leading-none tracking-tight'>
              <span className='bg-gradient-to-br from-gray-900 via-gray-700 to-gray-900 bg-clip-text text-transparent'>
                404
              </span>
            </h1>
            {/* Subtle reflection effect */}
            <div className='absolute inset-0 bg-gradient-to-t from-white/50 to-transparent blur-2xl opacity-30'></div>
          </div>
        </div>

        {/* Message */}
        <div className='backdrop-blur-2xl bg-white/50 border border-gray-200/50 rounded-3xl px-8 py-6 mb-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.08)] max-w-md mx-auto'>
          <h2 className='text-2xl font-bold text-black mb-2'>Page non trouvée</h2>
          <p className='text-gray-600 text-sm'>
            La page que vous recherchez n&apos;existe pas ou a été déplacée.
          </p>
        </div>

        {/* Action Buttons */}
        <div className='flex flex-col sm:flex-row gap-4 justify-center items-center'>
          <Link
            href='/'
            className='
              group inline-flex items-center gap-3 px-6 py-3
              backdrop-blur-2xl bg-white/70 border border-gray-200/50
              rounded-2xl
              shadow-[0_4px_16px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.9)]
              hover:shadow-[0_6px_24px_0_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,1)]
              transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
              hover:scale-105 active:scale-95
              text-base font-semibold text-gray-800
            '
          >
            <Home className='w-5 h-5 text-gray-700 group-hover:text-black transition-colors' />
            <span>Retour à l&apos;accueil</span>
          </Link>

          <button
            onClick={() => window.history.back()}
            className='
              group inline-flex items-center gap-3 px-6 py-3
              backdrop-blur-2xl bg-white/70 border border-gray-200/50
              rounded-2xl
              shadow-[0_4px_16px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.9)]
              hover:shadow-[0_6px_24px_0_rgba(0,0,0,0.12),inset_0_1px_0_0_rgba(255,255,255,1)]
              transition-all duration-[350ms] cubic-bezier(0.4, 0, 0.2, 1)
              hover:scale-105 active:scale-95
              text-base font-semibold text-gray-800
            '
          >
            <ArrowLeft className='w-5 h-5 text-gray-700 group-hover:text-black transition-colors' />
            <span>Page précédente</span>
          </button>
        </div>
      </div>
    </div>
  );
}
