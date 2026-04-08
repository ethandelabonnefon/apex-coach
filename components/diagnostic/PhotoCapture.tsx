"use client";

import { useRef, useState, useCallback } from "react";
import { Card, Button, SectionTitle, InfoBox } from "@/components/ui";

interface PhotoCaptureProps {
  photos: (string | null)[];
  onPhotosChange: (photos: (string | null)[]) => void;
}

const PHOTO_SLOTS = [
  { label: "Face (avant)", icon: "🧍", instruction: "Tiens-toi droit, bras le long du corps, face à la caméra" },
  { label: "Profil (côté)", icon: "🧍‍♂️", instruction: "Tourne-toi de 90° à droite, bras le long du corps" },
  { label: "Dos (arrière)", icon: "🔄", instruction: "Tourne le dos à la caméra, bras le long du corps" },
];

function compressImage(file: File, maxWidth: number = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoCapture({ photos, onPhotosChange }: PhotoCaptureProps) {
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);
  const [capturing, setCapturing] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileSelect = useCallback(
    async (index: number, file: File) => {
      try {
        const compressed = await compressImage(file);
        const newPhotos = [...photos];
        newPhotos[index] = compressed;
        onPhotosChange(newPhotos);
      } catch {
        console.error("Erreur compression image");
      }
    },
    [photos, onPhotosChange]
  );

  const startCamera = useCallback(async (index: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 800 }, height: { ideal: 1200 } },
      });
      streamRef.current = stream;
      setCapturing(index);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      // Camera not available, fall back to file input
      fileInputRefs.current[index]?.click();
    }
  }, []);

  const capturePhoto = useCallback(
    (index: number) => {
      if (!videoRef.current) return;
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      const newPhotos = [...photos];
      newPhotos[index] = dataUrl;
      onPhotosChange(newPhotos);
      stopCamera();
    },
    [photos, onPhotosChange]
  );

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCapturing(null);
  }, []);

  const removePhoto = useCallback(
    (index: number) => {
      const newPhotos = [...photos];
      newPhotos[index] = null;
      onPhotosChange(newPhotos);
    },
    [photos, onPhotosChange]
  );

  const photoCount = photos.filter(Boolean).length;

  return (
    <Card>
      <SectionTitle>Photos corporelles</SectionTitle>
      <p className="text-xs text-white/40 mb-4">
        Prends 3 photos en sous-vêtements ou tenue de sport serrée pour une analyse visuelle par IA.
        Les photos restent privées et sont stockées localement.
      </p>

      {/* Camera capture modal */}
      {capturing !== null && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <p className="text-white text-sm mb-4">{PHOTO_SLOTS[capturing].instruction}</p>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-[60vh] rounded-xl border border-white/10"
          />
          <div className="flex gap-4 mt-6">
            <Button variant="danger" onClick={stopCamera}>
              Annuler
            </Button>
            <Button onClick={() => capturePhoto(capturing)}>
              Capturer
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PHOTO_SLOTS.map((slot, i) => (
          <div key={i} className="flex flex-col items-center">
            <p className="text-xs text-white/60 mb-2 font-medium">
              {slot.icon} {slot.label}
            </p>

            {photos[i] ? (
              <div className="relative group">
                <img
                  src={photos[i]!}
                  alt={slot.label}
                  className="w-full h-48 object-cover rounded-xl border border-white/10"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => startCamera(i)}>
                    Reprendre
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => removePhoto(i)}>
                    Supprimer
                  </Button>
                </div>
                <div className="absolute top-2 right-2">
                  <div className="w-5 h-5 rounded-full bg-[#00ff94] flex items-center justify-center">
                    <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-48 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3 hover:border-[#00ff94]/30 transition-colors">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => startCamera(i)}>
                    <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Photo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fileInputRefs.current[i]?.click()}
                  >
                    Fichier
                  </Button>
                </div>
                <p className="text-[10px] text-white/25 text-center px-2">{slot.instruction}</p>
              </div>
            )}

            <input
              ref={(el) => { fileInputRefs.current[i] = el; }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(i, file);
                e.target.value = "";
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-white/30">{photoCount}/3 photos prises</p>
        {photoCount > 0 && photoCount < 3 && (
          <p className="text-xs text-[#ff9500]/70">Les 3 photos sont recommandées pour une analyse complète</p>
        )}
      </div>

      {photoCount === 0 && (
        <InfoBox variant="info">
          <p className="text-xs">
            Les photos permettent une analyse visuelle par IA de ton physique. Tu peux aussi passer cette
            étape et ne faire que l'analyse numérique.
          </p>
        </InfoBox>
      )}
    </Card>
  );
}
