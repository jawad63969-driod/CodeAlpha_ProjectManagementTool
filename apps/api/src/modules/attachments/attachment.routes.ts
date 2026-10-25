import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { Permission } from '@taskforge/shared';
import { env } from '../../config/env.js';
import { handler } from '../../core/async.js';
import { AppError } from '../../core/errors.js';
import { authenticate, requireAuth } from '../../middleware/authenticate.js';
import { authorize, fromAttachment, fromTask } from '../../rbac/authorize.js';
import { isInlineSafe } from './mime.js';
import { attachmentService } from './attachment.service.js';

// Buffered in memory: the cap is small, and hashing needs the whole file anyway.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});

const ofTask = fromTask();

export const attachmentRouter = Router();

attachmentRouter.get(
  '/tasks/:taskId/attachments',
  authenticate,
  authorize(Permission.PROJECT_READ, ofTask),
  handler(async (req: Request, res: Response) => {
    res.json({ attachments: attachmentService.list(requireAuth(req), req.params['taskId'] as string) });
  }),
);

attachmentRouter.post(
  '/tasks/:taskId/attachments',
  authenticate,
  authorize(Permission.ATTACHMENT_CREATE, ofTask),
  upload.single('file'),
  handler(async (req: Request, res: Response) => {
    if (!req.file) throw AppError.validation('No file was uploaded');
    const attachment = attachmentService.upload(requireAuth(req), req.params['taskId'] as string, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    });
    res.status(201).json({ attachment });
  }),
);

attachmentRouter.get(
  '/attachments/:attachmentId/download',
  authenticate,
  handler(async (req: Request, res: Response) => {
    const { dto, body } = attachmentService.read(requireAuth(req), req.params['attachmentId'] as string);
    // Unknown types are never rendered in the browser — they are downloaded.
    const disposition = isInlineSafe(dto.mimeType) ? 'inline' : 'attachment';
    res.setHeader('Content-Type', dto.mimeType);
    res.setHeader('Content-Length', String(dto.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(dto.fileName)}"`);
    res.send(body);
  }),
);

attachmentRouter.delete(
  '/attachments/:attachmentId',
  authenticate,
  authorize(Permission.ATTACHMENT_CREATE, fromAttachment()),
  handler(async (req: Request, res: Response) => {
    attachmentService.remove(requireAuth(req), req.params['attachmentId'] as string);
    res.json({ ok: true });
  }),
);
