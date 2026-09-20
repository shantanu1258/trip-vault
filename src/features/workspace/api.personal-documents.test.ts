import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  queue: vi.fn(),
  cache: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
  from: vi.fn()
}));
vi.mock("../../lib/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("../sync/localSync", () => ({
  localProfileId: async () => "owner-1",
  cacheEntity: mocks.cache,
  queueAccountDocumentUpload: mocks.queue
}));
vi.mock("../../lib/storage/offlineFiles", () => ({
  storeOfflineFile: mocks.store,
  readOfflineFile: mocks.read
}));
import { associateAccountDocument, openPersonalDocument, stageAccountDocument } from "./api";
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  mocks.queue.mockResolvedValue("upload-operation");
});

it("queues private metadata with the bytes, without a trip or a separate metadata write", async () => {
  const file = new File(["%PDF-file"], "identity.pdf", { type: "application/pdf" });
  const upload = await stageAccountDocument(file, "a".repeat(64), {
    title: " My Aadhaar ",
    kind: "aadhaar",
    label: "Masked copy"
  });
  expect(upload).toMatchObject({
    owner_id: "owner-1",
    personal_title: "My Aadhaar",
    personal_kind: "aadhaar",
    associated_document_id: null,
    sync_state: "queued"
  });
  expect(mocks.queue).toHaveBeenCalledWith({
    upload: expect.objectContaining({
      personal_title: "My Aadhaar",
      personal_kind: "aadhaar",
      personal_label: "Masked copy",
      associated_document_id: null
    }),
    storagePath: expect.stringContaining("owner-1/")
  });
  expect(mocks.store).toHaveBeenCalledWith(
    expect.objectContaining({ profileId: "owner-1", blob: file })
  );
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(file);
  expect(await openPersonalDocument(upload)).toBe(file);
  await expect(openPersonalDocument({ ...upload, owner_id: "someone-else" })).rejects.toThrow(
    "not available"
  );
  await expect(
    associateAccountDocument({
      upload,
      tripId: "trip",
      title: "Identity",
      category: "passport",
      purpose: "passport",
      assignmentMode: "unassigned",
      visibility: "trip"
    })
  ).rejects.toThrow("stay private");
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
