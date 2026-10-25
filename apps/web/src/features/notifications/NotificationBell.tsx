import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@taskforge/shared';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { useToast } from '../../shared/ui/Toast.jsx';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { Button, EmptyState, ErrorState, Skeleton } from '../../shared/ui/misc.jsx';
import { Icon } from '../../shared/ui/Icon.jsx';
import { relativeTime } from '../../shared/hooks/time.js';

export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: keys.notifications,
    queryFn: endpoints.notifications,
  });

  const markAll = useMutation({
    mutationFn: endpoints.markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not mark those as read'),
  });
  const markOne = useMutation({
    mutationFn: endpoints.markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not mark that as read'),
  });

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const unread = data?.unread ?? 0;
  const items = data?.data ?? [];

  const openItem = (notification: NotificationDto): void => {
    setOpen(false);
    if (!notification.readAt) markOne.mutate(notification.id);
    if (notification.projectId) {
      navigate(`/projects/${notification.projectId}${notification.taskId ? `?task=${notification.taskId}` : ''}`);
    }
  };

  return (
    <div className="menu notif" ref={holder}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Icon name="bell" size={15} />
        {unread > 0 && <span className="bell__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown dropdown--wide">
          <div className="dropdown__head">
            <span>Notifications</span>
            {unread > 0 && (
              <Button variant="ghost" size="sm" icon="check" onClick={() => markAll.mutate()}>Mark all read</Button>
            )}
          </div>
          <div className="notif-list">
            {/* "All caught up" was shown for all three of: still loading, the
                request failed, and genuinely nothing waiting. Only the third
                is true, and the first two hid real notifications. */}
            {isPending && <Skeleton rows={3} className="notif-list__skeleton" />}
            {isError && (
              <ErrorState
                compact
                title="Could not load your notifications"
                message={error instanceof ApiError ? error.message : 'The request did not reach the server.'}
                retrying={isFetching}
                onRetry={() => void refetch()}
              />
            )}
            {!isPending && !isError && items.length === 0 && (
              <EmptyState compact icon="checkCircle" title="All caught up" message="No new notifications." />
            )}
            {!isError && items.map((notification) => (
              <button key={notification.id} type="button"
                      className={`notif__item${notification.readAt ? '' : ' is-unread'}`}
                      onClick={() => openItem(notification)}>
                <Avatar person={notification.actor ?? undefined} size={24} />
                <span className="grow">
                  <span className="notif__text">
                    <strong>{notification.actor?.name ?? 'Someone'}</strong> {notification.message}
                  </span>
                  <span className="notif__time">{relativeTime(notification.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
