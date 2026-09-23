import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { apiFetch } from "../api/client";

interface UploadTarget {
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  uploadHeaders: Record<string, string>;
  publicUrl: string;
  key: string;
}

export interface PickedMedia {
  localUri: string;
  publicUrl: string;
  isVideo: boolean;
}

export function useMediaUpload() {
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickAndUpload() {
    setError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to attach media.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const isVideo = asset.type === "video";
    const contentType = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");

    setIsUploading(true);
    try {
      // Step 1: ask the backend where to upload (works the same whether
      // it's backed by local disk or S3-compatible storage).
      const target = await apiFetch<UploadTarget>("/media/upload-target", {
        method: "POST",
        body: JSON.stringify({ contentType }),
      });

      // Step 2: read the picked file's bytes and upload them there directly.
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();

      const uploadRes = await fetch(target.uploadUrl, {
        method: target.uploadMethod,
        headers: target.uploadHeaders,
        body: blob,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      setMedia({ localUri: asset.uri, publicUrl: target.publicUrl, isVideo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload media");
    } finally {
      setIsUploading(false);
    }
  }

  function clear() {
    setMedia(null);
    setError(null);
  }

  return { media, isUploading, error, pickAndUpload, clear };
}
