import type { Request, Response } from 'express';
import type { CreateColumnInput, UpdateColumnInput } from '@taskforge/shared';
import { handler } from '../../core/async.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { boardService } from './board.service.js';

const projectIdOf = (req: Request): string => req.params['projectId'] as string;
const boardIdOf = (req: Request): string | undefined => {
  const value = req.query['boardId'];
  return typeof value === 'string' ? value : undefined;
};

export const boardController = {
  snapshot: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json(boardService.snapshot(auth, projectIdOf(req), boardIdOf(req)));
  }),

  listBoards: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ boards: boardService.listBoards(auth, projectIdOf(req)) });
  }),

  createBoard: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { name } = req.body as { name: string };
    res.status(201).json({ board: boardService.createBoard(auth, projectIdOf(req), name) });
  }),

  listColumns: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ columns: boardService.listColumns(auth, projectIdOf(req), boardIdOf(req)) });
  }),

  createColumn: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const column = boardService.createColumn(auth, projectIdOf(req), req.body as CreateColumnInput, boardIdOf(req));
    res.status(201).json({ column });
  }),

  updateColumn: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const column = boardService.updateColumn(auth, req.params['columnId'] as string, req.body as UpdateColumnInput);
    res.json({ column });
  }),

  deleteColumn: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const moveTo = req.query['moveTo'];
    const result = boardService.deleteColumn(
      auth,
      req.params['columnId'] as string,
      typeof moveTo === 'string' ? moveTo : undefined,
    );
    res.json({ ok: true, ...result });
  }),

  reorderColumns: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { orderedColumnIds } = req.body as { orderedColumnIds: string[] };
    res.json({ columns: boardService.reorderColumns(auth, projectIdOf(req), orderedColumnIds, boardIdOf(req)) });
  }),

  listLabels: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    res.json({ labels: boardService.listLabels(auth, projectIdOf(req)) });
  }),

  createLabel: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { name, color } = req.body as { name: string; color: string };
    res.status(201).json({ label: boardService.createLabel(auth, projectIdOf(req), name, color) });
  }),

  deleteLabel: handler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    boardService.deleteLabel(auth, projectIdOf(req), req.params['labelId'] as string);
    res.json({ ok: true });
  }),
};
