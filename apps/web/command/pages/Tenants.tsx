import { useEffect, useMemo, useState } from 'react';
import { dailyHours, tenantStatuses, type Tenant } from '../../../../packages/domain';
import { Glyph } from '../../icons/glyphs';
import { HeroArt, LogoTile } from '../../shared/ui';
import { deleteResource, errorMessage, fieldErrors, saveResource, useCommand } from '../data';
import {
  directoryUnits,
  tenantForDirectoryUnit,
} from '../../../../packages/domain/reference/architectural-directory';
import { UploadButton } from './MediaLibrary';
import {
  Badge,
  ColorField,
  ConfirmButton,
  DataTable,
  Drawer,
  MediaPicker,
  NumberField,
  PageHeader,
  SelectField,
  Tabs,
  TagInput,
  TextArea,
  TextField,
  ToggleField,
} from '../ui';

const statusTone = (s: Tenant['status']) =>
  s === 'ACTIVE'
    ? 'green'
    : s === 'COMING_SOON'
      ? 'blue'
      : s === 'TEMPORARILY_CLOSED'
        ? 'amber'
        : 'neutral';
const statusLabel: Record<Tenant['status'], string> = {
  ACTIVE: 'Active',
  COMING_SOON: 'Coming soon',
  TEMPORARILY_CLOSED: 'Temporarily closed',
  HIDDEN: 'Hidden',
};
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function blankTenant(data: ReturnType<typeof useCommand>['data']): Tenant {
  const floor = data.floors[0];
  const available = directoryUnits.find(
    (unit) => unit.floorId === floor?.id && !tenantForDirectoryUnit(unit, data.tenants),
  );
  const feature = available
    ? data.features.find((feature) => feature.id === available.featureId)
    : undefined;
  return {
    id: '',
    name: '',
    tradingName: '',
    categoryId: data.categories[0]?.id ?? '',
    subcategory: '',
    floorId: floor?.id ?? '',
    unitNumber: available?.unitNumber ?? '',
    nodeId: '',
    featureId: feature?.id ?? '',
    shortSummary: '',
    description: '',
    keywords: [],
    productTypes: [],
    services: [],
    brands: [],
    logo: '',
    heroImage: '',
    gallery: [],
    brandColor: '#3b5bdb',
    hours: dailyHours('10:00', '22:00', { open: '10:00', close: '23:00' }),
    waitMinutes: null,
    phone: '',
    website: '',
    accessibilityNotes: '',
    status: 'ACTIVE',
    anchor: false,
    dining: null,
    cinema: null,
    i18n: {},
  };
}

export default function Tenants() {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('tenants', 'write');
  const mapDirectory = data.floors.some((item) => item.id === 'l0');
  const [editing, setEditing] = useState<{ tenant: Tenant; isNew: boolean } | null>(null);
  const [category, setCategory] = useState('');
  const [floor, setFloor] = useState('');
  const [status, setStatus] = useState('');

  // Deep link: /command/tenants/<id>
  useEffect(() => {
    const id = window.location.pathname.split('/')[3];
    const tenant = id ? data.tenants.find((t) => t.id === decodeURIComponent(id)) : null;
    if (tenant) setEditing({ tenant: structuredClone(tenant), isNew: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(
    () =>
      data.tenants.filter(
        (t) =>
          (!category || t.categoryId === category) &&
          (!floor || t.floorId === floor) &&
          (!status || t.status === status),
      ),
    [data.tenants, category, floor, status],
  );
  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;
  const floorName = (id: string) => data.floors.find((f) => f.id === id)?.shortName ?? id;

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle={
          mapDirectory
            ? `${data.tenants.length} stores across Ground and First Floor. Assign a map unit and logo, then publish.`
            : `${data.tenants.length} stores, restaurants and services. Changes go live when you publish.`
        }
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing({ tenant: blankTenant(data), isNew: true })}
            >
              <Glyph name="plus" size={16} /> Add tenant
            </button>
          ) : null
        }
      />
      <DataTable
        rows={rows}
        searchText={(t) => `${t.name} ${t.unitNumber} ${t.subcategory} ${t.keywords.join(' ')}`}
        onRowClick={(t) => setEditing({ tenant: structuredClone(t), isNew: false })}
        filters={
          <>
            <select
              className="cmd-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="cmd-select"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              aria-label="Filter by floor"
            >
              <option value="">All floors</option>
              {data.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.shortName}
                </option>
              ))}
            </select>
            <select
              className="cmd-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">Any status</option>
              {tenantStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
          </>
        }
        columns={[
          {
            key: 'logo',
            header: '',
            width: '56px',
            render: (t) => <LogoTile tenant={t} size={36} />,
          },
          {
            key: 'name',
            header: 'Tenant',
            sort: (t) => t.name,
            render: (t) => (
              <span className="cmd-cell-title">
                <strong>{t.name}</strong>
                <small>{t.subcategory}</small>
              </span>
            ),
          },
          {
            key: 'category',
            header: 'Category',
            sort: (t) => categoryName(t.categoryId),
            render: (t) => categoryName(t.categoryId),
          },
          {
            key: 'floor',
            header: 'Floor',
            sort: (t) => t.floorId,
            render: (t) => floorName(t.floorId),
          },
          {
            key: 'unit',
            header: 'Unit',
            sort: (t) => t.unitNumber,
            render: (t) => <code>{t.unitNumber}</code>,
          },
          {
            key: 'status',
            header: 'Status',
            sort: (t) => t.status,
            render: (t) => <Badge tone={statusTone(t.status)}>{statusLabel[t.status]}</Badge>,
          },
          {
            key: 'offer',
            header: 'Offer',
            render: (t) =>
              data.offers.some((o) => o.tenantId === t.id && o.status === 'ACTIVE') ? (
                <Badge tone="violet">Offer live</Badge>
              ) : (
                <span className="cmd-muted">—</span>
              ),
          },
          {
            key: 'anchor',
            header: 'Anchor',
            render: (t) => (t.anchor ? <Glyph name="star" size={14} /> : null),
            align: 'center',
          },
        ]}
      />
      {editing ? (
        <TenantEditor
          key={editing.tenant.id || 'new'}
          initial={editing.tenant}
          isNew={editing.isNew}
          onClose={() => {
            setEditing(null);
            if (window.location.pathname.split('/')[3])
              window.history.replaceState(null, '', '/command/tenants');
          }}
        />
      ) : null}
    </>
  );
}

function TenantEditor({
  initial,
  isNew,
  onClose,
}: {
  initial: Tenant;
  isNew: boolean;
  onClose: () => void;
}) {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('tenants', 'write');
  const [tenant, setTenant] = useState<Tenant>(initial);
  const [tab, setTab] = useState('basics');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Tenant>(key: K, value: Tenant[K]) =>
    setTenant((t) => ({ ...t, [key]: value }));

  const floorUnits = data.features.filter(
    (f) =>
      f.floorId === tenant.floorId &&
      f.kind === 'unit' &&
      directoryUnits.some((unit) => unit.floorId === f.floorId && unit.featureId === f.id),
  );
  const floorNodes = data.nodes.filter(
    (n) =>
      n.floorId === tenant.floorId &&
      (n.type === 'tenant' || n.type === 'poi' || n.type === 'corridor'),
  );
  const occupiedBy = (featureId: string) => {
    const unit = directoryUnits.find(
      (unit) => unit.floorId === tenant.floorId && unit.featureId === featureId,
    );
    const occupant = unit && tenantForDirectoryUnit(unit, data.tenants);
    return occupant?.id !== tenant.id ? occupant?.name : undefined;
  };
  const selectUnit = (featureId: string, floorId = tenant.floorId) => {
    const unit = directoryUnits.find(
      (unit) => unit.floorId === floorId && unit.featureId === featureId,
    );
    const existing = unit && tenantForDirectoryUnit(unit, data.tenants);
    setTenant((tenant) => ({
      ...tenant,
      floorId,
      featureId,
      unitNumber: unit?.unitNumber ?? '',
      nodeId: existing?.id === tenant.id ? existing.nodeId : '',
    }));
  };
  const logoFields = (
    <div className="is-wide">
      <MediaPicker
        label="Logo"
        value={tenant.logo}
        onChange={(value) => set('logo', value)}
        media={data.media}
        hint="Publish to show this logo on the selected map unit. Clear it to show the tenant name."
      />
      <UploadButton
        label="Upload logo"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onUploaded={async (asset) => {
          set('logo', asset.url);
          await command.reload();
        }}
      />
    </div>
  );

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await saveResource(
        'tenants',
        { ...tenant, id: isNew ? tenant.id || undefined : tenant.id } as Tenant,
        isNew ? undefined : initial.id,
      );
      command.toast(`${tenant.name} saved. Publish to update kiosks.`);
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
      await deleteResource('tenants', initial.id);
      command.toast(`${initial.name} deleted.`);
      await command.reload();
      onClose();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  const tabs = [
    { id: 'basics', label: 'Basics' },
    { id: 'profile', label: 'Profile' },
    { id: 'tags', label: 'Products & tags' },
    { id: 'hours', label: 'Hours' },
    { id: 'dining', label: tenant.cinema ? 'Cinema' : 'Dining & cinema' },
    { id: 'media', label: 'Media' },
    { id: 'location', label: 'Map location' },
    { id: 'translations', label: 'Translations' },
    { id: 'preview', label: 'Preview' },
  ];
  const errorBadge = (keys: string[]) =>
    keys.some((k) => errors[k]) ? <i className="cmd-tab-error" aria-label="Has errors" /> : null;

  return (
    <Drawer
      wide
      title={isNew ? 'New tenant' : initial.name}
      subtitle={
        isNew
          ? 'Create a directory listing and link it to a map unit.'
          : `${tenant.unitNumber} · ${data.floors.find((f) => f.id === tenant.floorId)?.shortName ?? ''}`
      }
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
            {busy ? 'Saving…' : 'Save tenant'}
          </button>
        </>
      }
    >
      <Tabs
        tabs={tabs.map((t) => ({
          ...t,
          badge: errorBadge(
            t.id === 'basics'
              ? ['name', 'categoryId', 'status', 'brandColor']
              : t.id === 'location'
                ? ['floorId', 'nodeId', 'featureId', 'unitNumber']
                : t.id === 'profile'
                  ? ['shortSummary', 'description', 'website', 'phone']
                  : [],
          ),
        }))}
        active={tab}
        onChange={setTab}
      />
      {!canWrite ? (
        <div className="notice">Your role can view tenants but not change them.</div>
      ) : null}
      <fieldset className="cmd-form" disabled={!canWrite}>
        {tab === 'basics' ? (
          <>
            <TextField
              label="Tenant name"
              value={tenant.name}
              onChange={(v) => set('name', v)}
              error={errors.name}
            />
            <TextField
              label="Trading name"
              value={tenant.tradingName}
              onChange={(v) => set('tradingName', v)}
              hint="Shown if different from the name"
            />
            {isNew ? (
              <TextField
                label="ID (optional)"
                value={tenant.id}
                onChange={(v) => set('id', v)}
                hint="Leave blank to generate from the name"
                error={errors.id}
              />
            ) : null}
            <SelectField
              label="Category"
              value={tenant.categoryId}
              onChange={(v) => set('categoryId', v)}
              options={data.categories.map((c) => ({ value: c.id, label: c.name }))}
              error={errors.categoryId}
            />
            <TextField
              label="Subcategory"
              value={tenant.subcategory}
              onChange={(v) => set('subcategory', v)}
              hint="e.g. Italian restaurant, Sportswear & footwear"
            />
            <SelectField
              label="Status"
              value={tenant.status}
              onChange={(v) => set('status', v as Tenant['status'])}
              options={tenantStatuses.map((s) => ({ value: s, label: statusLabel[s] }))}
            />
            <ColorField
              label="Brand colour"
              value={tenant.brandColor}
              onChange={(v) => set('brandColor', v)}
              error={errors.brandColor}
            />
            <ToggleField
              label="Anchor store"
              checked={tenant.anchor}
              onChange={(v) => set('anchor', v)}
              hint="Anchors get larger map labels and appear first in results"
            />
            {logoFields}
          </>
        ) : null}
        {tab === 'profile' ? (
          <>
            <TextField
              label="Short summary"
              value={tenant.shortSummary}
              onChange={(v) => set('shortSummary', v)}
              error={errors.shortSummary}
              maxLength={300}
              wide
            />
            <TextArea
              label="Description"
              value={tenant.description}
              onChange={(v) => set('description', v)}
              error={errors.description}
              rows={5}
              maxLength={2500}
            />
            <TextField
              label="Phone"
              value={tenant.phone}
              onChange={(v) => set('phone', v)}
              error={errors.phone}
            />
            <TextField
              label="Website"
              value={tenant.website}
              onChange={(v) => set('website', v)}
              error={errors.website}
              placeholder="https://"
            />
            <NumberField
              label="Estimated waiting time (minutes)"
              value={tenant.waitMinutes ?? NaN}
              onChange={(value) => set('waitMinutes', Number.isFinite(value) ? value : null)}
              min={0}
              max={240}
              hint="Optional. Shown on the mobile brand page; update it when the estimate changes."
              error={errors.waitMinutes}
            />
            <TextArea
              label="Accessibility notes"
              value={tenant.accessibilityNotes}
              onChange={(v) => set('accessibilityNotes', v)}
              rows={2}
              maxLength={500}
            />
          </>
        ) : null}
        {tab === 'tags' ? (
          <>
            <TagInput
              label="Known for / product types"
              value={tenant.productTypes}
              onChange={(v) => set('productTypes', v)}
              hint="Shown as tags on the profile and used by search"
              error={errors.productTypes}
            />
            <TagInput
              label="Search keywords"
              value={tenant.keywords}
              onChange={(v) => set('keywords', v)}
              hint="Words visitors might type: shoes, running shoes, gym…"
              error={errors.keywords}
            />
            <TagInput
              label="Services"
              value={tenant.services}
              onChange={(v) => set('services', v)}
            />
            <TagInput
              label="Brands stocked"
              value={tenant.brands}
              onChange={(v) => set('brands', v)}
            />
          </>
        ) : null}
        {tab === 'hours' ? (
          <div className="cmd-hours is-wide">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const h = tenant.hours.find((x) => x.day === day)!;
              const update = (patch: Partial<typeof h>) =>
                set(
                  'hours',
                  tenant.hours.map((x) => (x.day === day ? { ...x, ...patch } : x)),
                );
              return (
                <div key={day} className="cmd-hours-row">
                  <strong>{days[day]}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={!h.closed}
                      onChange={(e) => update({ closed: !e.target.checked })}
                    />{' '}
                    Open
                  </label>
                  <input
                    type="time"
                    value={h.open}
                    disabled={h.closed}
                    onChange={(e) => update({ open: e.target.value })}
                    aria-label={`${days[day]} opening time`}
                  />
                  <span>–</span>
                  <input
                    type="time"
                    value={h.close}
                    disabled={h.closed}
                    onChange={(e) => update({ close: e.target.value })}
                    aria-label={`${days[day]} closing time`}
                  />
                </div>
              );
            })}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                const monday = tenant.hours.find((x) => x.day === 1)!;
                set(
                  'hours',
                  tenant.hours.map((x) => ({
                    ...x,
                    open: monday.open,
                    close: monday.close,
                    closed: monday.closed,
                  })),
                );
              }}
            >
              Copy Monday to all days
            </button>
            {errors.hours ? <p className="cmd-field-error">{errors.hours}</p> : null}
          </div>
        ) : null}
        {tab === 'dining' ? (
          <>
            <ToggleField
              label="Restaurant / café details"
              checked={Boolean(tenant.dining)}
              onChange={(on) =>
                set(
                  'dining',
                  on
                    ? {
                        cuisines: [],
                        dietary: [],
                        dineIn: true,
                        takeaway: true,
                        delivery: false,
                        priceBand: '₹₹',
                        menuUrl: '',
                        reservationUrl: '',
                      }
                    : null,
                )
              }
            />
            {tenant.dining ? (
              <>
                <TagInput
                  label="Cuisines"
                  value={tenant.dining.cuisines}
                  onChange={(v) => set('dining', { ...tenant.dining!, cuisines: v })}
                />
                <TagInput
                  label="Dietary options"
                  value={tenant.dining.dietary}
                  onChange={(v) => set('dining', { ...tenant.dining!, dietary: v })}
                />
                <ToggleField
                  label="Dine-in"
                  checked={tenant.dining.dineIn}
                  onChange={(v) => set('dining', { ...tenant.dining!, dineIn: v })}
                />
                <ToggleField
                  label="Takeaway"
                  checked={tenant.dining.takeaway}
                  onChange={(v) => set('dining', { ...tenant.dining!, takeaway: v })}
                />
                <ToggleField
                  label="Delivery"
                  checked={tenant.dining.delivery}
                  onChange={(v) => set('dining', { ...tenant.dining!, delivery: v })}
                />
                <SelectField
                  label="Price band"
                  value={tenant.dining.priceBand}
                  onChange={(v) => set('dining', { ...tenant.dining!, priceBand: v as '₹' })}
                  options={['₹', '₹₹', '₹₹₹', '₹₹₹₹'].map((v) => ({ value: v, label: v }))}
                />
                <TextField
                  label="Menu link"
                  value={tenant.dining.menuUrl}
                  onChange={(v) => set('dining', { ...tenant.dining!, menuUrl: v })}
                  placeholder="https://"
                  error={errors.dining}
                />
                <TextField
                  label="Reservation link"
                  value={tenant.dining.reservationUrl}
                  onChange={(v) => set('dining', { ...tenant.dining!, reservationUrl: v })}
                  placeholder="https://"
                />
              </>
            ) : null}
            <ToggleField
              label="Cinema details"
              checked={Boolean(tenant.cinema)}
              onChange={(on) =>
                set('cinema', on ? { screens: 1, bookingUrl: '', showtimes: [] } : null)
              }
            />
            {tenant.cinema ? (
              <>
                <NumberField
                  label="Screens"
                  value={tenant.cinema.screens}
                  min={1}
                  max={40}
                  onChange={(v) => set('cinema', { ...tenant.cinema!, screens: v })}
                />
                <TextField
                  label="Booking link"
                  value={tenant.cinema.bookingUrl}
                  onChange={(v) => set('cinema', { ...tenant.cinema!, bookingUrl: v })}
                  placeholder="https://"
                  error={errors.cinema}
                />
                <div className="cmd-showtimes is-wide">
                  <strong>Showtimes (showtime-ready model — connect a ticketing feed later)</strong>
                  {tenant.cinema.showtimes.map((show, i) => {
                    const update = (patch: Partial<typeof show>) =>
                      set('cinema', {
                        ...tenant.cinema!,
                        showtimes: tenant.cinema!.showtimes.map((s, j) =>
                          j === i ? { ...s, ...patch } : s,
                        ),
                      });
                    return (
                      <div key={show.id} className="cmd-showtime-row">
                        <input
                          value={show.title}
                          onChange={(e) => update({ title: e.target.value })}
                          aria-label="Film title"
                          placeholder="Title"
                        />
                        <input
                          value={show.rating}
                          onChange={(e) => update({ rating: e.target.value })}
                          aria-label="Rating"
                          placeholder="Rating"
                        />
                        <input
                          value={show.language}
                          onChange={(e) => update({ language: e.target.value })}
                          aria-label="Language"
                          placeholder="Language"
                        />
                        <input
                          type="number"
                          value={show.durationMinutes}
                          onChange={(e) => update({ durationMinutes: Number(e.target.value) })}
                          aria-label="Duration minutes"
                        />
                        <input
                          value={show.times.join(', ')}
                          onChange={(e) =>
                            update({
                              times: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter((s) => /^\d{2}:\d{2}$/.test(s)),
                            })
                          }
                          aria-label="Times"
                          placeholder="11:20, 14:45"
                        />
                        <button
                          type="button"
                          className="cmd-icon-btn"
                          onClick={() =>
                            set('cinema', {
                              ...tenant.cinema!,
                              showtimes: tenant.cinema!.showtimes.filter((_, j) => j !== i),
                            })
                          }
                          aria-label="Remove showtime"
                        >
                          <Glyph name="trash" size={16} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                      set('cinema', {
                        ...tenant.cinema!,
                        showtimes: [
                          ...tenant.cinema!.showtimes,
                          {
                            id: `st-${Date.now().toString(36)}`,
                            title: 'New film',
                            rating: 'U',
                            language: 'English',
                            durationMinutes: 120,
                            times: ['18:00'],
                          },
                        ],
                      })
                    }
                  >
                    <Glyph name="plus" size={14} /> Add film
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : null}
        {tab === 'media' ? (
          <>
            {logoFields}
            <MediaPicker
              label="Hero image"
              value={tenant.heroImage}
              onChange={(v) => set('heroImage', v)}
              media={data.media}
              hint="Without a photo, an illustrated banner is used."
            />
            <div className="cmd-field is-wide">
              <label>Gallery</label>
              <div className="cmd-gallery-edit">
                {tenant.gallery.map((url) => (
                  <span key={url}>
                    <img src={url} alt="" />
                    <button
                      type="button"
                      className="cmd-icon-btn"
                      onClick={() =>
                        set(
                          'gallery',
                          tenant.gallery.filter((g) => g !== url),
                        )
                      }
                      aria-label="Remove image"
                    >
                      <Glyph name="close" size={14} />
                    </button>
                  </span>
                ))}
                <select
                  className="cmd-select"
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    set('gallery', [...tenant.gallery, e.target.value].slice(0, 12))
                  }
                  aria-label="Add gallery image"
                >
                  <option value="">Add image…</option>
                  {data.media
                    .filter((m) => m.kind === 'image' && !tenant.gallery.includes(m.url))
                    .map((m) => (
                      <option key={m.id} value={m.url}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </>
        ) : null}
        {tab === 'location' ? (
          <>
            <SelectField
              label="Floor"
              value={tenant.floorId}
              onChange={(v) => {
                const unit = directoryUnits.find(
                  (unit) => unit.floorId === v && !tenantForDirectoryUnit(unit, data.tenants),
                );
                selectUnit(unit?.featureId ?? '', v);
              }}
              options={data.floors.map((f) => ({
                value: f.id,
                label: f.id === 'l0' ? 'Ground Floor' : f.id === 'l1' ? 'First Floor' : f.name,
              }))}
              error={errors.floorId}
            />
            <TextField
              label="Unit number"
              value={tenant.unitNumber}
              onChange={(v) => set('unitNumber', v)}
              error={errors.unitNumber}
            />
            <SelectField
              label="Map unit"
              value={tenant.featureId}
              onChange={(v) => selectUnit(v)}
              options={[
                { value: '', label: 'Choose a unit…' },
                ...floorUnits
                  .filter((f) => !occupiedBy(f.id))
                  .map((f) => ({
                    value: f.id,
                    label: directoryUnits.find((unit) => unit.featureId === f.id)?.label ?? f.label,
                  })),
              ]}
              error={errors.featureId}
              hint="Choose an available unit. Its name or logo appears inside that unit after publishing."
            />
            <SelectField
              label="Entrance node (route destination)"
              value={tenant.nodeId}
              onChange={(v) => set('nodeId', v)}
              options={[
                { value: '', label: 'Choose a node…' },
                ...floorNodes.map((n) => ({ value: n.id, label: `${n.label} · ${n.id}` })),
              ]}
              error={errors.nodeId}
              hint="Choose the confirmed entrance. Add and connect a node in Floors & Maps if needed."
            />
          </>
        ) : null}
        {tab === 'translations' ? (
          <>
            <p className="cmd-muted is-wide">
              Hindi text shown when visitors switch language. Leave blank to fall back to English.
            </p>
            <TextField
              label="Name (हिन्दी)"
              value={tenant.i18n.hi?.name ?? ''}
              onChange={(v) =>
                set('i18n', { ...tenant.i18n, hi: { ...tenant.i18n.hi, name: v || undefined } })
              }
              wide
            />
            <TextField
              label="Short summary (हिन्दी)"
              value={tenant.i18n.hi?.shortSummary ?? ''}
              onChange={(v) =>
                set('i18n', {
                  ...tenant.i18n,
                  hi: { ...tenant.i18n.hi, shortSummary: v || undefined },
                })
              }
              wide
            />
            <TextArea
              label="Description (हिन्दी)"
              value={tenant.i18n.hi?.description ?? ''}
              onChange={(v) =>
                set('i18n', {
                  ...tenant.i18n,
                  hi: { ...tenant.i18n.hi, description: v || undefined },
                })
              }
            />
          </>
        ) : null}
        {tab === 'preview' ? (
          <div className="cmd-preview is-wide">
            <div className="cmd-preview-card">
              <HeroArt tenant={tenant} data={data} height={170} />
              <div className="cmd-preview-body">
                <div className="cmd-preview-head">
                  <LogoTile tenant={tenant} size={64} />
                  <div>
                    <strong>{tenant.name || 'Tenant name'}</strong>
                    <span>
                      {tenant.subcategory ||
                        data.categories.find((c) => c.id === tenant.categoryId)?.name}{' '}
                      · {data.floors.find((f) => f.id === tenant.floorId)?.shortName} ·{' '}
                      {tenant.unitNumber}
                    </span>
                  </div>
                </div>
                <p>{tenant.shortSummary}</p>
                <div className="chip-row">
                  {[...(tenant.dining?.cuisines ?? []), ...tenant.productTypes]
                    .slice(0, 6)
                    .map((tag) => (
                      <span key={tag} className="chip is-static">
                        {tag}
                      </span>
                    ))}
                </div>
                <span className="btn btn-primary">Get directions</span>
              </div>
            </div>
            <p className="cmd-muted">
              This is how the kiosk profile will look once you save and publish.
            </p>
          </div>
        ) : null}
      </fieldset>
    </Drawer>
  );
}
