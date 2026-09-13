import { database, type OutboxOperation } from "../../lib/local-db/database";
import { readOfflineFile } from "../../lib/storage/offlineFiles";
import { supabase } from "../../lib/supabase/client";
import { resolveDeviceProfileId } from "../../lib/auth/deviceSession";

export async function localProfileId() {
  return resolveDeviceProfileId();
}

export async function cacheEntityList<T extends { id: string }>(entityType: string, rows: T[]) {
  const profileId = await localProfileId(); if (!profileId) return;
  await database.transaction("rw", database.entities, async () => {
    await database.entities.where("[profileId+entityType]").equals([profileId, entityType]).delete();
    await database.entities.bulkPut(rows.map((row) => ({ profileId, entityType, id: row.id, data: row, updatedAt: "updated_at" in row && typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString() })));
  });
}

export async function cacheEntity<T extends { id: string }>(entityType: string, row: T) {
  const profileId = await localProfileId(); if (!profileId) return;
  await database.entities.put({ profileId, entityType, id: row.id, data: row, updatedAt: "updated_at" in row && typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString() });
}

export async function readEntityList<T>(entityType: string): Promise<T[]> {
  const profileId = await localProfileId(); if (!profileId) return [];
  return (await database.entities.where("[profileId+entityType]").equals([profileId, entityType]).toArray()).map((row) => row.data as T);
}

export async function readEntityById<T>(entityTypePrefix: string, id: string): Promise<T | undefined> {
  const profileId = await localProfileId(); if (!profileId) return undefined;
  const row = await database.entities.where("profileId").equals(profileId).filter((entity) => entity.id === id && entity.entityType.startsWith(entityTypePrefix)).first();
  return row?.data as T | undefined;
}

export async function networkWithCache<T extends { id: string }>(entityType: string, request: () => Promise<T[]>): Promise<T[]> {
  if (navigator.onLine) {
    try { const rows = await request(); await cacheEntityList(entityType, rows); return rows; }
    catch (error) { const cached = await readEntityList<T>(entityType); if (cached.length) return cached; throw error; }
  }
  return readEntityList<T>(entityType);
}

export async function queueCreate<T extends { id: string }>(input: { entityType: string; table: string; row: T; serverRow?: Record<string, unknown>; dependsOn?: string[] }) {
  const profileId = await localProfileId(); if (!profileId) throw new Error("Sign in online once before saving offline.");
  await cacheEntity(input.entityType, input.row);
  const operationId = crypto.randomUUID();
  await database.outbox.put({ operationId, profileId, entityType: input.entityType, entityId: input.row.id, operation: "create", payload: { table: input.table, row: input.serverRow ?? input.row }, dependsOn: input.dependsOn ?? [], attemptCount: 0, createdAt: new Date().toISOString() });
  return operationId;
}

export async function queueDocumentUpload(input: { document: Record<string, unknown> & { id: string }; version: Record<string, unknown> & { id: string }; storagePath: string }) {
  const profileId = await localProfileId(); if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({ operationId, profileId, entityType: "documents", entityId: input.document.id, operation: "upload_document", payload: input, dependsOn: [], attemptCount: 0, createdAt: new Date().toISOString() });
  return operationId;
}

export async function queueAccountDocumentUpload(input: { upload: Record<string, unknown> & { id: string }; storagePath: string }) {
  const profileId = await localProfileId(); if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({ operationId, profileId, entityType: "account-document-uploads", entityId: input.upload.id, operation: "upload_account_document", payload: input, dependsOn: [], attemptCount: 0, createdAt: new Date().toISOString() });
  return operationId;
}

export async function queueDocumentAssociation(input: { documentId: string; uploadId: string; rpc: Record<string, unknown>; dependsOn?: string[] }) {
  const profileId = await localProfileId(); if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({ operationId, profileId, entityType: "documents", entityId: input.documentId, operation: "associate_account_document", payload: { uploadId: input.uploadId, rpc: input.rpc }, dependsOn: input.dependsOn ?? [], attemptCount: 0, createdAt: new Date().toISOString() });
  return operationId;
}

export async function queueUpdate<T extends { id: string }>(input: { entityType: string; table: string; row: T; patch: Record<string, unknown>; baseVersion?: number }) {
  const profileId = await localProfileId(); if (!profileId) throw new Error("Sign in online once before saving offline.");
  await cacheEntity(input.entityType, input.row);
  const operationId = crypto.randomUUID();
  await database.outbox.put({ operationId, profileId, entityType: input.entityType, entityId: input.row.id, operation: "update", payload: { table: input.table, patch: input.patch }, baseVersion: input.baseVersion, dependsOn: [], attemptCount: 0, createdAt: new Date().toISOString() });
  return operationId;
}

export async function queueDelete(input: { entityType: string; table: string; entityId: string; match?: Record<string, string>; hard?: boolean; dependsOn?: string[] }) {
  const profileId = await localProfileId(); if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({ operationId, profileId, entityType: input.entityType, entityId: input.entityId, operation: "delete", payload: { table: input.table, match: input.match, hard: input.hard }, dependsOn: input.dependsOn ?? [], attemptCount: 0, createdAt: new Date().toISOString() });
  return operationId;
}

export function orderOutbox(operations: OutboxOperation[]) {
  const remaining = new Map(operations.map((operation) => [operation.operationId, operation])); const ordered: OutboxOperation[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((operation) => operation.dependsOn.every((dependency) => !remaining.has(dependency))).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!ready.length) return [...ordered, ...[...remaining.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))];
    ready.forEach((operation) => { ordered.push(operation); remaining.delete(operation.operationId); });
  }
  return ordered;
}

export function classifySyncError(error: unknown) {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } : null;
  const message = error instanceof Error
    ? error.message
    : candidate
      ? [candidate.code, candidate.message, candidate.details, candidate.hint].filter(Boolean).join(" ")
      : String(error);
  if (/version_conflict|changed on another device/i.test(message)) return "conflict" as const;
  if (/quota|space/i.test(message)) return "quota" as const;
  if (/auth|sign in|session/i.test(message)) return "authentication" as const;
  if (/permission|row.level.security|forbidden|not authorized|42501/i.test(message)) return "permission" as const;
  if (/schema cache|column .* does not exist|relation .* does not exist|42703|42P01/i.test(message)) return "schema" as const;
  if (/network|fetch|timeout|temporar|unavailable/i.test(message)) return "retryable" as const;
  return "failed" as const;
}

export function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "23505" || /duplicate key|already exists/i.test(String(candidate.message ?? ""));
}

export type SyncIssue = OutboxOperation & { localValue: unknown; serverValue?: unknown };

export async function listSyncIssues(): Promise<SyncIssue[]> {
  const profileId = await localProfileId(); if (!profileId) return [];
  const operations = await database.outbox.where("profileId").equals(profileId).filter((operation) => Boolean(operation.lastErrorCode)).toArray();
  return Promise.all(operations.map(async (operation) => {
    const local = await database.entities.get([profileId, operation.entityType, operation.entityId]);
    const payload = operation.payload as { conflictServer?: unknown };
    return { ...operation, localValue: local?.data ?? null, serverValue: payload.conflictServer };
  }));
}

export async function getSyncSummary() {
  const profileId = await localProfileId();
  if (!profileId) return { pending: 0, issues: 0, conflicts: 0 };
  const operations = await database.outbox.where("profileId").equals(profileId).toArray();
  return { pending: operations.length, issues: operations.filter((operation) => operation.lastErrorCode).length, conflicts: operations.filter((operation) => operation.lastErrorCode === "conflict").length };
}

async function discardOperationTree(operationId: string) {
  const all = await database.outbox.toArray();
  const children = all.filter((operation) => operation.dependsOn.includes(operationId));
  for (const child of children) await discardOperationTree(child.operationId);
  await database.outbox.delete(operationId);
}

export async function discardDocumentUploadOperations(uploadId: string, documentId?: string) {
  const profileId = await localProfileId(); if (!profileId) return;
  const operations = await database.outbox.where("profileId").equals(profileId).filter((operation) => {
    if (operation.entityId === uploadId || (documentId && operation.entityId === documentId)) return true;
    const payload = operation.payload as { uploadId?: unknown };
    return payload.uploadId === uploadId;
  }).toArray();
  for (const operation of operations) await discardOperationTree(operation.operationId);
}

export async function resolveSyncIssue(operationId: string, resolution: "keep_local" | "use_server" | "retry" | "discard") {
  const operation = await database.outbox.get(operationId); if (!operation) return;
  const payload = operation.payload as { conflictServer?: Record<string, unknown> | null };
  if (resolution === "use_server") {
    if (payload.conflictServer && typeof payload.conflictServer.id === "string") await cacheEntity(operation.entityType, payload.conflictServer as { id: string });
    await discardOperationTree(operationId); return;
  }
  if (resolution === "discard") {
    if (operation.operation === "create") await database.entities.delete([operation.profileId, operation.entityType, operation.entityId]);
    await discardOperationTree(operationId); return;
  }
  if (resolution === "keep_local") {
    const serverVersion = payload.conflictServer?.version;
    if (typeof serverVersion !== "number") throw new Error("Reconnect and refresh the server version before keeping this edit.");
    const { conflictServer: _ignored, ...cleanPayload } = payload;
    await database.outbox.update(operationId, { baseVersion: serverVersion, payload: cleanPayload, lastErrorCode: undefined, attemptCount: 0 });
  } else await database.outbox.update(operationId, { lastErrorCode: undefined, attemptCount: 0 });
  await syncOutbox();
}

async function pushDocument(operation: OutboxOperation) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const payload = operation.payload as { document: Record<string, unknown> & { id: string }; version: Record<string, unknown> & { id: string }; storagePath: string };
  const blob = await readOfflineFile(operation.profileId, payload.version.id); if (!blob) throw new Error("Local document bytes are missing.");
  // Uploads are resumable: a previous attempt may have created either row before
  // the storage upload or final pointer update failed. `ignoreDuplicates` maps to
  // ON CONFLICT DO NOTHING, so retries do not emit a 23505 response or require
  // the UPDATE policy merely to rediscover an existing row.
  const { error: docError } = await supabase
    .from("documents")
    .upsert({ ...payload.document, current_version_id: null }, { onConflict: "id", ignoreDuplicates: true });
  if (docError) throw docError;
  const { error: uploadError } = await supabase.storage.from("trip-documents").upload(payload.storagePath, blob, { contentType: String(payload.version.mime_type), upsert: false });
  if (uploadError && !/exist|duplicate/i.test(uploadError.message)) throw uploadError;
  const { error: versionError } = await supabase
    .from("document_versions")
    .upsert(payload.version, { onConflict: "id", ignoreDuplicates: true });
  if (versionError) throw versionError;
  const { error: finalError } = await supabase.from("documents").update({ current_version_id: payload.version.id }).eq("id", payload.document.id); if (finalError) throw finalError;
}

async function pushAccountDocument(operation: OutboxOperation) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const payload = operation.payload as { upload: Record<string, unknown> & { id: string }; storagePath: string };
  const blob = await readOfflineFile(operation.profileId, payload.upload.id); if (!blob) throw new Error("Local document bytes are missing.");
  const { error: rowError } = await supabase.from("account_document_uploads").upsert(payload.upload, { onConflict: "id", ignoreDuplicates: true });
  if (rowError) throw rowError;
  const { error: uploadError } = await supabase.storage.from("account-documents").upload(payload.storagePath, blob, { contentType: String(payload.upload.mime_type), upsert: false });
  if (uploadError && !/exist|duplicate/i.test(uploadError.message)) throw uploadError;
}

async function pushDocumentAssociation(operation: OutboxOperation) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const payload = operation.payload as { rpc: Record<string, unknown> };
  const { error } = await supabase.rpc("associate_account_document", payload.rpc);
  if (error) throw error;
}

export async function syncOutbox() {
  if (!navigator.onLine || !supabase) return { synced: 0, failed: 0 };
  const profileId = await localProfileId(); if (!profileId) return { synced: 0, failed: 0 };
  const operations = orderOutbox(await database.outbox.where("profileId").equals(profileId).toArray()); let synced = 0; let failed = 0;
  for (const operation of operations) {
    const unresolvedDependencies = operation.dependsOn.length
      ? (await database.outbox.bulkGet(operation.dependsOn)).some(Boolean)
      : false;
    if (unresolvedDependencies) continue;
    try {
      if (operation.operation === "upload_document") await pushDocument(operation);
      else if (operation.operation === "upload_account_document") await pushAccountDocument(operation);
      else if (operation.operation === "associate_account_document") await pushDocumentAssociation(operation);
      else {
        const payload = operation.payload as { table: string; row?: Record<string, unknown>; patch?: Record<string, unknown>; match?: Record<string, string>; hard?: boolean };
        if (operation.operation === "create" && payload.row) { const { error } = await supabase.from(payload.table).upsert(payload.row, { ignoreDuplicates: true }); if (error) throw error; }
        if (operation.operation === "update" && payload.patch) {
          let request = supabase.from(payload.table).update(payload.patch).eq("id", operation.entityId);
          if (operation.baseVersion !== undefined) request = request.eq("version", operation.baseVersion);
          const { data, error } = await request.select("id"); if (error) throw error;
          if (operation.baseVersion !== undefined && !data?.length) throw new Error("version_conflict");
        }
        if (operation.operation === "delete") {
          let request = payload.hard ? supabase.from(payload.table).delete() : supabase.from(payload.table).update({ deleted_at: new Date().toISOString() });
          const match = payload.match ?? { id: operation.entityId };
          for (const [column, value] of Object.entries(match)) request = request.eq(column, value);
          const { error } = await request; if (error) throw error;
        }
      }
      await database.outbox.delete(operation.operationId); synced += 1;
    } catch (error) {
      failed += 1;
      const classification = classifySyncError(error);
      let payload = operation.payload;
      if (classification === "conflict" && operation.operation === "update") {
        const currentPayload = operation.payload as { table: string } & Record<string, unknown>;
        const { data } = await supabase.from(currentPayload.table).select("*").eq("id", operation.entityId).maybeSingle();
        payload = { ...currentPayload, conflictServer: data ?? null };
      }
      await database.outbox.update(operation.operationId, { attemptCount: operation.attemptCount + 1, lastErrorCode: classification, payload });
    }
  }
  return { synced, failed };
}
