'use client';
import { useEffect, useRef, useState } from 'react';

interface ParallaxProps {
  image: string;
  speed?: number;
  height?: string;
  width?: string;
  blur?: number;
  opacity?: number;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  grayscale?: number;
  overlay?: string;
  overlayOpacity?: number;
  scale?: number;
  rotate?: number;
  children?: React.ReactNode;
  className?: string;
  threshold?: number;
  disabled?: boolean;
}

export const Parallax: React.FC<ParallaxProps> = ({
  image,
  speed = 0.5,
  height = '100vh',
  width = '100%',
  blur = 0,
  opacity = 1,
  brightness = 100,
  contrast = 100,
  saturate = 100,
  grayscale = 100,
  overlay,
  overlayOpacity = 0.5,
  scale = 1,
  rotate = 0,
  children,
  className = '',
  threshold = 0,
  disabled = false
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [backgroundPositionY, setBackgroundPositionY] = useState(0);

  useEffect(() => {
    if (disabled) return;

    const handleScroll = () => {
      if (!elementRef.current) return;

      const rect = elementRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      if (rect.bottom >= -threshold && rect.top <= windowHeight + threshold) {
        const scrolled = window.pageYOffset;
        const elementTop = elementRef.current.offsetTop;
        const relativePos = scrolled - elementTop;
        const parallaxOffset = relativePos * speed;
        setBackgroundPositionY(parallaxOffset);
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed, threshold, disabled]);

  const getFilter = () => {
    const filters = [];
    if (blur > 0) filters.push(`blur(${blur}px)`);
    if (brightness !== 100) filters.push(`brightness(${brightness}%)`);
    if (contrast !== 100) filters.push(`contrast(${contrast}%)`);
    if (saturate !== 100) filters.push(`saturate(${saturate}%)`);
    if (grayscale !== 100) filters.push(`grayscale(${grayscale})`);
    return filters.join(' ');
  };

  const getTransform = () => {
    const transforms = [];
    if (scale !== 1) transforms.push(`scale(${scale})`);
    if (rotate !== 0) transforms.push(`rotate(${rotate}deg)`);
    return transforms.join(' ');
  };

  return (
    <div 
      ref={elementRef}
      className={`relative overflow-hidden ${className}`}
      style={{ height, width }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${image})`,
          backgroundPositionY: `${backgroundPositionY}px`,
          filter: getFilter(),
          opacity,
          transform: getTransform()
        }}
      />
      
      {overlay && (
        <div 
          className="absolute inset-0"
          style={{
            backgroundColor: overlay,
            opacity: overlayOpacity
          }}
        />
      )}
      
      {children && (
        <div className="relative z-10 h-full flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
};