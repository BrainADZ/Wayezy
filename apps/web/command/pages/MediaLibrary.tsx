import { useRef, useState } from 'react';
import type { Media } from '../../../../packages/domain';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { deleteResource, errorMessage, saveResource, useCommand } from '../data';
import { ConfirmButton, Drawer, Empty, PageHeader, TextField } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm';

/** Reads video duration/dimensions in the browser so the server can store accurate metadata. */
function videoMeta(file: File) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        duration: Math.round(video.duration * 10) / 10,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(video.src);
    };
    video.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
    video.src = URL.createObjectURL(file);
  });
}

export async function uploadMedia(file: File) {
  const form = new FormData();
  form.append('file', file);
  form.append('name', file.name);
  if (file.type.startsWith('video/')) {
    const meta = await videoMeta(file);
    form.append('duration', String(meta.duration));
    form.append('width', String(meta.width));
    form.append('height', String(meta.height));
  }
  return api<Media>('/api/admin/media/upload', { method: 'POST', body: form });
}

export function UploadButton({
  label = 'Upload',
  onUploaded,
}: {
  label?: string;
  onUploaded: (asset: Media) => void | Promise<void>;
}) {
  const command = useCommand();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const asset = await uploadMedia(file);
            command.toast(`${asset.name} uploaded.`);
            await onUploaded(asset);
          } catch (error) {
            command.toast(errorMessage(error), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => input.current?.click()}
        disabled={busy || !command.can('media', 'write')}
      >
        <Glyph name="upload" size={16} /> {busy ? 'Uploading…' : label}
      </button>
    </>
  );
}

export default function MediaLibrary() {
  const command = useCommand();
  const { data } = command;
  const [selected, setSelected] = useState<Media | null>(null);
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all');
  const [dragging, setDragging] = useState(false);
  const usage = (m: Media) => [
    ...data.campaigns.filter((c) => c.mediaId === m.id).map((c) => `Campaign: ${c.name}`),
    ...data.tenants
      .filter((t) => t.logo === m.url || t.heroImage === m.url || t.gallery.includes(m.url))
      .map((t) => `Tenant: ${t.name}`),
    ...data.offers.filter((o) => o.image === m.url).map((o) => `Offer: ${o.title}`),
    ...data.events.filter((e) => e.image === m.url).map((e) => `Event: ${e.title}`),
  ];
  const assets = data.media.filter((m) => kind === 'all' || m.kind === kind);

  const onDrop = async (files: FileList) => {
    for (const file of Array.from(files).slice(0, 10)) {
      try {
        const asset = await uploadMedia(file);
        command.toast(`${asset.name} uploaded.`);
      } catch (e) {
        command.toast(`${file.name}: ${errorMessage(e)}`, 'error');
      }
    }
    await command.reload();
  };

  return (
    <>
      <PageHeader
        title="Media Library"
        subtitle="Logos, tenant photography, offer images and advertising creatives. Images are optimised to WebP on upload; files are validated by content, not just extension."
        actions={
          <>
            <div className="segmented">
              {(['all', 'image', 'video'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={kind === k ? 'is-active' : ''}
                  onClick={() => setKind(k)}
                >
                  {k === 'all' ? 'All' : k === 'image' ? 'Images' : 'Videos'}
                </button>
              ))}
            </div>
            <UploadButton onUploaded={() => command.reload()} />
          </>
        }
      />
      <div
        className={`cmd-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (command.can('media', 'write')) void onDrop(e.dataTransfer.files);
        }}
      >
        <Glyph name="upload" size={20} /> Drag and drop images or videos here · JPEG, PNG, WebP,
        AVIF, MP4, WebM
      </div>
      {assets.length ? (
        <div className="cmd-media-grid">
          {assets.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cmd-media-tile"
              onClick={() => setSelected(m)}
            >
              {m.kind === 'video' ? (
                <video src={m.url} muted preload="metadata" />
              ) : (
                <img src={m.url} alt="" loading="lazy" />
              )}
              <span>{m.name}</span>
              <small>
                {m.kind} · {m.width && m.height ? `${m.width}×${m.height}` : 'size n/a'}
                {m.duration ? ` · ${m.duration}s` : ''}
                {usage(m).length ? ` · used ${usage(m).length}×` : ''}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon="image"
          title="No media yet"
          body="Upload creatives and tenant images to use them across COMMAND."
        />
      )}
      {selected ? (
        <MediaDetail
          key={selected.id}
          media={selected}
          usage={usage(selected)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function MediaDetail({
  media,
  usage,
  onClose,
}: {
  media: Media;
  usage: string[];
  onClose: () => void;
}) {
  const command = useCommand();
  const [name, setName] = useState(media.name);
  const canWrite = command.can('media', 'write');
  return (
    <Drawer
      title={media.name}
      subtitle={`${media.mimeType} · ${(media.size / 1024).toFixed(0)} KB`}
      onClose={onClose}
      footer={
        <>
          {canWrite ? (
            <ConfirmButton
              label={
                <>
                  <Glyph name="trash" size={16} /> Delete
                </>
              }
              disabled={usage.length > 0}
              onConfirm={async () => {
                try {
                  await deleteResource('media', media.id);
                  command.toast('Media deleted.');
                  await command.reload();
                  onClose();
                } catch (e) {
                  command.toast(errorMessage(e), 'error');
                }
              }}
            />
          ) : (
            <span />
          )}
          <span className="cmd-foot-spacer" />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canWrite || name === media.name}
            onClick={async () => {
              try {
                await saveResource('media', { name } as Media, media.id);
                command.toast('Renamed.');
                await command.reload();
                onClose();
              } catch (e) {
                command.toast(errorMessage(e), 'error');
              }
            }}
          >
            Save name
          </button>
        </>
      }
    >
      <div className="cmd-media-detail">
        {media.kind === 'video' ? (
          <video src={media.url} controls muted />
        ) : (
          <img src={media.url} alt="" />
        )}
        <fieldset className="cmd-form" disabled={!canWrite}>
          <TextField label="Name" value={name} onChange={setName} wide />
        </fieldset>
        <dl className="cmd-dl">
          <dt>URL</dt>
          <dd>
            <code>{media.url}</code>
          </dd>
          <dt>Dimensions</dt>
          <dd>{media.width && media.height ? `${media.width} × ${media.height}` : '—'}</dd>
          <dt>Duration</dt>
          <dd>{media.duration ? `${media.duration}s` : '—'}</dd>
          <dt>Used by</dt>
          <dd>{usage.length ? usage.join(' · ') : 'Not in use'}</dd>
        </dl>
        {usage.length ? (
          <div className="notice is-warning">
            This asset is in use, so it can’t be deleted until it is replaced.
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
