import { clearProfileLocalData, database, type LocalDocumentRecord } from "../local-db/database";

type StorageManagerWithDirectory = StorageManager & { getDirectory?: () => Promise<any> };

async function directoryFor(profileId: string) {
  const storage = navigator.storage as StorageManagerWithDirectory;
  if (!storage.getDirectory) return null;
  const root = await storage.getDirectory();
  const profiles = await root.getDirectoryHandle("profiles", { create: true });
  const profile = await profiles.getDirectoryHandle(profileId, { create: true });
  return profile.getDirectoryHandle("documents", { create: true });
}

export async function storeOfflineFile(input: { profileId: string; versionId: string; blob: Blob; sha256: string; pinReason?: LocalDocumentRecord["pinReason"] }) {
  let localPath = `indexeddb://${input.profileId}/${input.versionId}`;
  try {
    const directory = await directoryFor(input.profileId);
    if (directory) {
      const handle = await directory.getFileHandle(input.versionId, { create: true });
      const writable = await handle.createWritable();
      await writable.write(input.blob);
      await writable.close();
      localPath = `opfs://profiles/${input.profileId}/documents/${input.versionId}`;
    } else {
      await database.localFileBlobs.put({ profileId: input.profileId, documentVersionId: input.versionId, blob: input.blob });
    }
  } catch {
    await database.localFileBlobs.put({ profileId: input.profileId, documentVersionId: input.versionId, blob: input.blob });
  }
  await database.localDocuments.put({ profileId: input.profileId, documentVersionId: input.versionId, localPath, byteSize: input.blob.size, sha256: input.sha256, verifiedAt: new Date().toISOString(), pinReason: input.pinReason ?? "document" });
  return localPath;
}

export async function readOfflineFile(profileId: string, versionId: string) {
  const record = await database.localDocuments.get([profileId, versionId]);
  if (!record?.verifiedAt) return null;
  if (record.localPath.startsWith("opfs://")) {
    try {
      const directory = await directoryFor(profileId);
      const handle = await directory?.getFileHandle(versionId);
      return handle ? await (await handle.getFile()) : null;
    } catch {
      return null;
    }
  }
  return (await database.localFileBlobs.get([profileId, versionId]))?.blob ?? null;
}

export async function removeOfflineFile(profileId: string, versionId: string) {
  const record = await database.localDocuments.get([profileId, versionId]);
  if (record?.localPath.startsWith("opfs://")) {
    try { const directory = await directoryFor(profileId); await directory?.removeEntry(versionId); } catch { /* already absent */ }
  }
  await Promise.all([database.localDocuments.delete([profileId, versionId]), database.localFileBlobs.delete([profileId, versionId])]);
}

export async function removeDocumentOfflineCopy(profileId: string, versionId: string) {
  const pendingUpload = await database.outbox.where("profileId").equals(profileId).filter((operation) => {
    if (operation.operation !== "upload_document") return false;
    const payload = operation.payload as { version?: { id?: string } };
    return payload.version?.id === versionId;
  }).first();
  if (pendingUpload) throw new Error("Keep this device copy until its upload has synchronized.");

  await removeOfflineFile(profileId, versionId);
  const manifests = await database.offlineManifests.where("profileId").equals(profileId).toArray();
  await Promise.all(manifests.filter((manifest) => manifest.expectedVersionIds.includes(versionId)).map((manifest) => database.offlineManifests.update(
    [profileId, manifest.tripId],
    { state: "failed", verifiedVersionIds: manifest.verifiedVersionIds.filter((id) => id !== versionId), checkedAt: new Date().toISOString() }
  )));
}

export async function clearProfileOfflineData(profileId: string) {
  const records = await database.localDocuments.where("profileId").equals(profileId).toArray();
  await Promise.all(records.map((record) => removeOfflineFile(profileId, record.documentVersionId)));
  await clearProfileLocalData(profileId);
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const result = await navigator.storage.estimate();
  return { usage: result.usage ?? 0, quota: result.quota ?? 0 };
}
