import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { VideoMetadata } from './types';
import Video from './components/Video/Video';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher/LanguageSwitcher';
import { toast, ToastContainer } from 'react-toastify';
import { IconUpload, IconFolder } from '@tabler/icons-react';

function App() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [metadataMap, setMetadataMap] = useState<Record<string, VideoMetadata>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const addFile = useCallback((file: string) => {
    setFiles(prevFiles => [...prevFiles, file]);
  }, []);

  const removeFile = useCallback((file: string) => {
    console.log('Removing file:', file);
    setFiles(prevFiles => prevFiles.filter(f => f !== file));
    setMetadataMap(prevMap => {
      const newMap = { ...prevMap };
      delete newMap[file];
      return newMap;
    });
    setErrorMap(prevMap => {
      const newMap = { ...prevMap };
      delete newMap[file];
      return newMap;
    });
  }, []);

  const processFile = useCallback(
    async (file: string) => {
      try {
        const result = await invoke<VideoMetadata>('get_video_metadata', { path: file });

        console.log('Video metadata result:', result);
        setMetadataMap(prevMap => ({
          ...prevMap,
          [file]: result,
        }));
      } catch (error) {
        console.error('Error getting video metadata:', error);
        // Show error toast
        toast.error(t('errors.videoProcessingFailed'), {
          autoClose: 2000,
        });
        setErrorMap(prevMap => ({
          ...prevMap,
          [file]: (error as string) || t('errors.unknownError'),
        }));
      }
    },
    [t]
  );

  const handleFileDrop = useCallback(
    async (file: string) => {
      // check if is processing
      console.log(files);
      if (files.includes(file)) {
        if (metadataMap[file]) {
          toast.warn(t('errors.fileAlreadyProcessed'), {
            autoClose: 2000,
          });
          console.log(t('errors.fileAlreadyProcessed'), file);
          return;
        }
        // If file is already in the processing list, return directly

        toast.warn(t('errors.fileBeingProcessed'), {
          autoClose: 2000,
        });
        console.warn(t('errors.fileBeingProcessed'), file);
        return;
      }

      console.log('File dropped:', file);
      addFile(file);

      await processFile(file);
    },
    [addFile, files, metadataMap, processFile, t]
  );

  // Listen for drag-and-drop events inside the webview
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent(event => {
        if (event.payload.type !== 'drop') {
          return;
        }
        console.log('Webview drag drop event:', event);
        const droppedPaths = event.payload.paths ?? [];
        if (droppedPaths.length > 0) {
          for (const droppedPath of droppedPaths) {
            void handleFileDrop(droppedPath);
          }
        } else {
          console.warn(t('errors.noFilesDropped'));
        }
      })
      .then(fn => {
        if (cancelled) {
          // Effect torn down before the listener resolved — release it now.
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleFileDrop, t]);

  // Handle video deletion
  const handleDeleteVideo = (filePath: string) => {
    removeFile(filePath);
  };

  // Handle video processing retry
  const handleRetryVideo = async (filePath: string) => {
    // Clear error state
    setErrorMap(prevMap => {
      const newMap = { ...prevMap };
      delete newMap[filePath];
      return newMap;
    });

    // Clear previous metadata
    setMetadataMap(prevMap => {
      const newMap = { ...prevMap };
      delete newMap[filePath];
      return newMap;
    });

    // Reprocess the file
    await processFile(filePath);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="fixed top-0 left-0 right-0 h-8 z-10 bg-gray-50 border-b border-gray-200" data-tauri-drag-region="true" />

      <div className="py-8 px-4 pt-12">
        <ToastContainer />
        <LanguageSwitcher />
        <div className="container mx-auto max-w-6xl">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">{t('app.title')}</h1>
            <p className="text-gray-600">{t('app.subtitle')}</p>
          </header>

          {/* Upload section */}
          <div className="text-center mb-8">
            <button
              onClick={() => {
                open({
                  multiple: false,
                  filters: [
                    { name: t('fileDialog.videoFiles'), extensions: ['mp4', 'avi', 'mov', 'mkv', 'flv', 'm4v'] },
                  ],
                }).then(selectedFile => {
                  if (selectedFile) {
                    handleFileDrop(selectedFile);
                  } else {
                    console.warn(t('errors.noFileSelected'));
                  }
                });
              }}
              className="inline-flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-lg shadow-md transition-colors duration-200 cursor-pointer"
            >
              <IconUpload className="h-5 w-5 mr-2" />
              {t('upload.selectFile')}
            </button>
            <p className="mt-3 text-gray-600 text-sm">{t('upload.dragDropHint')}</p>
          </div>

          {/* Video card grid */}
          {files.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold text-gray-700 mb-4">
                {t('video.processedVideos')} ({files.length})
              </h2>
              <div className="grid grid-cols-1 gap-6">
                {files.map(file => (
                  <div
                    key={file}
                    className="rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300"
                  >
                    <Video
                      metadata={metadataMap[file]}
                      error={errorMap[file]}
                      onDelete={() => handleDeleteVideo(file)}
                      onRetry={handleRetryVideo}
                      path={file}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message when no files are present */}
          {files.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <IconFolder className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p>{t('video.noVideosYet')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
