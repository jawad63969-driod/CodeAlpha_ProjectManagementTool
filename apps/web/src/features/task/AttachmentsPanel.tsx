import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError, api, tokens } from '../../shared/api/client.js';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { useToast } from '../../shared/ui/Toast.jsx';
import { Button, EmptyState, ErrorState, IconButton, Spinner } from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { relativeTime } from '../../shared/hooks/time.js';

const prettySize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const AttachmentsPanel = ({ taskId, canEdit }: { taskId: string; canEdit: boolean }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { session } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: keys.attachments(taskId),
    queryFn: () => endpoints.attachments(taskId),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: keys.attachments(taskId) });
    void queryClient.invalidateQueries({ queryKey: keys.task(taskId) });
  };

  const upload = useMutation({
    mutationFn: (file: File) => endpoints.uploadAttachment(taskId, file),
    onSuccess: () => { toast.success('File attached'); refresh(); },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not upload that file'),
  });

  const remove = useMutation({
    mutationFn: (attachmentId: string) => endpoints.deleteAttachment(attachmentId),
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not delete that file'),
  });

  /** Downloads go through fetch so the access token travels with them. */
  const download = async (url: string, fileName: string): Promise<void> => {
    try {
      const response = await fetch(api.absolute(url), {
        headers: { Authorization: `Bearer ${tokens.access() ?? ''}` },
      });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement('a'), { href: objectUrl, download: fileName });
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    } catch {
      toast.error('Could not download that file');
    }
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) upload.mutate(file);
  };

  if (isLoading) return <Spinner label="Loading files" />;

  return (
    <div className="stack">
      {canEdit && (
        <div
          className={`dropzone${over ? ' is-over' : ''}`}
          role="button" tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(event) => event.key === 'Enter' && input.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <input ref={input} type="file" hidden
                 onChange={(event) => {
                   const file = event.target.files?.[0];
                   if (file) upload.mutate(file);
                   event.target.value = '';
                 }} />
          <Icon name="upload" size={18} />
          <strong>{upload.isPending ? 'Uploading…' : 'Drop a file, or click to browse'}</strong>
          <span className="faint small">Up to 25 MB · identical files are stored once</span>
        </div>
      )}

      {/* "Nothing attached yet" is a claim about the task. It must not be made
          when the request to find out failed — a file the user uploaded a
          minute ago would appear to have been thrown away. */}
      {isError && (
        <ErrorState
          compact
          title="Could not load the files on this card"
          message={error instanceof ApiError ? error.message : 'The request did not reach the server.'}
          retrying={isFetching}
          onRetry={() => void refetch()}
        />
      )}
      {!isError && (data?.attachments ?? []).length === 0 && (
        <EmptyState compact icon="paperclip" title="Nothing attached yet" />
      )}
      {!isError && (data?.attachments ?? []).map((attachment) => (
        <div key={attachment.id} className="file-row">
          <span className="file-row__icon">
            <Icon name="file" size={15} />
          </span>
          <span className="file-row__info">
            <span className="file-row__name truncate">{attachment.fileName}</span>
            <span className="file-row__meta">
              {prettySize(attachment.sizeBytes)} · {attachment.mimeType} · {relativeTime(attachment.createdAt)}
            </span>
          </span>
          <Avatar person={attachment.uploadedBy ?? undefined} size={20} />
          <Button size="sm" icon="download"
                  onClick={() => void download(attachment.downloadUrl, attachment.fileName)}>
            Save
          </Button>
          {attachment.uploadedBy?.id === session?.user.id && (
            <IconButton icon="trash" label={`Delete ${attachment.fileName}`} size="sm" tone="danger"
                        onClick={() => remove.mutate(attachment.id)} />
          )}
        </div>
      ))}
    </div>
  );
};
