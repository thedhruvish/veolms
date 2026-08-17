/**
 * StorageAdapter: Contract for downloading source video chunks and uploading
 * encoded HLS playlists and segments to local disk or remote object storage.
 */
export interface StorageAdapter {
  readonly driverType: "local" | "s3";

  /**
   * Downloads a remote storage asset to a local file path.
   */
  downloadFile(remoteKey: string, localDestinationPath: string): Promise<void>;

  /**
   * Uploads a local file to the destination storage key.
   */
  uploadFile(
    localSourcePath: string,
    remoteDestinationKey: string,
  ): Promise<void>;

  /**
   * Uploads all files within a local directory recursively under a remote prefix.
   */
  uploadDirectory(
    localSourceDir: string,
    remoteDestinationPrefix: string,
  ): Promise<readonly string[]>;

  /**
   * Checks if an asset exists in storage.
   */
  exists(remoteKey: string): Promise<boolean>;

  /**
   * Deletes an asset from storage.
   */
  deleteFile(remoteKey: string): Promise<void>;
}
