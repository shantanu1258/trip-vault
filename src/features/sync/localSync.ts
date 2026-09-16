import { database, type OutboxOperation } from "../../lib/local-db/database";
import { readOfflineFile } from "../../lib/storage/offlineFiles";
import { supabase } from "../../lib/supabase/client";
import { resolveDeviceProfileId } from "../../lib/auth/deviceSession";

export async function localProfileId() {
  return resolveDeviceProfileId();
}

export async function cacheEntityList<T extends { id: string }>(entityType: string, rows: T[]) {
  const profileId = await localProfileId();
  if (!profileId) return;
  await database.transaction("rw", database.entities, async () => {
    await database.entities
      .where("[profileId+entityType]")
      .equals([profileId, entityType])
      .delete();
    await database.entities.bulkPut(
      rows.map((row) => ({
        profileId,
        entityType,
        id: row.id,
        data: row,
        updatedAt:
          "updated_at" in row && typeof row.updated_at === "string"
            ? row.updated_at
            : new Date().toISOString()
      }))
    );
  });
}

export async function cacheEntity<T extends { id: string }>(entityType: string, row: T) {
  const profileId = await localProfileId();
  if (!profileId) return;
  await database.entities.put({
    profileId,
    entityType,
    id: row.id,
    data: row,
    updatedAt:
      "updated_at" in row && typeof row.updated_at === "string"
        ? row.updated_at
        : new Date().toISOString()
  });
}

export async function readEntityList<T>(entityType: string): Promise<T[]> {
  const profileId = await localProfileId();
  if (!profileId) return [];
  return (
    await database.entities
      .where("[profileId+entityType]")
      .equals([profileId, entityType])
      .toArray()
  ).map((row) => row.data as T);
}

export async function readEntityById<T>(
  entityTypePrefix: string,
  id: string
): Promise<T | undefined> {
  const profileId = await localProfileId();
  if (!profileId) return undefined;
  const row = await database.entities
    .where("profileId")
    .equals(profileId)
    .filter((entity) => entity.id === id && entity.entityType.startsWith(entityTypePrefix))
    .first();
  return row?.data as T | undefined;
}

export async function networkWithCache<T extends { id: string }>(
  entityType: string,
  request: () => Promise<T[]>
): Promise<T[]> {
  if (navigator.onLine) {
    try {
      const rows = await request();
      await cacheEntityList(entityType, rows);
      return rows;
    } catch (error) {
      const cached = await readEntityList<T>(entityType);
      if (cached.length) return cached;
      throw error;
    }
  }
  return readEntityList<T>(entityType);
}

export async function queueCreate<T extends { id: string }>(input: {
  entityType: string;
  table: string;
  row: T;
  serverRow?: Record<string, unknown>;
  dependsOn?: string[];
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  await cacheEntity(input.entityType, input.row);
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: input.entityType,
    entityId: input.row.id,
    operation: "create",
    payload: { table: input.table, row: input.serverRow ?? input.row },
    dependsOn: input.dependsOn ?? [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueUpsert<T extends { id: string }>(input: {
  entityType: string;
  table: string;
  row: T;
  serverRow?: Record<string, unknown>;
  dependsOn?: string[];
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  await cacheEntity(input.entityType, input.row);
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: input.entityType,
    entityId: input.row.id,
    operation: "upsert",
    payload: { table: input.table, row: input.serverRow ?? input.row },
    dependsOn: input.dependsOn ?? [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueDocumentUpload(input: {
  document: Record<string, unknown> & { id: string };
  version: Record<string, unknown> & { id: string };
  storagePath: string;
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: "documents",
    entityId: input.document.id,
    operation: "upload_document",
    payload: input,
    dependsOn: [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueAccountDocumentUpload(input: {
  upload: Record<string, unknown> & { id: string };
  storagePath: string;
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: "account-document-uploads",
    entityId: input.upload.id,
    operation: "upload_account_document",
    payload: input,
    dependsOn: [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueDocumentAssociation(input: {
  documentId: string;
  uploadId: string;
  rpc: Record<string, unknown>;
  dependsOn?: string[];
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: "documents",
    entityId: input.documentId,
    operation: "associate_account_document",
    payload: { uploadId: input.uploadId, rpc: input.rpc },
    dependsOn: input.dependsOn ?? [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueUpdate<T extends { id: string }>(input: {
  entityType: string;
  table: string;
  row: T;
  patch: Record<string, unknown>;
  baseVersion?: number;
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  await cacheEntity(input.entityType, input.row);
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: input.entityType,
    entityId: input.row.id,
    operation: "update",
    payload: { table: input.table, patch: input.patch },
    baseVersion: input.baseVersion,
    dependsOn: [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueRpc(input: {
  entityType: string;
  entityId: string;
  functionName: string;
  args: Record<string, unknown>;
  dependsOn?: string[];
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: "rpc",
    payload: { functionName: input.functionName, args: input.args },
    dependsOn: input.dependsOn ?? [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export async function queueDelete(input: {
  entityType: string;
  table: string;
  entityId: string;
  match?: Record<string, string>;
  hard?: boolean;
  dependsOn?: string[];
}) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before saving offline.");
  const operationId = crypto.randomUUID();
  await database.outbox.put({
    operationId,
    profileId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: "delete",
    payload: { table: input.table, match: input.match, hard: input.hard },
    dependsOn: input.dependsOn ?? [],
    attemptCount: 0,
    createdAt: new Date().toISOString()
  });
  return operationId;
}

export function orderOutbox(operations: OutboxOperation[]) {
  const remaining = new Map(operations.map((operation) => [operation.operationId, operation]));
  const ordered: OutboxOperation[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()]
      .filter((operation) => operation.dependsOn.every((dependency) => !remaining.has(dependency)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!ready.length)
      return [
        ...ordered,
        ...[...remaining.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      ];
    ready.forEach((operation) => {
      ordered.push(operation);
      remaining.delete(operation.operationId);
    });
  }
  return ordered;
}

type OutboxRowPayload = {
  table?: unknown;
  row?: unknown;
  patch?: unknown;
  match?: unknown;
} & Record<string, unknown>;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rowPayload(operation: OutboxOperation) {
  const payload = recordValue(operation.payload) as OutboxRowPayload | null;
  return {
    payload,
    row: recordValue(payload?.row),
    patch: recordValue(payload?.patch),
    match: recordValue(payload?.match)
  };
}

function bookingIdForTravelerOperation(operation: OutboxOperation) {
  const { payload, row, match } = rowPayload(operation);
  if (payload?.table !== "booking_travelers") return null;
  const bookingId = row?.booking_id ?? match?.booking_id;
  return typeof bookingId === "string" && bookingId ? bookingId : null;
}

/**
 * Upgrades rows written by a previously cached PWA before they reach the
 * stricter event-form schema. This is deliberately pure so the upgrade can be
 * verified independently from IndexedDB and safely repeated after a crash.
 */
export function upgradeLegacyOutboxOperations(operations: OutboxOperation[]) {
  const upgraded = operations.map((operation) => ({
    ...operation,
    dependsOn: [...operation.dependsOn]
  }));
  const changed = new Set<string>();
  const removed = new Set<string>();
  const travelerOperations = new Map<string, OutboxOperation[]>();

  for (const operation of upgraded) {
    const bookingId = bookingIdForTravelerOperation(operation);
    if (!bookingId) continue;
    const existing = travelerOperations.get(bookingId) ?? [];
    existing.push(operation);
    travelerOperations.set(bookingId, existing);
  }

  for (const operation of upgraded) {
    const { payload, row, patch } = rowPayload(operation);
    if (!payload) continue;

    if (
      (operation.operation === "create" || operation.operation === "upsert") &&
      payload.table === "journey_legs" &&
      row
    ) {
      const details = recordValue(row.details);
      const mode = row.mode;
      if (
        (!details || Object.keys(details).length === 0) &&
        ["train", "bus", "ferry", "cab"].includes(String(mode))
      ) {
        operation.payload = {
          ...payload,
          row: {
            ...row,
            details: mode === "cab" ? { kind: "cab", ride_type: "local" } : { kind: mode }
          }
        };
        changed.add(operation.operationId);
      }
      continue;
    }

    if (payload.table !== "bookings") continue;
    const target = operation.operation === "update" ? patch : row;
    if (!target) continue;
    const bookingId = typeof target.id === "string" ? target.id : operation.entityId;
    const relatedTravelerOperations = travelerOperations.get(bookingId) ?? [];
    const additions = relatedTravelerOperations.filter(
      (item) => item.operation === "create" || item.operation === "upsert"
    );
    const explicitScope =
      target.participant_scope === "everyone" || target.participant_scope === "selected"
        ? target.participant_scope
        : null;
    let participantScope = explicitScope;

    if (
      !participantScope &&
      (operation.operation !== "update" || relatedTravelerOperations.length > 0)
    ) {
      // Legacy creates with no child rows meant Everyone; any explicit child
      // row meant Selected. A legacy update only changes scope when its child
      // operations prove that participant membership was edited.
      participantScope =
        additions.length > 0 || operation.operation === "update" ? "selected" : "everyone";
      const nextTarget = { ...target, participant_scope: participantScope };
      operation.payload =
        operation.operation === "update"
          ? { ...payload, patch: nextTarget }
          : { ...payload, row: nextTarget };
      changed.add(operation.operationId);
    }

    if (!participantScope) continue;
    if (participantScope === "everyone") {
      // Everyone is represented only by the booking flag. Keep deletes because
      // they may be clearing traveler rows already stored on the server.
      additions.forEach((item) => removed.add(item.operationId));
      continue;
    }

    for (const child of relatedTravelerOperations) {
      if (!child.dependsOn.includes(operation.operationId)) {
        child.dependsOn = [...child.dependsOn, operation.operationId];
        changed.add(child.operationId);
      }
    }
  }

  const bookingParentIds = new Set<string>();
  for (const operation of upgraded) {
    const { payload, row, patch } = rowPayload(operation);
    if (payload?.table !== "bookings") continue;
    const target = operation.operation === "update" ? patch : row;
    const bookingId = typeof target?.id === "string" ? target.id : operation.entityId;
    if (bookingId) bookingParentIds.add(bookingId);
  }

  // A cached app may have received the server response for the legacy booking
  // but stopped before sending its traveler rows. Mark only those orphaned
  // rows so sync can repair an Everyone default if the stricter trigger proves
  // that the parent was stored before participant_scope existed.
  for (const operation of upgraded) {
    if (
      removed.has(operation.operationId) ||
      (operation.operation !== "create" && operation.operation !== "upsert")
    )
      continue;
    const bookingId = bookingIdForTravelerOperation(operation);
    if (!bookingId || bookingParentIds.has(bookingId)) continue;
    const { payload } = rowPayload(operation);
    if (!payload) continue;
    operation.payload = { ...payload, legacyParticipantScopeRepair: true };
    changed.add(operation.operationId);
  }

  // The allocation trigger checks Selected booking membership. Make that
  // relationship an explicit dependency instead of relying on millisecond
  // timestamps to happen to order sibling outbox rows correctly.
  const legParents = new Map<string, { bookingId: string }>();
  const travelerAdds = new Map<string, OutboxOperation>();
  for (const operation of upgraded) {
    if (
      removed.has(operation.operationId) ||
      (operation.operation !== "create" && operation.operation !== "upsert")
    )
      continue;
    const { payload, row } = rowPayload(operation);
    if (!payload || !row) continue;
    if (payload.table === "flight_legs" || payload.table === "journey_legs") {
      const legId = typeof row.id === "string" ? row.id : operation.entityId;
      if (legId && typeof row.booking_id === "string")
        legParents.set(legId, { bookingId: row.booking_id });
    } else if (
      payload.table === "booking_travelers" &&
      typeof row.booking_id === "string" &&
      typeof row.traveler_id === "string"
    ) {
      travelerAdds.set(`${row.booking_id}:${row.traveler_id}`, operation);
    }
  }
  for (const operation of upgraded) {
    if (
      removed.has(operation.operationId) ||
      (operation.operation !== "create" && operation.operation !== "upsert")
    )
      continue;
    const { payload, row } = rowPayload(operation);
    if (!payload || !row) continue;
    const legId =
      payload.table === "flight_leg_travelers"
        ? row.flight_leg_id
        : payload.table === "journey_leg_travelers"
          ? row.journey_leg_id
          : null;
    if (typeof legId !== "string" || typeof row.traveler_id !== "string") continue;
    const parent = legParents.get(legId);
    if (!parent) continue;
    const traveler = travelerAdds.get(`${parent.bookingId}:${row.traveler_id}`);
    if (!traveler) continue;
    if (!operation.dependsOn.includes(traveler.operationId)) {
      operation.dependsOn = [...operation.dependsOn, traveler.operationId];
      changed.add(operation.operationId);
    }
  }

  return {
    operations: upgraded.filter((operation) => !removed.has(operation.operationId)),
    updatedOperationIds: [...changed].filter((operationId) => !removed.has(operationId)),
    removedOperationIds: [...removed]
  };
}

export function isParticipantScopeMismatchError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [candidate.message, candidate.details, candidate.hint].some((value) =>
    /booking traveler rows require selected scope/i.test(String(value ?? ""))
  );
}

async function prepareOutboxForCurrentSchema(operations: OutboxOperation[]) {
  const result = upgradeLegacyOutboxOperations(operations);
  for (const operationId of result.removedOperationIds) await database.outbox.delete(operationId);
  const byId = new Map(result.operations.map((operation) => [operation.operationId, operation]));
  for (const operationId of result.updatedOperationIds) {
    const operation = byId.get(operationId);
    if (!operation) continue;
    await database.outbox.update(operationId, {
      payload: operation.payload,
      dependsOn: operation.dependsOn,
      attemptCount: 0,
      lastErrorCode: undefined,
      nextAttemptAt: undefined
    });
  }
  return result.operations;
}

export function classifySyncError(error: unknown) {
  const candidate =
    error && typeof error === "object"
      ? (error as {
          code?: unknown;
          error?: unknown;
          message?: unknown;
          details?: unknown;
          hint?: unknown;
          status?: unknown;
          statusCode?: unknown;
        })
      : null;
  const message = candidate
    ? [
        candidate.code,
        candidate.error,
        candidate.status,
        candidate.statusCode,
        candidate.message,
        candidate.details,
        candidate.hint
      ]
        .filter(Boolean)
        .join(" ")
    : String(error);
  if (/version_conflict|changed on another device/i.test(message)) return "conflict" as const;
  if (/quota|space/i.test(message)) return "quota" as const;
  if (/auth|sign in|session/i.test(message)) return "authentication" as const;
  if (
    /permission|row.level.security|forbidden|not authorized|blocked|zscaler|dlp.denied|42501|\b403\b/i.test(
      message
    )
  )
    return "permission" as const;
  if (/schema cache|column .* does not exist|relation .* does not exist|42703|42P01/i.test(message))
    return "schema" as const;
  if (/network|fetch|timeout|temporar|unavailable/i.test(message)) return "retryable" as const;
  return "failed" as const;
}

export function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "23505" ||
    /duplicate key|already exists/i.test(String(candidate.message ?? ""))
  );
}

export function isDuplicateStorageObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    error?: unknown;
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status = String(candidate.statusCode ?? candidate.status ?? "");
  const code = String(candidate.code ?? candidate.error ?? "");
  const message = String(candidate.message ?? "");
  return (
    status === "409" ||
    /^duplicate$/i.test(code) ||
    /\balready exists\b|\bduplicate\b/i.test(message)
  );
}

export function isMissingAccountDocumentObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [candidate.message, candidate.details, candidate.hint].some((value) =>
    /document file is not stored yet/i.test(String(value ?? ""))
  );
}

type AccountDocumentStorageStep = {
  finalize: () => PromiseLike<{ data: unknown; error: unknown }>;
  upload: () => PromiseLike<{ error: unknown }>;
};

/**
 * Reconciles an account upload before sending its bytes again. The first
 * finalization call recovers the common case where Storage and the database
 * committed but the browser lost the response. Only the RPC's explicit
 * missing-object result permits a new, non-upsert Storage upload.
 */
export async function ensureAccountDocumentStored(step: AccountDocumentStorageStep) {
  const preflight = await step.finalize();
  if (!preflight.error) {
    if (typeof preflight.data !== "string")
      throw new Error("Supabase did not confirm the stored document file.");
    return preflight.data;
  }
  if (!isMissingAccountDocumentObjectError(preflight.error)) throw preflight.error;

  const { error: uploadError } = await step.upload();
  if (uploadError && !isDuplicateStorageObjectError(uploadError)) throw uploadError;

  const finalized = await step.finalize();
  if (finalized.error) throw finalized.error;
  if (typeof finalized.data !== "string")
    throw new Error("Supabase did not confirm the stored document file.");
  return finalized.data;
}

export function associatedAccountDocumentUpload(
  upload: Record<string, unknown>,
  documentId: string,
  updatedAt: string
) {
  return {
    ...upload,
    associated_document_id: documentId,
    updated_at: updatedAt,
    sync_state: "synced",
    association_pending: false,
    sync_error: undefined,
    can_retry: false
  };
}

export type SyncIssue = OutboxOperation & { localValue: unknown; serverValue?: unknown };

export type SyncIssueGroup = {
  key: string;
  entityType: string;
  lastErrorCode?: string;
  issues: SyncIssue[];
  attemptCount: number;
};

function syncIssueGroupKey(
  issue: Pick<OutboxOperation, "operationId" | "entityType" | "lastErrorCode">
) {
  // Conflicts need an individual choice between the local and cloud values.
  // Other failures for the same logical entity can be resolved as one batch.
  return issue.lastErrorCode === "conflict"
    ? `conflict:${issue.operationId}`
    : `${issue.entityType}:${issue.lastErrorCode ?? "failed"}`;
}

export function groupSyncIssues(issues: SyncIssue[]): SyncIssueGroup[] {
  const groups = new Map<string, SyncIssueGroup>();
  for (const issue of issues) {
    const key = syncIssueGroupKey(issue);
    const group = groups.get(key);
    if (group) {
      group.issues.push(issue);
      group.attemptCount = Math.max(group.attemptCount, issue.attemptCount);
      continue;
    }
    groups.set(key, {
      key,
      entityType: issue.entityType,
      lastErrorCode: issue.lastErrorCode,
      issues: [issue],
      attemptCount: issue.attemptCount
    });
  }
  return [...groups.values()];
}

export async function listSyncIssues(): Promise<SyncIssue[]> {
  const profileId = await localProfileId();
  if (!profileId) return [];
  const operations = await database.outbox
    .where("profileId")
    .equals(profileId)
    .filter((operation) => Boolean(operation.lastErrorCode))
    .toArray();
  return Promise.all(
    operations.map(async (operation) => {
      const local = await database.entities.get([
        profileId,
        operation.entityType,
        operation.entityId
      ]);
      const payload = operation.payload as { conflictServer?: unknown };
      return { ...operation, localValue: local?.data ?? null, serverValue: payload.conflictServer };
    })
  );
}

export async function getSyncSummary() {
  const profileId = await localProfileId();
  if (!profileId) return { pending: 0, issues: 0, conflicts: 0 };
  const operations = await database.outbox.where("profileId").equals(profileId).toArray();
  const failed = operations.filter((operation) => operation.lastErrorCode);
  return {
    pending: operations.length,
    issues: new Set(failed.map(syncIssueGroupKey)).size,
    conflicts: failed.filter((operation) => operation.lastErrorCode === "conflict").length
  };
}

async function discardOperationTree(operationId: string) {
  const all = await database.outbox.toArray();
  const children = all.filter((operation) => operation.dependsOn.includes(operationId));
  for (const child of children) await discardOperationTree(child.operationId);
  await database.outbox.delete(operationId);
}

export async function discardDocumentUploadOperations(uploadId: string, documentId?: string) {
  const profileId = await localProfileId();
  if (!profileId) return;
  const operations = await database.outbox
    .where("profileId")
    .equals(profileId)
    .filter((operation) => {
      if (operation.entityId === uploadId || (documentId && operation.entityId === documentId))
        return true;
      const payload = operation.payload as { uploadId?: unknown };
      return payload.uploadId === uploadId;
    })
    .toArray();
  for (const operation of operations) await discardOperationTree(operation.operationId);
}

export async function resolveSyncIssue(
  operationId: string,
  resolution: "keep_local" | "use_server" | "retry" | "discard"
) {
  const operation = await database.outbox.get(operationId);
  if (!operation) return;
  const payload = operation.payload as { conflictServer?: Record<string, unknown> | null };
  if (resolution === "use_server") {
    if (payload.conflictServer && typeof payload.conflictServer.id === "string")
      await cacheEntity(operation.entityType, payload.conflictServer as { id: string });
    await discardOperationTree(operationId);
    return;
  }
  if (resolution === "discard") {
    if (operation.operation === "create" || operation.operation === "upsert") {
      await database.entities.delete([
        operation.profileId,
        operation.entityType,
        operation.entityId
      ]);
    }
    await discardOperationTree(operationId);
    return;
  }
  if (resolution === "keep_local") {
    const serverVersion = payload.conflictServer?.version;
    if (typeof serverVersion !== "number")
      throw new Error("Reconnect and refresh the server version before keeping this edit.");
    const { conflictServer: _ignored, ...cleanPayload } = payload;
    await database.outbox.update(operationId, {
      baseVersion: serverVersion,
      payload: cleanPayload,
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      attemptCount: 0
    });
  } else
    await database.outbox.update(operationId, {
      lastErrorCode: undefined,
      nextAttemptAt: undefined,
      attemptCount: 0
    });
  await syncOutbox();
}

export async function resolveSyncIssueGroup(
  operationIds: string[],
  resolution: "retry" | "discard"
) {
  const profileId = await localProfileId();
  if (!profileId) return;
  const operations = (await database.outbox.bulkGet([...new Set(operationIds)])).filter(
    (operation): operation is OutboxOperation =>
      Boolean(operation && operation.profileId === profileId)
  );
  if (resolution === "discard") {
    for (const operation of operations) {
      if (operation.operation === "create" || operation.operation === "upsert")
        await database.entities.delete([
          operation.profileId,
          operation.entityType,
          operation.entityId
        ]);
      await discardOperationTree(operation.operationId);
    }
    return;
  }
  await Promise.all(
    operations.map((operation) =>
      database.outbox.update(operation.operationId, {
        lastErrorCode: undefined,
        nextAttemptAt: undefined,
        attemptCount: 0
      })
    )
  );
  await syncOutbox();
}

async function pushDocument(operation: OutboxOperation) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const payload = operation.payload as {
    document: Record<string, unknown> & { id: string };
    version: Record<string, unknown> & { id: string };
    storagePath: string;
  };
  const blob = await readOfflineFile(
    operation.profileId,
    payload.version.id,
    String(payload.version.mime_type)
  );
  if (!blob) throw new Error("Local document bytes are missing.");
  // Uploads are resumable: a previous attempt may have created either row before
  // the storage upload or final pointer update failed. `ignoreDuplicates` maps to
  // ON CONFLICT DO NOTHING, so retries do not emit a 23505 response or require
  // the UPDATE policy merely to rediscover an existing row.
  const { error: docError } = await supabase
    .from("documents")
    .upsert(
      { ...payload.document, current_version_id: null },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (docError) throw docError;
  const { error: uploadError } = await supabase.storage
    .from("trip-documents")
    .upload(payload.storagePath, blob, {
      contentType: String(payload.version.mime_type),
      upsert: false
    });
  if (uploadError && !isDuplicateStorageObjectError(uploadError)) throw uploadError;
  const { error: versionError } = await supabase
    .from("document_versions")
    .upsert(payload.version, { onConflict: "id", ignoreDuplicates: true });
  if (versionError) throw versionError;
  const { error: finalError } = await supabase
    .from("documents")
    .update({ current_version_id: payload.version.id })
    .eq("id", payload.document.id);
  if (finalError) throw finalError;
}

async function pushAccountDocument(operation: OutboxOperation) {
  const api = supabase;
  if (!api) throw new Error("Supabase is not connected.");
  const payload = operation.payload as {
    upload: Record<string, unknown> & { id: string };
    storagePath: string;
  };
  const { error: rowError } = await api
    .from("account_document_uploads")
    .upsert(payload.upload, { onConflict: "id", ignoreDuplicates: true });
  if (rowError) throw rowError;
  const storedAt = await ensureAccountDocumentStored({
    finalize: () =>
      api.rpc("finalize_account_document_upload", { requested_upload_id: payload.upload.id }),
    upload: async () => {
      // Read bytes only when the preflight proves Storage still needs them. A
      // completed server upload can therefore reconcile even if this device's
      // temporary blob was cleared after the response was lost.
      const blob = await readOfflineFile(
        operation.profileId,
        payload.upload.id,
        String(payload.upload.mime_type)
      );
      if (!blob) throw new Error("Local document bytes are missing.");
      return api.storage.from("account-documents").upload(payload.storagePath, blob, {
        contentType: String(payload.upload.mime_type),
        upsert: false
      });
    }
  });

  const cached = await database.entities.get([
    operation.profileId,
    "account-document-uploads",
    payload.upload.id
  ]);
  if (cached && cached.data && typeof cached.data === "object") {
    const {
      sync_error: _syncError,
      can_retry: _canRetry,
      ...upload
    } = cached.data as Record<string, unknown>;
    await database.entities.put({
      ...cached,
      data: { ...upload, stored_at: storedAt, sync_state: "synced" },
      updatedAt: storedAt
    });
  }
}

async function pushDocumentAssociation(operation: OutboxOperation) {
  if (!supabase) throw new Error("Supabase is not connected.");
  const payload = operation.payload as {
    uploadId?: string;
    rpc: Record<string, unknown> & { requested_document_id?: string };
  };
  const { data, error } = await supabase.rpc("associate_account_document", payload.rpc);
  if (error) throw error;
  const uploadId = payload.uploadId ?? "";
  const documentId =
    typeof data === "string" ? data : (payload.rpc.requested_document_id ?? operation.entityId);
  if (uploadId && documentId) {
    const key: [string, string, string] = [
      operation.profileId,
      "account-document-uploads",
      uploadId
    ];
    const cached = await database.entities.get(key);
    if (cached?.data && typeof cached.data === "object") {
      const updatedAt = new Date().toISOString();
      await database.entities.put({
        ...cached,
        data: associatedAccountDocumentUpload(
          cached.data as Record<string, unknown>,
          documentId,
          updatedAt
        ),
        updatedAt
      });
    }
  }
}

type InternalSyncResult = { synced: number; failed: number; changedTables: string[] };

function changedTablesForOperation(operation: OutboxOperation) {
  if (operation.operation === "upload_document") return ["documents", "document_versions"];
  if (operation.operation === "upload_account_document") return ["account_document_uploads"];
  if (operation.operation === "associate_account_document")
    return ["documents", "document_versions", "document_travelers", "document_access"];
  const payload = operation.payload as { table?: unknown; functionName?: unknown };
  if (typeof payload.table === "string") return [payload.table];
  if (payload.functionName === "sync_booking_participants")
    return ["bookings", "booking_travelers"];
  return ["*"];
}

function canAutomaticallyAttempt(operation: OutboxOperation, now = Date.now()) {
  if (!operation.lastErrorCode) return true;
  if (operation.lastErrorCode !== "retryable") return false;
  return !operation.nextAttemptAt || new Date(operation.nextAttemptAt).getTime() <= now;
}

function retryAt(attemptCount: number) {
  const delay = Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delay).toISOString();
}

async function executeSyncOutbox(): Promise<InternalSyncResult> {
  if (!navigator.onLine || !supabase) return { synced: 0, failed: 0, changedTables: [] };
  const api = supabase;
  const profileId = await localProfileId();
  if (!profileId) return { synced: 0, failed: 0, changedTables: [] };
  const pending = await database.outbox.where("profileId").equals(profileId).toArray();
  const operations = orderOutbox(await prepareOutboxForCurrentSchema(pending));
  let synced = 0;
  let failed = 0;
  const changedTables = new Set<string>();
  for (const operation of operations) {
    if (!canAutomaticallyAttempt(operation)) continue;
    const unresolvedDependencies = operation.dependsOn.length
      ? (await database.outbox.bulkGet(operation.dependsOn)).some(Boolean)
      : false;
    if (unresolvedDependencies) continue;
    try {
      if (operation.operation === "upload_document") await pushDocument(operation);
      else if (operation.operation === "upload_account_document")
        await pushAccountDocument(operation);
      else if (operation.operation === "associate_account_document")
        await pushDocumentAssociation(operation);
      else if (operation.operation === "rpc") {
        const payload = operation.payload as {
          functionName: string;
          args: Record<string, unknown>;
        };
        const { error } = await api.rpc(payload.functionName, payload.args);
        if (error) throw error;
      } else {
        const payload = operation.payload as {
          table: string;
          row?: Record<string, unknown>;
          patch?: Record<string, unknown>;
          match?: Record<string, string>;
          hard?: boolean;
          legacyParticipantScopeRepair?: boolean;
        };
        if ((operation.operation === "create" || operation.operation === "upsert") && payload.row) {
          const send = () =>
            operation.operation === "create"
              ? api.from(payload.table).upsert(payload.row!, { ignoreDuplicates: true })
              : api.from(payload.table).upsert(payload.row!);
          let { error } = await send();
          if (
            error &&
            payload.legacyParticipantScopeRepair &&
            payload.table === "booking_travelers" &&
            isParticipantScopeMismatchError(error)
          ) {
            const bookingId = payload.row.booking_id;
            if (typeof bookingId !== "string" || !bookingId) throw error;
            const { error: repairError } = await api
              .from("bookings")
              .update({ participant_scope: "selected" })
              .eq("id", bookingId);
            if (repairError) throw repairError;
            ({ error } = await send());
          }
          if (error) throw error;
        }
        if (operation.operation === "update" && payload.patch) {
          let request = supabase
            .from(payload.table)
            .update(payload.patch)
            .eq("id", operation.entityId);
          if (operation.baseVersion !== undefined)
            request = request.eq("version", operation.baseVersion);
          const { data, error } = await request.select("id");
          if (error) throw error;
          if (operation.baseVersion !== undefined && !data?.length)
            throw new Error("version_conflict");
        }
        if (operation.operation === "delete") {
          let request = payload.hard
            ? supabase.from(payload.table).delete()
            : supabase.from(payload.table).update({ deleted_at: new Date().toISOString() });
          const match = payload.match ?? { id: operation.entityId };
          for (const [column, value] of Object.entries(match)) request = request.eq(column, value);
          const { error } = await request;
          if (error) throw error;
        }
      }
      await database.outbox.delete(operation.operationId);
      changedTablesForOperation(operation).forEach((table) => changedTables.add(table));
      synced += 1;
    } catch (error) {
      failed += 1;
      const classification = classifySyncError(error);
      let payload = operation.payload;
      if (classification === "conflict" && operation.operation === "update") {
        const currentPayload = operation.payload as { table: string } & Record<string, unknown>;
        const { data } = await supabase
          .from(currentPayload.table)
          .select("*")
          .eq("id", operation.entityId)
          .maybeSingle();
        payload = { ...currentPayload, conflictServer: data ?? null };
      }
      const attemptCount = operation.attemptCount + 1;
      await database.outbox.update(operation.operationId, {
        attemptCount,
        lastErrorCode: classification,
        nextAttemptAt: classification === "retryable" ? retryAt(attemptCount) : undefined,
        payload
      });
    }
  }
  return { synced, failed, changedTables: [...changedTables] };
}

let activeSync: Promise<InternalSyncResult> | null = null;

function sharedSyncRun() {
  if (activeSync) return activeSync;
  activeSync = executeSyncOutbox().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

export async function syncOutbox() {
  const { synced, failed } = await sharedSyncRun();
  return { synced, failed };
}

export function syncOutboxWithChanges() {
  return sharedSyncRun();
}
