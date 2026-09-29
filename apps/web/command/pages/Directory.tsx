import { useState, type ReactNode } from 'react';
import {
  contentStatuses,
  poiTypes,
  type Category,
  type Event,
  type Offer,
  type Poi,
} from '../../../../packages/domain';
import { Glyph } from '../../icons/glyphs';
import { AdminIcon } from '../../icons/admin';
import { categoryIcon, poiIcon } from '../../icons/illustrated';
import {
  deleteResource,
  errorMessage,
  fieldErrors,
  saveResource,
  useCommand,
  type TableResource,
} from '../data';
import {
  Badge,
  ColorField,
  ConfirmButton,
  DataTable,
  Drawer,
  IconPicker,
  MediaPicker,
  NumberField,
  PageHeader,
  SelectField,
  TagInput,
  TextArea,
  TextField,
  ToggleField,
  type Column,
} from '../ui';

type Kind = 'categories' | 'amenities' | 'offers' | 'events';
type Row = Category | Poi | Offer | Event;

const today = () => new Date().toISOString().slice(0, 10);
const statusTone = (s: string) => (s === 'ACTIVE' ? 'green' : s === 'DRAFT' ? 'neutral' : 'amber');
const poiTypeLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * Categories, amenities (POIs), offers and events share one CRUD page driven by per-type
 * column and form definitions. All writes go through the validated admin API.
 */
export default function Directory({ kind }: { kind: Kind }) {
  const command = useCommand();
  const { data } = command;
  const resource: TableResource = kind === 'amenities' ? 'pois' : kind;
  const canWrite = command.can(resource, 'write');
  const [editing, setEditing] = useState<{ item: Row; isNew: boolean } | null>(null);
  const floorName = (id: string) => data.floors.find((f) => f.id === id)?.shortName ?? id;
  const destinationName = (id: string) =>
    data.tenants.find((t) => t.id === id)?.name ?? data.pois.find((p) => p.id === id)?.name ?? '—';

  const config: {
    title: string;
    subtitle: string;
    addLabel: string;
    rows: Row[];
    columns: Column<Row>[];
    search: (r: Row) => string;
    blank: () => Row;
  } = (() => {
    switch (kind) {
      case 'categories':
        return {
          title: 'Categories',
          subtitle: 'Directory categories shown on the kiosk home. Synonyms improve search.',
          addLabel: 'Add category',
          rows: [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder),
          search: (r) => `${(r as Category).name} ${(r as Category).synonyms.join(' ')}`,
          blank: () =>
            ({
              id: '',
              name: '',
              icon: 'sparkle',
              color: '#1a5cff',
              sortOrder: data.categories.length + 1,
              primary: false,
              synonyms: [],
            }) as Category,
          columns: [
            {
              key: 'icon',
              header: '',
              width: '56px',
              render: (r) => <AdminIcon name={categoryIcon((r as Category).icon)} size={24} />,
            },
            {
              key: 'name',
              header: 'Category',
              sort: (r) => (r as Category).name,
              render: (r) => <strong>{(r as Category).name}</strong>,
            },
            {
              key: 'primary',
              header: 'Home screen',
              render: (r) =>
                (r as Category).primary ? (
                  <Badge tone="blue">Primary</Badge>
                ) : (
                  <span className="cmd-muted">Secondary</span>
                ),
            },
            {
              key: 'tenants',
              header: 'Tenants',
              render: (r) => data.tenants.filter((t) => t.categoryId === r.id).length,
              align: 'right',
            },
            {
              key: 'synonyms',
              header: 'Synonyms',
              render: (r) => (
                <span className="cmd-muted">{(r as Category).synonyms.join(', ') || '—'}</span>
              ),
            },
            {
              key: 'order',
              header: 'Order',
              sort: (r) => (r as Category).sortOrder,
              render: (r) => (r as Category).sortOrder,
              align: 'right',
            },
          ],
        };
      case 'amenities':
        return {
          title: 'Amenities & POIs',
          subtitle:
            'Washrooms, ATMs, parking, lifts and visitor services. Place new points on the map in Floors & Maps.',
          addLabel: 'Add amenity',
          rows: data.pois,
          search: (r) => `${(r as Poi).name} ${(r as Poi).type} ${(r as Poi).description}`,
          blank: () => {
            const floor = data.floors[0];
            return {
              id: '',
              name: '',
              type: 'Washroom',
              floorId: floor?.id ?? '',
              nodeId: data.nodes.find((n) => n.floorId === floor?.id)?.id ?? '',
              featureId: '',
              accessible: true,
              description: '',
              hours: '',
              status: 'ACTIVE',
            } as Poi;
          },
          columns: [
            {
              key: 'icon',
              header: '',
              width: '56px',
              render: (r) => (
                <AdminIcon name={poiIcon[(r as Poi).type] ?? 'information'} size={24} />
              ),
            },
            {
              key: 'name',
              header: 'Name',
              sort: (r) => (r as Poi).name,
              render: (r) => <strong>{(r as Poi).name}</strong>,
            },
            {
              key: 'type',
              header: 'Type',
              sort: (r) => (r as Poi).type,
              render: (r) => poiTypeLabel((r as Poi).type),
            },
            {
              key: 'floor',
              header: 'Floor',
              sort: (r) => (r as Poi).floorId,
              render: (r) => floorName((r as Poi).floorId),
            },
            {
              key: 'accessible',
              header: 'Step-free',
              render: (r) =>
                (r as Poi).accessible ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Badge tone={(r as Poi).status === 'ACTIVE' ? 'green' : 'neutral'}>
                  {(r as Poi).status === 'ACTIVE' ? 'Visible' : 'Hidden'}
                </Badge>
              ),
            },
          ],
        };
      case 'offers':
        return {
          title: 'Offers',
          subtitle:
            'Tenant promotions shown on profiles, the Offers screen and idle house content.',
          addLabel: 'Add offer',
          rows: data.offers,
          search: (r) => `${(r as Offer).title} ${destinationName((r as Offer).tenantId)}`,
          blank: () =>
            ({
              id: '',
              tenantId: data.tenants[0]?.id ?? '',
              title: '',
              highlight: '',
              description: '',
              image: '',
              start: today(),
              end: today(),
              terms: '',
              status: 'DRAFT',
            }) as Offer,
          columns: [
            {
              key: 'title',
              header: 'Offer',
              sort: (r) => (r as Offer).title,
              render: (r) => (
                <span className="cmd-cell-title">
                  <strong>{(r as Offer).title}</strong>
                  <small>{(r as Offer).highlight}</small>
                </span>
              ),
            },
            {
              key: 'tenant',
              header: 'Tenant',
              sort: (r) => destinationName((r as Offer).tenantId),
              render: (r) => destinationName((r as Offer).tenantId),
            },
            {
              key: 'dates',
              header: 'Runs',
              sort: (r) => (r as Offer).start,
              render: (r) => `${(r as Offer).start} → ${(r as Offer).end}`,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Badge tone={statusTone((r as Offer).status)}>{(r as Offer).status}</Badge>
              ),
            },
          ],
        };
      default:
        return {
          title: 'Events',
          subtitle: 'Centre events with optional directions to a tenant or amenity.',
          addLabel: 'Add event',
          rows: data.events,
          search: (r) => `${(r as Event).title} ${(r as Event).locationLabel}`,
          blank: () =>
            ({
              id: '',
              title: '',
              description: '',
              image: '',
              start: today(),
              end: today(),
              timeLabel: '',
              destinationId: '',
              locationLabel: '',
              status: 'DRAFT',
            }) as Event,
          columns: [
            {
              key: 'title',
              header: 'Event',
              sort: (r) => (r as Event).title,
              render: (r) => (
                <span className="cmd-cell-title">
                  <strong>{(r as Event).title}</strong>
                  <small>{(r as Event).timeLabel}</small>
                </span>
              ),
            },
            {
              key: 'where',
              header: 'Location',
              render: (r) =>
                (r as Event).locationLabel || destinationName((r as Event).destinationId),
            },
            {
              key: 'dates',
              header: 'Dates',
              sort: (r) => (r as Event).start,
              render: (r) => `${(r as Event).start} → ${(r as Event).end}`,
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => (
                <Badge tone={statusTone((r as Event).status)}>{(r as Event).status}</Badge>
              ),
            },
          ],
        };
    }
  })();

  return (
    <>
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing({ item: config.blank(), isNew: true })}
            >
              <Glyph name="plus" size={16} /> {config.addLabel}
            </button>
          ) : null
        }
      />
      <DataTable
        rows={config.rows}
        columns={config.columns}
        searchText={config.search}
        onRowClick={(r) => setEditing({ item: structuredClone(r), isNew: false })}
      />
      {editing ? (
        <Editor
          kind={kind}
          resource={resource}
          initial={editing.item}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function Editor({
  kind,
  resource,
  initial,
  isNew,
  onClose,
}: {
  kind: Kind;
  resource: TableResource;
  initial: Row;
  isNew: boolean;
  onClose: () => void;
}) {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can(resource, 'write');
  const [item, setItem] = useState<Row>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) =>
    setItem((current) => ({ ...current, [key]: value }) as Row);
  const v = item as unknown as Record<string, unknown>;
  const str = (key: string) => String(v[key] ?? '');

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const payload = { ...item, id: isNew ? item.id || undefined : item.id };
      await saveResource(resource, payload, isNew ? undefined : initial.id);
      command.toast('Saved. Publish to update kiosks.');
      await command.reload();
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      command.toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await deleteResource(resource, initial.id);
      command.toast('Deleted.');
      await command.reload();
      onClose();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  const destinationOptions = [
    { value: '', label: 'No directions' },
    ...data.tenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.unitNumber}` })),
    ...data.pois.map((p) => ({
      value: p.id,
      label: `${p.name} · ${data.floors.find((f) => f.id === p.floorId)?.shortName}`,
    })),
  ];

  let fields: ReactNode;
  if (kind === 'categories') {
    fields = (
      <>
        <TextField
          label="Name"
          value={str('name')}
          onChange={(x) => set('name', x)}
          error={errors.name}
        />
        {isNew ? (
          <TextField
            label="ID (optional)"
            value={str('id')}
            onChange={(x) => set('id', x)}
            error={errors.id}
          />
        ) : null}
        <ColorField
          label="Accent colour"
          value={str('color')}
          onChange={(x) => set('color', x)}
          error={errors.color}
        />
        <NumberField
          label="Display order"
          value={Number(v.sortOrder)}
          onChange={(x) => set('sortOrder', x)}
          min={0}
          max={1000}
        />
        <ToggleField
          label="Show on kiosk home"
          checked={Boolean(v.primary)}
          onChange={(x) => set('primary', x)}
          hint="Primary categories appear as large tiles"
        />
        <TagInput
          label="Search synonyms"
          value={(v.synonyms as string[]) ?? []}
          onChange={(x) => set('synonyms', x)}
          hint="e.g. food, restaurant, eat"
        />
        <IconPicker label="Illustrated icon" value={str('icon')} onChange={(x) => set('icon', x)} />
      </>
    );
  } else if (kind === 'amenities') {
    const floorId = str('floorId');
    fields = (
      <>
        <TextField
          label="Name"
          value={str('name')}
          onChange={(x) => set('name', x)}
          error={errors.name}
        />
        <SelectField
          label="Type"
          value={str('type')}
          onChange={(x) => set('type', x)}
          options={poiTypes.map((t) => ({ value: t, label: poiTypeLabel(t) }))}
        />
        <SelectField
          label="Floor"
          value={floorId}
          onChange={(x) => {
            setItem(
              (current) =>
                ({
                  ...current,
                  floorId: x,
                  nodeId: data.nodes.find((n) => n.floorId === x)?.id ?? '',
                  featureId: '',
                }) as Row,
            );
          }}
          options={data.floors.map((f) => ({ value: f.id, label: `${f.shortName} · ${f.theme}` }))}
        />
        <SelectField
          label="Route node"
          value={str('nodeId')}
          onChange={(x) => set('nodeId', x)}
          options={data.nodes
            .filter((n) => n.floorId === floorId)
            .map((n) => ({ value: n.id, label: `${n.label} · ${n.id}` }))}
          error={errors.nodeId}
          hint="Visitors are routed here"
        />
        <SelectField
          label="Map unit (optional)"
          value={str('featureId')}
          onChange={(x) => set('featureId', x)}
          options={[
            { value: '', label: 'None' },
            ...data.features
              .filter((f) => f.floorId === floorId)
              .map((f) => ({ value: f.id, label: f.label })),
          ]}
        />
        <TextField
          label="Hours"
          value={str('hours')}
          onChange={(x) => set('hours', x)}
          placeholder="e.g. 10:00–22:00"
        />
        <ToggleField
          label="Step-free access"
          checked={Boolean(v.accessible)}
          onChange={(x) => set('accessible', x)}
        />
        <ToggleField
          label="Visible to visitors"
          checked={str('status') === 'ACTIVE'}
          onChange={(x) => set('status', x ? 'ACTIVE' : 'HIDDEN')}
        />
        <TextArea
          label="Description"
          value={str('description')}
          onChange={(x) => set('description', x)}
          maxLength={500}
          error={errors.description}
        />
      </>
    );
  } else if (kind === 'offers') {
    fields = (
      <>
        <SelectField
          label="Tenant"
          value={str('tenantId')}
          onChange={(x) => set('tenantId', x)}
          options={data.tenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.unitNumber}` }))}
          error={errors.tenantId}
          wide
        />
        <TextField
          label="Title"
          value={str('title')}
          onChange={(x) => set('title', x)}
          error={errors.title}
        />
        <TextField
          label="Highlight"
          value={str('highlight')}
          onChange={(x) => set('highlight', x)}
          placeholder="20% OFF"
          maxLength={40}
        />
        <TextField
          label="Starts"
          type="date"
          value={str('start')}
          onChange={(x) => set('start', x)}
          error={errors.start}
        />
        <TextField
          label="Ends"
          type="date"
          value={str('end')}
          onChange={(x) => set('end', x)}
          error={errors.end}
        />
        <SelectField
          label="Status"
          value={str('status')}
          onChange={(x) => set('status', x)}
          options={contentStatuses.map((s) => ({ value: s, label: s }))}
        />
        <TextArea
          label="Description"
          value={str('description')}
          onChange={(x) => set('description', x)}
          maxLength={1000}
          error={errors.description}
        />
        <TextArea
          label="Terms"
          value={str('terms')}
          onChange={(x) => set('terms', x)}
          rows={2}
          maxLength={600}
        />
        <MediaPicker
          label="Offer image"
          value={str('image')}
          onChange={(x) => set('image', x)}
          media={data.media}
          hint="Optional — the tenant’s banner is used otherwise"
        />
      </>
    );
  } else {
    fields = (
      <>
        <TextField
          label="Title"
          value={str('title')}
          onChange={(x) => set('title', x)}
          error={errors.title}
          wide
        />
        <TextField
          label="Starts"
          type="date"
          value={str('start')}
          onChange={(x) => set('start', x)}
          error={errors.start}
        />
        <TextField
          label="Ends"
          type="date"
          value={str('end')}
          onChange={(x) => set('end', x)}
          error={errors.end}
        />
        <TextField
          label="Time"
          value={str('timeLabel')}
          onChange={(x) => set('timeLabel', x)}
          placeholder="Fri–Sun · 6:00–8:00 PM"
        />
        <SelectField
          label="Status"
          value={str('status')}
          onChange={(x) => set('status', x)}
          options={contentStatuses.map((s) => ({ value: s, label: s }))}
        />
        <SelectField
          label="Directions to"
          value={str('destinationId')}
          onChange={(x) => set('destinationId', x)}
          options={destinationOptions}
          error={errors.destinationId}
        />
        <TextField
          label="Location label"
          value={str('locationLabel')}
          onChange={(x) => set('locationLabel', x)}
          placeholder="Central Atrium · Level 1"
        />
        <TextArea
          label="Description"
          value={str('description')}
          onChange={(x) => set('description', x)}
          maxLength={1500}
          error={errors.description}
        />
        <MediaPicker
          label="Event image"
          value={str('image')}
          onChange={(x) => set('image', x)}
          media={data.media}
        />
      </>
    );
  }

  const title =
    kind === 'categories'
      ? 'category'
      : kind === 'amenities'
        ? 'amenity'
        : kind === 'offers'
          ? 'offer'
          : 'event';
  return (
    <Drawer
      title={isNew ? `New ${title}` : `Edit ${title}`}
      onClose={onClose}
      footer={
        <>
          {!isNew && canWrite ? (
            <ConfirmButton
              label={
                <>
                  <Glyph name="trash" size={16} /> Delete
                </>
              }
              onConfirm={remove}
            />
          ) : (
            <span />
          )}
          <span className="cmd-foot-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy || !canWrite}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {!canWrite ? (
        <div className="notice">Your role can view but not change this content.</div>
      ) : null}
      <fieldset className="cmd-form" disabled={!canWrite}>
        {fields}
      </fieldset>
    </Drawer>
  );
}
