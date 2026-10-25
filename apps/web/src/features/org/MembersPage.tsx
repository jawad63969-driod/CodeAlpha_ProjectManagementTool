import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../shared/auth/AuthContext.jsx';
import { endpoints, keys } from '../../shared/api/endpoints.js';
import { ApiError } from '../../shared/api/client.js';
import { Avatar } from '../../shared/ui/Avatar.jsx';
import { useToast } from '../../shared/ui/Toast.jsx';
import { Button, Chip, EmptyState, ErrorNote, Field, IconButton, Spinner } from '../../shared/ui/misc.jsx';
import { ConfirmDialog } from '../../shared/ui/Modal.jsx';

const ASSIGNABLE = ['ADMIN', 'MEMBER', 'GUEST'] as const;

const title = (value: string): string =>
  value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export const MembersPage = () => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [invite, setInvite] = useState({ email: '', role: 'MEMBER' });
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: keys.orgMembers,
    queryFn: endpoints.orgMembers,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.orgMembers });

  const add = useMutation({
    mutationFn: () => endpoints.addOrgMember({ email: invite.email.trim(), role: invite.role }),
    onSuccess: ({ member }) => {
      toast.success(`${member.name} joined the workspace`);
      setInvite({ email: '', role: 'MEMBER' });
      void refresh();
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Could not add that person'),
  });

  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => endpoints.setOrgRole(userId, role),
    onSuccess: () => void refresh(),
    onError: (caught) => toast.error(caught instanceof ApiError ? caught.message : 'Could not change that role'),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => endpoints.removeOrgMember(userId),
    onSuccess: () => { toast.info('Member removed'); setRemoving(null); void refresh(); },
    onError: (caught) => {
      toast.error(caught instanceof ApiError ? caught.message : 'Could not remove that person');
      setRemoving(null);
    },
  });

  if (isLoading) return <Spinner full label="Loading members" />;
  if (loadError) {
    return (
      <div className="page">
        <div className="page__inner page__inner--measure">
          <h1 className="page__title">Workspace members</h1>
          <ErrorNote>{loadError instanceof ApiError ? loadError.message : 'Could not load members'}</ErrorNote>
        </div>
      </div>
    );
  }

  const canManage = session?.orgRole === 'OWNER' || session?.orgRole === 'ADMIN';

  return (
    <div className="page">
      <div className="page__inner page__inner--measure">
        <div className="page__head">
          <div>
            <h1 className="page__title">{session?.organization.name}</h1>
            <p className="page__subtitle">
              Owners and admins manage the workspace · members create projects · guests only see what they are
              invited to.
            </p>
          </div>
        </div>

        {canManage && (
          <form
            className="stack"
            style={{ marginBottom: 'var(--sp-7)' }}
            onSubmit={(event: FormEvent) => { event.preventDefault(); setError(''); add.mutate(); }}
          >
            <ErrorNote>{error}</ErrorNote>
            <div className="invite">
              <Field label="Add a teammate" htmlFor="invite-email">
                <input id="invite-email" type="email" required placeholder="teammate@company.com" value={invite.email}
                       onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </Field>
              <Field label="Role" htmlFor="invite-role">
                <select id="invite-role" value={invite.role}
                        onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  {ASSIGNABLE.map((role) => <option key={role} value={role}>{title(role)}</option>)}
                </select>
              </Field>
              <Button type="submit" variant="primary" icon="plus" loading={add.isPending}>
                {add.isPending ? 'Adding…' : 'Add member'}
              </Button>
            </div>
            <p className="field__hint">
              The person needs a TaskForge account already — adding them grants access immediately.
            </p>
          </form>
        )}

        <div className="card">
          {(data?.members ?? []).map((member) => {
            const isSelf = member.id === session?.user.id;
            return (
              <div key={member.id} className="member-row">
                <Avatar person={member} size={30} />
                <span className="member-row__info">
                  <span className="member-row__name">{member.name}{isSelf ? ' (you)' : ''}</span>
                  <span className="member-row__mail">
                    {member.email}{member.jobTitle ? ` · ${member.jobTitle}` : ''}
                  </span>
                </span>
                {member.role === 'OWNER' || !canManage ? (
                  <Chip tone={member.role === 'OWNER' ? 'accent' : undefined}>{title(member.role)}</Chip>
                ) : (
                  <>
                    <select value={member.role} aria-label={`Role for ${member.name}`}
                            onChange={(e) => setRole.mutate({ userId: member.id, role: e.target.value })}>
                      {ASSIGNABLE.map((role) => <option key={role} value={role}>{title(role)}</option>)}
                    </select>
                    <IconButton icon="close" label={`Remove ${member.name}`} size="sm" tone="danger"
                                onClick={() => setRemoving({ id: member.id, name: member.name })} />
                  </>
                )}
              </div>
            );
          })}
          {(data?.members ?? []).length === 0 && (
            <EmptyState compact icon="users" title="No members yet" />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!removing}
        title="Remove from workspace?"
        message={<>{removing?.name} will lose access immediately and their open tasks will be unassigned.</>}
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
};
