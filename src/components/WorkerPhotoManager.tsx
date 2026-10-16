import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Trash2,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  User,
  ShieldAlert,
  Info
} from 'lucide-react';
import { WorkerRecord, WorkerProfilePhoto } from '../types';
import { FirebaseService } from '../services/firebaseService';

interface WorkerPhotoManagerProps {
  worker: WorkerRecord;
  currentProfilePhoto?: WorkerProfilePhoto | null;
  onPhotoUpdated: (photo: WorkerProfilePhoto | null) => void;
  canEdit: boolean; // true if admin or the worker themselves
  simTheme?: 'light' | 'dark';
}

export function WorkerPhotoManager({
  worker,
  currentProfilePhoto,
  onPhotoUpdated,
  canEdit,
  simTheme = 'light'
}: WorkerPhotoManagerProps) {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDark = simTheme === 'dark';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      setIsUploading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const uploaded = await FirebaseService.uploadWorkerProfilePhoto(
        worker.workerId,
        file,
        file.name
      );

      onPhotoUpdated(uploaded);
      setSuccessMessage('Worker profile photo uploaded and saved.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process and upload profile photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = async () => {
    try {
      setIsDeleting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await FirebaseService.deleteWorkerProfilePhoto(worker.workerId);
      onPhotoUpdated(null);
      setSuccessMessage('Worker profile photo removed.');
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove profile photo.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      {errorMessage && (
        <div className="p-2.5 bg-red-950/80 border border-red-700/80 rounded-xl text-xs text-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-2.5 bg-emerald-950/80 border border-emerald-700/80 rounded-xl text-xs text-emerald-200 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{successMessage}</p>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
        isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
      }`}>
        {/* Avatar Display */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => currentProfilePhoto && setPreviewOpen(true)}
            className={`w-14 h-14 rounded-full overflow-hidden border-2 relative shrink-0 flex items-center justify-center ${
              currentProfilePhoto ? 'cursor-pointer border-amber-400/80 hover:border-amber-400 shadow-sm' : 'border-slate-300 dark:border-slate-600 bg-amber-500'
            }`}
          >
            {currentProfilePhoto ? (
              <img
                src={currentProfilePhoto.downloadUrl}
                alt={worker.fullName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <User className="w-7 h-7 text-slate-950" />
            )}
            {currentProfilePhoto && (
              <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <Eye className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          <div>
            <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100">
              {currentProfilePhoto ? 'Profile Photo Attached' : 'No Profile Photo'}
            </h5>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {currentProfilePhoto
                ? `${(currentProfilePhoto.fileSize / 1024).toFixed(0)} KB • Max 1 photo`
                : 'Optional personal record (Limit: 1 photo)'}
            </p>
            {currentProfilePhoto && (
              <button
                onClick={() => setPreviewOpen(true)}
                className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline mt-0.5 inline-flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>View Full Size</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {canEdit && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              id={`worker-photo-input-${worker.workerId}`}
              disabled={isUploading || isDeleting}
            />

            <button
              id={`btn-upload-worker-photo-${worker.workerId}`}
              disabled={isUploading || isDeleting}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{currentProfilePhoto ? 'Replace' : 'Upload'}</span>
            </button>

            {currentProfilePhoto && (
              <button
                id={`btn-delete-worker-photo-${worker.workerId}`}
                disabled={isUploading || isDeleting}
                onClick={() => setShowDeleteConfirm(true)}
                className="min-h-[44px] px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors border border-transparent hover:border-rose-200 cursor-pointer flex items-center justify-center"
                title="Remove profile photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-fadeIn">
          <div className={`rounded-xl p-5 max-w-xs w-full shadow-2xl space-y-3 border ${
            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-4 h-4" />
              <h4 className="font-black text-xs uppercase tracking-wider">Remove Profile Photo?</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Remove the profile photo for <strong className="text-slate-800 dark:text-slate-200">{worker.fullName}</strong>?
              The image file will be removed from Firebase Storage and Firestore.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <button
                disabled={isDeleting}
                onClick={handleDeletePhoto}
                className="min-h-[44px] flex-1 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Remove</span>
              </button>
              <button
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="min-h-[44px] px-3.5 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-size Photo Preview Modal */}
      {previewOpen && currentProfilePhoto && (
        <div
          onClick={() => setPreviewOpen(false)}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
              <span className="font-bold text-xs">{worker.fullName} — Profile Photo</span>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <img
                src={currentProfilePhoto.downloadUrl}
                alt={worker.fullName}
                className="max-h-80 w-auto rounded-xl object-contain shadow-lg"
              />
            </div>
            <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Worker ID: {worker.workerId}</span>
              <span>{(currentProfilePhoto.fileSize / 1024).toFixed(0)} KB • Protected</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
