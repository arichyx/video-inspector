import type { VideoMetadata } from '@/types';
import { useTranslation } from 'react-i18next';
import { IconX, IconAlertTriangle, IconRefresh } from '@tabler/icons-react';

export default function Video({
  path,
  metadata,
  error,
  onDelete,
  onRetry,
}: {
  path: string;
  metadata: VideoMetadata | null;
  error: string | null;
  onDelete?: () => void;
  onRetry?: (filePath: string) => void; // If retry functionality is needed, pass the file path
}) {
  const { t } = useTranslation();

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 max-w-md mx-auto rounded-lg bg-red-50 border border-red-200 shadow-md text-center relative">
        {/* Delete button */}
        {onDelete && (
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 z-10 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md transition-colors duration-200 cursor-pointer"
            title={t('video.deleteVideo')}
          >
            <IconX className="h-5 w-5" />
          </button>
        )}

        <IconAlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2>{path}</h2>
        <h2 className="text-xl font-bold text-red-700 mb-2">{t('video.processingError')}</h2>
        <p className="text-red-600 mb-4">{error}</p>

        {onRetry && path && (
          <button
            onClick={() => onRetry(path)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center justify-center transition-colors duration-200"
            title={t('video.retryProcessing')}
          >
            <IconRefresh className="h-5 w-5 mr-2" />
            {t('video.retry')}
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (!metadata) {
    return (
      <div className="w-full bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        <div className="animate-pulse">
          {/* Thumbnails area placeholder - 4 thumbnails in a row */}
          <div className="w-full p-2">
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="bg-gray-300 rounded" style={{ aspectRatio: '16/9' }} />
              ))}
            </div>
          </div>

          {/* Information area placeholder */}
          <div className="p-4">
            {/* Filename placeholder */}
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />

            {/* Video information placeholder - 2 columns grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded col-span-2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="results relative">
        {/* Video card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow duration-300">
          {/* Delete button */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="absolute top-2 right-2 z-10 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md transition-colors duration-200 cursor-pointer"
              title={t('video.deleteVideo')}
            >
              <IconX className="h-5 w-5" />
            </button>
          )}

          <div className="flex flex-col">
            {/* Thumbnails area - up to 4 thumbnails in a row */}
            <div className="w-full  p-2">
              <div className="grid grid-cols-4 gap-2">
                {metadata.thumbnails_base64.map((thumbnail, index) => (
                  <div key={index} className="flex items-center justify-center">
                    <img
                      src={thumbnail}
                      alt={t('video.thumbnail')}
                      className="object-contain rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:scale-105 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer justify-self-center"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Information area */}
            <div className="w-full p-4 bg-gradient-to-b from-gray-50 to-white">
              <h3 className="text-lg font-bold text-gray-800 mb-3 truncate" title={metadata.file_path}>
                {metadata.file_path.split(/[\\/]/).pop()}
              </h3>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-gray-700 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{t('metadata.resolution')}:</span>
                  <span className="text-gray-600">{metadata.resolution}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">{t('metadata.frameRate')}:</span>
                  <span className="text-gray-600">
                    {metadata.frame_rate} {t('metadata.fps')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">{t('metadata.duration')}:</span>
                  <span className="text-gray-600">{metadata.duration}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">{t('metadata.bitRate')}:</span>
                  <span className="text-gray-600">{metadata.bit_rate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">{t('metadata.fileSize')}:</span>
                  <span className="text-gray-600">{metadata.file_size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">{t('metadata.fileHash')}:</span>
                  <span className="text-gray-600 font-mono text-xs truncate ml-2" title={metadata.file_hash}>
                    {metadata.file_hash.substring(0, 16)}...
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
