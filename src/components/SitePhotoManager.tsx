import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  Trash2,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Building2,
  Image as ImageIcon,
  ShieldAlert,
  Info
} from 'lucide-react';
import { ConstructionSite, SitePhotoMetadata } from '../types';
import { FirebaseService } from '../services/firebaseService';
import { MAX_SITE_PHOTOS_PER_SITE } from '../utils/imageProcessor';

interface SitePhotoManagerProps {
  site: ConstructionSite;
  isOpen: boolean;
  onClose: () => void;
  simTheme?: 'light' | 'dark';
}

export function SitePhotoManager({ site, isOpen, onClose, simTheme = 'light' }: SitePhotoManagerProps) {
  const [photos, setPhotos] = useState<SitePhotoMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<SitePhotoMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState<SitePhotoMetadata | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && site.siteId) {
      loadSitePhotos();
    }
  }, [isOpen, site.siteId]);

  const loadSitePhotos = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await FirebaseService.getSitePhotos(site.siteId);
      setPhotos(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load construction site photos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so user can re-select same file if needed
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (photos.length >= MAX_SITE_PHOTOS_PER_SITE) {
      setErrorMessage(`Maximum limit of ${MAX_SITE_PHOTOS_PER_SITE} photos reached for site ${site.siteId}. Remove an existing photo first.`);
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const uploaded = await FirebaseService.uploadSitePhoto(
        site.siteId,
        file,
        file.name,
        photos.length + 1
      );

      setPhotos((prev) => [...prev, uploaded]);
      setSuccessMessage(`Photo "${uploaded.fileName}" uploaded and stored in Firebase Storage.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to upload and process site photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = async (photo: SitePhotoMetadata) => {
    try {
      setDeletingPhotoId(photo.photoId);
      setErrorMessage(null);
      setSuccessMessage(null);

      await FirebaseService.deleteSitePhoto(site.siteId, photo.photoId);
      setPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      setSuccessMessage('Photo deleted from Firebase Storage and Firestore.');
      setConfirmDeletePhoto(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete site photo.');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  if (!isOpen) return null;

  const isDark = simTheme === 'dark';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div
        className={`rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border ${
          isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-800 bg-slate-950 text-white'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-white leading-tight">{site.siteName} Dossier Media</h3>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                  {site.siteId}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Site Infrastructure Media • Max 5 photos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status / Alert Notices */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 bg-red-950/80 border border-red-700/80 rounded-xl text-xs text-red-200 flex items-start gap-2">
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
          <div className="mx-4 mt-3 p-3 bg-emerald-950/80 border border-emerald-700/80 rounded-xl text-xs text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white text-xs">
              ✕
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* Quota & Upload Action Bar */}
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
            isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase font-mono">Site Media Quota</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  photos.length >= MAX_SITE_PHOTOS_PER_SITE
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                }`}>
                  {photos.length} / {MAX_SITE_PHOTOS_PER_SITE} Attached
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Client compression • Max 5MB • JPEG, PNG, WebP
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                id="site-photo-file-input"
                disabled={isUploading || photos.length >= MAX_SITE_PHOTOS_PER_SITE}
              />
              <button
                disabled={isUploading || photos.length >= MAX_SITE_PHOTOS_PER_SITE}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {isUploading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{isUploading ? 'Compressing...' : 'Upload Photo'}</span>
              </button>
            </div>
          </div>

          {/* Photos Grid */}
          {isLoading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2 text-amber-500" />
              <p className="text-xs font-semibold">Loading site media from Firebase...</p>
            </div>
          ) : photos.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 text-slate-400 opacity-60" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Site Photos Attached</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1 mb-4 leading-relaxed">
                Authorized administrators can attach up to 5 photos documenting site layout, safety zones, and civil infrastructure.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg font-black text-xs uppercase tracking-wider shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload First Photo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((photo, idx) => (
                <div
                  key={photo.photoId}
                  className={`rounded-xl border overflow-hidden shadow-xs transition-all flex flex-col group ${
                    isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Image container */}
                  <div
                    onClick={() => setPreviewPhoto(photo)}
                    className="relative aspect-video bg-slate-950 cursor-pointer overflow-hidden flex items-center justify-center"
                  >
                    <img
                      src={photo.downloadUrl}
                      alt={photo.fileName || `Site photo ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <span className="p-1.5 rounded-full bg-white/20 text-white backdrop-blur-xs">
                        <Eye className="w-4 h-4" />
                      </span>
                    </div>
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white font-mono text-[9px] font-bold">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Metadata and Controls */}
                  <div className="p-2.5 flex-1 flex flex-col justify-between text-xs">
                    <div>
                      <p className="font-bold text-[11px] truncate text-slate-800 dark:text-slate-100" title={photo.fileName}>
                        {photo.fileName}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                        <span>{(photo.fileSize / 1024).toFixed(0)} KB</span>
                        <span>{new Date(photo.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <button
                        onClick={() => setPreviewPhoto(photo)}
                        className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Preview</span>
                      </button>

                      <button
                        disabled={deletingPhotoId === photo.photoId}
                        onClick={() => setConfirmDeletePhoto(photo)}
                        className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 p-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Privacy & Invariant Notice */}
          <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
            <p className="leading-snug">
              Photos are stored in Firebase Storage and strictly indexed in Firestore metadata. All images are standard operational media; no biometric scanning, facial detection, or automated identity tracking is performed.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex justify-end ${
          isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 border rounded-lg text-xs font-bold transition-colors ${
              isDark
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Close
          </button>
        </div>
      </div>

      {/* Full-size Photo Preview Modal */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-60 flex items-center justify-center p-4 animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-xs truncate max-w-md">{previewPhoto.fileName}</span>
              </div>
              <button
                onClick={() => setPreviewPhoto(null)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-black p-2 flex items-center justify-center overflow-hidden">
              <img
                src={previewPhoto.downloadUrl}
                alt={previewPhoto.fileName}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
            <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Path: {previewPhoto.storagePath}</span>
              <span>{(previewPhoto.fileSize / 1024).toFixed(0)} KB • {previewPhoto.contentType}</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeletePhoto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-fadeIn">
          <div className={`rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-3 border ${
            isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              <h4 className="font-bold text-sm">Delete Site Photo?</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-800 dark:text-slate-200">{confirmDeletePhoto.fileName}</strong>?
              This will remove the file from Firebase Storage and remove its Firestore metadata.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <button
                disabled={deletingPhotoId === confirmDeletePhoto.photoId}
                onClick={() => handleDeletePhoto(confirmDeletePhoto)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {deletingPhotoId === confirmDeletePhoto.photoId ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>Delete Photo</span>
              </button>
              <button
                disabled={deletingPhotoId === confirmDeletePhoto.photoId}
                onClick={() => setConfirmDeletePhoto(null)}
                className={`px-3 py-2 border text-xs font-semibold rounded-lg ${
                  isDark
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
