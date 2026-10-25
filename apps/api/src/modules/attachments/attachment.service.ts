import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { EntityType, Permission, type AttachmentDto } from '@taskforge/shared';
import { db } from '../../db/client.js';
import { attachments, blobs, users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import { ID_PREFIX, newId } from '../../core/ids.js';
import { requirePermission } from '../../rbac/authorize.js';
import { recordActivity } from '../activity/activity.recorder.js';
import { taskService } from '../tasks/task.service.js';
import { sniffMimeType } from './mime.js';
import type { AuthContext } from '../../auth/context.js';

/** Fan the blob store out by hash prefix so no directory grows unbounded. */
const pathForHash = (hash: string): string =>
  path.join(env.storageDir, hash.slice(0, 2), `${hash}.bin`);

const toDto = (row: {
  attachment: typeof attachments.$inferSelect;
  blob: typeof blobs.$inferSelect;
  user: { id: string; name: string; avatarColor: string } | null;
}): AttachmentDto => ({
  id: row.attachment.id,
  taskId: row.attachment.taskId,
  fileName: row.attachment.fileName,
  mimeType: row.blob.mimeType,
  sizeBytes: row.blob.sizeBytes,
  uploadedBy: row.user ? { id: row.user.id, name: row.user.name, avatarColor: row.user.avatarColor } : null,
  createdAt: row.attachment.createdAt,
  downloadUrl: `/api/v1/attachments/${row.attachment.id}/download`,
});

const withBlob = (attachmentId: string, organizationId: string) =>
  db
    .select({ attachment: attachments, blob: blobs, user: users })
    .from(attachments)
    .innerJoin(blobs, eq(blobs.hash, attachments.blobHash))
    .leftJoin(users, eq(users.id, attachments.uploadedBy))
    .where(sql`${attachments.id} = ${attachmentId} and ${attachments.organizationId} = ${organizationId}`)
    .get();

export const attachmentService = {
  list(auth: AuthContext, taskId: string): AttachmentDto[] {
    taskService.load(auth, taskId);
    return db
      .select({ attachment: attachments, blob: blobs, user: users })
      .from(attachments)
      .innerJoin(blobs, eq(blobs.hash, attachments.blobHash))
      .leftJoin(users, eq(users.id, attachments.uploadedBy))
      .where(eq(attachments.taskId, taskId))
      .all()
      .map(toDto);
  },

  /**
   * Content-addressed upload (FR-G-02): the same bytes are stored once no matter
   * how many tasks reference them. Two people attaching the same 4 MB design
   * costs 4 MB, not 8.
   */
  upload(
    auth: AuthContext,
    taskId: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
  ): AttachmentDto {
    const task = taskService.load(auth, taskId);
    requirePermission(auth, Permission.ATTACHMENT_CREATE, task.projectId);

    if (file.buffer.length === 0) throw AppError.validation('That file is empty');
    if (file.buffer.length > env.maxUploadBytes) throw AppError.tooLarge();

    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const mimeType = sniffMimeType(file.buffer, file.mimetype);
    const storagePath = pathForHash(hash);
    const attachmentId = newId(ID_PREFIX.attachment);
    const fileName = path.basename(file.originalname).slice(0, 200) || 'attachment';

    return db.transaction((tx) => {
      const existing = tx.select().from(blobs).where(eq(blobs.hash, hash)).get();

      if (!existing) {
        fs.mkdirSync(path.dirname(storagePath), { recursive: true });
        fs.writeFileSync(storagePath, file.buffer);
        tx.insert(blobs)
          .values({ hash, sizeBytes: file.buffer.length, mimeType, storagePath, refCount: 1 })
          .run();
      } else {
        tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1` }).where(eq(blobs.hash, hash)).run();
      }

      tx.insert(attachments)
        .values({
          id: attachmentId,
          organizationId: auth.organizationId,
          taskId,
          blobHash: hash,
          fileName,
          uploadedBy: auth.userId,
        })
        .run();

      recordActivity(tx, {
        organizationId: auth.organizationId,
        projectId: task.projectId,
        actorId: auth.userId,
        entityType: EntityType.ATTACHMENT,
        entityId: attachmentId,
        action: 'created',
        changes: { fileName: { from: null, to: fileName } },
      });

      return toDto(
        tx
          .select({ attachment: attachments, blob: blobs, user: users })
          .from(attachments)
          .innerJoin(blobs, eq(blobs.hash, attachments.blobHash))
          .leftJoin(users, eq(users.id, attachments.uploadedBy))
          .where(eq(attachments.id, attachmentId))
          .get()!,
      );
    });
  },

  /** Download always goes through the permission check — the path is never public. */
  read(auth: AuthContext, attachmentId: string): { dto: AttachmentDto; body: Buffer } {
    const row = withBlob(attachmentId, auth.organizationId);
    if (!row) throw AppError.notFound('Attachment not found');
    taskService.load(auth, row.attachment.taskId);

    if (!fs.existsSync(row.blob.storagePath)) throw AppError.notFound('The stored file is missing from disk');
    return { dto: toDto(row), body: fs.readFileSync(row.blob.storagePath) };
  },

  /**
   * Deleting the last reference removes the bytes. Reference counting happens
   * inside the transaction, so a concurrent upload of the same content cannot
   * see a count of zero and have its file deleted underneath it.
   */
  remove(auth: AuthContext, attachmentId: string): void {
    const row = withBlob(attachmentId, auth.organizationId);
    if (!row) throw AppError.notFound('Attachment not found');
    const task = taskService.load(auth, row.attachment.taskId);

    if (row.attachment.uploadedBy !== auth.userId) {
      requirePermission(auth, Permission.ATTACHMENT_DELETE_ANY, task.projectId);
    } else {
      requirePermission(auth, Permission.ATTACHMENT_CREATE, task.projectId);
    }

    const orphanedPath = db.transaction((tx) => {
      tx.delete(attachments).where(eq(attachments.id, attachmentId)).run();
      tx.update(blobs).set({ refCount: sql`max(${blobs.refCount} - 1, 0)` }).where(eq(blobs.hash, row.blob.hash)).run();

      const remaining = tx.select({ n: blobs.refCount }).from(blobs).where(eq(blobs.hash, row.blob.hash)).get();
      if (remaining && Number(remaining.n) === 0) {
        tx.delete(blobs).where(eq(blobs.hash, row.blob.hash)).run();
        return row.blob.storagePath;
      }
      return null;
    });

    // Unlink only after the transaction commits — a rollback must not have
    // already destroyed the bytes.
    if (orphanedPath) fs.rmSync(orphanedPath, { force: true });

    recordActivity(db, {
      organizationId: auth.organizationId,
      projectId: task.projectId,
      actorId: auth.userId,
      entityType: EntityType.ATTACHMENT,
      entityId: attachmentId,
      action: 'deleted',
      changes: { fileName: { from: row.attachment.fileName, to: null } },
    });
  },
};
