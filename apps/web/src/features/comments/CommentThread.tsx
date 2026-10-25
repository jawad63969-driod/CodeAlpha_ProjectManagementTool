import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentDto, ProjectMemberDto } from '@taskforge/shared';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { useToast } from '../../shared/ui/Toast.jsx';
import { Button, EmptyState, ErrorState, Spinner } from '../../shared/ui/misc.jsx';
import { relativeTime } from '../../shared/hooks/time.js';

/** Highlights resolved @mentions without rendering any HTML from the body. */
const renderBody = (comment: CommentDto) => {
  const names = new Set(comment.mentions.map((m) => m.name.split(/\s+/)[0]!.toLowerCase()));
  return comment.body.split(/(@[\w][\w.-]*)/g).map((piece, index) =>
    piece.startsWith('@') && names.has(piece.slice(1).toLowerCase())
      ? <strong key={index} className="comment__mention">{piece}</strong>
      : <span key={index}>{piece}</span>,
  );
};

export const CommentThread = ({
  taskId, members, canComment,
}: { taskId: string; members: ProjectMemberDto[]; canComment: boolean }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommentDto | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: keys.comments(taskId),
    queryFn: () => endpoints.comments(taskId),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: keys.comments(taskId) });
    void queryClient.invalidateQueries({ queryKey: keys.task(taskId) });
  };

  const post = useMutation({
    mutationFn: () =>
      endpoints.createComment(taskId, {
        body: draft.trim(),
        ...(replyTo ? { parentCommentId: replyTo.id } : {}),
      }),
    onSuccess: () => { setDraft(''); setReplyTo(null); invalidate(); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not post that comment'),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) => endpoints.deleteComment(commentId),
    onSuccess: invalidate,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not delete that comment'),
  });

  const threads = useMemo(() => {
    const comments = data?.comments ?? [];
    const roots = comments.filter((comment) => !comment.parentCommentId);
    return roots.map((root) => ({
      root,
      replies: comments.filter((comment) => comment.parentCommentId === root.id),
    }));
  }, [data]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (draft.trim().length === 0) return;
    post.mutate();
  };

  const bubble = (comment: CommentDto, isReply: boolean) => (
    <div key={comment.id} className={`comment${isReply ? ' comment--reply' : ''}`}>
      <Avatar person={comment.author ?? undefined} size={28} />
      <div className="comment__body">
        <div className="comment__meta">
          <strong>{comment.author?.name ?? 'Removed user'}</strong>
          <span className="muted small">{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className="faint small">edited</span>}
          {canComment && !isReply && (
            <button type="button" className="link-btn" onClick={() => setReplyTo(comment)}>Reply</button>
          )}
          {comment.author?.id === session?.user.id && (
            <button type="button" className="link-btn link-btn--danger" onClick={() => remove.mutate(comment.id)}>
              Delete
            </button>
          )}
        </div>
        <p>{renderBody(comment)}</p>
      </div>
    </div>
  );

  if (isLoading) return <Spinner label="Loading discussion" />;

  return (
    <div className="stack">
      {/* "No discussion yet" hid an existing thread whenever the fetch failed,
          and the composer below then invited the user to start a duplicate. */}
      {isError && (
        <ErrorState
          compact
          title="Could not load the discussion"
          message={error instanceof ApiError ? error.message : 'The request did not reach the server.'}
          retrying={isFetching}
          onRetry={() => void refetch()}
        />
      )}
      {!isError && threads.length === 0 && (
        <EmptyState compact icon="message" title="No discussion yet"
                    message={canComment ? 'Start the thread below.' : undefined} />
      )}
      {!isError && threads.map(({ root, replies }) => (
        <div key={root.id} className="stack">
          {bubble(root, false)}
          {replies.map((reply) => bubble(reply, true))}
        </div>
      ))}

      {canComment && !isError && (
        <form className="composer" onSubmit={submit}>
          <Avatar person={session?.user} size={28} />
          <div className="grow">
            {replyTo && (
              <p className="muted small" style={{ marginBottom: 4 }}>
                Replying to {replyTo.author?.name}{' '}
                <button type="button" className="link-btn" onClick={() => setReplyTo(null)}>cancel</button>
              </p>
            )}
            <textarea
              rows={2} value={draft} aria-label="Write a comment"
              placeholder={`Write a comment… mention someone with @${members[0]?.name.split(' ')[0]?.toLowerCase() ?? 'name'}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event); }
              }}
            />
          </div>
          <Button variant="primary" size="sm" type="submit" disabled={!draft.trim()} loading={post.isPending}>
            Send
          </Button>
        </form>
      )}
    </div>
  );
};
