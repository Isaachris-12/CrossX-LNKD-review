export interface UploadTarget {
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  uploadHeaders: Record<string, string>;
  // The URL to use once the upload completes - this is what gets passed as
  // Post+'s mediaUrl.
  publicUrl: string;
  key: string;
}

// One implementation per storage backend. The client always follows the
// same two-step flow (ask for an UploadTarget, then upload bytes to
// uploadUrl) regardless of which backend is active, so swapping drivers
// never touches client code.
export interface StorageAdapter {
  name: string;
  createUploadTarget(contentType: string): Promise<UploadTarget>;
}
