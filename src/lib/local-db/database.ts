import Dexie, { type EntityTable, type Table } from "dexie";

export type DeviceSetting = {
  key: string;
  value: string;
  updatedAt: string;
};

export type LocalDocumentRecord = {
  profileId: string;
  documentVersionId: string;
  localPath: string;
  byteSize: number;
  sha256: string;
  verifiedAt: string;
  pinReason?: "document" | "trip" | "created";
};

export type LocalFileBlob = {
  profileId: string;
  documentVersionId: string;
  blob: Blob;
};

export type CachedEntity = {
  profileId: string;
  entityType: string;
  id: string;
  data: unknown;
  updatedAt: string;
};

export type OutboxOperation = {
  operationId: string;
  profileId: string;
  entityType: string;
  entityId: string;
  operation:
    | "create"
    | "upsert"
    | "update"
    | "delete"
    | "rpc"
    | "upload_document"
    | "upload_account_document"
    | "associate_account_document";
  payload: unknown;
  baseVersion?: number;
  dependsOn: string[];
  attemptCount: number;
  lastErrorCode?: string;
  nextAttemptAt?: string;
  createdAt: string;
};

export type OfflineManifest = {
  profileId: string;
  tripId: string;
  state:
    | "not_requested"
    | "preparing"
    | "essentials_ready"
    | "ready"
    | "stale"
    | "failed"
    | "insufficient_space";
  expectedVersionIds: string[];
  verifiedVersionIds: string[];
  checkedAt: string;
};

class TripVaultDatabase extends Dexie {
  settings!: EntityTable<DeviceSetting, "key">;
  localDocuments!: Table<LocalDocumentRecord, [string, string]>;
  localFileBlobs!: Table<LocalFileBlob, [string, string]>;
  entities!: Table<CachedEntity, [string, string, string]>;
  outbox!: EntityTable<OutboxOperation, "operationId">;
  offlineManifests!: Table<OfflineManifest, [string, string]>;

  constructor() {
    super("trip-vault");
    this.version(1).stores({
      settings: "&key, updatedAt",
      localDocuments: "&[profileId+documentVersionId], profileId, documentVersionId, verifiedAt"
    });
    this.version(2).stores({
      settings: "&key, updatedAt",
      localDocuments: "&[profileId+documentVersionId], profileId, documentVersionId, verifiedAt",
      localFileBlobs: "&[profileId+documentVersionId], profileId, documentVersionId",
      entities:
        "&[profileId+entityType+id], [profileId+entityType], profileId, entityType, id, updatedAt",
      outbox: "&operationId, profileId, entityType, entityId, createdAt",
      offlineManifests: "&[profileId+tripId], profileId, tripId, state, checkedAt"
    });
  }
}

export async function clearProfileLocalData(profileId: string) {
  await database.transaction(
    "rw",
    [
      database.localDocuments,
      database.localFileBlobs,
      database.entities,
      database.outbox,
      database.offlineManifests
    ],
    async () => {
      await Promise.all([
        database.localDocuments.where("profileId").equals(profileId).delete(),
        database.localFileBlobs.where("profileId").equals(profileId).delete(),
        database.entities.where("profileId").equals(profileId).delete(),
        database.outbox.where("profileId").equals(profileId).delete(),
        database.offlineManifests.where("profileId").equals(profileId).delete()
      ]);
    }
  );
}

export const database = new TripVaultDatabase();

export function canOpenLocalDocument(
  profileId: string | null,
  record: LocalDocumentRecord | undefined
): boolean {
  return Boolean(profileId && record && record.profileId === profileId && record.verifiedAt);
}
