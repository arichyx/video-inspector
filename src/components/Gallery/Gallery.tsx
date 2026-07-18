import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';

export default function Gallery({
  images,
  index,
  onClose,
}: {
  images: string[];
  index: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(index ?? 0);

  // Re-sync to the clicked thumbnail whenever the gallery is (re)opened.
  useEffect(() => {
    if (index !== null) {
      setCurrent(index);
    }
  }, [index]);

  // Keyboard navigation + body scroll lock while the gallery is open.
  useEffect(() => {
    if (index === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setCurrent((c) => Math.max(0, c - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrent((c) => Math.min(images.length - 1, c + 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, images.length, onClose]);

  if (index === null) return null;

  const hasPrev = current > 0;
  const hasNext = current < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 gallery-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('gallery.preview')}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors cursor-pointer"
        aria-label={t('gallery.close')}
      >
        <IconX className="h-6 w-6" />
      </button>

      {/* Main image: fills the space above the filmstrip */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center p-6 relative overflow-hidden"
        onClick={onClose}
      >
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((c) => c - 1);
            }}
            className="absolute left-4 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors cursor-pointer"
            aria-label={t('gallery.previous')}
          >
            <IconChevronLeft className="h-8 w-8" />
          </button>
        )}

        <img
          key={current}
          src={images[current]}
          alt={t('video.thumbnail')}
          onClick={(e) => e.stopPropagation()}
          className="h-full w-full object-contain gallery-zoom-in"
        />

        {hasNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((c) => c + 1);
            }}
            className="absolute right-4 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors cursor-pointer"
            aria-label={t('gallery.next')}
          >
            <IconChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>

      {/* Filmstrip: all thumbnails, click to jump, current highlighted */}
      <div
        className="shrink-0 flex flex-col items-center gap-2 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center items-center gap-2">
          {images.map((image, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(i);
              }}
              className={`overflow-hidden rounded border-2 transition-all cursor-pointer ${
                i === current
                  ? 'border-blue-400 opacity-100 scale-105'
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
              aria-label={t('gallery.goto', { n: i + 1 })}
              aria-current={i === current ? 'true' : undefined}
            >
              <img src={image} alt="" className="h-14 w-24 object-cover block" />
            </button>
          ))}
        </div>
        <div className="text-white/70 text-sm select-none">
          {t('gallery.counter', { current: current + 1, total: images.length })}
        </div>
      </div>
    </div>
  );
}
